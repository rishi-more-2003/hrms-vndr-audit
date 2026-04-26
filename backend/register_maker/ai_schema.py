"""Hybrid LLM schema extractor for register templates.

Flow:
  1. Try Gemini 3 Flash with extracted structured context
     (sheets/preview rows for xlsx, text+tables for pdf/docx)
     → Get JSON schema + confidence self-rating.
  2. If confidence < 0.7 OR JSON parse fails OR critical fields missing,
     escalate to Claude Sonnet 4.5 for a second pass.
  3. Return the better of the two.

Token cost is logged per call so we can show INR usage to tenants.
"""
from __future__ import annotations
import os
import json
import logging
import tempfile
from typing import Dict, Any, Optional, Tuple
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage, FileContentWithMimeType

load_dotenv()
logger = logging.getLogger(__name__)

# Model identifiers (per emergentintegrations playbook)
GEMINI_FLASH = "gemini-3-flash-preview"
CLAUDE_SONNET = "claude-sonnet-4-5-20250929"

# Approximate per-million-token rates → INR (Feb 2026)
# Gemini 3 Flash: $0.30 in / $2.50 out  → ₹25 in / ₹208 out per million
# Claude Sonnet 4.5: $3.00 in / $15.00 out → ₹250 in / ₹1250 out per million
USD_TO_INR = 83.0
RATES = {
    GEMINI_FLASH:  {"in": 0.30 / 1_000_000, "out": 2.50 / 1_000_000},
    CLAUDE_SONNET: {"in": 3.00 / 1_000_000, "out": 15.0 / 1_000_000},
}


def estimate_inr(model: str, tokens_in: int, tokens_out: int) -> float:
    r = RATES.get(model)
    if not r:
        return 0.0
    usd = tokens_in * r["in"] + tokens_out * r["out"]
    return round(usd * USD_TO_INR, 4)


SYSTEM_PROMPT = """You are an expert at reading Indian statutory labour-law register templates and extracting their data schema.
Indian registers (Form A, Form B, Muster Roll, Form O, Form 5A, Form 32, Wage Register, etc.) are heterogeneous: column names, layout, language and form codes vary by State and by governing Law (PF, ESIC, Factories Act, Shops & Establishments, Minimum Wages, CLRA, Bonus Act, POSH, etc.).

Your job: given an EMPTY template (or template with sample data), output a strict JSON schema that describes EXACTLY what data is needed to fill it in.

ALWAYS return JSON of this shape:
{
  "register_name": "<best guess at the register's official name>",
  "register_form_code": "<form code if present, e.g. Form A, Form O>",
  "description": "<1-line description of what this register tracks>",
  "row_type": "per_employee" | "aggregate" | "per_period" | "mixed",
  "period_basis": "monthly" | "quarterly" | "yearly" | "ad_hoc" | null,
  "columns": [
    {
      "name": "<header text as shown>",
      "key": "<snake_case stable key>",
      "dtype": "text" | "number" | "date" | "currency" | "bool",
      "required": true | false,
      "source_hint": "<where this likely comes from in employee/payroll data, e.g. 'employees.full_name' or 'payroll.basic_pay'>",
      "formula": "<if cell is computed, the formula or rule>",
      "header_cell": "<excel cell ref like A4 if known>",
      "sample": "<sample value seen, if any>"
    }
  ],
  "static_fields": [
    {
      "name": "<label>",
      "key": "<snake_case>",
      "source_hint": "<e.g. 'organization.name' or user-supplied>",
      "value_cell": "<cell ref>",
      "sample": "<value if any>"
    }
  ],
  "notes": "<anything tricky a human filler should know>",
  "confidence": <0.0 to 1.0 — how sure you are this schema is complete & correct>,
  "extraction_warnings": ["<list of ambiguities or caveats>"]
}

Be conservative on confidence. If the template is unusual, multilingual, scanned, or you can't see column headers clearly, return confidence < 0.7 and list specific warnings. Output ONLY JSON, no prose, no markdown fences."""


def _build_user_prompt(extracted: Dict[str, Any], hint: Optional[str]) -> str:
    parts = []
    if hint:
        parts.append(f"User hint about this template: {hint}\n")
    kind = extracted.get("kind")
    if kind == "xlsx":
        parts.append("This is an Excel (.xlsx) template. Below is a preview of each sheet (top rows + merged ranges).\n")
        for sh in extracted.get("sheets", []):
            parts.append(f"\n=== Sheet: {sh['name']} (max_row={sh['max_row']}, max_col={sh['max_col']}) ===")
            if sh.get("merged_ranges"):
                parts.append(f"Merged ranges: {', '.join(sh['merged_ranges'][:30])}")
            parts.append("Preview rows (row,col indexed from 1; empty cells shown as null):")
            for i, row in enumerate(sh.get("preview_rows", []), start=1):
                parts.append(f"  Row {i}: {json.dumps(row, ensure_ascii=False)}")
    elif kind == "pdf":
        parts.append(f"This is a PDF template ({extracted.get('page_count', 0)} pages).\n")
        for i, page in enumerate(extracted.get("text_pages", []), start=1):
            parts.append(f"\n=== Page {i} text ===\n{page[:3000]}")
        if extracted.get("tables"):
            parts.append("\n=== Tables extracted ===")
            for ti, tbl in enumerate(extracted["tables"][:5], start=1):
                parts.append(f"Table {ti}:")
                for row in tbl[:20]:
                    parts.append(f"  {json.dumps(row, ensure_ascii=False)}")
    elif kind == "docx":
        parts.append("This is a Word (.docx) template.\n")
        if extracted.get("paragraphs"):
            parts.append("=== Paragraphs ===\n" + "\n".join(extracted["paragraphs"][:80]))
        if extracted.get("tables"):
            parts.append("\n=== Tables ===")
            for ti, tbl in enumerate(extracted["tables"][:5], start=1):
                parts.append(f"Table {ti}:")
                for row in tbl[:30]:
                    parts.append(f"  {json.dumps(row, ensure_ascii=False)}")
    parts.append("\nNow output the JSON schema (and ONLY the JSON, no markdown, no prose).")
    return "\n".join(parts)


