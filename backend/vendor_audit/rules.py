"""Employee-level rule engine for Vendor Audit.

All rules return a Finding dict: {rule_code, law, severity, title, detail, expected, actual, employee_code}.
Severities: critical | high | medium | low | info
"""
from __future__ import annotations
from typing import Dict, Any, List
from datetime import datetime
import calendar


METRO_CITIES = {"MUMBAI", "KOLKATA", "DELHI", "CHENNAI", "HYDERABAD", "PUNE", "AHMEDABAD", "BENGALURU", "BANGALORE"}

PF_WAGE_CAP = 15000
ESIC_WAGE_THRESHOLD = 21000
EMPLOYEE_PF_PCT = 12.0
EMPLOYER_PF_PCT = 12.0
EPS_PCT = 8.33
EDLI_PCT = 0.5
PF_ADMIN_PCT = 0.5
EMPLOYEE_ESIC_PCT = 0.75
EMPLOYER_ESIC_PCT = 3.25


def _n(v) -> float:
    if v is None or v == "":
        return 0.0
    try:
        return float(str(v).replace(",", "").strip())
    except (TypeError, ValueError):
        return 0.0


def _s(v) -> str:
    return str(v).strip().upper() if v is not None else ""


def _yes(v) -> bool:
    return _s(v) in ("YES", "Y", "TRUE", "1", "APPLICABLE")


def _finding(rule_code: str, law: str, severity: str, title: str, detail: str,
             employee_code: str = None, expected=None, actual=None, field: str = None) -> Dict[str, Any]:
    return {
        "rule_code": rule_code, "law": law, "severity": severity,
        "title": title, "detail": detail,
        "employee_code": employee_code, "field": field,
        "expected": expected, "actual": actual,
    }


def _is_metro(row: Dict[str, Any]) -> bool:
    city = _s(row.get("CITY") or row.get("LOCATION"))
    return any(m in city for m in METRO_CITIES)


# ── PF rules ──
def audit_pf_employee(row: Dict[str, Any]) -> List[Dict[str, Any]]:
    findings: List[Dict[str, Any]] = []
    code = row.get("EMPLOYEE CODE") or ""
    if not _yes(row.get("PF APPLICABLE")):
        if _n(row.get("PF VPF")) > 0 or _n(row.get("EMP PF")) > 0:
            findings.append(_finding("PF001", "PF", "high", "PF deducted despite not applicable",
                "Employee marked PF NOT APPLICABLE but PF amount is non-zero.",
                code, expected=0, actual=_n(row.get("EMP PF") or row.get("PF VPF")), field="PF VPF"))
        return findings
    # UAN required
    uan = str(row.get("UAN NUMBER") or "").strip()
    if not uan:
        findings.append(_finding("PF002", "PF", "critical", "UAN missing",
            "PF is applicable but UAN NUMBER is blank. UAN is mandatory for every PF member.",
            code, field="UAN NUMBER"))
    elif not uan.isdigit() or len(uan) != 12:
        findings.append(_finding("PF003", "PF", "high", "UAN format invalid",
            "UAN should be exactly 12 digits. Found: " + uan, code, field="UAN NUMBER"))
    # PF BASE vs cap
    pf_base = _n(row.get("PF BASE"))
    incl = _n(row.get("INCLUSION AMT"))
    if incl > PF_WAGE_CAP and pf_base > PF_WAGE_CAP:
        findings.append(_finding("PF004", "PF", "medium", "PF Base exceeds ₹15,000 cap",
            f"PF Base is capped at ₹{PF_WAGE_CAP} when inclusion wages > ₹{PF_WAGE_CAP}.",
            code, expected=PF_WAGE_CAP, actual=pf_base, field="PF BASE"))
    if incl <= PF_WAGE_CAP and pf_base != incl and pf_base > 0:
        findings.append(_finding("PF005", "PF", "medium", "PF Base mismatch with Inclusion",
            f"When Inclusion ≤ ₹{PF_WAGE_CAP}, PF Base should equal Inclusion amount.",
            code, expected=incl, actual=pf_base, field="PF BASE"))
    # EPS BASE
    eps_base = _n(row.get("EPS BASE"))
    expected_eps_base = min(incl, PF_WAGE_CAP) if _yes(row.get("PF PENSION APPLICABLE")) else 0
    if _yes(row.get("PF PENSION APPLICABLE")) and abs(eps_base - expected_eps_base) > 1:
        findings.append(_finding("PF006", "PF", "medium", "EPS Base incorrect",
            f"EPS Base should be min(Inclusion, ₹{PF_WAGE_CAP}).",
            code, expected=expected_eps_base, actual=eps_base, field="EPS BASE"))
    # Employee PF = 12% of PF Base
    emp_pf = _n(row.get("EMP PF"))
    expected_emp_pf = round(pf_base * EMPLOYEE_PF_PCT / 100)
    if abs(emp_pf - expected_emp_pf) > 2:
        findings.append(_finding("PF007", "PF", "high", "Employee PF contribution mismatch",
            f"Expected 12% of PF Base = ₹{expected_emp_pf}, found ₹{emp_pf}.",
            code, expected=expected_emp_pf, actual=emp_pf, field="EMP PF"))
    # Employer PF pension = 8.33% of EPS Base (when PF Pension applicable)
    if _yes(row.get("PF PENSION APPLICABLE")):
        eps_contrib = _n(row.get("PF PENSION"))
        expected_eps_contrib = round(eps_base * EPS_PCT / 100)
        if abs(eps_contrib - expected_eps_contrib) > 2:
            findings.append(_finding("PF008", "PF", "high", "EPS contribution mismatch",
                f"Expected 8.33% of EPS Base = ₹{expected_eps_contrib}, found ₹{eps_contrib}.",
                code, expected=expected_eps_contrib, actual=eps_contrib, field="PF PENSION"))
    return findings


