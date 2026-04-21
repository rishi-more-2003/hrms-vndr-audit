"""Default Salary Component Kit — opinionated starter pack showcasing Phase 8B features.
Call POST /api/salary-components/seed-defaults to populate these for a new organization.
"""
import uuid
from datetime import datetime, timezone


def _now():
    return datetime.now(timezone.utc).isoformat()


def _c(code, name, component_type, **kwargs):
    base = {
        "id": str(uuid.uuid4()), "code": code, "name": name,
        "component_type": component_type, "category": "standard",
        "classification": "inclusion_wages",
        "calc_type": "fixed_amount", "default_value": 0, "default_percentage": 0,
        "is_fixed": True, "is_variable": False, "allow_direct_entry": False,
        "attendance_dependent": True,
        "attracts_pf": False, "attracts_esic": False, "attracts_pt": False,
        "attracts_lwf": False, "attracts_ot": False, "attracts_tds": False,
        "attracts_bonus": False,
        "calc_basis_mode": "earned", "applicability_basis_mode": "rate",
        "has_slabs": False, "slabs": [],
        "created_at": _now(),
    }
    base.update(kwargs)
    return base


def default_component_kit():
    """Return the full list of default components demonstrating Phase 8B capabilities."""
    return [
        # ══════════════ EARNINGS ══════════════
        _c("BASIC", "Basic Salary", "earning", group="Salary",
           calc_type="fixed_amount", default_value=20000,
           attracts_pf=True, attracts_esic=True, attracts_pt=True, attracts_lwf=True,
           attracts_ot=True, attracts_tds=True, attracts_bonus=True,
           classification="inclusion_wages",
           description="Basic wage — foundation for all statutory calculations"),

        _c("DA", "Dearness Allowance", "earning", group="Salary",
           calc_type="percentage_of_basic", default_percentage=10,
           attracts_pf=True, attracts_esic=True, attracts_pt=True, attracts_tds=True,
           attracts_bonus=True, classification="inclusion_wages",
           description="DA — clubbed with Basic for PF & Bonus"),

        _c("HRA", "House Rent Allowance", "earning", group="Allowances",
           calc_type="percentage_of_basic", default_percentage=40,
           attracts_esic=True, attracts_tds=True,
           classification="inclusion_wages",
           description="HRA — % of Basic, tax-exemption applies under Sec 10(13A)"),

        _c("CONV", "Conveyance Allowance", "earning", group="Allowances",
           calc_type="fixed_amount", default_value=1600,
           attracts_esic=True, attracts_tds=True,
           classification="inclusion_wages"),

        _c("SPECIAL", "Special Allowance", "earning", group="Allowances",
           calc_type="fixed_amount", default_value=5000, is_variable=True,
           attracts_esic=True, attracts_tds=True,
           classification="inclusion_wages",
           description="Residual component to balance CTC"),

        _c("MEDICAL", "Medical Reimbursement", "earning", group="Reimbursements",
           calc_type="fixed_amount", default_value=1250, attendance_dependent=False,
           classification="exclusion",
           description="Medical reimbursement — not attendance-dependent"),

        # ── Overtime Group (3 variants showing OT component pattern) ──
        _c("OT_15", "Overtime @ 1.5x", "earning", group="Overtime",
           calc_type="fixed_amount", default_value=0, is_variable=True,
           attendance_dependent=False,
           classification="inclusion_wages",
           ot_config={"enabled": True, "rate_type": "calculative", "factor": "one_half",
                      "calc_basis": "actual_days", "hours_per_day": 8},
           description="Weekday OT — 1.5x calculated on (Basic+DA)/actual_days/8"),

        _c("OT_2X", "Overtime @ 2x", "earning", group="Overtime",
           calc_type="fixed_amount", default_value=0, is_variable=True,
           attendance_dependent=False,
           classification="inclusion_wages",
           ot_config={"enabled": True, "rate_type": "calculative", "factor": "double",
                      "calc_basis": "actual_days", "hours_per_day": 8},
           description="Weekly-off / holiday OT — 2x"),

        _c("OT_3X", "Overtime @ 3x", "earning", group="Overtime",
           calc_type="fixed_amount", default_value=0, is_variable=True,
           attendance_dependent=False,
           classification="inclusion_wages",
           ot_config={"enabled": True, "rate_type": "calculative", "factor": "triple",
                      "calc_basis": "actual_days", "hours_per_day": 8},
           description="National holiday OT — 3x (some states mandate this)"),

        # ── Bonus Group ──
        _c("BONUS_STAT", "Statutory Bonus", "earning", group="Bonus",
           calc_type="fixed_amount", default_value=0, is_variable=True,
           attendance_dependent=False, classification="others",
           description="Payment of Bonus Act 1965 — 8.33%-20% of bonus-attracting wages"),

        _c("BONUS_PERF", "Performance Bonus", "earning", group="Bonus",
           calc_type="fixed_amount", default_value=0, is_variable=True,
           attendance_dependent=False,
           attracts_tds=True, classification="others",
           description="Non-statutory performance incentive"),

        _c("BONUS_FEST", "Festival Bonus", "earning", group="Bonus",
           calc_type="fixed_amount", default_value=0, is_variable=True,
           attendance_dependent=False,
           attracts_tds=True, classification="others"),

        # ══════════════ DEDUCTIONS ══════════════
        _c("PF_EMP", "Provident Fund (Employee)", "deduction", group="PF",
           auto_pair_key="pf",
           calc_type="percentage_of_basic", default_percentage=12,
           applicability_basis_mode="rate", calc_basis_mode="earned",
           description="EPF — 12% of min(PF-wage, ₹15,000 ceiling) on earned salary"),

        _c("ESIC_EMP", "ESIC (Employee)", "deduction", group="ESIC",
           auto_pair_key="esic",
           calc_type="percentage_of_gross", default_percentage=0.75,
           applicability={"enabled": True, "basis": "gross", "basis_mode": "rate",
                          "operator": "less_than_equal", "value_min": 21000},
           applicability_basis_mode="rate", calc_basis_mode="earned",
           description="ESIC — applies only if Rate gross ≤ ₹21,000; 0.75% of earned gross"),

        # PT Group — Maharashtra (slab-based per state)
        _c("PT_MH", "Professional Tax — Maharashtra", "deduction", group="Professional Tax",
           has_slabs=True, slab_salary_basis="gross",
           applicability_basis_mode="rate", calc_basis_mode="rate",
           slabs=[
               {"salary_from": 0, "salary_to": 7500, "fixed_amount": 0, "gender": "any"},
               {"salary_from": 7501, "salary_to": 10000, "fixed_amount": 175, "gender": "male"},
               {"salary_from": 7501, "salary_to": None, "fixed_amount": 0, "gender": "female"},
               {"salary_from": 10001, "salary_to": None, "fixed_amount": 200, "gender": "male"},
           ],
           description="Maharashtra PT — females earning ≤ ₹10k exempt; males slab-based"),

        # PT Group — Tamil Nadu (different slabs)
        _c("PT_TN", "Professional Tax — Tamil Nadu", "deduction", group="Professional Tax",
           has_slabs=True, slab_salary_basis="gross",
           applicability_basis_mode="rate", calc_basis_mode="rate",
           slabs=[
               {"salary_from": 0, "salary_to": 21000, "fixed_amount": 0},
               {"salary_from": 21001, "salary_to": 30000, "fixed_amount": 135},
               {"salary_from": 30001, "salary_to": 45000, "fixed_amount": 315},
               {"salary_from": 45001, "salary_to": 60000, "fixed_amount": 690},
               {"salary_from": 60001, "salary_to": 75000, "fixed_amount": 1025},
               {"salary_from": 75001, "salary_to": None, "fixed_amount": 1250},
           ],
           description="Tamil Nadu PT — half-yearly slabs (semi-annual charge in Apr & Oct)"),

        _c("LWF_EMP", "Labour Welfare Fund (Employee)", "deduction", group="LWF",
           auto_pair_key="lwf",
           calc_type="fixed_amount", default_value=25,
           description="Fixed state-specific contribution — customize per state"),

        _c("TDS", "Income Tax (TDS)", "deduction", group="TDS",
           calc_type="fixed_amount", default_value=0, is_variable=True,
           applicability_basis_mode="rate", calc_basis_mode="rate",
           description="Monthly TDS — auto-calculated from annual projection"),

        _c("LOAN_EMI", "Loan EMI", "deduction", group="Employee Dues",
           calc_type="fixed_amount", default_value=0, is_variable=True,
           allow_direct_entry=True, attendance_dependent=False,
           description="Linked to active Employee Loan record"),

        _c("ADVANCE_EMI", "Salary Advance EMI", "deduction", group="Employee Dues",
           calc_type="fixed_amount", default_value=0, is_variable=True,
           allow_direct_entry=True, attendance_dependent=False,
           description="Linked to active Salary Advance record"),

        # ══════════════ PROVISIONS (Employer cost) ══════════════
        # These are typically auto-created by auto-pairing but we seed presets anyway
        _c("GRATUITY_PROV", "Gratuity Provision", "provision", group="Gratuity",
           calc_type="percentage_of_basic", default_percentage=4.81,
           applicability={"enabled": False},  # Becomes active once employee crosses 5 yrs
           description="Actuarial provision — 15/26 × 1/12 ≈ 4.81% of Basic+DA"),

        _c("LEAVE_ENC_PROV", "Leave Encashment Provision", "provision", group="Leave Encashment",
           calc_type="percentage_of_basic", default_percentage=2,
           description="Monthly provision for unused leaves (customizable)"),
    ]
