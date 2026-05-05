"""Fine-tuning Studio routes — `/api/finetune/*` (platform_admin only).

Endpoints:
  GET    /finetune/config                                — provider key status + tunable models + tasks
  POST   /finetune/datasets                              — create dataset
  GET    /finetune/datasets                              — list datasets (with counts)
  GET    /finetune/datasets/{id}                         — dataset detail
  DELETE /finetune/datasets/{id}                         — delete dataset (+ examples)
  POST   /finetune/datasets/{id}/upload                  — upload PDF/Excel; bootstrap candidate
  GET    /finetune/datasets/{id}/examples?status=        — list examples
  GET    /finetune/datasets/{id}/jsonl                   — preview JSONL (approved-non-holdout)
  PUT    /finetune/examples/{id}                         — edit ground_truth/candidate
  POST   /finetune/examples/{id}/approve                 — mark approved
  POST   /finetune/examples/{id}/reject                  — mark rejected
  POST   /finetune/examples/{id}/holdout                 — toggle holdout
  DELETE /finetune/examples/{id}
  POST   /finetune/jobs                                  — kick off OpenAI fine-tune
  GET    /finetune/jobs                                  — list jobs
  GET    /finetune/jobs/{id}                             — refresh status from OpenAI + return
  POST   /finetune/jobs/{id}/cancel                      — cancel
  GET    /finetune/jobs/{id}/events                      — OpenAI training events log
  POST   /finetune/eval-runs                             — start a new eval (job_id)
  GET    /finetune/eval-runs                             — list
  GET    /finetune/eval-runs/{id}                        — detail with metrics + side-by-side pairs
  POST   /finetune/eval-runs/{id}/judgments              — record human side-by-side vote
"""
from __future__ import annotations
import asyncio
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

from saffron_saas import get_user
from . import openai_ft
from .tasks import TASKS, get_task, list_tasks, build_jsonl_lines, field_f1

logger = logging.getLogger(__name__)

_mongo_url = os.environ["MONGO_URL"]
_client = AsyncIOMotorClient(_mongo_url)
db = _client[os.environ["DB_NAME"]]


finetune_router = APIRouter(prefix="/finetune", tags=["finetune"])


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────
def _require_platform_admin(u: Dict[str, Any]) -> None:
    if u.get("role") != "platform_admin":
        raise HTTPException(403, "Fine-tuning Studio is platform-admin only")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic bodies
