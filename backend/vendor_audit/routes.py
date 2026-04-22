"""Vendor Audit API routes — admin manages contractors, contractors upload docs + view audits."""
from __future__ import annotations
import base64
import io
import os
import secrets
import uuid
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Response
from fastapi.security import HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from jose import jwt

from .models import (
    ContractorCreate, ContractorUpdate, AuditStartRequest, ChangePasswordRequest,
    VENDOR_SHEET_COLUMNS, PDF_DOC_TYPES, CENTRAL_LAWS, STATE_LAWS,
)
from .parsers import parse_vendor_excel, build_template_xlsx, DOC_PARSERS
from .rules import run_full_audit
from .registers import build_pf_register, build_esic_register, build_pt_register


# ── Shared deps (Mongo, auth) — re-use server-level connection ──
_mongo_url = os.environ["MONGO_URL"]
_client = AsyncIOMotorClient(_mongo_url)
db = _client[os.environ["DB_NAME"]]

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
SECRET_KEY = os.environ.get("SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
TOKEN_EXPIRE_MIN = 1440


vendor_router = APIRouter(prefix="/vendor-audit", tags=["vendor-audit"])
contractor_auth_router = APIRouter(prefix="/contractor", tags=["contractor-auth"])


# ── Auth helpers ──
from fastapi.security import HTTPBearer
security = HTTPBearer()


def _create_token(user_id: str, role: str) -> str:
    from datetime import timedelta
    payload = {"sub": user_id, "role": role, "exp": datetime.now(timezone.utc) + timedelta(minutes=TOKEN_EXPIRE_MIN)}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


async def get_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        uid = payload.get("sub")
        user = await db.users.find_one({"id": uid}, {"_id": 0, "password": 0})
        if not user:
            raise HTTPException(401, "User not found")
        return user
    except Exception:
        raise HTTPException(401, "Invalid token")


def require_admin(u):
    if u.get("role") != "admin":
        raise HTTPException(403, "Admin only")


def require_contractor(u):
    if u.get("role") != "contractor":
        raise HTTPException(403, "Contractor only")


async def contractor_for(u) -> dict:
    """Return contractor record for the logged-in contractor user."""
    c = await db.contractors.find_one({"user_id": u["id"]}, {"_id": 0})
    if not c:
        raise HTTPException(404, "No contractor profile linked to your account")
    return c


# ══════════════════════════ CONTRACTOR AUTH ══════════════════════════
from pydantic import BaseModel, EmailStr


class ContractorLogin(BaseModel):
    email: EmailStr
    password: str


@contractor_auth_router.post("/auth/login")
async def contractor_login(creds: ContractorLogin):
    user = await db.users.find_one({"email": creds.email, "role": "contractor"}, {"_id": 0})
    if not user or not pwd_context.verify(creds.password, user["password"]):
        raise HTTPException(401, "Invalid credentials")
    contractor = await db.contractors.find_one({"user_id": user["id"]}, {"_id": 0})
    token = _create_token(user["id"], "contractor")
    return {
        "access_token": token, "token_type": "bearer",
        "user": {"id": user["id"], "email": user["email"], "full_name": user["full_name"], "role": "contractor",
                 "must_change_password": user.get("must_change_password", False)},
        "contractor": contractor,
    }


@contractor_auth_router.get("/auth/me")
async def contractor_me(u=Depends(get_user)):
    require_contractor(u)
    c = await contractor_for(u)
    return {"user": u, "contractor": c}


@contractor_auth_router.post("/auth/change-password")
async def change_password(body: ChangePasswordRequest, u=Depends(get_user)):
    require_contractor(u)
    full = await db.users.find_one({"id": u["id"]}, {"_id": 0})
    if not pwd_context.verify(body.current_password, full["password"]):
        raise HTTPException(400, "Current password incorrect")
    if len(body.new_password) < 8:
        raise HTTPException(400, "New password must be at least 8 characters")
    await db.users.update_one({"id": u["id"]}, {"$set": {
        "password": pwd_context.hash(body.new_password), "must_change_password": False,
    }})
    return {"ok": True}


# ══════════════════════════ ADMIN — CONTRACTORS ══════════════════════════
@vendor_router.post("/contractors")
async def create_contractor(body: ContractorCreate, u=Depends(get_user)):
    require_admin(u)
    # Ensure unique email for user account
    exists = await db.users.find_one({"email": body.contact_email})
    if exists:
        raise HTTPException(400, f"A user with email {body.contact_email} already exists")
    temp_password = secrets.token_urlsafe(10)
    user_id = str(uuid.uuid4())
    contractor_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    await db.users.insert_one({
        "id": user_id, "email": body.contact_email, "full_name": body.contact_person or body.name,
        "role": "contractor", "password": pwd_context.hash(temp_password),
        "must_change_password": True, "created_at": now, "permissions": None,
    })
    c = body.model_dump()
    c["id"] = contractor_id
    c["user_id"] = user_id
    c["status"] = "active"
    c["created_at"] = now
    c["created_by"] = u["id"]
    await db.contractors.insert_one(c)
    c.pop("_id", None)
    return {"contractor": c, "temp_password": temp_password,
            "message": f"Share these credentials with the contractor: email={body.contact_email}, password={temp_password}"}


@vendor_router.get("/contractors")
async def list_contractors(u=Depends(get_user)):
    require_admin(u)
    data = await db.contractors.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return data


@vendor_router.get("/contractors/{contractor_id}")
async def get_contractor(contractor_id: str, u=Depends(get_user)):
    require_admin(u)
    c = await db.contractors.find_one({"id": contractor_id}, {"_id": 0})
    if not c: raise HTTPException(404, "Contractor not found")
    return c


@vendor_router.put("/contractors/{contractor_id}")
async def update_contractor(contractor_id: str, body: ContractorUpdate, u=Depends(get_user)):
    require_admin(u)
    patch = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if patch:
        await db.contractors.update_one({"id": contractor_id}, {"$set": patch})
    c = await db.contractors.find_one({"id": contractor_id}, {"_id": 0})
    if not c: raise HTTPException(404, "Contractor not found")
    return c


@vendor_router.post("/contractors/{contractor_id}/reset-password")
async def reset_contractor_password(contractor_id: str, u=Depends(get_user)):
    require_admin(u)
    c = await db.contractors.find_one({"id": contractor_id}, {"_id": 0})
    if not c: raise HTTPException(404, "Contractor not found")
    temp = secrets.token_urlsafe(10)
    await db.users.update_one({"id": c["user_id"]}, {"$set": {
        "password": pwd_context.hash(temp), "must_change_password": True,
    }})
    return {"temp_password": temp, "message": f"New temp password generated for {c['contact_email']}: {temp}"}


@vendor_router.delete("/contractors/{contractor_id}")
async def delete_contractor(contractor_id: str, u=Depends(get_user)):
    require_admin(u)
    c = await db.contractors.find_one({"id": contractor_id}, {"_id": 0})
    if not c: raise HTTPException(404, "Contractor not found")
    await db.contractors.delete_one({"id": contractor_id})
    await db.users.delete_one({"id": c["user_id"]})
    # Keep audit history
    return {"ok": True}


# ══════════════════════════ TEMPLATE DOWNLOAD (public for admins + contractors) ══════════════════════════
@vendor_router.get("/template/vendor-data-sheet")
async def download_template(u=Depends(get_user)):
    if u.get("role") not in ("admin", "contractor"):
        raise HTTPException(403, "Admin or contractor only")
    xlsx = build_template_xlsx()
    return Response(content=xlsx,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=vendor_data_collection_template.xlsx"})


@vendor_router.get("/meta/schema")
async def get_schema(u=Depends(get_user)):
    if u.get("role") not in ("admin", "contractor"):
        raise HTTPException(403, "Admin or contractor only")
    return {
        "sheet_columns": VENDOR_SHEET_COLUMNS,
        "pdf_doc_types": [{"key": k, "label": v} for k, v in PDF_DOC_TYPES],
        "central_laws": CENTRAL_LAWS,
        "state_laws": STATE_LAWS,
    }


# ══════════════════════════ AUDIT LIFECYCLE ══════════════════════════
async def _resolve_contractor(u, contractor_id: Optional[str] = None) -> dict:
    if u.get("role") == "contractor":
        return await contractor_for(u)
    require_admin(u)
    if not contractor_id:
        raise HTTPException(400, "contractor_id is required when admin starts an audit")
    c = await db.contractors.find_one({"id": contractor_id}, {"_id": 0})
    if not c: raise HTTPException(404, "Contractor not found")
    return c


@vendor_router.post("/audits/start")
async def start_audit(body: AuditStartRequest, contractor_id: Optional[str] = None, u=Depends(get_user)):
    c = await _resolve_contractor(u, contractor_id)
    audit_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    record = {
        "id": audit_id, "contractor_id": c["id"], "contractor_name": c.get("name", ""),
        "wage_month": body.wage_month.upper(), "state": body.state.upper(),
        "status": "draft",  # draft | uploaded | parsed | audited | submitted | approved | rejected
        "created_at": now, "created_by": u["id"],
        "rows": [], "documents": {}, "parsed_documents": {}, "audit_result": None,
        "manual_overrides": {},
    }
    await db.audit_runs.insert_one(record)
    record.pop("_id", None)
    return record


@vendor_router.get("/audits")
async def list_audits(contractor_id: Optional[str] = None, u=Depends(get_user)):
    q = {}
    if u.get("role") == "contractor":
        c = await contractor_for(u)
        q["contractor_id"] = c["id"]
    elif contractor_id:
        q["contractor_id"] = contractor_id
    data = await db.audit_runs.find(q, {"_id": 0, "rows": 0, "parsed_documents": 0}).sort("created_at", -1).to_list(500)
    return data


async def _load_audit(audit_id: str, u) -> dict:
    a = await db.audit_runs.find_one({"id": audit_id}, {"_id": 0})
    if not a: raise HTTPException(404, "Audit not found")
    if u.get("role") == "contractor":
        c = await contractor_for(u)
        if a["contractor_id"] != c["id"]:
            raise HTTPException(403, "Not your audit")
    return a


@vendor_router.get("/audits/{audit_id}")
async def get_audit(audit_id: str, u=Depends(get_user)):
    return await _load_audit(audit_id, u)


@vendor_router.post("/audits/{audit_id}/upload-excel")
async def upload_excel(audit_id: str, file: UploadFile = File(...), u=Depends(get_user)):
    a = await _load_audit(audit_id, u)
    content = await file.read()
    if not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(400, "Please upload a .xlsx file (the template you downloaded from the portal).")
    try:
        rows, warnings = parse_vendor_excel(content)
    except ValueError as e:
        raise HTTPException(400, str(e))
    if not rows:
        raise HTTPException(400, "No employee rows parsed from the Excel. Make sure header row has 'EMPLOYEE CODE' and data follows below.")
    await db.audit_runs.update_one({"id": audit_id}, {"$set": {
        "rows": rows, "excel_file_name": file.filename,
        "excel_row_count": len(rows),
        "status": "uploaded",
        "excel_warnings": warnings,
    }})
    return {"rows_parsed": len(rows), "warnings": warnings}


@vendor_router.post("/audits/{audit_id}/upload-pdf")
async def upload_pdf(audit_id: str, doc_type: str = Form(...), file: UploadFile = File(...), u=Depends(get_user)):
    a = await _load_audit(audit_id, u)
    if doc_type not in DOC_PARSERS:
        raise HTTPException(400, f"Unknown doc_type. Must be one of: {list(DOC_PARSERS.keys())}")
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only .pdf files are accepted")
    content = await file.read()
    try:
        parsed = DOC_PARSERS[doc_type](content)
    except ValueError as e:
        raise HTTPException(400, str(e))
    # Store PDF as base64 (small monthly docs; keeps DB self-contained)
    pdf_b64 = base64.b64encode(content).decode()
    docs = a.get("documents", {}) or {}
    parsed_docs = a.get("parsed_documents", {}) or {}
    docs[doc_type] = {"file_name": file.filename, "size": len(content), "uploaded_at": datetime.now(timezone.utc).isoformat(), "pdf_b64": pdf_b64}
    parsed_docs[doc_type] = parsed
    await db.audit_runs.update_one({"id": audit_id}, {"$set": {"documents": docs, "parsed_documents": parsed_docs, "status": "uploaded"}})
    # Strip pdf_b64 from response
    safe_doc = {k: v for k, v in docs[doc_type].items() if k != "pdf_b64"}
    return {"doc_type": doc_type, "document": safe_doc, "parsed": parsed}


@vendor_router.put("/audits/{audit_id}/manual-override")
async def manual_override(audit_id: str, body: dict, u=Depends(get_user)):
    """Contractor corrects auto-extracted values: {doc_type, field_path, value}."""
    a = await _load_audit(audit_id, u)
    doc_type = body.get("doc_type"); field_path = body.get("field_path"); value = body.get("value")
    if not doc_type or not field_path:
        raise HTTPException(400, "doc_type and field_path are required")
    parsed_docs = a.get("parsed_documents", {}) or {}
    if doc_type not in parsed_docs:
        raise HTTPException(400, f"No parsed data for {doc_type}")
    # apply dotted path
    parts = field_path.split(".")
    ref = parsed_docs[doc_type]
    for p in parts[:-1]:
        ref = ref.setdefault(p, {})
    ref[parts[-1]] = value
    overrides = a.get("manual_overrides", {}) or {}
    overrides.setdefault(doc_type, {})[field_path] = value
    await db.audit_runs.update_one({"id": audit_id}, {"$set": {
        "parsed_documents": parsed_docs, "manual_overrides": overrides,
    }})
    return {"ok": True, "parsed_documents": parsed_docs}


@vendor_router.post("/audits/{audit_id}/run")
async def run_audit(audit_id: str, u=Depends(get_user)):
    a = await _load_audit(audit_id, u)
    rows = a.get("rows", [])
    if not rows:
        raise HTTPException(400, "Upload the payroll Excel before running audit")
    parsed_docs = a.get("parsed_documents", {}) or {}
    missing = [k for k, _ in PDF_DOC_TYPES if k not in parsed_docs]
    if missing:
        # Allow run but record missing docs as findings
        pass
    result = run_full_audit(rows, parsed_docs, a["wage_month"])
    result["missing_documents"] = missing
    for mkey in missing:
        result["summary_findings"].append({
            "rule_code": "DOC001", "law": "DOCUMENT", "severity": "high",
            "title": f"Missing document: {dict(PDF_DOC_TYPES).get(mkey, mkey)}",
            "detail": "Audit completed without this document. Upload it and re-run for full compliance.",
            "expected": mkey, "actual": "missing",
        })
    await db.audit_runs.update_one({"id": audit_id}, {"$set": {
        "audit_result": result, "status": "audited",
        "audited_at": datetime.now(timezone.utc).isoformat(),
    }})
    return result


@vendor_router.post("/audits/{audit_id}/submit")
async def submit_audit(audit_id: str, u=Depends(get_user)):
    """Contractor submits for admin review after running audit."""
    a = await _load_audit(audit_id, u)
    if not a.get("audit_result"):
        raise HTTPException(400, "Run audit first before submitting")
    await db.audit_runs.update_one({"id": audit_id}, {"$set": {
        "status": "submitted", "submitted_at": datetime.now(timezone.utc).isoformat(),
    }})
    return {"ok": True, "status": "submitted"}


@vendor_router.post("/audits/{audit_id}/approve")
async def approve_audit(audit_id: str, body: dict = None, u=Depends(get_user)):
    require_admin(u)
    a = await _load_audit(audit_id, u)
    await db.audit_runs.update_one({"id": audit_id}, {"$set": {
        "status": "approved", "approved_at": datetime.now(timezone.utc).isoformat(),
        "approved_by": u["id"],
        "admin_remarks": (body or {}).get("remarks", ""),
    }})
    return {"ok": True}


@vendor_router.post("/audits/{audit_id}/reject")
async def reject_audit(audit_id: str, body: dict = None, u=Depends(get_user)):
    require_admin(u)
    a = await _load_audit(audit_id, u)
    reason = (body or {}).get("reason", "")
    if not reason:
        raise HTTPException(400, "reason required")
    await db.audit_runs.update_one({"id": audit_id}, {"$set": {
        "status": "rejected", "rejected_at": datetime.now(timezone.utc).isoformat(),
        "rejected_by": u["id"], "rejection_reason": reason,
    }})
    return {"ok": True}


@vendor_router.delete("/audits/{audit_id}")
async def delete_audit(audit_id: str, u=Depends(get_user)):
    a = await _load_audit(audit_id, u)
    # Contractor can only delete drafts
    if u.get("role") == "contractor" and a["status"] not in ("draft", "uploaded"):
        raise HTTPException(400, "Cannot delete a submitted/approved audit")
    await db.audit_runs.delete_one({"id": audit_id})
    return {"ok": True}


# ══════════════════════════ PDF DOWNLOAD ══════════════════════════
@vendor_router.get("/audits/{audit_id}/documents/{doc_type}")
async def download_doc(audit_id: str, doc_type: str, u=Depends(get_user)):
    a = await _load_audit(audit_id, u)
    docs = a.get("documents", {}) or {}
    if doc_type not in docs:
        raise HTTPException(404, "Document not found")
    pdf_b64 = docs[doc_type].get("pdf_b64")
    if not pdf_b64:
        raise HTTPException(404, "PDF binary missing")
    return Response(content=base64.b64decode(pdf_b64), media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={docs[doc_type].get('file_name','document.pdf')}"})


# ══════════════════════════ STATUTORY REGISTERS ══════════════════════════
@vendor_router.get("/audits/{audit_id}/register/{kind}")
async def download_register(audit_id: str, kind: str, u=Depends(get_user)):
    a = await _load_audit(audit_id, u)
    rows = a.get("rows", [])
    if not rows: raise HTTPException(400, "No payroll data in this audit")
    vendor = await db.contractors.find_one({"id": a["contractor_id"]}, {"_id": 0}) or {"name": a.get("contractor_name", "")}
    month = a.get("wage_month", "")
    if kind == "pf":
        xlsx = build_pf_register(rows, vendor, month); fname = f"PF_Register_{vendor.get('name','')}_{month}.xlsx"
    elif kind == "esic":
        xlsx = build_esic_register(rows, vendor, month); fname = f"ESIC_Register_{vendor.get('name','')}_{month}.xlsx"
    elif kind == "pt":
        xlsx = build_pt_register(rows, vendor, month); fname = f"PT_Register_{vendor.get('name','')}_{month}.xlsx"
    else:
        raise HTTPException(400, "kind must be pf | esic | pt")
    return Response(content=xlsx,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={fname}"})


# ══════════════════════════ DASHBOARD STATS ══════════════════════════
@vendor_router.get("/dashboard/stats")
async def dashboard_stats(u=Depends(get_user)):
    if u.get("role") == "contractor":
        c = await contractor_for(u)
        q = {"contractor_id": c["id"]}
    else:
        require_admin(u)
        q = {}
    total = await db.audit_runs.count_documents(q)
    by_status = {}
    async for a in db.audit_runs.find(q, {"_id": 0, "status": 1}):
        s = a.get("status", "draft")
        by_status[s] = by_status.get(s, 0) + 1
    contractors_count = await db.contractors.count_documents({})
    return {
        "total_audits": total, "by_status": by_status, "contractors_count": contractors_count,
    }
