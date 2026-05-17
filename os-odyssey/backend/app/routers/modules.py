"""
Modules Router
──────────────
Serves module content (review material, quiz data).
Content is static and defined server-side — the frontend can no longer
tamper with quiz answers or scoring.
"""

import logging
from fastapi import APIRouter, HTTPException, Request
from app.middleware.rate_limiter import limiter, API_LIMIT
from app.services.thread_pool import run_in_pool

logger = logging.getLogger("os-odyssey.modules")

router = APIRouter()


# ─── Module Content (server-authoritative) ──────────────
# This lives server-side so clients can't inspect quiz answers.

MODULE_CATALOG = {
    "module1": {
        "id": "module1",
        "number": "Module 1",
        "title": "Introduction to Operating Systems",
        "statements": 5,
        "topics": [
            "What is an Operating System?",
            "Computer System Structure",
            "Interrupts & Computer Startup",
            "Storage Hierarchy & Caching",
            "Processes, Dual-Mode & OS Operations",
        ],
    },
    "module2": {
        "id": "module2",
        "number": "Module 2",
        "title": "Operating-System Structures",
        "statements": 5,
        "topics": [
            "Operating System Services",
            "System Calls",
            "Types of System Calls",
            "OS Design: Policy vs. Mechanism & Structure Types",
            "System Boot & Debugging",
        ],
    },
    "module3": {
        "id": "module3",
        "number": "Module 3",
        "title": "Processes",
        "statements": 15,
        "topics": [
            "What is a Process?",
            "Process vs. Program",
            "The Five Process States",
            "Process Control Block (PCB)",
            "Process Scheduling Queues",
            "Schedulers",
            "Context Switch",
            "Process Creation & Termination",
            "Interprocess Communication",
            "Client-Server Communication",
        ],
    },
    "module4": {
        "id": "module4",
        "number": "Module 4",
        "title": "Threads",
        "statements": 25,
        "topics": [
            "What is a Thread?",
            "Multithreading Models",
            "Thread Libraries",
            "Threading Issues",
            "Thread Pools",
        ],
    },
}


def _build_module_list():
    """Build a lightweight list (no quiz answers). Offloaded to thread pool for demo."""
    return [
        {
            "id": m["id"],
            "number": m["number"],
            "title": m["title"],
            "statements": m["statements"],
            "topic_count": len(m["topics"]),
        }
        for m in MODULE_CATALOG.values()
    ]


# ─── Routes ─────────────────────────────────────────────

@router.get("/")
@limiter.limit(API_LIMIT)
async def list_modules(request: Request):
    """Return all available modules (metadata only)."""
    modules = await run_in_pool(_build_module_list)
    return {
        "modules": modules,
        "total": len(modules),
    }


@router.get("/{module_id}")
@limiter.limit(API_LIMIT)
async def get_module(request: Request, module_id: str):
    """Return full module details including topic list."""
    module = MODULE_CATALOG.get(module_id)
    if not module:
        raise HTTPException(status_code=404, detail=f"Module '{module_id}' not found.")

    return {"module": module}
