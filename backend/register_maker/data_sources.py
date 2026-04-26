"""Data extraction for arbitrary user-uploaded data sheets.

Unlike templates (where we just need the schema), data files can have ANY structure:
- Multi-sheet Excel with merged headers
- Scanned PDFs with employee tables
- Word docs with paragraphs of policy text + a table

We use a 2-pass approach:
  1. Deterministic extraction (openpyxl/pdfplumber/python-docx) → raw structured dump
  2. LLM normalization → list of {record_type, fields: {...}} flat records
"""
from __future__ import annotations
import json
import logging
import os
import tempfile
from typing import Dict, Any, List, Optional, Tuple
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage, FileContentWithMimeType

from .extractors import extract_any
from .ai_schema import GEMINI_FLASH, CLAUDE_SONNET, estimate_inr, _parse_json_loose, _approx_tokens

load_dotenv()
logger = logging.getLogger(__name__)


NORMALIZE_SYSTEM = """You are a data normalizer for Indian payroll/HR data sheets.
Given the raw structured content of an uploaded file (any of: Excel, PDF, Word), extract a flat list of records that another system can use to fill statutory registers.

ALWAYS return JSON of this shape:
{
  "records": [
    {
      "record_type": "employee" | "payroll" | "attendance" | "establishment" | "other",
      "fields": { "<snake_case_key>": <primitive value> }
    }
  ],
  "available_fields": ["<unique snake_case keys discovered across all records>"],
  "establishment": { "<key>": <value> },
  "period": { "month": <1-12 or null>, "year": <YYYY or null>, "label": "<original period text or null>" },
  "warnings": ["<any uncertainties>"],
  "confidence": <0.0 to 1.0>
}

Guidelines:
- Use SNAKE_CASE keys: employee_name, employee_code, father_name, designation, department, days_worked, basic_wage, dearness_allowance, gross_wage, total_deductions, net_pay, payment_date, pf_number, esic_number, uan, aadhaar_last4, etc.
- Numbers as numbers, dates as ISO strings (YYYY-MM-DD), money as raw numbers (no currency).
- Combine multi-sheet/multi-table data into a single records[] array.
- Establishment-level details (employer name, address, code) go under "establishment", not in records.
- If a value is unreadable, omit it rather than inventing.
- Output ONLY JSON, no prose, no markdown fences."""


async def _call(model: str, system: str, user_prompt: str,
                file_attach: Optional[str] = None, session: str = "rm-data") -> Tuple[Optional[str], int, int]:
    api_key = os.environ.get("EMERGENT_LLM_KEY", "")
    if not api_key:
        raise RuntimeError("EMERGENT_LLM_KEY not configured")
    provider = "gemini" if model.startswith("gemini") else "anthropic"
    chat = LlmChat(api_key=api_key, session_id=session, system_message=system).with_model(provider, model)
    file_contents = None
    if file_attach and provider == "gemini":
        mime = "application/pdf" if file_attach.endswith(".pdf") else "text/plain"
        file_contents = [FileContentWithMimeType(file_path=file_attach, mime_type=mime)]
    msg = UserMessage(text=user_prompt, file_contents=file_contents) if file_contents else UserMessage(text=user_prompt)
    text = await chat.send_message(msg)
    if not isinstance(text, str):
        text = str(text)
    tin = _approx_tokens(system) + _approx_tokens(user_prompt) + (1500 if file_contents else 0)
    return text, tin, _approx_tokens(text)


def _build_data_prompt(extracted: Dict[str, Any]) -> str:
    parts = []
    kind = extracted.get("kind")
    if kind == "xlsx":
        parts.append("Source: Excel file. Sheets:")
        for sh in extracted.get("sheets", []):
            parts.append(f"\n=== {sh['name']} (rows={sh['max_row']}, cols={sh['max_col']}) ===")
            for i, row in enumerate(sh.get("preview_rows", [])[:30], 1):
                parts.append(f"R{i}: {json.dumps(row, ensure_ascii=False)}")
    elif kind == "pdf":
        parts.append(f"Source: PDF ({extracted.get('page_count', 0)} pages).")
        for i, p in enumerate(extracted.get("text_pages", []), 1):
            parts.append(f"\n=== Page {i} ===\n{p[:2500]}")
        for ti, tbl in enumerate(extracted.get("tables", [])[:5], 1):
            parts.append(f"\n=== Table {ti} ===")
            for r in tbl[:20]:
                parts.append(json.dumps(r, ensure_ascii=False))
    elif kind == "docx":
        parts.append("Source: Word .docx.")
        if extracted.get("paragraphs"):
            parts.append("\nParagraphs:\n" + "\n".join(extracted["paragraphs"][:80]))
        for ti, tbl in enumerate(extracted.get("tables", [])[:5], 1):
            parts.append(f"\n=== Table {ti} ===")
            for r in tbl[:30]:
                parts.append(json.dumps(r, ensure_ascii=False))
    parts.append("\nNow output the JSON normalization. JSON only.")
    return "\n".join(parts)


