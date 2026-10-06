"""
Admin Router
────────────
Platform-wide management endpoints for admin users.
All endpoints require role='admin'.

Covers:
 • User listing, search, role management, deletion
 • Platform analytics
 • Security audit log viewer
 • Classroom oversight
"""

import logging
import math
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, field_validator

from app.middleware.rate_limiter import limiter, API_LIMIT
from app.middleware.sanitize import clean
from app.services.role_guard import require_admin
from app.services.audit_logger import log_audit_event
from app.services.supabase_client import get_admin_client

logger = logging.getLogger("os-odyssey.admin")

router = APIRouter()

ADMIN_LIMIT = "30/minute"


# ─── Schemas ────────────────────────────────────────────

class RoleUpdate(BaseModel):
    role: str

    @field_validator("role")
    @classmethod
    def validate_role(cls, v):
        if v not in ("student", "professor", "admin"):
            raise ValueError("Role must be 'student', 'professor', or 'admin'.")
        return v


class AdminUserUpdate(BaseModel):
    username: Optional[str] = None
    role: Optional[str] = None
    xp: Optional[int] = None
    level: Optional[int] = None
    rank: Optional[str] = None

    @field_validator("username")
    @classmethod
    def sanitize_username(cls, v):
        if v is not None:
            v = clean(v)
            if len(v) < 1 or len(v) > 50:
                raise ValueError("Username must be 1–50 characters.")
        return v

    @field_validator("role")
    @classmethod
    def validate_role(cls, v):
        if v is not None and v not in ("student", "professor", "admin"):
            raise ValueError("Role must be 'student', 'professor', or 'admin'.")
        return v


# ─── Users ──────────────────────────────────────────────

