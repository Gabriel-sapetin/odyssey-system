"""
Auth Router
───────────
Handles signup, login, logout, and password reset.
All endpoints are aggressively rate-limited to prevent brute-force attacks.
Auth is delegated to Supabase Auth — this layer adds:
  • Rate limiting
  • Input validation & sanitization
  • Structured logging
  • Consistent error responses
"""

import logging
import os
from typing import Optional
from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, field_validator

from app.middleware.rate_limiter import limiter, AUTH_LIMIT
from app.middleware.sanitize import clean
from app.services.supabase_client import get_admin_client
from app.services.turnstile import verify_turnstile_token

logger = logging.getLogger("os-odyssey.auth")

router = APIRouter()


# ─── Request Schemas ────────────────────────────────────

class SignUpRequest(BaseModel):
    email: EmailStr
    password: str
    turnstile_token: Optional[str] = None

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters.")
        if len(v) > 128:
            raise ValueError("Password must be at most 128 characters.")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    turnstile_token: Optional[str] = None


class PasswordResetRequest(BaseModel):
    email: EmailStr


# ─── Routes ─────────────────────────────────────────────

@router.post("/signup", status_code=status.HTTP_201_CREATED)
@limiter.limit(AUTH_LIMIT)
async def signup(request: Request, body: SignUpRequest):
    """
    Create a new user via Supabase Auth.
    Returns the user object (email confirmation may be required).
    """
    logger.info("Signup attempt: %s", body.email)

    # Verify Cloudflare Turnstile token (if configured)
    client_ip = request.client.host if request.client else None
    if not await verify_turnstile_token(body.turnstile_token or "", client_ip):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Security verification failed. Please try again.",
        )

    try:
        admin = get_admin_client()
        result = admin.auth.sign_up({
            "email": body.email,
            "password": body.password,
        })

        if not result.user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Signup failed — please try again.",
            )

        # Check if email confirmation is needed
        has_session = result.session is not None

        logger.info("Signup successful: %s (confirmed=%s)", body.email, has_session)

        return {
            "message": "Account created." if has_session else "Check your email to confirm your account.",
            "user": {
                "id": result.user.id,
                "email": result.user.email,
            },
            "session": {
                "access_token": result.session.access_token,
                "refresh_token": result.session.refresh_token,
            } if has_session else None,
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Signup error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )


@router.post("/login")
@limiter.limit(AUTH_LIMIT)
async def login(request: Request, body: LoginRequest):
    """
    Authenticate a user via Supabase Auth.
    Returns access_token and refresh_token on success.
    """
    logger.info("Login attempt: %s", body.email)

    # Verify Cloudflare Turnstile token (if configured)
    client_ip = request.client.host if request.client else None
    if not await verify_turnstile_token(body.turnstile_token or "", client_ip):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Security verification failed. Please try again.",
        )

    try:
        admin = get_admin_client()
        result = admin.auth.sign_in_with_password({
            "email": body.email,
            "password": body.password,
        })

        if not result.user or not result.session:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password.",
            )

        logger.info("Login successful: %s", body.email)

        return {
            "message": "Login successful.",
            "user": {
                "id": result.user.id,
                "email": result.user.email,
            },
            "session": {
                "access_token": result.session.access_token,
                "refresh_token": result.session.refresh_token,
            },
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Login error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )


@router.post("/logout")
@limiter.limit(AUTH_LIMIT)
async def logout(request: Request):
    """
    Sign out — invalidates the token on Supabase's side.
    The client should also discard the local token.
    """
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        try:
            admin = get_admin_client()
            admin.auth.sign_out(token)
        except Exception as exc:
            logger.warning("Logout error (non-critical): %s", exc)

    return {"message": "Logged out."}


@router.post("/reset-password")
@limiter.limit("5/minute")
async def reset_password(request: Request, body: PasswordResetRequest):
    """
    Send a password-reset email via Supabase Auth.
    Always returns 200 to prevent email enumeration.
    """
    logger.info("Password reset requested: %s", body.email)

    try:
        admin = get_admin_client()
        admin.auth.reset_password_email(body.email)
    except Exception as exc:
        # Don't reveal if the email exists or not
        logger.warning("Password reset error (hidden from user): %s", exc)

    return {"message": "If that email exists, a reset link has been sent."}
