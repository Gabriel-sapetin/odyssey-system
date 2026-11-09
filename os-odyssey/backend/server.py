"""
Odyssey — Uvicorn Entry Point
─────────────────────────────────
Run with:  python server.py
"""

try:
    import uvicorn
except ModuleNotFoundError as exc:
    if exc.name == "uvicorn":
        raise SystemExit(
            "Backend dependencies are missing. From this folder run "
            "'.\\start-backend.ps1' (PowerShell), or install them with "
            "'python -m pip install -r requirements.txt'."
        ) from exc
    raise

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