async def normalize_data_file(file_bytes: bytes, file_name: str) -> Dict[str, Any]:
    """Run AI normalization on a single uploaded data file. Returns dict with records, costs."""
    extracted = extract_any(file_bytes, file_name)
    user_prompt = _build_data_prompt(extracted)

    pdf_path: Optional[str] = None
    if extracted.get("kind") == "pdf":
        tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
        tmp.write(file_bytes)
        tmp.close()
        pdf_path = tmp.name

    total_in = total_out = 0
    cost = 0.0
    escalated = False
    model_used = GEMINI_FLASH
    warnings: list = []
    normalized: Optional[Dict[str, Any]] = None

    try:
        try:
            text, tin, tout = await _call(GEMINI_FLASH, NORMALIZE_SYSTEM, user_prompt, file_attach=pdf_path)
            total_in += tin
            total_out += tout
            cost += estimate_inr(GEMINI_FLASH, tin, tout)
            normalized = _parse_json_loose(text or "")
        except Exception as e:
            warnings.append(f"flash_error: {str(e)[:120]}")

        confidence = float((normalized or {}).get("confidence") or 0)
        records = (normalized or {}).get("records") or []
        if normalized is None or confidence < 0.6 or (not records and not (normalized or {}).get("establishment")):
            escalated = True
            try:
                text2, tin2, tout2 = await _call(CLAUDE_SONNET, NORMALIZE_SYSTEM, user_prompt, session="rm-data-sonnet")
                total_in += tin2
                total_out += tout2
                cost += estimate_inr(CLAUDE_SONNET, tin2, tout2)
                norm2 = _parse_json_loose(text2 or "")
                if norm2 and (norm2.get("records") or norm2.get("establishment")):
                    if not normalized or float(norm2.get("confidence") or 0) >= confidence:
                        normalized = norm2
                        model_used = CLAUDE_SONNET
            except Exception as e:
                warnings.append(f"sonnet_error: {str(e)[:120]}")

        if normalized is None:
            normalized = {"records": [], "available_fields": [], "establishment": {},
                          "period": {}, "warnings": warnings + ["AI extraction failed"], "confidence": 0.0}

        normalized["model_used"] = model_used
        if warnings:
            normalized["warnings"] = list({*(normalized.get("warnings") or []), *warnings})

        return {
            "normalized": normalized,
            "raw_extract_kind": extracted.get("kind"),
            "model_used": model_used,
            "tokens_in": total_in,
            "tokens_out": total_out,
            "cost_inr": round(cost, 4),
            "escalated": escalated,
        }
    finally:
        if pdf_path and os.path.exists(pdf_path):
            try:
                os.unlink(pdf_path)
            except Exception:
                pass


# ─── Field-mapping: template schema ↔ data sheet fields ───
MAPPING_SYSTEM = """You map data fields from a payroll/HR data sheet to columns of a target statutory register template.

Given:
  - target_columns: [{key, name, dtype, required, source_hint}]  ← from the studied template
  - target_static_fields: [{key, name, source_hint}]
  - available_fields: [list of snake_case keys discovered in the data]
  - sample_record: a sample record from the data (so you can see actual values)

Output JSON:
{
  "column_mapping": { "<target_column_key>": "<available_field_key OR null>" },
  "static_mapping": { "<target_static_key>": "<available_field_key OR org-level constant key OR null>" },
  "missing_required": ["<column_key or static_key that is required but unmapped>"],
  "missing_optional": ["<unmapped optional ones>"],
  "transforms": { "<target_key>": "<plain-english description of any computation needed, e.g. 'sum of basic + da'>" },
  "confidence": <0.0 to 1.0>
}

If a target column has no good source, use null. Be conservative — don't force a mapping where types don't match.
Output ONLY JSON."""


async def map_template_to_data(template_schema: Dict[str, Any],
                                available_fields: List[str],
                                sample_record: Optional[Dict[str, Any]] = None,
                                establishment: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Run AI to produce a column-by-column mapping. Returns mapping + costs."""
    target_columns = [
        {k: c.get(k) for k in ("key", "name", "dtype", "required", "source_hint")}
        for c in (template_schema.get("columns") or [])
    ]
    target_static = [
        {k: f.get(k) for k in ("key", "name", "source_hint")}
        for f in (template_schema.get("static_fields") or [])
    ]
    user_prompt = json.dumps({
        "target_columns": target_columns,
        "target_static_fields": target_static,
        "available_fields": available_fields,
        "sample_record": sample_record or {},
        "establishment": establishment or {},
    }, ensure_ascii=False)

    total_in = total_out = 0
    cost = 0.0
    escalated = False
    model_used = GEMINI_FLASH
    mapping = None
    try:
        text, tin, tout = await _call(GEMINI_FLASH, MAPPING_SYSTEM, user_prompt, session="rm-map")
        total_in += tin
        total_out += tout
        cost += estimate_inr(GEMINI_FLASH, tin, tout)
        mapping = _parse_json_loose(text or "")
    except Exception as e:
        logger.warning(f"map flash failed: {e}")

    if mapping is None or float(mapping.get("confidence") or 0) < 0.6:
        escalated = True
        try:
            text2, tin2, tout2 = await _call(CLAUDE_SONNET, MAPPING_SYSTEM, user_prompt, session="rm-map-sonnet")
            total_in += tin2
            total_out += tout2
            cost += estimate_inr(CLAUDE_SONNET, tin2, tout2)
            m2 = _parse_json_loose(text2 or "")
            if m2 and m2.get("column_mapping"):
                mapping = m2
                model_used = CLAUDE_SONNET
        except Exception as e:
            logger.warning(f"map sonnet failed: {e}")

    if mapping is None:
        mapping = {"column_mapping": {}, "static_mapping": {}, "missing_required": [],
                   "missing_optional": [], "transforms": {}, "confidence": 0.0}

    mapping["model_used"] = model_used
    return {
        "mapping": mapping,
        "model_used": model_used,
        "tokens_in": total_in,
        "tokens_out": total_out,
        "cost_inr": round(cost, 4),
        "escalated": escalated,
    }
