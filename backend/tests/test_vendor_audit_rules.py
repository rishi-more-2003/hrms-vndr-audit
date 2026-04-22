"""Vendor Audit rule engine tests — employee-level checks."""
import sys, os, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from vendor_audit.rules import (
    audit_pf_employee, audit_esic_employee, audit_pt_mh_employee,
    audit_mlwf_employee, audit_min_wages_employee, audit_structure_employee,
    audit_payment_date, run_full_audit,
)


def base_row(**overrides):
    row = {
        "EMPLOYEE CODE": "E001", "NAME OF EMPLOYEE (AS ON AADHAAR)": "Test",
        "WAGE MONTH": "JAN-2026", "GENDER": "MALE", "STATE": "MAHARASHTRA", "CITY": "MUMBAI",
        "PF APPLICABLE": "YES", "PF PENSION APPLICABLE": "YES", "ESIC APPLICABLE": "YES",
        "MLWF APPLICABLE": "YES",
        "UAN NUMBER": "123456789012", "ESIC IP NUMBER": "1234567890",
        "INCLUSION AMT": 15000, "PF BASE": 15000, "EPS BASE": 15000, "EDLI BASE": 15000,
        "FINAL GROSS EARNED": 18000, "ESIC BASE": 18000,
        "EMP PF": 1800, "EMR PF": 550, "PF PENSION": 1250, "ESIC": 135, "PT": 200, "LWF": 0,
        "RATE BASIC": 10000, "EARNED BASIC": 10000, "RATE HRA": 5000,
        "GROSS RATE": 20000, "TOTAL DEDUCTION": 2135, "NET SALARY": 15865,
    }
    row.update(overrides); return row


# ── PF ──
def test_pf_happy():
    assert audit_pf_employee(base_row()) == []

def test_pf_missing_uan():
    f = audit_pf_employee(base_row(**{"UAN NUMBER": ""}))
    assert any(x["rule_code"] == "PF002" for x in f)

def test_pf_bad_uan_format():
    f = audit_pf_employee(base_row(**{"UAN NUMBER": "ABC123"}))
    assert any(x["rule_code"] == "PF003" for x in f)

def test_pf_contribution_mismatch():
    f = audit_pf_employee(base_row(**{"EMP PF": 1500}))
    assert any(x["rule_code"] == "PF007" for x in f)

def test_pf_base_exceeds_cap():
    f = audit_pf_employee(base_row(**{"INCLUSION AMT": 25000, "PF BASE": 25000}))
    assert any(x["rule_code"] == "PF004" for x in f)

def test_pf_deducted_when_not_applicable():
    f = audit_pf_employee(base_row(**{"PF APPLICABLE": "NO", "EMP PF": 500}))
    assert any(x["rule_code"] == "PF001" for x in f)


# ── ESIC ──
def test_esic_above_threshold():
    f = audit_esic_employee(base_row(**{"FINAL GROSS EARNED": 25000, "ESIC BASE": 25000, "ESIC": 188}))
    assert any(x["rule_code"] == "ES001" for x in f)

def test_esic_missing_ip():
    f = audit_esic_employee(base_row(**{"ESIC IP NUMBER": ""}))
    assert any(x["rule_code"] == "ES003" for x in f)

def test_esic_contribution_mismatch():
    f = audit_esic_employee(base_row(**{"ESIC": 50}))  # should be ~135
    assert any(x["rule_code"] == "ES005" for x in f)

def test_esic_eligible_not_covered():
    f = audit_esic_employee(base_row(**{"ESIC APPLICABLE": "NO", "FINAL GROSS EARNED": 18000, "ESIC": 0, "ESIC BASE": 0}))
    assert any(x["rule_code"] == "ES002" for x in f)


# ── PT MH ──
def test_pt_mh_male_above_10k_non_feb():
    assert audit_pt_mh_employee(base_row(**{"FINAL GROSS EARNED": 15000, "PT": 200})) == []