# ─────────────────────────────────────────────────────────────────────────────
class CreateDatasetBody(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    task_type: str
    description: Optional[str] = None


class UpdateExampleBody(BaseModel):
    ground_truth_output: Optional[Dict[str, Any]] = None
    candidate_output: Optional[Dict[str, Any]] = None
    notes: Optional[str] = None


class CreateJobBody(BaseModel):
    dataset_id: str
    provider: str = "openai"  # only "openai" supported right now
    base_model: str = "gpt-4o-mini-2024-07-18"
    n_epochs: int = Field(3, ge=1, le=25)
    learning_rate_multiplier: Optional[float] = Field(None, ge=0.05, le=5.0)
    batch_size: Optional[int] = Field(None, ge=1, le=64)
    suffix: Optional[str] = None  # short name suffix, max 18 chars


class JudgmentBody(BaseModel):
    example_id: str
    choice: str  # "base" | "ft" | "tie"
    notes: Optional[str] = None


# ─────────────────────────────────────────────────────────────────────────────
# Config
# ─────────────────────────────────────────────────────────────────────────────
@finetune_router.get("/config")
async def get_config(u=Depends(get_user)):
    _require_platform_admin(u)
    return {
        "providers": {
            "openai": {
                "configured": openai_ft.is_configured(),
                "env_key": "OPENAI_API_KEY",
                "instructions": "Add OPENAI_API_KEY=sk-... to /app/backend/.env, then restart backend.",
                "tunable_models": openai_ft.TUNABLE_BASE_MODELS,
            },
            "gemini": {
                "configured": False,
                "env_key": "GOOGLE_VERTEX_PROJECT",
                "instructions": (
                    "Gemini fine-tuning was deprecated in the API-key path (May 2025). "
                    "Vertex AI is required: needs a GCP project, a service-account JSON, "
                    "and gcloud auth. Coming in a follow-up."
                ),
                "tunable_models": [],
            },
        },
        "tasks": list_tasks(),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Datasets
# ─────────────────────────────────────────────────────────────────────────────
@finetune_router.post("/datasets")
async def create_dataset(body: CreateDatasetBody, u=Depends(get_user)):
    _require_platform_admin(u)
    if body.task_type not in TASKS:
        raise HTTPException(400, f"task_type must be one of {list(TASKS.keys())}")
    doc = {
        "id": str(uuid.uuid4()),
        "name": body.name,
        "task_type": body.task_type,
        "description": body.description,
        "created_at": _now_iso(),
        "created_by": u["id"],
    }
    await db.ft_datasets.insert_one(doc)
    return {"id": doc["id"], "name": doc["name"], "task_type": doc["task_type"],
            "description": doc["description"], "created_at": doc["created_at"],
            "counts": {"total": 0, "pending": 0, "approved": 0, "rejected": 0, "holdout": 0}}


async def _dataset_counts(dataset_id: str) -> Dict[str, int]:
    pipeline = [
        {"$match": {"dataset_id": dataset_id}},
        {"$group": {"_id": "$status", "n": {"$sum": 1}}},
    ]
    out = {"total": 0, "pending": 0, "approved": 0, "rejected": 0, "holdout": 0}
    async for r in db.ft_examples.aggregate(pipeline):
        out[r["_id"]] = r["n"]
        out["total"] += r["n"]
    out["holdout"] = await db.ft_examples.count_documents(
        {"dataset_id": dataset_id, "status": "approved", "holdout": True})
    return out


@finetune_router.get("/datasets")
async def list_datasets(u=Depends(get_user)):
    _require_platform_admin(u)
    rows = await db.ft_datasets.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    out = []
    for r in rows:
        counts = await _dataset_counts(r["id"])
        out.append({**r, "counts": counts, "task_label": TASKS[r["task_type"]]["label"]})
    return out


@finetune_router.get("/datasets/{dataset_id}")
async def get_dataset(dataset_id: str, u=Depends(get_user)):
    _require_platform_admin(u)
    ds = await db.ft_datasets.find_one({"id": dataset_id}, {"_id": 0})
    if not ds:
        raise HTTPException(404, "Dataset not found")
    counts = await _dataset_counts(dataset_id)
    return {**ds, "counts": counts, "task": TASKS[ds["task_type"]]}


@finetune_router.delete("/datasets/{dataset_id}")
async def delete_dataset(dataset_id: str, u=Depends(get_user)):
    _require_platform_admin(u)
    await db.ft_examples.delete_many({"dataset_id": dataset_id})
    res = await db.ft_datasets.delete_one({"id": dataset_id})
    return {"ok": res.deleted_count == 1}


# ─────────────────────────────────────────────────────────────────────────────
# Examples
# ─────────────────────────────────────────────────────────────────────────────
@finetune_router.post("/datasets/{dataset_id}/upload")
async def upload_example(dataset_id: str, file: UploadFile = File(...), u=Depends(get_user)):
    """Upload a PDF/Excel/Word file. Backend runs the current production AI to
    bootstrap a candidate JSON output, which the user can then edit + approve."""
    _require_platform_admin(u)
    ds = await db.ft_datasets.find_one({"id": dataset_id})
    if not ds:
        raise HTTPException(404, "Dataset not found")
    task = get_task(ds["task_type"])
    bootstrap = task["bootstrap"]

    raw = await file.read()
    if not raw:
        raise HTTPException(400, "Empty file")
    if len(raw) > 25 * 1024 * 1024:
        raise HTTPException(413, "File too large (max 25 MB)")

    try:
        input_text, candidate = await bootstrap(raw, file.filename or "upload.bin")
    except Exception as e:
        logger.exception(f"finetune.upload bootstrap failed for task={ds['task_type']}")
        raise HTTPException(500, f"AI bootstrap failed: {e}")

    doc = {
        "id": str(uuid.uuid4()),
        "dataset_id": dataset_id,
        "task_type": ds["task_type"],
        "source_filename": file.filename,
        "source_size": len(raw),
        "input_text": input_text,
        "candidate_output": candidate,
        "ground_truth_output": candidate,    # start with candidate; user edits
        "status": "pending",                 # pending → approved | rejected
        "holdout": False,
        "notes": None,
        "created_at": _now_iso(),
    }
    await db.ft_examples.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@finetune_router.get("/datasets/{dataset_id}/examples")
async def list_examples(dataset_id: str, status: Optional[str] = None, u=Depends(get_user)):
    _require_platform_admin(u)
    q: Dict[str, Any] = {"dataset_id": dataset_id}
    if status:
        q["status"] = status
    rows = await db.ft_examples.find(
        q, {"_id": 0, "input_text": 0},
    ).sort("created_at", -1).to_list(500)
    return rows


@finetune_router.get("/examples/{example_id}")
async def get_example(example_id: str, u=Depends(get_user)):
    _require_platform_admin(u)
    ex = await db.ft_examples.find_one({"id": example_id}, {"_id": 0})
    if not ex:
        raise HTTPException(404, "Example not found")
    return ex


@finetune_router.put("/examples/{example_id}")
async def update_example(example_id: str, body: UpdateExampleBody, u=Depends(get_user)):
    _require_platform_admin(u)
    update: Dict[str, Any] = {}
    if body.ground_truth_output is not None:
        update["ground_truth_output"] = body.ground_truth_output
    if body.candidate_output is not None:
        update["candidate_output"] = body.candidate_output
    if body.notes is not None:
        update["notes"] = body.notes
    if not update:
        raise HTTPException(400, "Nothing to update")
    update["updated_at"] = _now_iso()
    res = await db.ft_examples.update_one({"id": example_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(404, "Example not found")
    return {"ok": True}


@finetune_router.post("/examples/{example_id}/approve")
async def approve_example(example_id: str, u=Depends(get_user)):
    _require_platform_admin(u)
    res = await db.ft_examples.update_one(
        {"id": example_id}, {"$set": {"status": "approved", "approved_at": _now_iso()}})
    if res.matched_count == 0:
        raise HTTPException(404, "Example not found")
    return {"ok": True, "status": "approved"}


@finetune_router.post("/examples/{example_id}/reject")
async def reject_example(example_id: str, u=Depends(get_user)):
    _require_platform_admin(u)
    res = await db.ft_examples.update_one(
        {"id": example_id}, {"$set": {"status": "rejected", "rejected_at": _now_iso()}})
    if res.matched_count == 0:
        raise HTTPException(404, "Example not found")
    return {"ok": True, "status": "rejected"}


@finetune_router.post("/examples/{example_id}/holdout")
async def toggle_holdout(example_id: str, u=Depends(get_user)):
    _require_platform_admin(u)
    ex = await db.ft_examples.find_one({"id": example_id}, {"_id": 0, "holdout": 1})
    if not ex:
        raise HTTPException(404, "Example not found")
    new_val = not bool(ex.get("holdout"))
    await db.ft_examples.update_one({"id": example_id}, {"$set": {"holdout": new_val}})
    return {"ok": True, "holdout": new_val}


@finetune_router.delete("/examples/{example_id}")
async def delete_example(example_id: str, u=Depends(get_user)):
    _require_platform_admin(u)
    res = await db.ft_examples.delete_one({"id": example_id})
    return {"ok": res.deleted_count == 1}


@finetune_router.get("/datasets/{dataset_id}/jsonl")
async def preview_jsonl(dataset_id: str, u=Depends(get_user)):
    """Returns the JSONL training rows that would be uploaded to OpenAI."""
    _require_platform_admin(u)
    ds = await db.ft_datasets.find_one({"id": dataset_id})
    if not ds:
        raise HTTPException(404, "Dataset not found")
    rows = await db.ft_examples.find(
        {"dataset_id": dataset_id, "status": "approved", "holdout": {"$ne": True}},
        {"_id": 0},
    ).to_list(2000)
    lines = build_jsonl_lines(ds["task_type"], rows)
    return {"line_count": len(lines), "preview": lines[:5], "char_count": sum(len(line) for line in lines)}


# ─────────────────────────────────────────────────────────────────────────────
# Jobs
# ─────────────────────────────────────────────────────────────────────────────
@finetune_router.post("/jobs")
async def create_job(body: CreateJobBody, u=Depends(get_user)):
    _require_platform_admin(u)
    if body.provider != "openai":
        raise HTTPException(400, "Only provider='openai' is supported right now")
    if not openai_ft.is_configured():
        raise HTTPException(400, "OPENAI_API_KEY not set in /app/backend/.env. Add the key and restart.")

    ds = await db.ft_datasets.find_one({"id": body.dataset_id})
    if not ds:
        raise HTTPException(404, "Dataset not found")
    examples = await db.ft_examples.find(
        {"dataset_id": body.dataset_id, "status": "approved", "holdout": {"$ne": True}},
        {"_id": 0},
    ).to_list(5000)
    if len(examples) < 10:
        raise HTTPException(400, f"OpenAI requires at least 10 approved non-holdout examples; you have {len(examples)}")

    lines = build_jsonl_lines(ds["task_type"], examples)
    cost = openai_ft.estimate_training_cost_usd(lines, body.base_model, body.n_epochs)

    # Upload + create job (these are synchronous OpenAI calls; we await them inline)
    try:
        file_id = await openai_ft.upload_training_file(lines, filename=f"saffron-{body.dataset_id[:8]}.jsonl")
        oai = await openai_ft.create_job(
            training_file_id=file_id, base_model=body.base_model,
            n_epochs=body.n_epochs,
            learning_rate_multiplier=body.learning_rate_multiplier,
            batch_size=body.batch_size,
            suffix=body.suffix,
        )
    except Exception as e:
        logger.exception("finetune.create_job: OpenAI call failed")
        raise HTTPException(500, f"OpenAI fine-tuning API rejected the request: {e}")

    doc = {
        "id": str(uuid.uuid4()),
        "dataset_id": body.dataset_id,
        "dataset_name": ds["name"],
        "task_type": ds["task_type"],
        "provider": "openai",
        "base_model": body.base_model,
        "hyperparameters": {
            "n_epochs": body.n_epochs,
            "learning_rate_multiplier": body.learning_rate_multiplier,
            "batch_size": body.batch_size,
            "suffix": body.suffix,
        },
        "training_examples": len(examples),
        "training_file_id": file_id,
        "cost_estimate": cost,
        "created_at": _now_iso(),
        "created_by": u["id"],
        **oai,
    }
    await db.ft_jobs.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@finetune_router.get("/jobs")
async def list_jobs(u=Depends(get_user)):
    _require_platform_admin(u)
    rows = await db.ft_jobs.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return rows


@finetune_router.get("/jobs/{job_id}")
async def get_job(job_id: str, u=Depends(get_user)):
    _require_platform_admin(u)
    job = await db.ft_jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(404, "Job not found")
    # Refresh from OpenAI if not terminal
    if job.get("openai_status") in {"validating_files", "queued", "running"}:
        try:
            latest = await openai_ft.get_job(job["openai_job_id"])
            await db.ft_jobs.update_one(
                {"id": job_id},
                {"$set": {**latest, "last_polled_at": _now_iso()}},
            )
            job.update(latest)
        except Exception as e:
            logger.warning(f"finetune.get_job: refresh failed: {e}")
    return job


@finetune_router.post("/jobs/{job_id}/cancel")
async def cancel_job(job_id: str, u=Depends(get_user)):
    _require_platform_admin(u)
    job = await db.ft_jobs.find_one({"id": job_id})
    if not job:
        raise HTTPException(404, "Job not found")
    try:
        latest = await openai_ft.cancel_job(job["openai_job_id"])
        await db.ft_jobs.update_one({"id": job_id}, {"$set": latest})
        return {"ok": True, **latest}
    except Exception as e:
        raise HTTPException(500, f"Cancel failed: {e}")


@finetune_router.get("/jobs/{job_id}/events")
async def job_events(job_id: str, u=Depends(get_user)):
    _require_platform_admin(u)
    job = await db.ft_jobs.find_one({"id": job_id}, {"_id": 0, "openai_job_id": 1})
    if not job:
        raise HTTPException(404, "Job not found")
    try:
        events = await openai_ft.list_events(job["openai_job_id"], limit=100)
        return {"events": events}
    except Exception as e:
        raise HTTPException(500, f"Could not fetch events: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# Eval Runs
# ─────────────────────────────────────────────────────────────────────────────
@finetune_router.post("/eval-runs")
async def start_eval(body: Dict[str, Any], u=Depends(get_user)):
    _require_platform_admin(u)
    job_id = body.get("job_id")
    if not job_id:
        raise HTTPException(400, "job_id is required")
    job = await db.ft_jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(404, "Job not found")
    if not job.get("fine_tuned_model"):
        raise HTTPException(400, "Job has not produced a fine-tuned model yet")
    holdout = await db.ft_examples.find(
        {"dataset_id": job["dataset_id"], "status": "approved", "holdout": True},
        {"_id": 0},
    ).to_list(500)
    if not holdout:
        raise HTTPException(400, "No holdout examples in this dataset. Mark some approved examples as 'holdout'.")

    task = get_task(job["task_type"])
    base_model = job["base_model"]
    ft_model = job["fine_tuned_model"]

    pairs: List[Dict[str, Any]] = []
    metric_sums = {"base_f1": 0.0, "ft_f1": 0.0, "base_em": 0.0, "ft_em": 0.0}

    async def _run_one(ex: Dict[str, Any]) -> Dict[str, Any]:
        """Run base + ft inference on a single example, score both."""
        base_text, base_usage = "", {"tokens_in": 0, "tokens_out": 0}
        ft_text, ft_usage = "", {"tokens_in": 0, "tokens_out": 0}
        try:
            base_text, base_usage = await openai_ft.infer(
                base_model, task["system"], ex["input_text"])
        except Exception as e:
            base_text = json.dumps({"error": str(e)})
        try:
            ft_text, ft_usage = await openai_ft.infer(
                ft_model, task["system"], ex["input_text"])
        except Exception as e:
            ft_text = json.dumps({"error": str(e)})

        try:
            base_json = json.loads(base_text)
        except Exception:
            base_json = {"_unparseable": base_text[:500]}
        try:
            ft_json = json.loads(ft_text)
        except Exception:
            ft_json = {"_unparseable": ft_text[:500]}

        gt = ex.get("ground_truth_output") or {}
        base_metrics = field_f1(base_json, gt)
        ft_metrics = field_f1(ft_json, gt)
        return {
            "example_id": ex["id"],
            "source_filename": ex.get("source_filename"),
            "ground_truth": gt,
            "base_output": base_json,
            "ft_output": ft_json,
            "base_metrics": base_metrics,
            "ft_metrics": ft_metrics,
            "base_usage": base_usage,
            "ft_usage": ft_usage,
        }

    # Run with limited concurrency to stay under OpenAI rate limits
    sem = asyncio.Semaphore(4)

    async def _bounded(ex):
        async with sem:
            return await _run_one(ex)

    pairs = await asyncio.gather(*[_bounded(ex) for ex in holdout])
    n = len(pairs) or 1
    for p in pairs:
        metric_sums["base_f1"] += p["base_metrics"]["f1"]
        metric_sums["ft_f1"] += p["ft_metrics"]["f1"]
        metric_sums["base_em"] += p["base_metrics"]["exact_match"]
        metric_sums["ft_em"] += p["ft_metrics"]["exact_match"]

    summary = {
        "base_avg_f1": round(metric_sums["base_f1"] / n, 4),
        "ft_avg_f1": round(metric_sums["ft_f1"] / n, 4),
        "base_exact_match_rate": round(metric_sums["base_em"] / n, 4),
        "ft_exact_match_rate": round(metric_sums["ft_em"] / n, 4),
        "ft_lift_f1": round((metric_sums["ft_f1"] - metric_sums["base_f1"]) / n, 4),
        "n_examples": n,
    }
    doc = {
        "id": str(uuid.uuid4()),
        "job_id": job_id,
        "dataset_id": job["dataset_id"],
        "task_type": job["task_type"],
        "base_model": base_model,
        "ft_model": ft_model,
        "summary": summary,
        "pairs": pairs,
        "judgments": [],
        "created_at": _now_iso(),
        "created_by": u["id"],
    }
    await db.ft_eval_runs.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@finetune_router.get("/eval-runs")
async def list_eval_runs(u=Depends(get_user)):
    _require_platform_admin(u)
    rows = await db.ft_eval_runs.find(
        {}, {"_id": 0, "pairs": 0, "judgments": 0},  # lighter list view
    ).sort("created_at", -1).to_list(100)
    return rows


@finetune_router.get("/eval-runs/{run_id}")
async def get_eval_run(run_id: str, u=Depends(get_user)):
    _require_platform_admin(u)
    r = await db.ft_eval_runs.find_one({"id": run_id}, {"_id": 0})
    if not r:
        raise HTTPException(404, "Eval run not found")
    return r


@finetune_router.post("/eval-runs/{run_id}/judgments")
async def record_judgment(run_id: str, body: JudgmentBody, u=Depends(get_user)):
    _require_platform_admin(u)
    if body.choice not in {"base", "ft", "tie"}:
        raise HTTPException(400, "choice must be 'base', 'ft', or 'tie'")
    judgment = {
        "id": str(uuid.uuid4()),
        "example_id": body.example_id,
        "choice": body.choice,
        "notes": body.notes,
        "judge_id": u["id"],
        "created_at": _now_iso(),
    }
    res = await db.ft_eval_runs.update_one(
        {"id": run_id},
        {"$pull": {"judgments": {"example_id": body.example_id}}},  # remove prior vote on same example
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Eval run not found")
    await db.ft_eval_runs.update_one(
        {"id": run_id}, {"$push": {"judgments": judgment}})
    # recompute aggregate
    run = await db.ft_eval_runs.find_one({"id": run_id}, {"_id": 0, "judgments": 1})
    js = run.get("judgments", [])
    counts = {"base": 0, "ft": 0, "tie": 0}
    for j in js:
        counts[j["choice"]] = counts.get(j["choice"], 0) + 1
    return {"ok": True, "judgments": js, "counts": counts}
