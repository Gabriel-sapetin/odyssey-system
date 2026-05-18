"""
Cloudflare Turnstile Verification Service
──────────────────────────────────────────
Server-side validation of Turnstile tokens to prevent bot abuse.
Used by auth routes (signup, login) to verify that the request
came from a real human and not automated tooling.

Setup:
  1. Create a Turnstile widget at https://dash.cloudflare.com → Turnstile
  2. Copy the Site Key → paste into your frontend HTML (data-sitekey)
  3. Copy the Secret Key → set as TURNSTILE_SECRET_KEY env var on Render
"""

import logging
import os

import httpx

logger = logging.getLogger("os-odyssey.turnstile")

TURNSTILE_SECRET = os.getenv("TURNSTILE_SECRET_KEY", "")
TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


async def verify_turnstile_token(token: str, remote_ip: str | None = None) -> bool:
    """
    Verify a Cloudflare Turnstile response token server-side.

    Args:
        token: The cf-turnstile-response token from the frontend widget.
        remote_ip: Optional client IP for additional validation.

    Returns:
        True if the token is valid, False otherwise.
    """
    if not TURNSTILE_SECRET:
        # If no secret is configured, skip verification (dev mode).
        logger.warning("TURNSTILE_SECRET_KEY not set — skipping Turnstile verification")
        return True

    if not token:
        logger.warning("Empty Turnstile token received")
        return False

    payload = {
        "secret": TURNSTILE_SECRET,
        "response": token,
    }

    if remote_ip:
        payload["remoteip"] = remote_ip

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(TURNSTILE_VERIFY_URL, data=payload)
            result = resp.json()

        success = result.get("success", False)

        if not success:
            error_codes = result.get("error-codes", [])
            logger.warning("Turnstile verification failed: %s", error_codes)
        else:
            logger.debug("Turnstile verification passed")

        return success

    except Exception as exc:
        logger.error("Turnstile verification error: %s", exc)
        # Fail open in case Cloudflare is unreachable — rate limiting still applies
        return True
