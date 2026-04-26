"""Pydantic models + DB schemas for Register Maker."""
from __future__ import annotations
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime, timezone
import uuid


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Categories ──
class CategoryCreate(BaseModel):
    name: str
    state: Optional[str] = None  # fixed dim
    law: Optional[str] = None    # fixed dim
    tags: List[str] = Field(default_factory=list)  # freeform
    parent_id: Optional[str] = None  # for nesting
    description: Optional[str] = None


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    state: Optional[str] = None
    law: Optional[str] = None
    tags: Optional[List[str]] = None
    description: Optional[str] = None


# ── Templates ──
class TemplateAISchema(BaseModel):
    """The JSON schema the LLM extracts from a blank register template."""
    register_name: Optional[str] = None
    register_form_code: Optional[str] = None  # e.g. "Form A", "Form O"
    description: Optional[str] = None
    row_type: Optional[str] = None  # "per_employee" | "aggregate" | "per_period" | "mixed"
    period_basis: Optional[str] = None  # "monthly" | "quarterly" | "yearly" | "ad_hoc"
    columns: List[Dict[str, Any]] = Field(default_factory=list)
    # Each column: {name, key, dtype: text|number|date|currency|bool, required, source_hint, formula?, header_cell?, sample?}
    static_fields: List[Dict[str, Any]] = Field(default_factory=list)
    # Header-area / footer-area fields not in the data table: {name, key, source_hint, value_cell?, sample?}
    notes: Optional[str] = None
    confidence: float = 0.0  # 0.0-1.0
    model_used: Optional[str] = None
    extraction_warnings: List[str] = Field(default_factory=list)


class TemplateUploadMeta(BaseModel):
    name: str
    category_id: str
    register_form_code: Optional[str] = None  # user-provided hint
    notes: Optional[str] = None


# ── DB document shapes (for reference, not enforced) ──
def new_category_doc(org_id: str, body: CategoryCreate) -> Dict[str, Any]:
    return {
        "id": str(uuid.uuid4()),
        "organization_id": org_id,
        "name": body.name,
        "state": body.state,
        "law": body.law,
        "tags": body.tags or [],
        "parent_id": body.parent_id,
        "description": body.description,
        "created_at": utcnow(),
    }


def new_template_doc(org_id: str, user_id: str, meta: TemplateUploadMeta, file_name: str,
                     file_kind: str, file_size: int, file_b64: str, file_sha256: str) -> Dict[str, Any]:
    return {
        "id": str(uuid.uuid4()),
        "organization_id": org_id,
        "uploaded_by": user_id,
        "category_id": meta.category_id,
        "name": meta.name,
        "register_form_code": meta.register_form_code,
        "notes": meta.notes,
        "file_name": file_name,
        "file_kind": file_kind,  # "xlsx" | "pdf" | "docx"
        "file_size": file_size,
        "file_b64": file_b64,
        "file_sha256": file_sha256,  # template fingerprint for cross-tenant lib
        "ai_schema": None,  # filled in after AI study
        "ai_status": "pending",  # pending | studying | ready | failed
        "ai_error": None,
        "ai_tokens_in": 0,
        "ai_tokens_out": 0,
        "ai_cost_inr": 0.0,
        "created_at": utcnow(),
        "studied_at": None,
    }
