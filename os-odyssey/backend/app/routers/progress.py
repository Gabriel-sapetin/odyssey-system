"""
Progress Router
───────────────
Tracks module completion, XP awards, streak updates, and badge grants.
Uses the thread pool for XP/level calculations to keep the event loop free.
"""

import logging
import math
from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from app.middleware.rate_limiter import limiter, API_LIMIT
from app.services.auth import get_current_user
from app.services.supabase_client import get_admin_client
from app.services.thread_pool import run_in_pool

logger = logging.getLogger("os-odyssey.progress")

router = APIRouter()


# ─── Schemas ────────────────────────────────────────────

class CompleteModuleRequest(BaseModel):
    module_id: str


class AwardBadgeRequest(BaseModel):
    badge_id: str


class StreakUpdateRequest(BaseModel):
    pass  # no body needed — uses server date


# ─── CPU-heavy helpers (run in thread pool) ─────────────

def _calculate_level(xp: int) -> int:
    """Mirror the frontend: level = max(1, floor(xp / 20))"""
    return max(1, math.floor(xp / 20))


def _calculate_rank(level: int) -> str:
    if level >= 75:
        return "Gold"
    if level >= 30:
        return "Silver"
    return "Bronze"


def _compute_xp_update(current_xp: int, bonus: int) -> dict:
    """Compute new XP, level, and rank (offloaded to thread pool)."""
    new_xp = current_xp + bonus
    new_level = _calculate_level(new_xp)
    new_rank = _calculate_rank(new_level)
    return {
        "xp": new_xp,
        "level": new_level,
        "rank": new_rank,
    }


# ─── Routes ─────────────────────────────────────────────

@router.get("/")
@limiter.limit(API_LIMIT)
async def get_progress(request: Request, user=Depends(get_current_user)):
    """Fetch current user's progress summary."""
    try:
        admin = get_admin_client()
        result = (
            admin.table("profiles")
            .select("xp, level, rank, completed_modules, streak, last_active_date, earned_badges, badges")
            .eq("id", user["id"])
            .single()
            .execute()
        )

        if not result.data:
            raise HTTPException(status_code=404, detail="Profile not found.")

        profile = result.data
        level = _calculate_level(profile.get("xp", 0))
        rank = _calculate_rank(level)

        return {
            "progress": {
                **profile,
                "level": level,
                "rank": rank,
            }
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Fetch progress error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to fetch progress.")


@router.post("/complete-module")
@limiter.limit(API_LIMIT)
async def complete_module(
    request: Request,
    body: CompleteModuleRequest,
    user=Depends(get_current_user),
):
    """
    Mark a module as completed.
    Awards XP and recalculates level/rank in the thread pool.
    """
    MODULE_XP_REWARD = 40  # XP per module completion

    try:
        admin = get_admin_client()

        # Fetch current profile
        profile_result = (
            admin.table("profiles")
            .select("xp, completed_modules")
            .eq("id", user["id"])
            .single()
            .execute()
        )

        if not profile_result.data:
            raise HTTPException(status_code=404, detail="Profile not found.")

        profile = profile_result.data
        completed = profile.get("completed_modules") or []

        if body.module_id in completed:
            return {"message": "Module already completed.", "already_completed": True}

        completed.append(body.module_id)

        # Offload XP calculation to thread pool
        xp_update = await run_in_pool(
            _compute_xp_update,
            profile.get("xp", 0),
            MODULE_XP_REWARD,
        )

        updates = {
            "completed_modules": completed,
            **xp_update,
        }

        update_result = (
            admin.table("profiles")
            .update(updates)
            .eq("id", user["id"])
            .execute()
        )

        logger.info(
            "Module %s completed by user %s — XP: %d → %d",
            body.module_id, user["id"], profile.get("xp", 0), xp_update["xp"],
        )

        return {
            "message": f"Module {body.module_id} completed!",
            "already_completed": False,
            "xp": xp_update["xp"],
            "level": xp_update["level"],
            "rank": xp_update["rank"],
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Complete module error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to complete module.")


@router.post("/streak")
@limiter.limit(API_LIMIT)
async def update_streak(
    request: Request,
    user=Depends(get_current_user),
):
    """
    Update the user's login streak.
    Called once per session — server determines the date (tamper-proof).
    """
    today = date.today().isoformat()  # YYYY-MM-DD

    try:
        admin = get_admin_client()

        profile_result = (
            admin.table("profiles")
            .select("streak, last_active_date")
            .eq("id", user["id"])
            .single()
            .execute()
        )

        if not profile_result.data:
            raise HTTPException(status_code=404, detail="Profile not found.")

        profile = profile_result.data
        last_active = profile.get("last_active_date")

        if last_active == today:
            return {"message": "Streak already counted today.", "streak": profile["streak"]}

        new_streak = 1  # default: reset

        if last_active:
            from datetime import datetime
            last_date = datetime.strptime(str(last_active), "%Y-%m-%d").date()
            today_date = date.today()
            diff = (today_date - last_date).days

            if diff == 1:
                new_streak = (profile.get("streak") or 0) + 1
            # diff > 1 means streak broken → resets to 1

        admin.table("profiles").update({
            "streak": new_streak,
            "last_active_date": today,
        }).eq("id", user["id"]).execute()

        logger.info("Streak updated for user %s: %d", user["id"], new_streak)

        return {"message": "Streak updated.", "streak": new_streak}

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Streak update error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to update streak.")


@router.post("/award-badge")
@limiter.limit(API_LIMIT)
async def award_badge(
    request: Request,
    body: AwardBadgeRequest,
    user=Depends(get_current_user),
):
    """
    Award a badge to the user.
    Idempotent — silently succeeds if badge already earned.
    """
    try:
        admin = get_admin_client()

        profile_result = (
            admin.table("profiles")
            .select("earned_badges, badges")
            .eq("id", user["id"])
            .single()
            .execute()
        )

        if not profile_result.data:
            raise HTTPException(status_code=404, detail="Profile not found.")

        profile = profile_result.data
        earned = profile.get("earned_badges") or []

        if body.badge_id in earned:
            return {"message": "Badge already earned.", "new": False}

        earned.append(body.badge_id)

        admin.table("profiles").update({
            "earned_badges": earned,
            "badges": len(earned),
        }).eq("id", user["id"]).execute()

        logger.info("Badge %s awarded to user %s", body.badge_id, user["id"])

        return {"message": "Badge awarded!", "new": True, "badge_id": body.badge_id}

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Award badge error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to award badge.")
