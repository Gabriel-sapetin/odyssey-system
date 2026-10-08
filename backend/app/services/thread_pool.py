"""
Thread Pool Service
───────────────────
Fixed-size ThreadPoolExecutor for offloading CPU-intensive work
(leaderboard aggregation, quiz scoring, analytics) off the async
event loop so HTTP I/O stays responsive.

Usage:
    from app.services.thread_pool import run_in_pool
    result = await run_in_pool(expensive_fn, arg1, arg2)
"""

import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from functools import partial

from app.config import settings

logger = logging.getLogger("os-odyssey.threads")

pool = ThreadPoolExecutor(
    max_workers=settings.WORKER_THREADS,
    thread_name_prefix="os-odyssey-worker",
)

logger.info("Thread pool initialised with %d workers", settings.WORKER_THREADS)


async def run_in_pool(fn, *args, **kwargs):
    """
    Run a synchronous function in the thread pool and await its result.

    Example:
        score = await run_in_pool(compute_quiz_score, answers, answer_key)
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(pool, partial(fn, *args, **kwargs))
