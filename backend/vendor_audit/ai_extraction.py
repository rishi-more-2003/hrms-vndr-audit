"""AI-powered document extraction for Vendor Audit.

Replaces the regex-only parsers with a hybrid pipeline:
  • PDFs    → Gemini 3 Flash multimodal (file-attached) → Sonnet 4.5 fallback (text only)
  • XLSX    → openpyxl preview → Gemini 3 Flash → Sonnet 4.5 fallback
  • DOCX    → python-docx preview → Gemini 3 Flash → Sonnet 4.5 fallback

A SHA-256-keyed cache (`vendor_extraction_cache` collection) means re-uploads
of the same file by any tenant are free.
"""
from __future__ import annotations
import hashlib
import io
import json
import logging
import os
import tempfile
from typing import Dict, Any, Optional, Tuple
from dotenv import load_dotenv

import openpyxl
import pdfplumber
from docx import Document as DocxDocument
from emergentintegrations.llm.chat import LlmChat, UserMessage, FileContentWithMimeType

load_dotenv()
logger = logging.getLogger(__name__)

GEMINI_FLASH = "gemini-3-flash-preview"
CLAUDE_SONNET = "claude-sonnet-4-5-20250929"
USD_TO_INR = 83.0
RATES = {
    GEMINI_FLASH: {"in": 0.30 / 1_000_000, "out": 2.50 / 1_000_000},
    CLAUDE_SONNET: {"in": 3.00 / 1_000_000, "out": 15.0 / 1_000_000},
}


