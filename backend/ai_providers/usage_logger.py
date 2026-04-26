"""Per-call usage logger.

Every LLM call routed through `router.run_task` is recorded in
`ai_usage_logs` Mongo collection so you can:
  • Bill tenants per-call
  • Spot regressions ("model X is now twice as expensive")
  • Curate fine-tuning datasets — every successful extraction is a candidate
    training example (subject to tenant opt-in flags)
"""
from __future__ import annotations
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

logger = logging.getLogger(__name__)


async def _get_db():
    """Lazy DB import to avoid circular deps with saffron_saas."""
    from saffron_saas import db
    return db


async def log_call(
    *,
    task: str,
    phase: str,
    provider: str,
    model: str,
    tokens_in: int,
    tokens_out: int,
    cost_inr: float,
    organization_id: Optional[str] = None,
    user_id: Optional[str] = None,
    used_fallback: bool = False,
    attempts: int = 1,
    success: bool = True,
    error: Optional[str] = None,
    meta: Optional[dict] = None,
) -> str:
    """Persist a usage record. Returns the log doc id (so callers can attach it
    to their domain object — e.g., audit_runs.ai_documents.{id}.usage_log_id)."""
    try:
        db = await _get_db()
        doc_id = str(uuid.uuid4())
        await db.ai_usage_logs.insert_one({
            "id": doc_id,
            "task": task,
            "phase": phase,
            "provider": provider,
            "model": model,
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
            "cost_inr": cost_inr,
            "organization_id": organization_id,
            "user_id": user_id,
            "used_fallback": used_fallback,
            "attempts": attempts,
            "success": success,
            "error": error,
            "meta": meta or {},
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        return doc_id
    except Exception as e:
        logger.warning(f"ai_usage_log insert failed: {e}")
        return ""


async def aggregate_usage(filters: Optional[dict] = None) -> dict:
    """Aggregate INR + tokens across a time window / org / phase. Used by the
    platform-admin AI dashboard."""
    db = await _get_db()
    match = filters or {}
    pipeline = [
        {"$match": match},
        {"$group": {
            "_id": {"phase": "$phase", "provider": "$provider", "model": "$model"},
            "calls": {"$sum": 1},
            "tokens_in": {"$sum": "$tokens_in"},
            "tokens_out": {"$sum": "$tokens_out"},
            "cost_inr": {"$sum": "$cost_inr"},
            "fallback_count": {"$sum": {"$cond": ["$used_fallback", 1, 0]}},
        }},
        {"$sort": {"cost_inr": -1}},
    ]
    rows = []
    async for r in db.ai_usage_logs.aggregate(pipeline):
        rows.append({
            "phase": r["_id"]["phase"],
            "provider": r["_id"]["provider"],
            "model": r["_id"]["model"],
            "calls": r["calls"],
            "tokens_in": r["tokens_in"],
            "tokens_out": r["tokens_out"],
            "cost_inr": round(r["cost_inr"], 4),
            "fallback_count": r["fallback_count"],
        })
    total_inr = round(sum(r["cost_inr"] for r in rows), 4)
    return {"breakdown": rows, "total_cost_inr": total_inr, "total_calls": sum(r["calls"] for r in rows)}
