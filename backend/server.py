"""
OS Odyssey — Uvicorn Entry Point
─────────────────────────────────
Run with:  python server.py
"""

import uvicorn
from app.config import settings

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=settings.PORT,
        reload=settings.DEBUG,
        workers=1 if settings.DEBUG else 4,
        log_level="debug" if settings.DEBUG else "info",
        access_log=True,
    )
