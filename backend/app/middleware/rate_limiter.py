"""
Rate Limiting — slowapi
───────────────────────
Three-tier rate limiting:
  1. Global   — 100 req/min per IP (applied via middleware)
  2. Auth     — 10 req/min per IP  (applied per-route)
  3. API      — 60 req/min per user (applied per-route)
"""

from slowapi import Limiter
from slowapi.util import get_remote_address
from app.config import settings


def _key_by_ip(request):
    """Rate-limit key: client IP address."""
    return get_remote_address(request)


def _key_by_user_or_ip(request):
    """Rate-limit key: authenticated user ID or fallback to IP."""
    user = getattr(request.state, "user", None)
    if user and hasattr(user, "id"):
        return str(user.id)
    return get_remote_address(request)


limiter = Limiter(
    key_func=_key_by_ip,
    default_limits=[settings.RATE_LIMIT_GLOBAL],
    storage_uri="memory://",
)

# Decorators for route-level limits
# Usage:  @auth_limit    on login/signup routes
#         @api_limit     on authenticated data routes
AUTH_LIMIT = settings.RATE_LIMIT_AUTH      # e.g. "10/minute"
API_LIMIT = "60/minute"
