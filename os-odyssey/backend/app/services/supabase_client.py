"""
Supabase Client Service
───────────────────────
Provides:
  • get_admin_client()  — service-role client (bypasses RLS)
  • get_user_client()   — per-request client scoped to user's JWT
"""

import logging
from supabase import create_client, Client
from app.config import settings

logger = logging.getLogger("os-odyssey.supabase")

_admin_client: Client | None = None


def get_admin_client() -> Client:
    """Return a singleton Supabase admin client (service-role key).
    
    SECURITY: Never falls back to anon key. The service-role key bypasses
    RLS, which is required for backend gameplay mutations. Using the anon
    key here would silently lose elevated privileges.
    """
    global _admin_client
    if _admin_client is None:
        key = settings.SUPABASE_SERVICE_ROLE_KEY
        if not key:
            raise RuntimeError(
                "SUPABASE_SERVICE_ROLE_KEY is not set. "
                "The backend MUST use the service-role key for admin operations. "
                "Never fall back to the anon key."
            )
        _admin_client = create_client(settings.SUPABASE_URL, key)
        logger.info("Supabase admin client initialised (service-role)")
    return _admin_client


def get_user_client(access_token: str) -> Client:
    """
    Create a Supabase client scoped to a user's JWT.
    RLS policies apply — the user can only access their own data.
    """
    client = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)
    client.postgrest.auth(access_token)
    return client