def test_pt_mh_male_above_10k_feb():
    f = audit_pt_mh_employee(base_row(**{"WAGE MONTH": "FEB-2026", "FINAL GROSS EARNED": 15000, "PT": 200}))
    assert any(x["rule_code"] == "PT001" for x in f)  # should be 300 in Feb

def test_pt_mh_male_7500():
    assert audit_pt_mh_employee(base_row(**{"FINAL GROSS EARNED": 7000, "PT": 0})) == []

def test_pt_mh_female_25k():
    assert audit_pt_mh_employee(base_row(**{"GENDER": "FEMALE", "FINAL GROSS EARNED": 25000, "PT": 0})) == []

def test_pt_mh_female_above_25k():
    f = audit_pt_mh_employee(base_row(**{"GENDER": "FEMALE", "FINAL GROSS EARNED": 30000, "PT": 0}))
    assert any(x["rule_code"] == "PT001" for x in f)


# ── MLWF ──
def test_mlwf_non_applicable_month():
    assert audit_mlwf_employee(base_row(**{"WAGE MONTH": "JAN-2026", "LWF": 0})) == []

def test_mlwf_wrong_amount_june():
    f = audit_mlwf_employee(base_row(**{"WAGE MONTH": "JUN-2026", "LWF": 50}))
    assert any(x["rule_code"] == "LW002" for x in f)

def test_mlwf_deducted_non_month():
    f = audit_mlwf_employee(base_row(**{"WAGE MONTH": "MAR-2026", "LWF": 25}))
    assert any(x["rule_code"] == "LW001" for x in f)

def test_mlwf_not_applicable_but_deducted():
    f = audit_mlwf_employee(base_row(**{"WAGE MONTH": "DEC-2026", "MLWF APPLICABLE": "NO", "LWF": 25}))
    assert any(x["rule_code"] == "LW003" for x in f)


# ── Minimum Wages ──
def test_min_wages_below():
    f = audit_min_wages_employee(base_row(**{"GROSS RATE": 10000}))
    assert any(x["rule_code"] == "MW001" for x in f)

def test_min_wages_ok():
    assert audit_min_wages_employee(base_row(**{"GROSS RATE": 15000})) == []


# ── Structure ──
def test_structure_hra_above_metro_max():
    f = audit_structure_employee(base_row(**{"INCLUSION AMT": 10000, "RATE HRA": 6000, "CITY": "MUMBAI"}))
    assert any(x["rule_code"] == "ST002" for x in f)

def test_structure_hra_above_non_metro_max():
    f = audit_structure_employee(base_row(**{"INCLUSION AMT": 10000, "RATE HRA": 5000, "CITY": "NAGPUR"}))
    assert any(x["rule_code"] == "ST002" for x in f)  # 5000 > 40% of 10k

def test_structure_net_mismatch():
    f = audit_structure_employee(base_row(**{"FINAL GROSS EARNED": 20000, "TOTAL DEDUCTION": 3000, "NET SALARY": 10000}))
    assert any(x["rule_code"] == "ST004" for x in f)


# ── Payment date ──
def test_payment_date_pf_late():
    f = audit_payment_date("JAN-2026", "20/02/2026", "20/02/2026")
    assert any(x["rule_code"] == "PW001" for x in f)

def test_payment_date_pf_on_time():
    f = audit_payment_date("JAN-2026", "14/02/2026", "20/02/2026")
    assert not any(x["rule_code"] == "PW001" for x in f)


# ── Orchestrator ──
def test_run_full_audit():
    rows = [base_row(), base_row(**{"EMPLOYEE CODE": "E002", "EMP PF": 1000})]  # second row wrong PF
    result = run_full_audit(rows, {}, "JAN-2026")
    assert result["totals"]["employees_audited"] == 2
    assert result["totals"]["employees_with_findings"] >= 1
    assert len(result["per_employee"]) == 2
