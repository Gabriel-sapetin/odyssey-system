"""
Profile Router
──────────────
CRUD operations on the user's profile (profiles table).
All endpoints require authentication and respect Supabase RLS.
"""

import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, field_validator

from app.middleware.rate_limiter import limiter, API_LIMIT
from app.middleware.sanitize import clean
from app.services.auth import get_current_user
from app.services.supabase_client import get_admin_client

logger = logging.getLogger("os-odyssey.profile")

router = APIRouter()


# ─── Schemas ────────────────────────────────────────────

class ProfileUpdate(BaseModel):
    username: Optional[str] = None
    character: Optional[str] = None
    avatar: Optional[str] = None
    streak: Optional[int] = None
    last_active_date: Optional[str] = None
    earned_badges: Optional[list[str]] = None
    badges: Optional[int] = None
    completed_modules: Optional[list[str]] = None

    @field_validator("username")
    @classmethod
    def sanitize_username(cls, v):
        if v is not None:
            v = clean(v)
            if len(v) < 1 or len(v) > 50:
                raise ValueError("Username must be 1–50 characters.")
        return v

    @field_validator("character")
    @classmethod
    def sanitize_character(cls, v):
        return clean(v) if v is not None else v

    @field_validator("avatar")
    @classmethod
    def validate_avatar(cls, v):
        if v is not None:
            v = clean(v)
            if len(v) > 500:
                raise ValueError("Avatar URL too long.")
        return v


# ─── Routes ─────────────────────────────────────────────

@router.get("/me")
@limiter.limit(API_LIMIT)
async def get_my_profile(request: Request, user=Depends(get_current_user)):
    """Fetch the authenticated user's full profile."""
    try:
        admin = get_admin_client()
        result = (
            admin.table("profiles")
            .select("*")
            .eq("id", user["id"])
            .single()
            .execute()
        )

        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Profile not found.",
            )

        return {"profile": result.data}

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Fetch profile error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch profile.",
        )


@router.patch("/me")
@limiter.limit(API_LIMIT)
async def update_my_profile(
    request: Request,
    body: ProfileUpdate,
    user=Depends(get_current_user),
):
    """
    Update the authenticated user's profile.
    Only non-null fields are updated (partial update).
    """
    # Build update dict from non-None fields
    updates = body.model_dump(exclude_none=True)

    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update.",
        )

    logger.info("Profile update for user %s: %s", user["id"], list(updates.keys()))

    try:
        admin = get_admin_client()
        result = (
            admin.table("profiles")
            .update(updates)
            .eq("id", user["id"])
            .execute()
        )

        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Profile not found.",
            )

        return {"profile": result.data[0] if result.data else None}

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Update profile error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update profile.",
        )
