"""Background poller for in-flight OpenAI fine-tuning jobs.

Mounted as a 5-minute APScheduler tick — server.py already runs an
`AsyncIOScheduler`, we just register one extra job. Idempotent + safe to
call manually.
"""
from __future__ import annotations
import logging
import os
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient

from . import openai_ft

logger = logging.getLogger(__name__)

INFLIGHT_STATUSES = {"validating_files", "queued", "running"}


def _db():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    return client[os.environ["DB_NAME"]]


async def poll_inflight_jobs() -> int:
    """Refresh status of all jobs not in a terminal state. Returns count refreshed."""
    if not openai_ft.is_configured():
        return 0
    db = _db()
    cursor = db.ft_jobs.find(
        {"provider": "openai", "openai_status": {"$in": list(INFLIGHT_STATUSES)}},
        {"_id": 0, "id": 1, "openai_job_id": 1},
    )
    refreshed = 0
    async for job in cursor:
        try:
            latest = await openai_ft.get_job(job["openai_job_id"])
            await db.ft_jobs.update_one(
                {"id": job["id"]},
                {"$set": {**latest, "last_polled_at": datetime.now(timezone.utc).isoformat()}},
            )
            refreshed += 1
        except Exception as e:
            logger.warning(f"finetune.scheduler: failed to refresh {job.get('openai_job_id')}: {e}")
    if refreshed:
        logger.info(f"finetune.scheduler: refreshed {refreshed} in-flight job(s)")
    return refreshed
