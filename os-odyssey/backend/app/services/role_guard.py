"""
Role Guard — Role-Based Access Control
───────────────────────────────────────
FastAPI dependencies that verify the authenticated user's role.

Role hierarchy:  admin > professor > student
 • require_admin()     — only role='admin'
 • require_professor() — role='professor' OR role='admin'
 • get_user_role()     — returns {id, email, token, role} without restricting

Usage:
    @router.get("/admin-only")
    async def secret(user=Depends(require_admin)):
        ...
"""

import logging
from fastapi import Depends, HTTPException, status

from app.services.auth import get_current_user
from app.services.supabase_client import get_admin_client

logger = logging.getLogger("os-odyssey.role_guard")

ROLE_HIERARCHY = {"admin": 3, "professor": 2, "student": 1}


async def get_user_role(user=Depends(get_current_user)):
    """
    Dependency: fetches the user's role from profiles and attaches it.
    Returns the user dict with an added 'role' key.
    Does NOT restrict access — use require_admin/require_professor for that.
    """
    try:
        admin = get_admin_client()
        result = (
            admin.table("profiles")
            .select("role")
            .eq("id", user["id"])
            .single()
            .execute()
        )

        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Profile not found.",
            )

        user["role"] = result.data.get("role", "student")
        return user

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Role lookup failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to verify user role.",
        )


async def require_admin(user=Depends(get_user_role)):
    """Dependency: rejects non-admin users with 403."""
    if user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required.",
        )
    return user


async def require_professor(user=Depends(get_user_role)):
    """Dependency: allows professor OR admin, rejects students with 403."""
    role = user.get("role", "student")
    if ROLE_HIERARCHY.get(role, 0) < ROLE_HIERARCHY["professor"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Professor access required.",
        )
    return user
