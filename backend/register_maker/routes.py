"""FastAPI router for Register Maker — Phase A + Phase B endpoints."""
from __future__ import annotations
import asyncio
import base64
import hashlib
import logging
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.responses import Response
from pydantic import BaseModel
from datetime import datetime, timezone

from saffron_saas import db, get_user
from .models import (
    CategoryCreate, CategoryUpdate, TemplateUploadMeta,
    new_category_doc, new_template_doc,
)
from .extractors import detect_kind, extract_any
from .ai_schema import study_template
from .data_sources import normalize_data_file, map_template_to_data
from .generator import fill_xlsx_template, generate_fresh_xlsx

logger = logging.getLogger(__name__)
register_maker_router = APIRouter(prefix="/register-maker", tags=["register-maker"])


# Helper: org gate — register-maker is an admin-only module today
def _require_admin_or_module_admin(u: dict):
    if u.get("role") == "admin":
        return
    mr = (u.get("module_roles") or {}).get("register_maker")
    if mr == "admin":
        return
    raise HTTPException(403, "Register Maker is admin-only")


def _org(u: dict) -> str:
    org_id = u.get("organization_id")
    if not org_id:
        raise HTTPException(400, "No organization context")
    return org_id


# ──────────────── CATEGORIES ────────────────
@register_maker_router.post("/categories")
async def create_category(body: CategoryCreate, u=Depends(get_user)):
    _require_admin_or_module_admin(u)
    org_id = _org(u)
    if body.parent_id:
        parent = await db.register_categories.find_one({"id": body.parent_id, "organization_id": org_id}, {"_id": 0})
        if not parent:
            raise HTTPException(400, "parent_id not found in your organization")
    doc = new_category_doc(org_id, body)
    await db.register_categories.insert_one(doc)
    doc.pop("_id", None)
    return doc


@register_maker_router.get("/categories")
async def list_categories(u=Depends(get_user)):
    _require_admin_or_module_admin(u)
    org_id = _org(u)
    cats = await db.register_categories.find({"organization_id": org_id}, {"_id": 0}).to_list(500)
    # Attach template counts
    counts = {}
    if cats:
        ids = [c["id"] for c in cats]
        pipeline = [
            {"$match": {"organization_id": org_id, "category_id": {"$in": ids}}},
            {"$group": {"_id": "$category_id", "n": {"$sum": 1}}},
        ]
        async for r in db.register_templates.aggregate(pipeline):
            counts[r["_id"]] = r["n"]
    for c in cats:
        c["template_count"] = counts.get(c["id"], 0)
    return cats


@register_maker_router.put("/categories/{cat_id}")
async def update_category(cat_id: str, body: CategoryUpdate, u=Depends(get_user)):
    _require_admin_or_module_admin(u)
    org_id = _org(u)
    upd = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if not upd:
        raise HTTPException(400, "Nothing to update")
    res = await db.register_categories.update_one({"id": cat_id, "organization_id": org_id}, {"$set": upd})
    if res.matched_count == 0:
        raise HTTPException(404, "Category not found")
    cat = await db.register_categories.find_one({"id": cat_id}, {"_id": 0})
    return cat


