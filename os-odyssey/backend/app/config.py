"""
OS Odyssey — Backend Configuration
───────────────────────────────────
Loads environment variables via pydantic-settings for type-safe config.
"""

import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    """Application settings loaded from environment."""

    # Supabase
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_ANON_KEY: str = os.getenv("SUPABASE_ANON_KEY", "")
    SUPABASE_SERVICE_ROLE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    SUPABASE_JWT_SECRET: str = os.getenv("SUPABASE_JWT_SECRET", "")

    # Server
    PORT: int = int(os.getenv("PORT", "4000"))
    ENV: str = os.getenv("ENV", "development")
    DEBUG: bool = ENV == "development"

    # CORS
    CORS_ORIGINS: list[str] = [
        o.strip()
        for o in os.getenv("CORS_ORIGINS", "http://localhost:5500").split(",")
        if o.strip()
    ]

    # Rate limiting
    RATE_LIMIT_GLOBAL: str = os.getenv("RATE_LIMIT_GLOBAL", "100/minute")
    RATE_LIMIT_AUTH: str = os.getenv("RATE_LIMIT_AUTH", "10/minute")

    # Thread pool
    WORKER_THREADS: int = int(os.getenv("WORKER_THREADS", "4"))


settings = Settings()
