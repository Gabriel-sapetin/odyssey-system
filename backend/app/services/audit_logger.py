"""
Security Audit Logger
─────────────────────
Writes tamper-proof audit entries for every gameplay mutation.
Uses the admin client (service-role) so RLS cannot block writes.
Runs fire-and-forget to avoid adding latency to requests.
"""

import logging
from typing import Optional
from fastapi import Request

from app.services.supabase_client import get_admin_client

logger = logging.getLogger("os-odyssey.audit")


def get_client_ip(request: Request) -> str:
    """Extract the real client IP, respecting reverse-proxy headers."""
    # X-Forwarded-For may contain: "client, proxy1, proxy2"
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    # X-Real-IP (used by some proxies like Nginx)
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    # Direct connection
    if request.client:
        return request.client.host
    return "unknown"


def get_user_agent(request: Request) -> str:
    """Extract the User-Agent header."""
    return request.headers.get("user-agent", "unknown")


def log_audit_event(
    user_id: str,
    action: str,
    detail: dict,
    request: Optional[Request] = None,
) -> None:
    """
    Write an audit log entry to the security_audit_log table.

    Args:
        user_id: The authenticated user's UUID.
        action:  One of 'complete_module', 'award_badge', 'update_streak',
                 'profile_update', 'suspicious_activity'.
        detail:  Action-specific data (e.g. module_id, xp_before, xp_after).
        request: The FastAPI Request object (for IP/UA extraction).
    """
    ip = get_client_ip(request) if request else "server"
    ua = get_user_agent(request) if request else "server"

    try:
        admin = get_admin_client()
        admin.table("security_audit_log").insert({
            "user_id": user_id,
            "action": action,
            "detail": detail,
            "ip_address": ip,
            "user_agent": ua,
        }).execute()

        logger.info(
            "AUDIT | %s | user=%s | ip=%s | %s",
            action, user_id, ip, detail,
        )
    except Exception as exc:
        # Never let audit logging failures break the request
        logger.error("Audit log write failed: %s", exc)