# ── ESIC rules ──
def audit_esic_employee(row: Dict[str, Any]) -> List[Dict[str, Any]]:
    findings: List[Dict[str, Any]] = []
    code = row.get("EMPLOYEE CODE") or ""
    applicable = _yes(row.get("ESIC APPLICABLE"))
    final_gross = _n(row.get("FINAL GROSS EARNED"))
    esic_base = _n(row.get("ESIC BASE"))
    esic_emp = _n(row.get("ESIC"))
    # Threshold check
    if applicable and final_gross > ESIC_WAGE_THRESHOLD:
        findings.append(_finding("ES001", "ESIC", "high", "ESIC applied above threshold",
            f"Final Gross ₹{final_gross} exceeds ESIC threshold ₹{ESIC_WAGE_THRESHOLD}. Employee should not be covered unless already in contribution period.",
            code, expected=f"≤{ESIC_WAGE_THRESHOLD}", actual=final_gross, field="FINAL GROSS EARNED"))
    if not applicable and final_gross <= ESIC_WAGE_THRESHOLD and final_gross > 0:
        findings.append(_finding("ES002", "ESIC", "medium", "Eligible employee not covered under ESIC",
            f"Final Gross ₹{final_gross} ≤ ₹{ESIC_WAGE_THRESHOLD}. ESIC appears applicable but marked NO.",
            code, field="ESIC APPLICABLE"))
    if applicable:
        ip = str(row.get("ESIC IP NUMBER") or "").strip()
        if not ip:
            findings.append(_finding("ES003", "ESIC", "critical", "ESIC IP Number missing",
                "ESIC is applicable but IP Number is blank.", code, field="ESIC IP NUMBER"))
        if esic_base > 0 and abs(esic_base - final_gross) > 1:
            findings.append(_finding("ES004", "ESIC", "medium", "ESIC Base mismatch Final Gross",
                "ESIC Base should equal Final Gross Earned.",
                code, expected=final_gross, actual=esic_base, field="ESIC BASE"))
        expected_esic_emp = round(esic_base * EMPLOYEE_ESIC_PCT / 100)
        if abs(esic_emp - expected_esic_emp) > 2:
            findings.append(_finding("ES005", "ESIC", "high", "ESIC employee contribution mismatch",
                f"Expected 0.75% of ESIC Base = ₹{expected_esic_emp}, found ₹{esic_emp}.",
                code, expected=expected_esic_emp, actual=esic_emp, field="ESIC"))
    return findings


# ── PT Maharashtra rules ──
def _pt_mh_expected(gender: str, month: str, gross: float) -> float:
    """PT Maharashtra slab. Month: 'FEB' or other (MAR-JAN)."""
    is_feb = _s(month).startswith("FEB")
    gender = _s(gender)
    if gender == "FEMALE":
        if gross <= 25000:
            return 0
        return 300 if is_feb else 200
    # male / other
    if gross <= 7500:
        return 0
    if gross <= 10000:
        return 300 if is_feb else 175
    return 300 if is_feb else 200


