"""Deterministic register generation engine.

Takes:
  - The original template file (.xlsx preferred, fallback for pdf/docx)
  - The template's AI schema
  - Normalized data records
  - The AI-produced field mapping (target_key → source_key)

Produces a filled .xlsx file as bytes. NO AI calls happen here — once the mapping
is cached, generation is free and deterministic.
"""
from __future__ import annotations
import io
import logging
from typing import Any, Dict, List, Optional, Tuple
import base64
import openpyxl
from openpyxl.utils import get_column_letter, column_index_from_string

logger = logging.getLogger(__name__)


def _coerce(value: Any, dtype: str) -> Any:
    if value is None or value == "":
        return None
    try:
        if dtype == "number" or dtype == "currency":
            if isinstance(value, (int, float)):
                return value
            s = str(value).replace(",", "").replace("₹", "").strip()
            return float(s)
        if dtype == "bool":
            return bool(value) if not isinstance(value, str) else value.strip().lower() in ("true", "yes", "y", "1")
        return value
    except Exception:
        return value


def _resolve_value(target_key: str, source_key: Optional[str], record: Dict[str, Any],
                   establishment: Dict[str, Any], dtype: str, source_hint: Optional[str] = None,
                   row_index: Optional[int] = None) -> Any:
    # Implicit row_index handling — even if mapping AI didn't catch it
    if (source_key == "row_index") or (not source_key and source_hint == "row_index"):
        return (row_index or 0) + 1 if row_index is not None else None
    if not source_key:
        return None
    fields = record.get("fields") if isinstance(record, dict) and "fields" in record else record
    if isinstance(fields, dict) and source_key in fields:
        return _coerce(fields[source_key], dtype)
    if isinstance(establishment, dict) and source_key in establishment:
        return _coerce(establishment[source_key], dtype)
    return None


def _establishment_lookup(key: Optional[str], establishment: Dict[str, Any], extra: Optional[Dict[str, Any]] = None) -> Any:
    """Tolerant lookup: try the AI-supplied key plus a few common synonyms."""
    if not key:
        return None
    bag = {**(extra or {}), **(establishment or {})}
    if key in bag:
        return bag[key]
    # Synonym map (snake_case)
    synonyms = {
        "employer_name": ["name", "company_name", "organization_name", "establishment_name", "legal_name"],
        "establishment_name": ["name", "employer_name", "company_name"],
        "establishment_address": ["address", "registered_address", "office_address"],
        "address": ["establishment_address", "registered_address", "office_address"],
        "wage_period": ["label", "period", "month_year", "pay_period"],
        "period": ["label", "wage_period", "month_year"],
        "month_year": ["label", "wage_period", "period"],
    }
    for syn in synonyms.get(key, []):
        if syn in bag:
            return bag[syn]
    return None