def file_sha256(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def detect_kind(file_name: str) -> str:
    n = (file_name or "").lower()
    if n.endswith((".xlsx", ".xls")):
        return "xlsx"
    if n.endswith(".pdf"):
        return "pdf"
    if n.endswith(".docx"):
        return "docx"
    raise ValueError("Only .pdf, .xlsx, .docx accepted")


def estimate_inr(model: str, t_in: int, t_out: int) -> float:
    r = RATES.get(model)
    if not r:
        return 0.0
    return round((t_in * r["in"] + t_out * r["out"]) * USD_TO_INR, 4)


def _approx_tokens(text: str) -> int:
    return max(1, len(text) // 4)


SYSTEM_PROMPT = """You are an expert at reading Indian statutory labour-compliance documents (PF challans/returns/ECRs, ESIC challans/Form 5/contribution history, Professional Tax challans/returns, MLWF, payroll registers, attendance sheets, wage registers).

Your job: from the document, extract a STRICT JSON of all relevant fields a labour-audit system would need.

Always return JSON of this shape:
{
  "doc_type_detected": "pf_ecr" | "pf_challan" | "pf_paid_challan" | "esic_paid_challan" | "esic_contribution_history" | "esic_rc" | "pt_paid_challan" | "pt_return" | "mlwf_challan" | "wage_register" | "attendance_sheet" | "payroll_data" | "establishment_doc" | "unknown",
  "summary": {
    "establishment_name": "...",
    "establishment_code": "...",       // employer code, PF est code, ESIC code, PT TIN, etc.
    "wage_month": "MMM-YYYY",          // e.g. "MAR-2026"
    "period_from": "YYYY-MM-DD",
    "period_to": "YYYY-MM-DD",
    "challan_number": "...",
    "trrn": "...",
    "payment_date": "YYYY-MM-DD",
    "amount_paid": <number>,
    "total_subscribers": <int>,
    "total_employees": <int>,
    "total_wages": <number>,
    "total_contribution": <number>,
    "ac01_emp": <number>, "ac01_er": <number>,
    "ac02_admin": <number>, "ac10_er": <number>, "ac21_er": <number>,
    "<any_other_relevant_field>": ...
  },
  "employees": [
    {
      "uan": "...", "esic_ip": "...", "pf_member_id": "...",
      "name": "...", "father_name": "...", "designation": "...",
      "gender": "MALE"|"FEMALE"|"OTHER",
      "days_worked": <int>, "ncp_days": <int>,
      "gross_wages": <number>, "basic": <number>, "da": <number>,
      "epf_wages": <number>, "eps_wages": <number>, "edli_wages": <number>,
      "epf_contribution": <number>, "eps_contribution": <number>, "edli_contribution": <number>,
      "esic_wages": <number>, "esic_employee": <number>, "esic_employer": <number>,
      "pt_amount": <number>, "mlwf_amount": <number>,
      "doj": "YYYY-MM-DD", "dol": "YYYY-MM-DD",
      "<any_other_field>": ...
    }
  ],
  "tables": [ { "title": "...", "headers": [...], "rows": [[...]] } ],
  "warnings": [ "<unreadable / ambiguous bits>" ],
  "confidence": <0.0 to 1.0>
}

RULES:
- Use snake_case keys. Numbers as numbers (not strings). Dates ISO YYYY-MM-DD where possible.
- If a field is unreadable, OMIT it (don't invent values).
- For multi-page contribution histories, extract ALL employee rows you can see (truncate at most 500).
- For payroll/wage Excel sheets, the "doc_type_detected" should be "wage_register" or "payroll_data".
- Output ONLY JSON. No prose, no markdown fences."""


def _excel_preview(content: bytes, max_rows: int = 80, max_cols: int = 50) -> Dict[str, Any]:
    wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
    sheets: list = []
    for ws in wb.worksheets[:5]:
        max_r = min(ws.max_row or 0, max_rows)
        max_c = min(ws.max_column or 0, max_cols)
        rows = []
        for r in range(1, max_r + 1):
            row = []
            for c in range(1, max_c + 1):
                v = ws.cell(row=r, column=c).value
                row.append(None if v is None else (str(v).strip() or None))
            rows.append(row)
        sheets.append({"name": ws.title, "max_row": ws.max_row, "max_col": ws.max_column, "rows": rows})
    return {"kind": "xlsx", "sheets": sheets}


def _pdf_preview(content: bytes, max_pages: int = 10) -> Dict[str, Any]:
    text_pages: list = []
    tables: list = []
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for page in pdf.pages[:max_pages]:
            try:
                txt = page.extract_text() or ""
            except Exception:
                txt = ""
            text_pages.append(txt)
            try:
                for t in (page.extract_tables() or []):
                    tables.append([[(c or "").strip() for c in row] for row in t])
            except Exception:
                pass
    return {"kind": "pdf", "page_count": len(text_pages), "text_pages": text_pages, "tables": tables}


def _docx_preview(content: bytes) -> Dict[str, Any]:
    doc = DocxDocument(io.BytesIO(content))
    paragraphs = [p.text for p in doc.paragraphs if p.text and p.text.strip()]
    tables: list = []
    for t in doc.tables:
        tables.append([[c.text.strip() for c in row.cells] for row in t.rows])
    return {"kind": "docx", "paragraphs": paragraphs, "tables": tables}


def get_text_for_validation(content: bytes, file_kind: str) -> str:
    """Cheap text extract for validation rules (no LLM needed)."""
    try:
        if file_kind == "pdf":
            with pdfplumber.open(io.BytesIO(content)) as pdf:
                return "\n".join((p.extract_text() or "") for p in pdf.pages[:5])
        if file_kind == "xlsx":
            wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
            out = []
            for ws in wb.worksheets[:3]:
                for row in ws.iter_rows(values_only=True):
                    for v in row:
                        if v is not None:
                            out.append(str(v))
            return "\n".join(out)
        if file_kind == "docx":
            d = DocxDocument(io.BytesIO(content))
            out = [p.text for p in d.paragraphs]
            for t in d.tables:
                for r in t.rows:
                    for c in r.cells:
                        out.append(c.text)
            return "\n".join(out)
    except Exception as e:
        logger.warning(f"text extract failed: {e}")
    return ""


def _build_user_prompt(extracted: Dict[str, Any], hint: Optional[str]) -> str:
    parts: list = []
    if hint:
        parts.append(f"User hint: {hint}\n")
    kind = extracted.get("kind")
    if kind == "xlsx":
        parts.append("This is an Excel (.xlsx) document. Sheets:")
        for sh in extracted.get("sheets", []):
            parts.append(f"\n=== {sh['name']} ({sh['max_row']}×{sh['max_col']}) ===")
            for i, row in enumerate(sh.get("rows", []), 1):
                parts.append(f"R{i}: {json.dumps(row, ensure_ascii=False)}")
    elif kind == "pdf":
        parts.append(f"This is a PDF ({extracted.get('page_count', 0)} pages).")
        for i, p in enumerate(extracted.get("text_pages", []), 1):
            parts.append(f"\n=== Page {i} ===\n{(p or '')[:3000]}")
        for ti, t in enumerate(extracted.get("tables", [])[:8], 1):
            parts.append(f"\n=== Table {ti} ===")
            for row in t[:30]:
                parts.append(json.dumps(row, ensure_ascii=False))
    elif kind == "docx":
        parts.append("This is a Word (.docx) document.")
        if extracted.get("paragraphs"):
            parts.append("Paragraphs:\n" + "\n".join(extracted["paragraphs"][:120]))
        for ti, t in enumerate(extracted.get("tables", [])[:5], 1):
            parts.append(f"\n=== Table {ti} ===")
            for row in t[:40]:
                parts.append(json.dumps(row, ensure_ascii=False))
    parts.append("\nNow output the JSON. JSON only.")
    return "\n".join(parts)


def _parse_loose_json(text: str) -> Optional[Dict[str, Any]]:
    if not text:
        return None
    t = text.strip()
    if t.startswith("```"):
        t = t.strip("`")
        if t.lower().startswith("json"):
            t = t[4:].strip()
    try:
        return json.loads(t)
    except Exception:
        pass
    s, e = t.find("{"), t.rfind("}")
    if s >= 0 and e > s:
        try:
            return json.loads(t[s:e + 1])
        except Exception:
            return None
    return None


async def _call(model_hint: str, system: str, user_prompt: str,
                pdf_path: Optional[str] = None, session: str = "vendor-extract",
                escalate: bool = False) -> Tuple[Optional[str], int, int, float, str]:
    """Run via the unified ai_providers router. Returns (text, tokens_in, tokens_out, cost_inr, model_used).

    `model_hint` is informational metadata logged with the call — the actual model
    is chosen by the router from env config (AI_P1_MODEL / AI_P1_FALLBACK_MODEL).
    `escalate=True` runs the fallback chain first (used after Pass-1 confidence is low).
    """
    from ai_providers import run_task, FileAttachment
    files = [FileAttachment(path=pdf_path, mime_type="application/pdf")] if pdf_path else None
    result = await run_task(
        task="document_extract",
        system=system, user=user_prompt, files=files,
        session_id=session, json_mode=True,
        escalate=escalate,
        meta={"hint_model": model_hint},
    )
    return result.text, result.tokens_in, result.tokens_out, result.cost_inr, result.model_used


async def extract_document(content: bytes, file_name: str, claimed_doc_type: Optional[str] = None,
                            cache_lookup=None, cache_save=None) -> Dict[str, Any]:
    """Run the full extraction pipeline. Returns dict with extracted, validation, costs.

    cache_lookup(sha) → existing extracted dict or None
    cache_save(sha, payload) → store extraction for cross-tenant reuse
    """
    sha = file_sha256(content)
    file_kind = detect_kind(file_name)

    # ── Cache hit ──
    # We cache only the AI EXTRACTION (which depends on bytes alone).
    # Validation depends on the user's claimed_doc_type so we always recompute it.
    from .validators import validate_document_text
    raw_text = get_text_for_validation(content, file_kind)
    v_status, v_conf, v_detected, v_msg = validate_document_text(raw_text, claimed_doc_type or "")
    validation = {"status": v_status, "confidence": v_conf, "detected_type": v_detected, "message": v_msg}

    if cache_lookup:
        cached = await cache_lookup(sha)
        if cached:
            return {
                "sha256": sha, "file_kind": file_kind,
                "extracted": cached.get("extracted"),
                "validation": validation,                 # fresh
                "model_used": cached.get("model_used"),
                "tokens_in": 0, "tokens_out": 0, "cost_inr": 0.0,
                "escalated": False, "from_cache": True,
            }

    # ── AI extraction ──
    if file_kind == "xlsx":
        preview = _excel_preview(content)
    elif file_kind == "pdf":
        preview = _pdf_preview(content)
    else:
        preview = _docx_preview(content)

    user_prompt = _build_user_prompt(preview, hint=claimed_doc_type)
    pdf_tmp_path: Optional[str] = None
    if file_kind == "pdf":
        tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
        tmp.write(content)
        tmp.close()
        pdf_tmp_path = tmp.name

    total_in = total_out = 0
    cost = 0.0
    escalated = False
    model_used = GEMINI_FLASH
    extracted: Optional[Dict[str, Any]] = None
    warnings: list = []

    try:
        # Pass 1: configured P1 primary (default Gemini Flash)
        try:
            text, tin, tout, cost_inr, used_model = await _call(
                GEMINI_FLASH, SYSTEM_PROMPT, user_prompt, pdf_path=pdf_tmp_path,
            )
            total_in += tin
            total_out += tout
            cost += cost_inr
            model_used = used_model
            extracted = _parse_loose_json(text or "")
        except Exception as e:
            warnings.append(f"primary_error: {str(e)[:120]}")

        confidence = float((extracted or {}).get("confidence") or 0)
        needs = (extracted is None) or (confidence < 0.6)
        if needs:
            escalated = True
            try:
                # Escalate to P1 fallback (or PDF-strong if env points there)
                text2, tin2, tout2, cost_inr2, used_model2 = await _call(
                    CLAUDE_SONNET, SYSTEM_PROMPT, user_prompt,
                    pdf_path=None, session="vendor-extract-fb", escalate=True,
                )
                total_in += tin2
                total_out += tout2
                cost += cost_inr2
                ext2 = _parse_loose_json(text2 or "")
                if ext2 and (ext2.get("summary") or ext2.get("employees") or ext2.get("doc_type_detected")):
                    if not extracted or float(ext2.get("confidence") or 0) >= confidence:
                        extracted = ext2
                        model_used = used_model2
            except Exception as e:
                warnings.append(f"escalation_error: {str(e)[:120]}")

        if extracted is None:
            extracted = {"doc_type_detected": "unknown", "summary": {}, "employees": [],
                         "tables": [], "warnings": warnings, "confidence": 0.0}

        if warnings:
            extracted.setdefault("warnings", [])
            extracted["warnings"] = list({*(extracted.get("warnings") or []), *warnings})
        extracted["model_used"] = model_used

        # Cache the AI bits (no PII concerns since file_hash matches the same bytes)
        payload = {
            "extracted": extracted,
            "validation": validation,
            "model_used": model_used,
        }
        if cache_save:
            try:
                await cache_save(sha, payload)
            except Exception as e:
                logger.warning(f"cache_save failed: {e}")

        return {
            "sha256": sha, "file_kind": file_kind,
            "extracted": extracted, "validation": validation,
            "model_used": model_used, "tokens_in": total_in, "tokens_out": total_out,
            "cost_inr": round(cost, 4), "escalated": escalated, "from_cache": False,
        }
    finally:
        if pdf_tmp_path and os.path.exists(pdf_tmp_path):
            try:
                os.unlink(pdf_tmp_path)
            except Exception:
                pass