@router.get("/users")
@limiter.limit(ADMIN_LIMIT)
async def list_users(
    request: Request,
    search: Optional[str] = Query(None, max_length=100),
    role_filter: Optional[str] = Query(None, alias="role"),
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
    user=Depends(require_admin),
):
    """List all users with optional search, role filter, and pagination."""
    try:
        admin = get_admin_client()
        query = admin.table("profiles").select(
            "id, email, username, character, avatar, xp, level, rank, role, streak, badges, earned_badges, completed_modules, created_at",
            count="exact",
        )

        if search:
            search_clean = clean(search)
            query = query.or_(f"username.ilike.%{search_clean}%,email.ilike.%{search_clean}%")

        if role_filter and role_filter in ("student", "professor", "admin"):
            query = query.eq("role", role_filter)

        # Pagination
        offset = (page - 1) * per_page
        query = query.order("created_at", desc=True).range(offset, offset + per_page - 1)

        result = query.execute()

        total = result.count if result.count is not None else 0
        total_pages = math.ceil(total / per_page) if per_page else 1

        # Recalculate level/rank for consistency
        users = []
        for u in (result.data or []):
            xp = u.get("xp", 0) or 0
            level = max(1, math.floor(xp / 20))
            rank = _rank_from_level(level)
            users.append({**u, "level": level, "rank": rank})

        return {
            "users": users,
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": total_pages,
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("List users error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to list users.")


@router.get("/users/{user_id}")
@limiter.limit(ADMIN_LIMIT)
async def get_user(
    request: Request,
    user_id: str,
    user=Depends(require_admin),
):
    """Get a specific user's full profile."""
    try:
        admin = get_admin_client()
        result = (
            admin.table("profiles")
            .select("*")
            .eq("id", user_id)
            .single()
            .execute()
        )

        if not result.data:
            raise HTTPException(status_code=404, detail="User not found.")

        return {"user": result.data}

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Get user error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to fetch user.")


@router.patch("/users/{user_id}/role")
@limiter.limit(ADMIN_LIMIT)
async def update_user_role(
    request: Request,
    user_id: str,
    body: RoleUpdate,
    user=Depends(require_admin),
):
    """Promote or demote a user's role."""
    try:
        admin = get_admin_client()

        # Fetch current role for audit
        current = (
            admin.table("profiles")
            .select("role, username")
            .eq("id", user_id)
            .single()
            .execute()
        )

        if not current.data:
            raise HTTPException(status_code=404, detail="User not found.")

        old_role = current.data.get("role", "student")

        result = (
            admin.table("profiles")
            .update({"role": body.role})
            .eq("id", user_id)
            .execute()
        )

        logger.info(
            "Role change: %s (%s) → %s (by admin %s)",
            current.data.get("username"), old_role, body.role, user["id"],
        )

        log_audit_event(
            user_id=user["id"],
            action="admin_role_change",
            detail={
                "target_user_id": user_id,
                "target_username": current.data.get("username"),
                "old_role": old_role,
                "new_role": body.role,
            },
            request=request,
        )

        return {"message": f"Role updated to {body.role}.", "old_role": old_role, "new_role": body.role}

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Update role error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to update role.")


@router.patch("/users/{user_id}")
@limiter.limit(ADMIN_LIMIT)
async def update_user(
    request: Request,
    user_id: str,
    body: AdminUserUpdate,
    user=Depends(require_admin),
):
    """Admin edit of any user's profile fields."""
    updates = body.model_dump(exclude_none=True)

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update.")

    # Recalculate level/rank if XP is being changed
    if "xp" in updates:
        xp = updates["xp"]
        updates["level"] = max(1, math.floor(xp / 20))
        updates["rank"] = _rank_from_level(updates["level"])

    try:
        admin = get_admin_client()

        result = (
            admin.table("profiles")
            .update(updates)
            .eq("id", user_id)
            .execute()
        )

        if not result.data:
            raise HTTPException(status_code=404, detail="User not found.")

        log_audit_event(
            user_id=user["id"],
            action="admin_user_edit",
            detail={"target_user_id": user_id, "fields_updated": list(updates.keys())},
            request=request,
        )

        return {"message": "User updated.", "user": result.data[0] if result.data else None}

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Admin user update error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to update user.")


@router.delete("/users/{user_id}")
@limiter.limit(ADMIN_LIMIT)
async def delete_user(
    request: Request,
    user_id: str,
    user=Depends(require_admin),
):
    """Delete a user account. Cascades to all related data."""
    if user_id == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own account.")

    try:
        admin = get_admin_client()

        # Fetch username for audit before deletion
        target = (
            admin.table("profiles")
            .select("username, email, role")
            .eq("id", user_id)
            .single()
            .execute()
        )

        if not target.data:
            raise HTTPException(status_code=404, detail="User not found.")

        log_audit_event(
            user_id=user["id"],
            action="admin_delete_user",
            detail={
                "target_user_id": user_id,
                "target_username": target.data.get("username"),
                "target_email": target.data.get("email"),
            },
            request=request,
        )

        # Delete from Supabase Auth (cascades to profiles and all FKs)
        admin.auth.admin.delete_user(user_id)

        logger.info("User %s deleted by admin %s", user_id, user["id"])

        return {"message": "User deleted."}

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Delete user error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to delete user.")


@router.post("/users/{user_id}/reset-xp")
@limiter.limit(ADMIN_LIMIT)
async def reset_user_xp(
    request: Request,
    user_id: str,
    user=Depends(require_admin),
):
    """Reset a user's XP, level, and rank to defaults."""
    try:
        admin = get_admin_client()

        # Get current for audit
        current = (
            admin.table("profiles")
            .select("xp, level, rank, username")
            .eq("id", user_id)
            .single()
            .execute()
        )

        if not current.data:
            raise HTTPException(status_code=404, detail="User not found.")

        admin.table("profiles").update({
            "xp": 20,
            "level": 1,
            "rank": "Bronze",
            "badges": 0,
            "streak": 1,
            "completed_modules": [],
            "earned_badges": [],
        }).eq("id", user_id).execute()

        log_audit_event(
            user_id=user["id"],
            action="admin_reset_xp",
            detail={
                "target_user_id": user_id,
                "target_username": current.data.get("username"),
                "old_xp": current.data.get("xp"),
                "old_level": current.data.get("level"),
            },
            request=request,
        )

        return {"message": "User progress reset."}

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Reset XP error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to reset user progress.")


# ─── Platform Stats ────────────────────────────────────

@router.get("/stats")
@limiter.limit(ADMIN_LIMIT)
async def get_admin_stats(
    request: Request,
    user=Depends(require_admin),
):
    """Platform-wide analytics for the admin dashboard."""
    try:
        admin = get_admin_client()

        # Total users
        all_profiles = admin.table("profiles").select("id, xp, role, created_at", count="exact").execute()
        total_users = all_profiles.count or 0

        profiles = all_profiles.data or []

        # Role counts
        students = sum(1 for p in profiles if p.get("role", "student") == "student")
        professors = sum(1 for p in profiles if p.get("role") == "professor")
        admins = sum(1 for p in profiles if p.get("role") == "admin")

        # Average XP
        total_xp = sum(p.get("xp", 0) or 0 for p in profiles)
        avg_xp = round(total_xp / total_users, 1) if total_users else 0

        # Classroom count
        classrooms_result = admin.table("classrooms").select("id", count="exact").execute()
        total_classrooms = classrooms_result.count or 0

        return {
            "stats": {
                "total_users": total_users,
                "students": students,
                "professors": professors,
                "admins": admins,
                "avg_xp": avg_xp,
                "total_xp": total_xp,
                "total_classrooms": total_classrooms,
            }
        }

    except Exception as exc:
        logger.error("Admin stats error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to fetch admin stats.")


# ─── Audit Log ──────────────────────────────────────────

@router.get("/audit-log")
@limiter.limit(ADMIN_LIMIT)
async def get_audit_log(
    request: Request,
    action_filter: Optional[str] = Query(None, alias="action"),
    user_filter: Optional[str] = Query(None, alias="user_id"),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    user=Depends(require_admin),
):
    """Query the security audit log with filters and pagination."""
    try:
        admin = get_admin_client()
        query = admin.table("security_audit_log").select(
            "id, user_id, action, detail, ip_address, user_agent, created_at",
            count="exact",
        )

        if action_filter:
            query = query.eq("action", action_filter)

        if user_filter:
            query = query.eq("user_id", user_filter)

        offset = (page - 1) * per_page
        query = query.order("created_at", desc=True).range(offset, offset + per_page - 1)

        result = query.execute()

        total = result.count if result.count is not None else 0

        # Enrich with usernames
        entries = result.data or []
        user_ids = list({e["user_id"] for e in entries if e.get("user_id")})

        username_map = {}
        if user_ids:
            profiles_result = (
                admin.table("profiles")
                .select("id, username")
                .in_("id", user_ids)
                .execute()
            )
            username_map = {p["id"]: p["username"] for p in (profiles_result.data or [])}

        for entry in entries:
            entry["username"] = username_map.get(entry.get("user_id"), "Unknown")

        return {
            "entries": entries,
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": math.ceil(total / per_page) if per_page else 1,
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Audit log error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to fetch audit log.")


# ─── Classroom Oversight ────────────────────────────────

@router.get("/classrooms")
@limiter.limit(ADMIN_LIMIT)
async def list_all_classrooms(
    request: Request,
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
    user=Depends(require_admin),
):
    """List ALL classrooms across all professors."""
    try:
        admin = get_admin_client()

        offset = (page - 1) * per_page
        result = (
            admin.table("classrooms")
            .select("*", count="exact")
            .order("created_at", desc=True)
            .range(offset, offset + per_page - 1)
            .execute()
        )

        total = result.count if result.count is not None else 0
        classrooms = result.data or []

        # Enrich with professor username and member count
        prof_ids = list({c["professor_id"] for c in classrooms if c.get("professor_id")})
        prof_map = {}
        if prof_ids:
            prof_result = admin.table("profiles").select("id, username").in_("id", prof_ids).execute()
            prof_map = {p["id"]: p["username"] for p in (prof_result.data or [])}

        for c in classrooms:
            c["professor_username"] = prof_map.get(c.get("professor_id"), "Unknown")
            # Get member count
            members = (
                admin.table("classroom_members")
                .select("id", count="exact")
                .eq("classroom_id", c["id"])
                .execute()
            )
            c["member_count"] = members.count or 0

        return {
            "classrooms": classrooms,
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": math.ceil(total / per_page) if per_page else 1,
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("List all classrooms error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to list classrooms.")


@router.delete("/classrooms/{classroom_id}")
@limiter.limit(ADMIN_LIMIT)
async def admin_delete_classroom(
    request: Request,
    classroom_id: str,
    user=Depends(require_admin),
):
    """Admin delete any classroom."""
    try:
        admin = get_admin_client()

        classroom = (
            admin.table("classrooms")
            .select("name, professor_id")
            .eq("id", classroom_id)
            .single()
            .execute()
        )

        if not classroom.data:
            raise HTTPException(status_code=404, detail="Classroom not found.")

        admin.table("classrooms").delete().eq("id", classroom_id).execute()

        log_audit_event(
            user_id=user["id"],
            action="admin_delete_classroom",
            detail={
                "classroom_id": classroom_id,
                "classroom_name": classroom.data.get("name"),
            },
            request=request,
        )

        return {"message": "Classroom deleted."}

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Admin delete classroom error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to delete classroom.")


# ─── Helpers ────────────────────────────────────────────

def _rank_from_level(level: int) -> str:
    if level >= 115:
        return "Platinum"
    if level >= 75:
        return "Gold"
    if level >= 30:
        return "Silver"
    return "Bronze"