def _find_header_row(ws, columns: List[Dict[str, Any]]) -> Optional[Tuple[int, Dict[str, int]]]:
    """Search the worksheet for the row that contains the column headers.
    Returns (row_index, {column_key: column_letter_index}) or None.
    """
    if not columns:
        return None
    # Build a map of header text → key
    header_to_key = {(c.get("name") or "").strip().lower(): c.get("key") for c in columns if c.get("name")}
    if not header_to_key:
        return None
    # Scan first 30 rows
    max_r = min(ws.max_row or 0, 30)
    max_c = min(ws.max_column or 0, 60)
    for r in range(1, max_r + 1):
        matches: Dict[str, int] = {}
        for c in range(1, max_c + 1):
            v = ws.cell(row=r, column=c).value
            if v is None:
                continue
            s = str(v).strip().lower()
            if s in header_to_key and header_to_key[s] not in matches:
                matches[header_to_key[s]] = c
        # Need at least 50% of columns matched on a single row
        if len(matches) >= max(2, len(header_to_key) // 2):
            return r, matches
    return None


def _set_static_cell(ws, cell_ref: Optional[str], value: Any):
    if not cell_ref or value is None:
        return
    try:
        ws[cell_ref] = value
    except Exception:
        pass


def fill_xlsx_template(template_b64: str, schema: Dict[str, Any], mapping: Dict[str, Any],
                        records: List[Dict[str, Any]], establishment: Dict[str, Any]) -> Tuple[bytes, Dict[str, Any]]:
    """Fill an existing .xlsx template (preserves formatting, merges, formulas).
    Returns (filled_bytes, metadata)."""
    raw = base64.b64decode(template_b64)
    wb = openpyxl.load_workbook(io.BytesIO(raw))
    ws = wb.active  # for now: fill primary sheet; multi-sheet support can come later

    columns: List[Dict[str, Any]] = schema.get("columns") or []
    static_fields: List[Dict[str, Any]] = schema.get("static_fields") or []
    column_mapping: Dict[str, Optional[str]] = (mapping or {}).get("column_mapping") or {}
    static_mapping: Dict[str, Optional[str]] = (mapping or {}).get("static_mapping") or {}

    # 1. Find header row
    found = _find_header_row(ws, columns)
    if not found:
        # Fallback: try to use schema's header_cell hints
        header_row = None
        cells: Dict[str, int] = {}
        for c in columns:
            ref = c.get("header_cell")
            if ref:
                try:
                    col_letter = "".join(ch for ch in ref if ch.isalpha())
                    row_num = int("".join(ch for ch in ref if ch.isdigit()))
                    cells[c["key"]] = column_index_from_string(col_letter)
                    header_row = max(header_row or 0, row_num)
                except Exception:
                    pass
        if header_row and cells:
            found = (header_row, cells)
    if not found:
        # No header row — bail with a metadata error; write nothing
        return _write_bytes(wb), {"rows_written": 0, "warning": "could_not_locate_header_row"}

    header_row, key_to_col = found
    start_row = header_row + 1

    # 2. Write static fields by AI-supplied value_cell with tolerant lookup
    period_extra = (mapping or {}).get("__period__") or {}
    for sf in static_fields:
        key = sf.get("key")
        cell_ref = sf.get("value_cell")
        src = static_mapping.get(key)
        # Try mapped source key first, then fall back to the static field's own key
        val = _establishment_lookup(src, establishment, period_extra)
        if val is None:
            val = _establishment_lookup(key, establishment, period_extra)
        _set_static_cell(ws, cell_ref, val)

    # 3. Write data rows
    written = 0
    for i, rec in enumerate(records or []):
        target_row = start_row + i
        for c in columns:
            key = c.get("key")
            if not key:
                continue
            col_idx = key_to_col.get(key)
            if not col_idx:
                continue
            src_key = column_mapping.get(key)
            value = _resolve_value(key, src_key, rec, establishment,
                                    c.get("dtype") or "text",
                                    source_hint=c.get("source_hint"),
                                    row_index=i)
            if value is not None:
                try:
                    ws.cell(row=target_row, column=col_idx).value = value
                except Exception:
                    pass
        written += 1

    return _write_bytes(wb), {"rows_written": written, "header_row": header_row, "start_row": start_row}


def _write_bytes(wb) -> bytes:
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def generate_fresh_xlsx(schema: Dict[str, Any], mapping: Dict[str, Any],
                        records: List[Dict[str, Any]], establishment: Dict[str, Any],
                        register_name: str = "Register") -> Tuple[bytes, Dict[str, Any]]:
    """Build a fresh .xlsx from scratch using the AI schema. Used when the original
    template was a PDF or Word doc that we cannot fill in-place."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = (schema.get("register_form_code") or register_name)[:30]

    # Title row
    ws["A1"] = schema.get("register_name") or register_name
    ws["A1"].font = openpyxl.styles.Font(bold=True, size=14)

    # Static fields: top-left labels + values with tolerant lookup
    static = schema.get("static_fields") or []
    static_mapping = (mapping or {}).get("static_mapping") or {}
    period_extra = (mapping or {}).get("__period__") or {}
    row = 3
    for sf in static:
        key = sf.get("key")
        ws.cell(row=row, column=1).value = sf.get("name") or key
        src = static_mapping.get(key)
        val = _establishment_lookup(src, establishment, period_extra)
        if val is None:
            val = _establishment_lookup(key, establishment, period_extra)
        ws.cell(row=row, column=2).value = val
        row += 1

    # Header row
    columns = schema.get("columns") or []
    header_row = row + 1
    for ci, c in enumerate(columns, start=1):
        cell = ws.cell(row=header_row, column=ci)
        cell.value = c.get("name") or c.get("key")
        cell.font = openpyxl.styles.Font(bold=True)

    # Data rows
    column_mapping = (mapping or {}).get("column_mapping") or {}
    written = 0
    for i, rec in enumerate(records or []):
        for ci, c in enumerate(columns, start=1):
            key = c.get("key")
            src_key = column_mapping.get(key) if key else None
            val = _resolve_value(key, src_key, rec, establishment,
                                  c.get("dtype") or "text",
                                  source_hint=c.get("source_hint"),
                                  row_index=i)
            if val is not None:
                ws.cell(row=header_row + 1 + i, column=ci).value = val
        written += 1

    # Auto-width columns
    for ci, c in enumerate(columns, start=1):
        ws.column_dimensions[get_column_letter(ci)].width = max(12, min(35, len(str(c.get("name") or "")) + 4))

    return _write_bytes(wb), {"rows_written": written, "header_row": header_row, "fresh": True}
