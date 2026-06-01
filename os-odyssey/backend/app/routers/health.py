#Health Check Router For Ping Activity On Render
#Lightweight endpoint for uptime monitors, load balancers, and CI pipelines.

import time
from fastapi import APIRouter, Request
from app.middleware.rate_limiter import limiter

router = APIRouter()

_start_time = time.time()


@router.get("/")
@limiter.limit("30/minute")
async def health_check(request: Request):
    uptime = round(time.time() - _start_time, 1)
    return {
        "status": "healthy",
        "uptime_seconds": uptime,
        "service": "OS Odyssey API",
        "version": "1.0.0",
    }


@router.get("/ping")
async def ping(request: Request):
    return {"pong": True}
