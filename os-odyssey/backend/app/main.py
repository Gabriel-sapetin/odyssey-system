"""
OS Odyssey — FastAPI Application Factory
─────────────────────────────────────────
Production-hardened server with:
 • Helmet-style security headers
 • CORS (origin allow-list)
 • Gzip compression
 • Global + per-route rate limiting  (slowapi)
 • Structured JSON logging
 • Thread pool for CPU-heavy work
 • Input sanitization
 • Graceful shutdown
"""

import asyncio
import logging
import os
import uuid
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.middleware.rate_limiter import limiter
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.middleware.request_id import RequestIDMiddleware
from app.routers import auth, profile, progress, modules, stats, health
from app.services.thread_pool import pool

# ─── Logging ────────────────────────────────────────────
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("os-odyssey")

# ─── Keep-Alive Interval (13 min — under Render's 15 min sleep threshold)
KEEPALIVE_INTERVAL = 13 * 60  # seconds


async def _keepalive_ping(stop_event: asyncio.Event):
    """Background task that pings our own /api/health/ping endpoint
    every 13 minutes to prevent Render free-tier from sleeping."""
    external_url = os.getenv("RENDER_EXTERNAL_URL", "").rstrip("/")
    if not external_url:
        logger.warning("RENDER_EXTERNAL_URL not set — keepalive ping disabled")
        return

    ping_url = f"{external_url}/api/health/ping"
    logger.info("🏓  Keepalive ping enabled → %s (every %ds)", ping_url, KEEPALIVE_INTERVAL)

    async with httpx.AsyncClient(timeout=30) as client:
        while not stop_event.is_set():
            try:
                await asyncio.sleep(KEEPALIVE_INTERVAL)
                if stop_event.is_set():
                    break
                resp = await client.get(ping_url)
                logger.info("🏓  Keepalive ping → %d", resp.status_code)
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.warning("🏓  Keepalive ping failed: %s", exc)


# ─── Lifespan (startup / shutdown) ──────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀  OS Odyssey API starting up")
    logger.info("   Environment : %s", settings.ENV)
    logger.info("   CORS origins: %s", ", ".join(settings.CORS_ORIGINS) or "(all)")
    logger.info("   Thread pool : %d workers", settings.WORKER_THREADS)

    # Start keepalive ping in production (Render free tier)
    stop_event = asyncio.Event()
    keepalive_task = None
    if not settings.DEBUG:
        keepalive_task = asyncio.create_task(_keepalive_ping(stop_event))

    yield

    # Shutdown
    stop_event.set()
    if keepalive_task:
        keepalive_task.cancel()
        try:
            await keepalive_task
        except asyncio.CancelledError:
            pass
    pool.shutdown(wait=True)
    logger.info("🛑  OS Odyssey API shut down gracefully")


# ─── App Instance ───────────────────────────────────────
app = FastAPI(
    title="OS Odyssey API",
    version="1.0.0",
    description="Backend API for OS Odyssey — an interactive Operating Systems learning platform.",
    docs_url="/api/docs" if settings.DEBUG else None,
    redoc_url="/api/redoc" if settings.DEBUG else None,
    lifespan=lifespan,
)

# ─── Rate Limiter State ─────────────────────────────────
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ─── Middleware Stack (order matters — outermost first) ──
# 1. Request ID tracking
app.add_middleware(RequestIDMiddleware)

# 2. Security headers (Helmet-equivalent)
app.add_middleware(SecurityHeadersMiddleware)

# 3. Gzip compression (responses > 500 bytes)
app.add_middleware(GZipMiddleware, minimum_size=500)

# 4. CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Request-ID"],
    max_age=86400,  # pre-flight cache 24h
)


# ─── Request / Response Logging ─────────────────────────
@app.middleware("http")
async def log_requests(request: Request, call_next):
    rid = request.state.request_id if hasattr(request.state, "request_id") else "?"
    logger.info("%s %s [%s]", request.method, request.url.path, rid)
    response = await call_next(request)
    logger.info(
        "%s %s → %d [%s]",
        request.method,
        request.url.path,
        response.status_code,
        rid,
    )
    return response


# ─── Global Exception Handler ───────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    rid = getattr(request.state, "request_id", "unknown")
    logger.error("Unhandled error [%s]: %s", rid, exc, exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"error": "Internal server error.", "request_id": rid},
    )


# ─── Routers ────────────────────────────────────────────
app.include_router(health.router, prefix="/api/health", tags=["Health"])
app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(profile.router, prefix="/api/profile", tags=["Profile"])
app.include_router(progress.router, prefix="/api/progress", tags=["Progress"])
app.include_router(modules.router, prefix="/api/modules", tags=["Modules"])
app.include_router(stats.router, prefix="/api/stats", tags=["Stats"])


# ─── Root Redirect ──────────────────────────────────────
@app.get("/", include_in_schema=False)
async def root():
    return {
        "service": "OS Odyssey API",
        "version": "1.0.0",
        "docs": "/api/docs" if settings.DEBUG else None,
    }
