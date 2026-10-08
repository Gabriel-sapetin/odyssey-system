"""
Authentication Dependencies
────────────────────────────
FastAPI dependency functions for extracting and verifying the
Supabase JWT from the Authorization header.
"""

import logging
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.services.supabase_client import get_admin_client, get_user_client

logger = logging.getLogger("os-odyssey.auth")

_bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
):
    """
    Dependency: extracts Bearer token, verifies via Supabase, returns user dict.
    Raises 401 if missing/invalid.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header.",
        )

    token = credentials.credentials
    if not token or len(token) < 10:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token.",
        )

    try:
        admin = get_admin_client()
        result = admin.auth.get_user(token)

        if not result or not result.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token.",
            )

        return {
            "id": result.user.id,
            "email": result.user.email,
            "token": token,
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Token verification failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token verification failed.",
        )


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
):
    """
    Dependency: same as get_current_user but returns None instead of 401.
    Useful for endpoints that work both authenticated and anonymously.
    """
    if credentials is None:
        return None
    try:
        return await get_current_user(credentials)
    except HTTPException:
        return None
