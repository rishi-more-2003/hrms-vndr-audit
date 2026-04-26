"""Combine AI-extracted data from multiple uploaded documents into a unified
employee row set compatible with the existing rule engine (VENDOR_SHEET_COLUMNS).

The contractor uploads any combo of: PF ECR, PF challan, ESIC contribution
history, Payroll Excel, Wage Register PDF, etc. We pull the most authoritative
employee list from one of them (ECR > contribution history > payroll register)
and then enrich with cross-document matched fields (UAN/IP-based).
"""
from __future__ import annotations
from typing import Dict, Any, List, Tuple
import logging

logger = logging.getLogger(__name__)

# Mapping from AI-extracted snake_case keys → existing canonical sheet columns
# (used by rules.py via _s, _n, _yes helpers — it just reads dict[KEY])
AI_TO_SHEET = {
    "uan": "UAN",
    "esic_ip": "ESIC IP NUMBER",
    "pf_member_id": "PF MEMBER ID",
    "name": "NAME OF EMPLOYEE (AS ON AADHAAR)",
    "father_name": "FATHER/HUSBAND NAME",
    "designation": "DESIGNATION",
    "gender": "GENDER",
    "doj": "DATE OF JOINING",
    "dol": "DATE OF LEAVING",
    "days_worked": "DAYS PAID",
    "ncp_days": "NCP DAYS",
    "gross_wages": "FINAL GROSS EARNED",
    "basic": "BASIC",
    "da": "DA",
    "epf_wages": "PF BASE",
    "eps_wages": "EPS BASE",
    "edli_wages": "EDLI BASE",
    "epf_contribution": "PF",
    "eps_contribution": "PF PENSION",
    "esic_wages": "ESIC BASE",
    "esic_employee": "ESIC",
    "pt_amount": "PT",
    "mlwf_amount": "MLWF",
}


def _employee_id(emp: Dict[str, Any]) -> str:
    """Best-effort canonical identifier for matching across documents."""
    for k in ("uan", "UAN", "esic_ip", "ESIC IP NUMBER", "pf_member_id", "PF MEMBER ID"):
        v = emp.get(k)
        if v:
            return str(v).strip()
    nm = emp.get("name") or emp.get("NAME OF EMPLOYEE (AS ON AADHAAR)") or ""
    return str(nm).strip().upper()


def _ai_emp_to_sheet_row(emp: Dict[str, Any]) -> Dict[str, Any]:
    row: Dict[str, Any] = {}
    for ai_key, sheet_col in AI_TO_SHEET.items():
        if ai_key in emp and emp[ai_key] is not None and emp[ai_key] != "":
            row[sheet_col] = emp[ai_key]
    # Pass through any keys that already match (capitalized) — useful for
    # docs where the AI output already used canonical column names
    for k, v in emp.items():
        if k.upper() == k and v is not None and v != "" and k not in row:
            row[k] = v
    # Sensible defaults for applicability flags so rule engine doesn't crash
    row.setdefault("EMPLOYEE CODE", row.get("UAN") or row.get("ESIC IP NUMBER") or row.get("NAME OF EMPLOYEE (AS ON AADHAAR)") or "")
    row.setdefault("PF APPLICABLE", "YES" if (row.get("PF") or row.get("PF BASE")) else "NO")
    row.setdefault("ESIC APPLICABLE", "YES" if (row.get("ESIC") or row.get("ESIC BASE")) else "NO")
    return row


# Authority order for "primary employee list"
PRIMARY_AUTHORITY = [
    "wage_register", "payroll_data",
    "pf_ecr", "esic_contribution_history",
]


def combine_extractions(documents: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], Dict[str, Dict[str, Any]], List[str]]:
    """Combine N AI-extracted documents into (rows, parsed_docs_compat, warnings).

    documents = [
      {
        "claimed_doc_type": str,                # contractor-asserted type
        "extracted": <full JSON from AI>,
        "validation": <{status, detected_type, confidence, message}>,
        ...
      }
    ]

    Returns:
      - rows: employee rows compatible with rules.run_full_audit
      - parsed_docs: dict keyed by detected/claimed doc_type with summary in
        the same shape regex parsers produced (rules engine reads this for
        cross-document checks).
      - warnings: human-friendly strings to bubble up.
    """
    warnings: List[str] = []

    # Bucket by effective doc type
    by_type: Dict[str, List[Dict[str, Any]]] = {}
    for d in documents:
        ext = d.get("extracted") or {}
        val = d.get("validation") or {}
        # Effective doc type: claimed first, then detected by AI/validator
        eff = (d.get("claimed_doc_type") or ext.get("doc_type_detected") or val.get("detected_type") or "unknown")
        by_type.setdefault(eff, []).append(d)
        # Surface mismatch warnings
        if val.get("status") == "mismatch":
            warnings.append(val.get("message") or f"Doc {d.get('file_name','?')} looks like wrong type")

    # Build legacy-compatible parsed_docs[doc_type] = {"summary": {...}, ...}
    parsed_docs: Dict[str, Dict[str, Any]] = {}
    for dtype, lst in by_type.items():
        # Pick highest-confidence extraction for that type
        best = max(lst, key=lambda x: float((x.get("extracted") or {}).get("confidence") or 0))
        ext = best.get("extracted") or {}
        parsed_docs[dtype] = {
            "doc_type": dtype,
            "summary": ext.get("summary", {}),
            "employees": ext.get("employees", []),
            "tables": ext.get("tables", []),
            "ai_confidence": ext.get("confidence", 0),
            "model_used": ext.get("model_used"),
        }

    # Pick primary employee list
    rows_emps: List[Dict[str, Any]] = []
    primary_dtype: str = ""
    for cand in PRIMARY_AUTHORITY:
        if cand in by_type:
            d = by_type[cand][0]
            ext = d.get("extracted") or {}
            emps = ext.get("employees") or []
            if emps:
                rows_emps = emps
                primary_dtype = cand
                break
    if not rows_emps:
        # Fallback — use any doc with employees, prefer highest count
        candidates = [d for lst in by_type.values() for d in lst if (d.get("extracted") or {}).get("employees")]
        if candidates:
            best = max(candidates, key=lambda x: len((x.get("extracted") or {}).get("employees") or []))
            rows_emps = (best.get("extracted") or {}).get("employees") or []
            primary_dtype = (best.get("extracted") or {}).get("doc_type_detected") or "unknown"
            warnings.append(f"Used '{primary_dtype}' as primary employee list (no wage-register/payroll/ECR found).")

    # Enrich primary employees with fields from other docs (matched by UAN/IP/name)
    other_lookups: Dict[str, Dict[str, Dict[str, Any]]] = {}
    for dtype, lst in by_type.items():
        if dtype == primary_dtype:
            continue
        for d in lst:
            ext = d.get("extracted") or {}
            for emp in (ext.get("employees") or []):
                key = _employee_id(emp)
                if key:
                    other_lookups.setdefault(dtype, {})[key] = emp

    rows: List[Dict[str, Any]] = []
    for emp in rows_emps:
        merged = dict(emp)
        key = _employee_id(emp)
        if key:
            for dtype, lookup in other_lookups.items():
                if key in lookup:
                    for k, v in lookup[key].items():
                        if v not in (None, "") and merged.get(k) in (None, ""):
                            merged[k] = v
        rows.append(_ai_emp_to_sheet_row(merged))

    if not rows:
        warnings.append("No employee rows could be extracted from any uploaded document.")
    return rows, parsed_docs, warnings
