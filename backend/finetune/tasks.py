"""Task registry for fine-tuning.

Each supported task wires together:
- system + user prompt templates (frozen so JSONL stays consistent across runs)
- a `bootstrap_candidate` coroutine that takes raw file bytes and returns
  a candidate JSON output by running the current production AI pipeline.
- a `score_example` function that computes a 0..1 quality score given a
  predicted JSON and the ground-truth JSON.

The bootstrap step is what makes the dashboard usable for laypeople: instead
of asking them to write JSON from scratch, we run the current AI, show them
the result, and they correct it.
"""
from __future__ import annotations
import json
from typing import Any, Callable, Dict, List, Optional, Tuple


# ─────────────────────────────────────────────────────────────────────────────
# JSON metric helpers — recursive field-level F1 + exact-match
# ─────────────────────────────────────────────────────────────────────────────
def _flatten(obj: Any, prefix: str = "") -> Dict[str, str]:
    """Flatten a JSON tree into {dotted.path: stringified_value}.

    Lists are matched positionally by index. We canonicalise values to strings
    (lower-cased, stripped) so that "7,200" vs "7200" / true vs "true" don't
    spuriously fail.
    """
    out: Dict[str, str] = {}
    if isinstance(obj, dict):
        for k, v in obj.items():
            out.update(_flatten(v, f"{prefix}.{k}" if prefix else str(k)))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            out.update(_flatten(v, f"{prefix}[{i}]"))
    else:
        canon = "" if obj is None else str(obj).strip().lower().replace(",", "")
        out[prefix or "$"] = canon
    return out


def field_f1(predicted: Any, ground_truth: Any) -> Dict[str, float]:
    """Return dict with precision, recall, f1, exact_match across leaf fields."""
    p = _flatten(predicted)
    g = _flatten(ground_truth)
    if not g and not p:
        return {"precision": 1.0, "recall": 1.0, "f1": 1.0, "exact_match": 1.0,
                "leaves_predicted": 0, "leaves_truth": 0, "leaves_correct": 0}
    correct = sum(1 for k, v in p.items() if g.get(k) == v)
    precision = correct / len(p) if p else 0.0
    recall = correct / len(g) if g else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) else 0.0
    return {
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
        "exact_match": 1.0 if predicted == ground_truth else 0.0,
        "leaves_predicted": len(p),
        "leaves_truth": len(g),
        "leaves_correct": correct,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Task registry
# ─────────────────────────────────────────────────────────────────────────────

# These prompts are intentionally kept small + stable so the JSONL we build
# matches what production sends at inference time.
VENDOR_AUDIT_SYSTEM = (
    "You are a senior Indian payroll auditor. Extract structured data from a "
    "labour-law statutory document (PF ECR, ESIC return, PT challan, wage register, "
    "or attendance sheet). Return ONLY valid JSON. No prose, no markdown."
)

REGISTER_SCHEMA_SYSTEM = (
    "You are an expert in Indian labour-law statutory registers. Given a register "
    "template, extract its schema: column names, data types, period basis, and any "
    "computed columns. Return ONLY valid JSON."
)

REGISTER_NORMALIZE_SYSTEM = (
    "You are a payroll-data normaliser. Convert the heterogeneous payroll data "
    "below into a canonical employee-record list. Return ONLY valid JSON with "
    "keys: employees (list), period (string)."
)


async def _bootstrap_vendor_audit(file_bytes: bytes, file_name: str) -> Tuple[str, Dict[str, Any]]:
    """Run the current vendor audit AI pipeline. Returns (input_text, candidate_json)."""
    from vendor_audit.ai_extraction import (
        get_text_for_validation, detect_kind, _build_user_prompt,
        _excel_preview, _pdf_preview, _docx_preview, extract_document,
    )
    kind = detect_kind(file_name)
    if kind == "xlsx":
        extracted_preview = _excel_preview(file_bytes)
    elif kind == "pdf":
        extracted_preview = _pdf_preview(file_bytes)
    elif kind == "docx":
        extracted_preview = _docx_preview(file_bytes)
    else:
        extracted_preview = {"raw": get_text_for_validation(file_bytes, kind)[:8000]}
    user_prompt = _build_user_prompt(extracted_preview, hint=None)
    result = await extract_document(file_bytes, file_name, claimed_doc_type=None)
    candidate = result.get("extracted") or {}
    return user_prompt, candidate


async def _bootstrap_register_schema(file_bytes: bytes, file_name: str) -> Tuple[str, Dict[str, Any]]:
    from register_maker.ai_schema import study_template, _build_user_prompt
    from register_maker.extractors import extract_any, detect_kind
    extracted = extract_any(file_bytes, file_name)
    user_prompt = _build_user_prompt(extracted, hint=None)
    studied = await study_template(extracted, file_bytes=file_bytes,
                                    file_kind=detect_kind(file_name), hint=None)
    return user_prompt, (studied.get("ai_schema") or {})


async def _bootstrap_register_normalize(file_bytes: bytes, file_name: str) -> Tuple[str, Dict[str, Any]]:
    from register_maker.data_sources import normalize_data_file, _build_data_prompt
    from register_maker.extractors import extract_any
    extracted = extract_any(file_bytes, file_name)
    user_prompt = _build_data_prompt(extracted)
    norm = await normalize_data_file(file_bytes, file_name)
    return user_prompt, (norm.get("normalized") or {})


TASKS: Dict[str, Dict[str, Any]] = {
    "vendor_audit_extract": {
        "label": "Vendor Audit — document extraction",
        "description": "Extract employee/payroll rows from PF/ESIC/PT/wage docs.",
        "system": VENDOR_AUDIT_SYSTEM,
        "bootstrap": _bootstrap_vendor_audit,
        "default_base_model": "gpt-4o-mini-2024-07-18",
    },
    "register_schema": {
        "label": "Register Maker — template schema",
        "description": "Extract column schema from an uploaded register template.",
        "system": REGISTER_SCHEMA_SYSTEM,
        "bootstrap": _bootstrap_register_schema,
        "default_base_model": "gpt-4o-mini-2024-07-18",
    },
    "register_normalize": {
        "label": "Register Maker — data normalisation",
        "description": "Normalise raw payroll sheets into canonical employee records.",
        "system": REGISTER_NORMALIZE_SYSTEM,
        "bootstrap": _bootstrap_register_normalize,
        "default_base_model": "gpt-4o-mini-2024-07-18",
    },
}


def get_task(task_type: str) -> Dict[str, Any]:
    if task_type not in TASKS:
        raise ValueError(f"Unknown task_type: {task_type}")
    return TASKS[task_type]


def list_tasks() -> List[Dict[str, Any]]:
    return [
        {"key": k, "label": v["label"], "description": v["description"],
         "default_base_model": v["default_base_model"]}
        for k, v in TASKS.items()
    ]


def build_jsonl_lines(task_type: str, examples: List[Dict[str, Any]]) -> List[str]:
    """Build OpenAI chat-format JSONL training rows from approved examples."""
    task = get_task(task_type)
    lines: List[str] = []
    for ex in examples:
        gt = ex.get("ground_truth_output") or ex.get("candidate_output") or {}
        row = {
            "messages": [
                {"role": "system", "content": task["system"]},
                {"role": "user", "content": ex["input_text"]},
                {"role": "assistant", "content": json.dumps(gt, ensure_ascii=False)},
            ]
        }
        lines.append(json.dumps(row, ensure_ascii=False))
    return lines
