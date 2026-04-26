"""FastAPI router for Register Maker — Phase A endpoints."""
from __future__ import annotations
import asyncio
import base64
import hashlib
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks
from datetime import datetime, timezone

from saffron_saas import db, get_user
from .models import (
    CategoryCreate, CategoryUpdate, TemplateUploadMeta,
    new_category_doc, new_template_doc,
)
from .extractors import detect_kind, extract_any
from .ai_schema import study_template

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
        "ai_usage": {
            "tokens_in": totals.get("tokens_in", 0),
            "tokens_out": totals.get("tokens_out", 0),
            "total_cost_inr": round(totals.get("cost_inr", 0.0), 2),
        },
    }


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