def audit_pt_mh_employee(row: Dict[str, Any]) -> List[Dict[str, Any]]:
    findings: List[Dict[str, Any]] = []
    code = row.get("EMPLOYEE CODE") or ""
    if _s(row.get("STATE")) != "MAHARASHTRA":
        return findings
    gross = _n(row.get("FINAL GROSS EARNED"))
    if gross <= 0:
        return findings
    month = _s(row.get("WAGE MONTH"))
    expected = _pt_mh_expected(_s(row.get("GENDER")), month, gross)
    actual = _n(row.get("PT"))
    if abs(expected - actual) > 1:
        findings.append(_finding("PT001", "PT_MH", "high", "PT Maharashtra amount incorrect",
            f"Per MH slab for {row.get('GENDER')}, {month}, gross ₹{gross}: expected ₹{expected}, found ₹{actual}.",
            code, expected=expected, actual=actual, field="PT"))
    return findings


# ── MLWF rules ──
def audit_mlwf_employee(row: Dict[str, Any]) -> List[Dict[str, Any]]:
    findings: List[Dict[str, Any]] = []
    code = row.get("EMPLOYEE CODE") or ""
    month = _s(row.get("WAGE MONTH"))
    is_mlwf_month = month.startswith("JUN") or month.startswith("DEC")
    lwf = _n(row.get("LWF"))
    if not is_mlwf_month:
        if lwf > 0:
            findings.append(_finding("LW001", "MLWF", "medium", "MLWF deducted in wrong month",
                "MLWF deduction should be only in June and December wage months.",
                code, expected=0, actual=lwf, field="LWF"))
        return findings
    if _yes(row.get("MLWF APPLICABLE")):
        if lwf != 25:
            findings.append(_finding("LW002", "MLWF", "high", "MLWF amount incorrect",
                "MLWF deduction is ₹25/- per half-year (June & December).",
                code, expected=25, actual=lwf, field="LWF"))
    else:
        if lwf > 0:
            findings.append(_finding("LW003", "MLWF", "high", "MLWF deducted but not applicable",
                "MLWF is NOT applicable for this employee but LWF amount > 0.",
                code, expected=0, actual=lwf, field="LWF"))
    return findings


# ── Minimum Wages (simple floor check) ──
MIN_WAGES_FLOOR = {  # state -> monthly floor (indicative — user can maintain a master later)
    "MAHARASHTRA": 13000,
    "KARNATAKA": 12500,
    "DELHI": 17494,
    "TAMIL NADU": 11500,
    "HARYANA": 11358,
}


def audit_min_wages_employee(row: Dict[str, Any]) -> List[Dict[str, Any]]:
    findings: List[Dict[str, Any]] = []
    code = row.get("EMPLOYEE CODE") or ""
    state = _s(row.get("STATE"))
    floor = MIN_WAGES_FLOOR.get(state)
    if not floor:
        return findings
    gross_rate = _n(row.get("GROSS RATE"))
    if gross_rate > 0 and gross_rate < floor:
        findings.append(_finding("MW001", "MINIMUM_WAGES", "critical", "Below Minimum Wage",
            f"Gross Rate ₹{gross_rate} is below the {state} minimum wage floor of ₹{floor}/month.",
            code, expected=floor, actual=gross_rate, field="GROSS RATE"))
    return findings


# ── HRA & Inclusion rules ──
def audit_structure_employee(row: Dict[str, Any]) -> List[Dict[str, Any]]:
    findings: List[Dict[str, Any]] = []
    code = row.get("EMPLOYEE CODE") or ""
    incl = _n(row.get("INCLUSION AMT"))
    if incl <= 0:
        return findings
    # HRA min 5%, max 50% (metro) / 40% (non-metro)
    rate_hra = _n(row.get("RATE HRA"))
    min_hra = round(incl * 0.05)
    max_hra_pct = 0.50 if _is_metro(row) else 0.40
    max_hra = round(incl * max_hra_pct)
    if rate_hra > 0 and rate_hra < min_hra:
        findings.append(_finding("ST001", "STRUCTURE", "low", "HRA below minimum 5% of Inclusion",
            f"HRA ₹{rate_hra} < 5% of Inclusion (₹{min_hra}).",
            code, expected=f"≥{min_hra}", actual=rate_hra, field="RATE HRA"))
    if rate_hra > max_hra:
        findings.append(_finding("ST002", "STRUCTURE", "medium",
            f"HRA exceeds max {int(max_hra_pct*100)}% of Inclusion",
            f"HRA ₹{rate_hra} > {int(max_hra_pct*100)}% of Inclusion (₹{max_hra}).",
            code, expected=f"≤{max_hra}", actual=rate_hra, field="RATE HRA"))
    # Basic should be ≥ 50% of Final Earned Gross
    basic_earned = _n(row.get("EARNED BASIC"))
    final_gross = _n(row.get("FINAL GROSS EARNED"))
    if final_gross > 0 and basic_earned > 0 and basic_earned < final_gross * 0.5:
        findings.append(_finding("ST003", "STRUCTURE", "medium", "Basic below 50% of Final Gross",
            "Earned Basic should be at least 50% of Final Gross Earned.",
            code, expected=round(final_gross*0.5), actual=basic_earned, field="EARNED BASIC"))
    # Net salary sanity
    tot_ded = _n(row.get("TOTAL DEDUCTION"))
    net = _n(row.get("NET SALARY"))
    if final_gross > 0 and abs((final_gross - tot_ded) - net) > 2:
        findings.append(_finding("ST004", "STRUCTURE", "high", "Net salary does not tally",
            f"Final Gross ₹{final_gross} - Total Deduction ₹{tot_ded} ≠ Net Salary ₹{net}.",
            code, expected=final_gross - tot_ded, actual=net, field="NET SALARY"))
    return findings


