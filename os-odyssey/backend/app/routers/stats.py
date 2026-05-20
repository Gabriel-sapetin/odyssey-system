"""
Stats Router
────────────
Public platform statistics (learner count, module count, etc.).
Uses the thread pool for aggregation queries.
"""

import logging
from fastapi import APIRouter, Request
from app.middleware.rate_limiter import limiter
from app.services.supabase_client import get_admin_client
from app.services.thread_pool import run_in_pool

logger = logging.getLogger("os-odyssey.stats")

router = APIRouter()


def _aggregate_stats(profiles_count: int) -> dict:
    """
    Compute platform stats (offloaded to thread pool).
    In a larger app this would aggregate from multiple tables.
    """
    total_modules = 4
    total_topics = 50  # 5 + 5 + 15 + 25

    return {
        "learners": profiles_count,
        "modules": total_modules,
        "topics": total_topics,
    }


@router.get("/")
@limiter.limit("30/minute")
async def get_platform_stats(request: Request):
    """Return public platform statistics."""
    try:
        admin = get_admin_client()

        # Use the existing RPC function
        result = admin.rpc("get_learner_count").execute()
        count = int(result.data) if result.data is not None else 0

        stats = await run_in_pool(_aggregate_stats, count)

        return {"stats": stats}

    except Exception as exc:
        logger.error("Stats error: %s", exc)
        # Return fallback stats rather than failing
        return {
            "stats": {
                "learners": 0,
                "modules": 4,
                "topics": 50,
            }
        }


@router.get("/leaderboard")
@limiter.limit("20/minute")
async def get_leaderboard(request: Request):
    """Return top 10 users by XP (public, no sensitive data)."""
    try:
        admin = get_admin_client()
        result = (
            admin.table("profiles")
            .select("username, xp, level, rank, character, avatar, earned_badges")
            .order("xp", desc=True)
            .limit(25)
            .execute()
        )

        leaderboard = []
        for i, entry in enumerate(result.data or [], 1):
            xp = int(entry.get("xp") or 0)
            level = max(1, xp // 20)
            rank = "Gold" if level >= 75 else "Silver" if level >= 30 else "Bronze"
            leaderboard.append({
                "position": i,
                "username": entry.get("username", "Anonymous"),
                "xp": xp,
                "level": level,
                "rank": rank,
                "character": entry.get("character", "Kernel Penguin"),
                "avatar": entry.get("avatar", "../../assets/penguin-flower-removebg-preview.png"),
                "badge_count": len(entry.get("earned_badges") or []),
            })

        return {"leaderboard": leaderboard}

    except Exception as exc:
        logger.error("Leaderboard error: %s", exc)
        return {"leaderboard": []}
