"""OpenAI fine-tuning provider — uses your OPENAI_API_KEY directly.

Wraps the openai>=1.0 AsyncClient lifecycle: upload → create job → poll → infer.
Cost estimates are based on OpenAI's published pricing as of 2026-01.
"""
from __future__ import annotations
import io
import json
import logging
import os
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


# Latest tunable models exposed in the dashboard. These are well-known OpenAI
# fine-tuning targets — keep this list short and curated.
TUNABLE_BASE_MODELS = [
    {"id": "gpt-4o-mini-2024-07-18", "label": "GPT-4o mini (2024-07-18) — recommended",
     "train_per_m": 3.0, "in_per_m": 0.30, "out_per_m": 1.20},
    {"id": "gpt-4.1-mini-2025-04-14", "label": "GPT-4.1 mini (2025-04-14)",
     "train_per_m": 5.0, "in_per_m": 0.80, "out_per_m": 3.20},
    {"id": "gpt-4.1-nano-2025-04-14", "label": "GPT-4.1 nano (2025-04-14) — cheapest",
     "train_per_m": 1.5, "in_per_m": 0.20, "out_per_m": 0.80},
]


def _model_meta(base: str) -> Dict[str, Any]:
    for m in TUNABLE_BASE_MODELS:
        if m["id"] == base:
            return m
    return TUNABLE_BASE_MODELS[0]


def estimate_training_cost_usd(jsonl_lines: List[str], base_model: str, n_epochs: int) -> Dict[str, Any]:
    """Rough estimate: tokens ≈ chars/4. Multiply by epochs * train_per_m."""
    chars = sum(len(line) for line in jsonl_lines)
    tokens_per_epoch = max(1, chars // 4)
    total_tokens = tokens_per_epoch * n_epochs
    meta = _model_meta(base_model)
    cost_usd = (total_tokens / 1_000_000) * meta["train_per_m"]
    return {
        "approx_tokens_per_epoch": tokens_per_epoch,
        "approx_total_tokens": total_tokens,
        "approx_cost_usd": round(cost_usd, 4),
        "approx_cost_inr": round(cost_usd * 84, 2),  # ~₹84/USD
        "base_model": base_model,
        "epochs": n_epochs,
    }


def _client():
    from openai import AsyncOpenAI
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set in /app/backend/.env")
    return AsyncOpenAI(api_key=api_key)


async def upload_training_file(jsonl_lines: List[str], filename: str = "saffron-train.jsonl") -> str:
    """Upload an in-memory JSONL blob with purpose='fine-tune' → returns file id."""
    client = _client()
    blob = ("\n".join(jsonl_lines) + "\n").encode("utf-8")
    resp = await client.files.create(file=(filename, io.BytesIO(blob)), purpose="fine-tune")
    logger.info(f"openai_ft: uploaded training file {resp.id} ({len(blob)} bytes, {len(jsonl_lines)} lines)")
    return resp.id


async def create_job(
    *, training_file_id: str, base_model: str,
    n_epochs: int = 3,
    learning_rate_multiplier: Optional[float] = None,
    batch_size: Optional[int] = None,
    suffix: Optional[str] = None,
    validation_file_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Kick off a fine-tuning job. Returns the OpenAI job dict."""
    client = _client()
    hp: Dict[str, Any] = {"n_epochs": n_epochs}
    if learning_rate_multiplier is not None:
        hp["learning_rate_multiplier"] = learning_rate_multiplier
    if batch_size is not None:
        hp["batch_size"] = batch_size
    kwargs: Dict[str, Any] = {
        "training_file": training_file_id,
        "model": base_model,
        "hyperparameters": hp,
    }
    if suffix:
        kwargs["suffix"] = suffix[:18]  # OpenAI hard-limits suffix length
    if validation_file_id:
        kwargs["validation_file"] = validation_file_id
    resp = await client.fine_tuning.jobs.create(**kwargs)
    return _job_to_dict(resp)


async def get_job(openai_job_id: str) -> Dict[str, Any]:
    client = _client()
    resp = await client.fine_tuning.jobs.retrieve(openai_job_id)
    return _job_to_dict(resp)


async def cancel_job(openai_job_id: str) -> Dict[str, Any]:
    client = _client()
    resp = await client.fine_tuning.jobs.cancel(openai_job_id)
    return _job_to_dict(resp)


async def list_events(openai_job_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    client = _client()
    resp = await client.fine_tuning.jobs.list_events(fine_tuning_job_id=openai_job_id, limit=limit)
    return [
        {"id": e.id, "created_at": e.created_at, "level": e.level, "message": e.message,
         "type": getattr(e, "type", None)}
        for e in resp.data
    ]


async def infer(model_id: str, system: str, user: str, json_mode: bool = True,
                temperature: float = 0.0, max_tokens: int = 4096) -> Tuple[str, Dict[str, int]]:
    """Run inference against a base or fine-tuned model. Returns (text, usage)."""
    client = _client()
    kwargs: Dict[str, Any] = {
        "model": model_id,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    resp = await client.chat.completions.create(**kwargs)
    text = resp.choices[0].message.content or ""
    u = resp.usage
    usage = {
        "tokens_in": int(u.prompt_tokens or 0) if u else 0,
        "tokens_out": int(u.completion_tokens or 0) if u else 0,
    }
    return text, usage


def _job_to_dict(resp: Any) -> Dict[str, Any]:
    """Coerce an OpenAI FineTuningJob into a stable dict for storage."""
    err = getattr(resp, "error", None)
    return {
        "openai_job_id": resp.id,
        "openai_status": resp.status,                   # validating_files | queued | running | succeeded | failed | cancelled
        "fine_tuned_model": getattr(resp, "fine_tuned_model", None),
        "training_file": getattr(resp, "training_file", None),
        "trained_tokens": getattr(resp, "trained_tokens", None),
        "created_at": getattr(resp, "created_at", None),
        "finished_at": getattr(resp, "finished_at", None),
        "error_message": (err.message if err and getattr(err, "message", None) else None),
        "base_model": getattr(resp, "model", None),
    }


def is_configured() -> bool:
    return bool(os.environ.get("OPENAI_API_KEY", "").strip())