# ── Payment of Wages date rule (uses parsed docs) ──
def audit_payment_date(wage_month: str, pf_paid_date: str, pt_paid_date: str) -> List[Dict[str, Any]]:
    findings: List[Dict[str, Any]] = []
    def _parse(d):
        if not d: return None
        for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%d/%m/%y", "%d-%m-%y"):
            try: return datetime.strptime(d, fmt)
            except: pass
        return None
    try:
        wm = datetime.strptime(wage_month, "%b-%Y")
    except Exception:
        return findings
    last_day = calendar.monthrange(wm.year, wm.month)[1]
    # PF due by 15th of next month
    nm = wm.month % 12 + 1
    ny = wm.year + (1 if wm.month == 12 else 0)
    pf_due = datetime(ny, nm, 15)
    pt_due = datetime(ny, nm, 21)  # MH PT — 21st of next month (half-yearly ≤ 30th Nov also)
    dt = _parse(pf_paid_date)
    if dt and dt > pf_due:
        findings.append(_finding("PW001", "PAYMENT_OF_WAGES", "high", "PF paid after due date",
            f"PF paid on {pf_paid_date}. Statutory due date: {pf_due.strftime('%d/%m/%Y')} (15th of month following wage month).",
            expected=pf_due.strftime("%d/%m/%Y"), actual=pf_paid_date))
    dt = _parse(pt_paid_date)
    if dt and dt > pt_due:
        findings.append(_finding("PW002", "PAYMENT_OF_WAGES", "high", "PT paid after due date (Maharashtra)",
            f"PT paid on {pt_paid_date}. MH due date for monthly PT: {pt_due.strftime('%d/%m/%Y')}.",
            expected=pt_due.strftime("%d/%m/%Y"), actual=pt_paid_date))
    return findings