@register_maker_router.delete("/categories/{cat_id}")
async def delete_category(cat_id: str, u=Depends(get_user)):
    _require_admin_or_module_admin(u)
    org_id = _org(u)
    # Block delete if templates exist
    n = await db.register_templates.count_documents({"organization_id": org_id, "category_id": cat_id})
    if n > 0:
        raise HTTPException(400, f"Cannot delete — {n} template(s) live in this category. Move or delete them first.")
    # Block delete if children exist
    nc = await db.register_categories.count_documents({"organization_id": org_id, "parent_id": cat_id})
    if nc > 0:
        raise HTTPException(400, f"Cannot delete — {nc} sub-categories exist.")
    res = await db.register_categories.delete_one({"id": cat_id, "organization_id": org_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Category not found")
    return {"ok": True}


# ──────────────── TEMPLATES ────────────────
async def _study_template_bg(template_id: str, file_bytes: bytes, file_kind: str, hint: Optional[str]):
    """Background task: run AI study on uploaded template."""
    try:
        await db.register_templates.update_one({"id": template_id}, {"$set": {"ai_status": "studying"}})
        extracted = extract_any(file_bytes, "x." + file_kind) if file_kind in ("xlsx", "pdf", "docx") else None
        if not extracted:
            await db.register_templates.update_one({"id": template_id},
                {"$set": {"ai_status": "failed", "ai_error": "Could not extract content"}})
            return
        result = await study_template(extracted, file_bytes=file_bytes, file_kind=file_kind, hint=hint)
        await db.register_templates.update_one({"id": template_id}, {"$set": {
            "ai_schema": result["ai_schema"],
            "ai_status": "ready",
            "ai_error": None,
            "ai_tokens_in": result["tokens_in"],
            "ai_tokens_out": result["tokens_out"],
            "ai_cost_inr": result["cost_inr"],
            "ai_model_used": result["model_used"],
            "ai_escalated": result["escalated"],
            "studied_at": datetime.now(timezone.utc).isoformat(),
        }})
    except Exception as e:
        logger.exception("study_template_bg failed")
        await db.register_templates.update_one({"id": template_id}, {"$set": {
            "ai_status": "failed", "ai_error": str(e)[:500],
        }})


@register_maker_router.post("/templates")
async def upload_template(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    name: str = Form(...),
    category_id: str = Form(...),
    register_form_code: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    u=Depends(get_user),
):
    _require_admin_or_module_admin(u)
    org_id = _org(u)
    # Validate category
    cat = await db.register_categories.find_one({"id": category_id, "organization_id": org_id}, {"_id": 0})
    if not cat:
        raise HTTPException(400, "Invalid category_id")
    # Validate file kind
    try:
        kind = detect_kind(file.filename or "")
    except ValueError as e:
        raise HTTPException(400, str(e))
    content = await file.read()
    if not content:
        raise HTTPException(400, "Empty file")
    if len(content) > 15 * 1024 * 1024:
        raise HTTPException(400, "File too large (max 15MB)")
    sha256 = hashlib.sha256(content).hexdigest()
    file_b64 = base64.b64encode(content).decode()
    meta = TemplateUploadMeta(name=name, category_id=category_id, register_form_code=register_form_code, notes=notes)
    doc = new_template_doc(org_id, u["id"], meta, file.filename or f"template.{kind}", kind, len(content), file_b64, sha256)
    await db.register_templates.insert_one(doc)
    # Trigger AI study in background (returns immediately)
    background_tasks.add_task(_study_template_bg, doc["id"], content, kind, notes or name)
    # Return without file_b64
    out = {k: v for k, v in doc.items() if k not in ("file_b64", "_id")}
    return out


@register_maker_router.get("/templates")
async def list_templates(category_id: Optional[str] = None, u=Depends(get_user)):
    _require_admin_or_module_admin(u)
    org_id = _org(u)
    q = {"organization_id": org_id}
    if category_id:
        q["category_id"] = category_id
    items = await db.register_templates.find(q, {"_id": 0, "file_b64": 0}).sort("created_at", -1).to_list(500)
    return items


@register_maker_router.get("/templates/{template_id}")
async def get_template(template_id: str, u=Depends(get_user)):
    _require_admin_or_module_admin(u)
    org_id = _org(u)
    t = await db.register_templates.find_one({"id": template_id, "organization_id": org_id}, {"_id": 0, "file_b64": 0})
    if not t:
        raise HTTPException(404, "Template not found")
    return t


@register_maker_router.post("/templates/{template_id}/restudy")
async def restudy_template(template_id: str, background_tasks: BackgroundTasks, u=Depends(get_user)):
    """Re-run AI schema extraction on an existing template (e.g., after a fix or model upgrade)."""
    _require_admin_or_module_admin(u)
    org_id = _org(u)
    t = await db.register_templates.find_one({"id": template_id, "organization_id": org_id})
    if not t:
        raise HTTPException(404, "Template not found")
    file_b64 = t.get("file_b64")
    if not file_b64:
        raise HTTPException(400, "Template file not stored — please re-upload")
    try:
        content = base64.b64decode(file_b64)
    except Exception:
        raise HTTPException(500, "Stored file is corrupt")
    background_tasks.add_task(_study_template_bg, template_id, content, t["file_kind"], t.get("notes") or t.get("name"))
    await db.register_templates.update_one({"id": template_id}, {"$set": {"ai_status": "studying", "ai_error": None}})
    return {"ok": True, "status": "studying"}


@register_maker_router.delete("/templates/{template_id}")
async def delete_template(template_id: str, u=Depends(get_user)):
    _require_admin_or_module_admin(u)
    org_id = _org(u)
    res = await db.register_templates.delete_one({"id": template_id, "organization_id": org_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Template not found")
    return {"ok": True}


# ──────────────── USAGE / DASHBOARD STATS ────────────────
@register_maker_router.get("/stats")
async def stats(u=Depends(get_user)):
    _require_admin_or_module_admin(u)
    org_id = _org(u)
    n_cats = await db.register_categories.count_documents({"organization_id": org_id})
    n_tpls = await db.register_templates.count_documents({"organization_id": org_id})
    n_ready = await db.register_templates.count_documents({"organization_id": org_id, "ai_status": "ready"})
    # Sum tokens + cost
    pipeline = [
        {"$match": {"organization_id": org_id}},
        {"$group": {
            "_id": None,
            "tokens_in": {"$sum": "$ai_tokens_in"},
            "tokens_out": {"$sum": "$ai_tokens_out"},
            "cost_inr": {"$sum": "$ai_cost_inr"},
        }},
    ]
    agg = [r async for r in db.register_templates.aggregate(pipeline)]
    totals = agg[0] if agg else {"tokens_in": 0, "tokens_out": 0, "cost_inr": 0.0}
    totals.pop("_id", None)
    return {
        "categories": n_cats,
        "templates": n_tpls,
        "templates_ready": n_ready,
        "templates_studying": n_tpls - n_ready,
        "data_sources": await db.register_data_sources.count_documents({"organization_id": org_id}),
        "generations": await db.register_generations.count_documents({"organization_id": org_id}),
        "ai_usage": {
            "tokens_in": totals.get("tokens_in", 0),
            "tokens_out": totals.get("tokens_out", 0),
            "total_cost_inr": round(totals.get("cost_inr", 0.0), 2),
        },
    }


# ════════════════ PHASE B ════════════════

# ──────────────── DATA SOURCES (uploaded data files) ────────────────
async def _normalize_data_bg(data_source_id: str, file_bytes: bytes, file_name: str):
    try:
        await db.register_data_sources.update_one({"id": data_source_id}, {"$set": {"ai_status": "studying"}})
        result = await normalize_data_file(file_bytes, file_name)
        await db.register_data_sources.update_one({"id": data_source_id}, {"$set": {
            "normalized": result["normalized"],
            "raw_extract_kind": result["raw_extract_kind"],
            "ai_status": "ready",
            "ai_error": None,
            "ai_tokens_in": result["tokens_in"],
            "ai_tokens_out": result["tokens_out"],
            "ai_cost_inr": result["cost_inr"],
            "ai_model_used": result["model_used"],
            "ai_escalated": result["escalated"],
            "studied_at": datetime.now(timezone.utc).isoformat(),
        }})
    except Exception as e:
        logger.exception("normalize_data_bg failed")
        await db.register_data_sources.update_one({"id": data_source_id}, {"$set": {
            "ai_status": "failed", "ai_error": str(e)[:500],
        }})


@register_maker_router.post("/data-sources")
async def upload_data_source(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    label: Optional[str] = Form(None),
    u=Depends(get_user),
):
    _require_admin_or_module_admin(u)
    org_id = _org(u)
    try:
        kind = detect_kind(file.filename or "")
    except ValueError as e:
        raise HTTPException(400, str(e))
    content = await file.read()
    if not content:
        raise HTTPException(400, "Empty file")
    if len(content) > 25 * 1024 * 1024:
        raise HTTPException(400, "File too large (max 25MB)")
    sha = hashlib.sha256(content).hexdigest()
    doc = {
        "id": str(uuid.uuid4()),
        "organization_id": org_id,
        "uploaded_by": u["id"],
        "label": label or (file.filename or f"data.{kind}"),
        "file_name": file.filename or f"data.{kind}",
        "file_kind": kind,
        "file_size": len(content),
        "file_b64": base64.b64encode(content).decode(),
        "file_sha256": sha,
        "normalized": None,
        "ai_status": "pending",
        "ai_error": None,
        "ai_tokens_in": 0, "ai_tokens_out": 0, "ai_cost_inr": 0.0,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "studied_at": None,
    }
    await db.register_data_sources.insert_one(doc)
    background_tasks.add_task(_normalize_data_bg, doc["id"], content, file.filename or f"data.{kind}")
    out = {k: v for k, v in doc.items() if k not in ("file_b64", "_id")}
    return out


@register_maker_router.get("/data-sources")
async def list_data_sources(u=Depends(get_user)):
    _require_admin_or_module_admin(u)
    org_id = _org(u)
    items = await db.register_data_sources.find(
        {"organization_id": org_id}, {"_id": 0, "file_b64": 0}
    ).sort("created_at", -1).to_list(500)
    # Strip large normalized payload from list view; expose only summary
    for it in items:
        norm = it.pop("normalized", None) or {}
        it["records_count"] = len(norm.get("records") or [])
        it["available_fields_count"] = len(norm.get("available_fields") or [])
        it["normalized_period"] = norm.get("period") or {}
    return items


@register_maker_router.get("/data-sources/{ds_id}")
async def get_data_source(ds_id: str, u=Depends(get_user)):
    _require_admin_or_module_admin(u)
    org_id = _org(u)
    d = await db.register_data_sources.find_one({"id": ds_id, "organization_id": org_id}, {"_id": 0, "file_b64": 0})
    if not d:
        raise HTTPException(404, "Data source not found")
    return d


@register_maker_router.delete("/data-sources/{ds_id}")
async def delete_data_source(ds_id: str, u=Depends(get_user)):
    _require_admin_or_module_admin(u)
    org_id = _org(u)
    res = await db.register_data_sources.delete_one({"id": ds_id, "organization_id": org_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Data source not found")
    return {"ok": True}


# ──────────────── GENERATIONS (jobs that produce filled registers) ────────────────
class GenerationCreate(BaseModel):
    data_source_ids: List[str]
    template_ids: List[str]
    label: Optional[str] = None


def _merge_data_sources(sources: list) -> dict:
    """Combine multiple normalized data sources into one record set."""
    records: list = []
    available: set = set()
    establishment: dict = {}
    period: dict = {}
    for s in sources:
        norm = (s or {}).get("normalized") or {}
        for r in (norm.get("records") or []):
            records.append(r)
        for f in (norm.get("available_fields") or []):
            available.add(f)
        # First non-empty establishment/period wins
        if not establishment and norm.get("establishment"):
            establishment = norm["establishment"]
        if not period and norm.get("period"):
            period = norm["period"]
    return {
        "records": records,
        "available_fields": sorted(available),
        "establishment": establishment,
        "period": period,
    }


async def _run_generation_bg(generation_id: str):
    try:
        gen = await db.register_generations.find_one({"id": generation_id})
        if not gen:
            return
        # Fetch data sources
        ds_docs = await db.register_data_sources.find(
            {"id": {"$in": gen["data_source_ids"]}, "organization_id": gen["organization_id"]}
        ).to_list(50)
        if not ds_docs:
            await db.register_generations.update_one({"id": generation_id}, {"$set": {
                "status": "failed", "error": "Data sources not found", "completed_at": datetime.now(timezone.utc).isoformat()
            }})
            return
        # Wait for any pending data sources (max ~60s)
        for _ in range(30):
            pending = [d for d in ds_docs if d.get("ai_status") not in ("ready", "failed")]
            if not pending:
                break
            await asyncio.sleep(2)
            ds_docs = await db.register_data_sources.find(
                {"id": {"$in": gen["data_source_ids"]}, "organization_id": gen["organization_id"]}
            ).to_list(50)

        merged = _merge_data_sources(ds_docs)

        # Process each template
        results: list = []
        total_cost = 0.0
        total_in = 0
        total_out = 0
        for tid in gen["template_ids"]:
            tpl = await db.register_templates.find_one({"id": tid, "organization_id": gen["organization_id"]})
            if not tpl:
                results.append({"template_id": tid, "status": "failed", "error": "Template not found"})
                continue
            schema = tpl.get("ai_schema") or {}
            if not schema or tpl.get("ai_status") != "ready":
                results.append({"template_id": tid, "template_name": tpl.get("name"),
                                "status": "failed", "error": "Template AI study not ready"})
                continue

            # Field mapping (cached by template×data fingerprint)
            cache_key = hashlib.sha256(
                (tid + "|" + "|".join(sorted([d["file_sha256"] for d in ds_docs if d.get("file_sha256")]))).encode()
            ).hexdigest()
            cached = await db.register_mappings.find_one({"cache_key": cache_key})
            if cached:
                mapping = cached["mapping"]
                map_cost = 0.0
                map_in = 0
                map_out = 0
                map_escalated = False
                map_model = "cached"
            else:
                sample = (merged["records"][0] if merged["records"] else {})
                map_result = await map_template_to_data(
                    template_schema=schema,
                    available_fields=merged["available_fields"],
                    sample_record=sample.get("fields") if isinstance(sample, dict) else sample,
                    establishment=merged["establishment"],
                )
                mapping = map_result["mapping"]
                # Inject period for tolerant static lookup at fill time
                if merged.get("period"):
                    mapping["__period__"] = merged["period"]
                map_cost = map_result["cost_inr"]
                map_in = map_result["tokens_in"]
                map_out = map_result["tokens_out"]
                map_escalated = map_result["escalated"]
                map_model = map_result["model_used"]
                # Cache (excluding personal data)
                await db.register_mappings.insert_one({
                    "cache_key": cache_key,
                    "template_id": tid,
                    "organization_id": gen["organization_id"],
                    "mapping": mapping,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                })

            total_cost += map_cost
            total_in += map_in
            total_out += map_out

            # Filter records: only employee/payroll types
            data_records = [
                r for r in merged["records"]
                if isinstance(r, dict) and r.get("record_type") in ("employee", "payroll", "attendance", None)
            ] or merged["records"]

            # Generate output
            output_bytes: Optional[bytes] = None
            gen_meta: dict = {}
            try:
                if tpl.get("file_kind") == "xlsx" and tpl.get("file_b64"):
                    output_bytes, gen_meta = fill_xlsx_template(
                        tpl["file_b64"], schema, mapping, data_records, merged["establishment"]
                    )
                else:
                    output_bytes, gen_meta = generate_fresh_xlsx(
                        schema, mapping, data_records, merged["establishment"], register_name=tpl.get("name") or "Register"
                    )
            except Exception as e:
                logger.exception("fill failed")
                results.append({"template_id": tid, "template_name": tpl.get("name"),
                                "status": "failed", "error": f"Fill failed: {str(e)[:200]}"})
                continue

            output_id = str(uuid.uuid4())
            await db.register_outputs.insert_one({
                "id": output_id,
                "generation_id": generation_id,
                "template_id": tid,
                "organization_id": gen["organization_id"],
                "file_name": f"{(tpl.get('name') or 'register').replace(' ', '_')}_{datetime.now(timezone.utc).strftime('%Y%m')}.xlsx",
                "file_b64": base64.b64encode(output_bytes).decode(),
                "file_size": len(output_bytes),
                "created_at": datetime.now(timezone.utc).isoformat(),
            })

            results.append({
                "template_id": tid,
                "template_name": tpl.get("name"),
                "status": "ready",
                "output_id": output_id,
                "rows_written": gen_meta.get("rows_written", 0),
                "missing_required": (mapping or {}).get("missing_required") or [],
                "missing_optional": (mapping or {}).get("missing_optional") or [],
                "transforms": (mapping or {}).get("transforms") or {},
                "mapping_confidence": (mapping or {}).get("confidence", 0),
                "mapping_model": map_model,
                "mapping_escalated": map_escalated,
                "mapping_cost_inr": round(map_cost, 4),
            })

        await db.register_generations.update_one({"id": generation_id}, {"$set": {
            "status": "ready",
            "results": results,
            "merged_summary": {
                "records_count": len(merged["records"]),
                "available_fields": merged["available_fields"],
                "establishment": merged["establishment"],
                "period": merged["period"],
            },
            "ai_tokens_in": total_in,
            "ai_tokens_out": total_out,
            "ai_cost_inr": round(total_cost, 4),
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }})
    except Exception as e:
        logger.exception("generation failed")
        await db.register_generations.update_one({"id": generation_id}, {"$set": {
            "status": "failed", "error": str(e)[:500],
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }})


@register_maker_router.post("/generations")
async def create_generation(body: GenerationCreate, background_tasks: BackgroundTasks, u=Depends(get_user)):
    _require_admin_or_module_admin(u)
    org_id = _org(u)
    if not body.data_source_ids:
        raise HTTPException(400, "Pick at least one data source")
    if not body.template_ids:
        raise HTTPException(400, "Pick at least one register template")
    # Validate ownership
    n_ds = await db.register_data_sources.count_documents({
        "id": {"$in": body.data_source_ids}, "organization_id": org_id
    })
    if n_ds != len(body.data_source_ids):
        raise HTTPException(400, "One or more data sources not in your organization")
    n_tpl = await db.register_templates.count_documents({
        "id": {"$in": body.template_ids}, "organization_id": org_id
    })
    if n_tpl != len(body.template_ids):
        raise HTTPException(400, "One or more templates not in your organization")
    doc = {
        "id": str(uuid.uuid4()),
        "organization_id": org_id,
        "created_by": u["id"],
        "data_source_ids": body.data_source_ids,
        "template_ids": body.template_ids,
        "label": body.label or f"Generation {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M')}",
        "status": "queued",
        "results": [],
        "merged_summary": {},
        "ai_tokens_in": 0, "ai_tokens_out": 0, "ai_cost_inr": 0.0,
        "error": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "completed_at": None,
    }
    await db.register_generations.insert_one(doc)
    background_tasks.add_task(_run_generation_bg, doc["id"])
    out = {k: v for k, v in doc.items() if k != "_id"}
    return out


@register_maker_router.get("/generations")
async def list_generations(u=Depends(get_user)):
    _require_admin_or_module_admin(u)
    org_id = _org(u)
    items = await db.register_generations.find({"organization_id": org_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return items


@register_maker_router.get("/generations/{gen_id}")
async def get_generation(gen_id: str, u=Depends(get_user)):
    _require_admin_or_module_admin(u)
    org_id = _org(u)
    g = await db.register_generations.find_one({"id": gen_id, "organization_id": org_id}, {"_id": 0})
    if not g:
        raise HTTPException(404, "Generation not found")
    return g


@register_maker_router.delete("/generations/{gen_id}")
async def delete_generation(gen_id: str, u=Depends(get_user)):
    _require_admin_or_module_admin(u)
    org_id = _org(u)
    res = await db.register_generations.delete_one({"id": gen_id, "organization_id": org_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Generation not found")
    # Cascade — delete outputs
    await db.register_outputs.delete_many({"generation_id": gen_id, "organization_id": org_id})
    return {"ok": True}


@register_maker_router.get("/outputs/{output_id}/download")
async def download_output(output_id: str, u=Depends(get_user)):
    _require_admin_or_module_admin(u)
    org_id = _org(u)
    o = await db.register_outputs.find_one({"id": output_id, "organization_id": org_id})
    if not o:
        raise HTTPException(404, "Output not found")
    raw = base64.b64decode(o["file_b64"])
    headers = {"Content-Disposition": f'attachment; filename="{o["file_name"]}"'}
    return Response(content=raw, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers=headers)


# ──────────────── REFERENCE DATA ────────────────
INDIAN_STATES = [
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat",
    "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh",
    "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab",
    "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh",
    "Uttarakhand", "West Bengal",
    "Delhi", "Jammu & Kashmir", "Ladakh", "Puducherry", "Chandigarh", "Andaman & Nicobar",
    "Dadra & Nagar Haveli and Daman & Diu", "Lakshadweep",
]

LABOUR_LAWS = [
    "Factories Act, 1948",
    "Shops & Establishments Act (state-specific)",
    "Minimum Wages Act, 1948",
    "Payment of Wages Act, 1936",
    "Payment of Bonus Act, 1965",
    "Payment of Gratuity Act, 1972",
    "Contract Labour (R&A) Act, 1970",
    "Inter-State Migrant Workmen Act, 1979",
    "Equal Remuneration Act, 1976",
    "Maternity Benefit Act, 1961",
    "Industrial Employment (Standing Orders) Act, 1946",
    "Industrial Disputes Act, 1947",
    "Trade Unions Act, 1926",
    "Workmen's Compensation Act, 1923",
    "POSH Act, 2013",
    "Employees' Provident Funds & MP Act, 1952",
    "Employees' State Insurance Act, 1948",
    "Professional Tax (state-specific)",
    "Labour Welfare Fund (state-specific)",
    "Apprentices Act, 1961",
    "Child & Adolescent Labour Act, 1986",
    "Building & Other Construction Workers Act, 1996",
    "Code on Wages, 2019",
    "Industrial Relations Code, 2020",
    "Code on Social Security, 2020",
    "OSH&WC Code, 2020",
]


@register_maker_router.get("/meta/reference")
async def reference_data(u=Depends(get_user)):
    _require_admin_or_module_admin(u)
    return {"states": INDIAN_STATES, "laws": LABOUR_LAWS}