def _parse_json_loose(text: str) -> Optional[Dict[str, Any]]:
    """Try multiple ways to extract a JSON object from an LLM response."""
    if not text:
        return None
    t = text.strip()
    # Strip markdown fences
    if t.startswith("```"):
        t = t.strip("`")
        if t.lower().startswith("json"):
            t = t[4:]
        t = t.strip()
        # Re-find first { and last }
    try:
        return json.loads(t)
    except Exception:
        pass
    # Find first { and matching last }
    start = t.find("{")
    end = t.rfind("}")
    if start >= 0 and end > start:
        try:
            return json.loads(t[start:end + 1])
        except Exception:
            return None
    return None


def _approx_tokens(text: str) -> int:
    """Cheap token estimate: ~4 chars per token."""
    return max(1, len(text) // 4)


async def _call_llm(model_hint: str, system: str, user_prompt: str,
                    pdf_path: Optional[str] = None, session_id: str = "register-schema",
                    task: str = "template_schema",
                    escalate: bool = False) -> Tuple[Optional[str], int, int, float, str]:
    """Run via the unified ai_providers router.
    Returns (text, tokens_in, tokens_out, cost_inr, model_used).

    `model_hint` is metadata only — actual model is chosen from AI_P*_MODEL env.
    `task` defaults to template_schema (P1). Pass task='legal_qa' for P2 / 'audit_report' for P3.
    """
    from ai_providers import run_task as _router_run, FileAttachment
    files = [FileAttachment(path=pdf_path, mime_type="application/pdf")] if pdf_path else None
    result = await _router_run(
        task=task,
        system=system, user=user_prompt, files=files,
        session_id=session_id, json_mode=True,
        escalate=escalate,
        meta={"hint_model": model_hint},
    )
    return result.text, result.tokens_in, result.tokens_out, result.cost_inr, result.model_used


async def study_template(extracted: Dict[str, Any], file_bytes: Optional[bytes] = None,
                          file_kind: str = "xlsx", hint: Optional[str] = None) -> Dict[str, Any]:
    """Hybrid schema extraction with auto-escalation.

    Returns dict with: ai_schema (TemplateAISchema-shaped dict), model_used,
    tokens_in, tokens_out, cost_inr, escalated, warnings.
    """
    user_prompt = _build_user_prompt(extracted, hint)

    # Optional PDF attach for Gemini multimodal — only if file is PDF
    pdf_tmp_path: Optional[str] = None
    if file_kind == "pdf" and file_bytes:
        tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
        tmp.write(file_bytes)
        tmp.close()
        pdf_tmp_path = tmp.name

    total_in = 0
    total_out = 0
    total_cost = 0.0
    escalated = False
    model_used = GEMINI_FLASH
    warnings: list = []

    try:
        # Pass 1: configured P1 primary
        try:
            text, t_in, t_out, c_inr, used_model = await _call_llm(
                GEMINI_FLASH, SYSTEM_PROMPT, user_prompt,
                pdf_path=pdf_tmp_path, session_id="rm-flash",
            )
            total_in += t_in
            total_out += t_out
            total_cost += c_inr
            model_used = used_model
            schema = _parse_json_loose(text or "")
        except Exception as e:
            logger.warning(f"Primary template-extract call failed: {e}")
            warnings.append(f"primary_error: {str(e)[:120]}")
            schema = None
            text = None

        # Decide whether to escalate
        confidence = float((schema or {}).get("confidence") or 0)
        needs_escalation = (
            schema is None
            or confidence < 0.7
            or not schema.get("columns")
        )

        if needs_escalation:
            escalated = True
            try:
                text2, t_in2, t_out2, c_inr2, used_model2 = await _call_llm(
                    CLAUDE_SONNET, SYSTEM_PROMPT, user_prompt,
                    pdf_path=None, session_id="rm-sonnet", escalate=True,
                )
                total_in += t_in2
                total_out += t_out2
                total_cost += c_inr2
                schema2 = _parse_json_loose(text2 or "")
                if schema2 and schema2.get("columns"):
                    if not schema or float(schema2.get("confidence") or 0) >= confidence:
                        schema = schema2
                        model_used = used_model2
            except Exception as e:
                logger.warning(f"Escalation call failed: {e}")
                warnings.append(f"escalation_error: {str(e)[:120]}")

        if schema is None:
            schema = {
                "register_name": None,
                "columns": [],
                "static_fields": [],
                "confidence": 0.0,
                "extraction_warnings": warnings + ["AI extraction failed — please re-upload or describe manually."],
                "notes": None,
                "row_type": None,
                "period_basis": None,
            }

        # Stamp metadata
        schema["model_used"] = model_used
        schema.setdefault("extraction_warnings", [])
        if warnings:
            schema["extraction_warnings"] = list({*(schema.get("extraction_warnings") or []), *warnings})

        return {
            "ai_schema": schema,
            "model_used": model_used,
            "tokens_in": total_in,
            "tokens_out": total_out,
            "cost_inr": round(total_cost, 4),
            "escalated": escalated,
        }
    finally:
        if pdf_tmp_path and os.path.exists(pdf_tmp_path):
            try:
                os.unlink(pdf_tmp_path)
            except Exception:
                pass