# ── Cross-document checks ──
def audit_cross_document(rows: List[Dict[str, Any]], parsed_docs: Dict[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
    findings: List[Dict[str, Any]] = []
    n_rows = len(rows)
    sum_pf_base = sum(_n(r.get("PF BASE")) for r in rows)
    sum_emp_pf = sum(_n(r.get("EMP PF")) for r in rows)
    sum_eps = sum(_n(r.get("PF PENSION")) for r in rows)
    sum_esic_emp = sum(_n(r.get("ESIC")) for r in rows)
    sum_esic_base = sum(_n(r.get("ESIC BASE")) for r in rows)
    sum_pt = sum(_n(r.get("PT")) for r in rows)

    pf_ecr = (parsed_docs.get("pf_ecr") or {}).get("summary", {})
    pf_challan = (parsed_docs.get("pf_challan") or {}).get("summary", {})
    pf_paid = (parsed_docs.get("pf_paid_challan") or {}).get("summary", {})
    esic_hist = (parsed_docs.get("esic_contribution_history") or {}).get("summary", {})
    esic_paid = (parsed_docs.get("esic_paid_challan") or {}).get("summary", {})
    pt_paid = (parsed_docs.get("pt_paid_challan") or {}).get("summary", {})

    if pf_ecr and pf_ecr.get("total_members"):
        if int(pf_ecr["total_members"]) < n_rows:
            findings.append(_finding("XD001", "PF", "critical", "PF ECR member count less than payroll rows",
                f"PF ECR reports {pf_ecr['total_members']} members, but payroll sheet has {n_rows} employees.",
                expected=f"≥{n_rows}", actual=pf_ecr["total_members"]))
    if pf_challan and pf_challan.get("total_subscribers"):
        if int(pf_challan["total_subscribers"]) < n_rows:
            findings.append(_finding("XD002", "PF", "critical", "PF Challan subscribers count mismatch",
                f"PF Challan reports {pf_challan['total_subscribers']} subscribers vs {n_rows} payroll rows.",
                expected=f"≥{n_rows}", actual=pf_challan["total_subscribers"]))
    if pf_ecr.get("total_epf_remitted") and sum_emp_pf > 0:
        if pf_ecr["total_epf_remitted"] + 5 < sum_emp_pf:
            findings.append(_finding("XD003", "PF", "high", "PF ECR EPF remitted less than payroll deductions",
                f"ECR reports ₹{pf_ecr['total_epf_remitted']} but payroll employee PF sums to ₹{sum_emp_pf}.",
                expected=f"≥{sum_emp_pf}", actual=pf_ecr["total_epf_remitted"]))
    # ESIC: contribution history wages ≥ sum of esic base
    if esic_hist.get("total_wages") and sum_esic_base > 0:
        if esic_hist["total_wages"] + 10 < sum_esic_base:
            findings.append(_finding("XD004", "ESIC", "high", "ESIC contribution history wages less than payroll",
                f"ESIC contribution history reports total wages ₹{esic_hist['total_wages']} but payroll ESIC base sums to ₹{sum_esic_base}.",
                expected=f"≥{sum_esic_base}", actual=esic_hist["total_wages"]))
    # ESIC Paid amount vs employee contribution + employer contribution
    if esic_paid.get("amount_paid"):
        expected_total = round(sum_esic_emp + sum_esic_base * EMPLOYER_ESIC_PCT / 100)
        if esic_paid["amount_paid"] + 10 < expected_total:
            findings.append(_finding("XD005", "ESIC", "medium", "ESIC paid less than expected",
                f"Paid ₹{esic_paid['amount_paid']}; expected ≥ ₹{expected_total} (0.75% emp + 3.25% er).",
                expected=expected_total, actual=esic_paid["amount_paid"]))
    # PT paid amount vs sum
    if pt_paid.get("amount_paid"):
        if pt_paid["amount_paid"] + 5 < sum_pt:
            findings.append(_finding("XD006", "PT_MH", "medium", "PT paid less than payroll deductions",
                f"PT paid challan ₹{pt_paid['amount_paid']}; payroll PT sums to ₹{sum_pt}.",
                expected=f"≥{sum_pt}", actual=pt_paid["amount_paid"]))
    return findings


# ── Orchestrator ──
def run_full_audit(rows: List[Dict[str, Any]], parsed_docs: Dict[str, Dict[str, Any]],
                   wage_month: str) -> Dict[str, Any]:
    per_employee: List[Dict[str, Any]] = []
    all_findings: List[Dict[str, Any]] = []
    for row in rows:
        f = []
        f += audit_pf_employee(row)
        f += audit_esic_employee(row)
        f += audit_pt_mh_employee(row)
        f += audit_mlwf_employee(row)
        f += audit_min_wages_employee(row)
        f += audit_structure_employee(row)
        per_employee.append({
            "employee_code": row.get("EMPLOYEE CODE"),
            "name": row.get("NAME OF EMPLOYEE (AS ON AADHAAR)"),
            "findings": f,
            "finding_count": len(f),
        })
        all_findings += f
    # Cross-document
    xfindings = audit_cross_document(rows, parsed_docs)
    # Payment-date
    pf_paid_date = (parsed_docs.get("pf_paid_challan") or {}).get("summary", {}).get("payment_date", "")
    pt_paid_date = (parsed_docs.get("pt_paid_challan") or {}).get("summary", {}).get("payment_date", "")
    date_findings = audit_payment_date(wage_month, pf_paid_date, pt_paid_date)
    summary_findings = xfindings + date_findings
    all_findings += summary_findings

    # Severity counts
    sev_count = {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
    for f in all_findings:
        sev_count[f["severity"]] = sev_count.get(f["severity"], 0) + 1

    return {
        "per_employee": per_employee,
        "summary_findings": summary_findings,
        "totals": {
            "employees_audited": len(rows),
            "employees_with_findings": sum(1 for e in per_employee if e["finding_count"] > 0),
            "total_findings": len(all_findings),
            "by_severity": sev_count,
        },
    }
