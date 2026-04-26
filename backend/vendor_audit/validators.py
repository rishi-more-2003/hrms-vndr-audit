"""Document validation rules — regex-based identifiers per doc-type.

Adopted from the reference Saffron project. Used to catch "wrong document
uploaded" errors (e.g., contractor uploads PF Challan in ESIC slot).
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import List, Tuple
import re


@dataclass
class DocRule:
    doc_type: str
    label: str
    key_identifiers: List[str] = field(default_factory=list)   # at least min_key_matches must hit
    min_key_matches: int = 2
    secondary_identifiers: List[str] = field(default_factory=list)  # bonus confidence
    strong_exclusions: List[str] = field(default_factory=list)      # if any hit → it's NOT this doc


VALIDATION_RULES = {
    "pf_ecr": DocRule(
        doc_type="pf_ecr", label="PF ECR (Form 5A / Return)",
        key_identifiers=[
            r"electronic\s*challan\s*cum\s*return",
            r"ecr\s*(type|id)",
            r"member\s*details",
            r"\buan\b",
            r"contribution\s*(rate|remitted)",
        ],
        secondary_identifiers=[
            r"epf\s*contribution", r"eps\s*contribution", r"total\s*members",
            r"wage\s*month", r"return\s*month",
        ],
        strong_exclusions=[
            r"transaction\s*completed", r"payment\s*confirmation\s*receipt",
        ],
    ),
    "pf_challan": DocRule(
        doc_type="pf_challan", label="PF Challan",
        key_identifiers=[
            r"combined\s*challan", r"provident\s*fund\s*organisation",
            r"\btrrn\b", r"establishment\s*(code|id)",
            r"a\/c[\s.\-]*(01|02|10|21|22)",
        ],
        secondary_identifiers=[
            r"\bepf\b", r"\beps\b", r"\bedli\b",
            r"total\s*subscribers", r"wage\s*month",
        ],
        strong_exclusions=[
            r"payment\s*confirmation\s*receipt", r"payment\s*confirmed",
            r"return\s*of\s*contribution",
        ],
    ),
    "pf_paid_challan": DocRule(
        doc_type="pf_paid_challan", label="PF Paid Challan",
        key_identifiers=[
            r"\btrrn\b", r"(amount\s*paid|amount\s*remitted)",
            r"(payment\s*confirmation|paid\s*on)",
            r"(employer|epfo)",
            r"bank\s*cin",
        ],
        secondary_identifiers=[
            r"payment\s*successful", r"transaction\s*successful",
        ],
        strong_exclusions=[
            r"electronic\s*challan\s*cum\s*return", r"member\s*details",
            r"return\s*of\s*contribution",
        ],
    ),
    "esic_paid_challan": DocRule(
        doc_type="esic_paid_challan", label="ESIC Paid Challan",
        key_identifiers=[
            r"\besic\b", r"transaction\s*(completed|details|successful|status)",
            r"challan\s*(number|no\.?)", r"employer.?s?\s*code",
            r"amount\s*(paid|rs\.?)",
        ],
        secondary_identifiers=[
            r"state\s*insurance", r"34\d{14,17}",
        ],
        strong_exclusions=[
            r"form[\s\-]*5", r"return\s*of\s*contribution",
            r"contribution\s*history",
        ],
    ),
    "esic_contribution_history": DocRule(
        doc_type="esic_contribution_history", label="ESIC Contribution History",
        key_identifiers=[
            r"contribution\s*history", r"ip\s*(number|contribution)",
            r"total\s*ip\s*contribution",
            r"total\s*employer\s*contribution",
            r"total\s*monthly\s*wages",
        ],
        secondary_identifiers=[
            r"is\s*disable", r"no\.?\s*of\s*days", r"ip\s*name",
        ],
        strong_exclusions=[
            r"form[\s\-]*5", r"return\s*of\s*contribution",
            r"transaction\s*completed",
        ],
    ),
    "pt_paid_challan": DocRule(
        doc_type="pt_paid_challan", label="PT Paid Challan",
        key_identifiers=[
            r"professional\s*tax", r"(grn|cin)\s*[:\-]?",
            r"(tin|registration\s*no)",
            r"(amount\s*paid|tax\s*amount)",
            r"(payment\s*date|paid\s*on)",
        ],
        secondary_identifiers=[
            r"mvat", r"gstn", r"period\s*(from|to)",
        ],
        strong_exclusions=[
            r"epf", r"esic", r"return\s*of\s*contribution",
        ],
    ),
    "pt_return": DocRule(
        doc_type="pt_return", label="PT Return",
        key_identifiers=[
            r"professional\s*tax", r"(form\s*iiib|form\s*9\b)",
            r"return\s*period",
            r"(tin|registration\s*no)",
            r"(total\s*tax|tax\s*amount)",
        ],
        secondary_identifiers=[
            r"return\s*type", r"period\s*(from|to)",
        ],
        strong_exclusions=[
            r"challan", r"epf", r"esic\s*paid",
        ],
    ),
}


def validate_document_text(text: str, claimed_doc_type: str) -> Tuple[str, float, str, str]:
    """Returns (status, confidence, detected_doc_type, message).

    status: one of "valid" | "invalid" | "mismatch"
    detected_doc_type: best-fitting rule key (or empty)
    message: human-friendly explanation
    """
    if not text or not text.strip():
        return "invalid", 0.0, "", "No readable text in document"

    txt = text  # already lowered or original — regex flags handle case
    scores: dict = {}
    for key, rule in VALIDATION_RULES.items():
        kmatches = sum(1 for p in rule.key_identifiers if re.search(p, txt, re.IGNORECASE))
        smatches = sum(1 for p in rule.secondary_identifiers if re.search(p, txt, re.IGNORECASE))
        excl = sum(1 for p in rule.strong_exclusions if re.search(p, txt, re.IGNORECASE))
        # Score: every key match worth 2, secondary 1, exclusion -3
        score = kmatches * 2 + smatches - excl * 3
        scores[key] = {"score": score, "kmatches": kmatches, "smatches": smatches, "excl": excl, "rule": rule}

    best_key = max(scores, key=lambda k: scores[k]["score"])
    best = scores[best_key]
    rule = best["rule"]

    # Confidence: cap to 1.0
    max_possible = len(rule.key_identifiers) * 2 + len(rule.secondary_identifiers)
    confidence = max(0.0, min(1.0, best["score"] / max(max_possible, 1)))

    if best["kmatches"] < rule.min_key_matches or best["score"] <= 0:
        # Below the threshold for any KNOWN statutory document.
        # That doesn't make the upload illegitimate — it might be a wage register,
        # payroll Excel, or generic establishment doc. Surface as 'unknown' (not 'invalid')
        # so the AI extraction still proceeds and the contractor isn't blocked.
        return "unknown", confidence, "", "Could not match any known statutory format — AI will still attempt extraction"

    if claimed_doc_type and best_key != claimed_doc_type:
        # Show the specific mismatch
        claimed_label = VALIDATION_RULES.get(claimed_doc_type, DocRule(claimed_doc_type, claimed_doc_type)).label
        return "mismatch", confidence, best_key, (
            f"This looks like a {rule.label} but was uploaded under {claimed_label}."
        )

    return "valid", confidence, best_key, f"Looks like a valid {rule.label}"
