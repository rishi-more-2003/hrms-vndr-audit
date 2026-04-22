"""Vendor Audit data models + constants."""
from pydantic import BaseModel, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime

# All vendor data collection sheet columns, kept in order for template export + parse.
VENDOR_SHEET_COLUMNS = [
    "SR.NO", "WAGE MONTH", "EMPLOYEE CODE", "NAME OF EMPLOYEE (AS ON AADHAAR)", "MIDDLE NAME",
    "DATE OF BIRTH (AS ON AADHAAR)", "GENDER", "MARITAL STATUS",
    "MOBILE NUMBER (AADHAAR LINKED)", "ALTERNATE MOBILE NUMBER", "EMAIL ID",
    "PRESENT ADDRESS", "PARMANENT ADDRESS", "DESIGNATION", "DEPARTMENT", "CATEGORY",
    "AADHAAR CARD NUMBER (OPTIONAL)", "PAN CARD NUMBER (OPTIONAL)",
    "BANK ACCOUNT NUMBER", "BANK IFSC CODE",
    "MLWF APPLICABLE", "MLWF LIN NUMBER", "ESIC APPLICABLE", "ESIC IP NUMBER",
    "PF APPLICABLE", "PF PENSION APPLICABLE", "UAN NUMBER", "PF ACCOUNT NUMBER",
    "DATE OF JOINING", "EMPLOYEE TYPE", "SALARY TYPE", "STATE", "CITY", "LOCATION",
    # daily attendance 20th..19th (rolling wage cycle) + OT
    "20th", "20th OT", "21st", "21st OT", "22nd", "22nd OT", "23rd", "23rd OT",
    "24th", "24th OT", "25th", "25th OT", "26th", "26th OT", "27th", "27th OT",
    "28th", "28th OT", "29th", "29th OT", "30th", "30th OT", "31st", "31st OT",
    "1st", "1st OT", "2nd", "2nd OT", "3rd", "3rd OT", "4th", "4th OT",
    "5th", "5th OT", "6th", "6th OT", "7th", "7th OT", "8th", "8th OT",
    "9th", "9th OT", "10th", "10th OT", "11th", "11th OT", "12th", "12th OT",
    "13th", "13th OT", "14th", "14th OT", "15th", "15th OT", "16th", "16th OT",
    "17th", "17th OT", "18th", "18th OT", "19th", "19th OT",
    "TOTAL DAYS", "PRESENT DAYS (P)", "WEEK OFFS (WO)", "ABSENT DAYS (AB)",
    "PAID LEAVES (PL)", "CASUAL LEAVES (CL)", "SICK LEAVES (SL)",
    "FESTIVAL HOLIDAY (FH)", "NATIONAL HOLIDAY (NH)", "STATE HOLIDAY (SH)",
    "NOT JOINED / AFTER EXIT DAY (-)", "OVER TIME HOURS", "PAID DAYS", "LOSS OF PAY DAYS",
    # Leave balances
    "OP BAL PAID LEAVES EARNED", "PAID LEAVES AVAILED", "CL BAL OF PAID LEAVES",
    "OP BAL CASUAL LEAVES EARNED", "CASUAL LEAVES AVAILED", "CL BAL OF CASUAL LEAVES",
    "OP BAL SICK LEAVES EARNED", "SICK LEAVES AVAILED", "CL BAL OF SICK LEAVES",
    # Rate components (full-month)
    "RATE BASIC", "RATE DA", "RATE HRA", "RATE CCA", "RATE SPECIAL ALLO", "RATE CONVY",
    "RATE TRAVEL ALLO", "RATE WASHING ALLO", "RATE MEDICAL ALLO", "RATE EDUCATION ALLO",
    "RATE FOOD ALLO", "RATE LEAVE TRAVEL ALLO", "RATE OTH ALLO",
    "GROSS RATE", "OT RATE",
    # Earned components (this cycle)
    "EARNED BASIC", "EARNED DA", "EARNED HRA", "EARNED CCA", "EARNED SPECIAL ALLO", "EARNED CONVY",
    "EARNED TRAVEL ALLO", "EARNED WASHING ALLO", "EARNED MEDICAL ALLO", "EARNED EDUCATION ALLO",
    "EARNED FOOD ALLO", "EARNED LEAVE TRAVEL ALLO", "EARNED OTH ALLO",
    "INCENTIVE", "COMMISSION", "REIMBURSEMENT", "BONUS",
    "GROSS EARNED", "OT EARNED", "FINAL GROSS EARNED",
    "INCLUSION AMT", "EXCLUSION AMT",
    "PF BASE", "EPS BASE", "EDLI BASE", "ESIC BASE",
    "PF VPF", "ESIC", "PT", "LWF", "ADVANCE", "LOAN", "TDS RECOVERY",
    "HEALTH INSURANCE", "FOOD COUPON", "TOTAL DEDUCTION", "NET SALARY",
    "EMP PF", "EMR PF", "PF PENSION",
    "EMP CONTRI ESI", "EMR CONTRI ESI",
    "EMP CONTRI LWF", "EMR CONTRI LWF",
    "REMARKS",
]

SHEET_INSTRUCTIONS = [
    "Fill wage month in MMM-YYYY format (e.g., JAN-2026). Salary cycle = 20th of prev month -> 19th of this month.",
    "Gender: MALE / FEMALE / OTHER. Marital Status: MARRIED / UNMARRIED / DIVORCED / WIDOWED.",
    "MLWF/ESIC/PF/PF PENSION APPLICABLE: YES / NO only.",
    "Daily attendance codes: P=Present, WO=Week-off, AB=Absent, PL=Paid Leave, CL=Casual Leave, SL=Sick Leave, FH=Festival Holiday, NH=National Holiday, SH=State Holiday, (-) = Not joined / after exit.",
    "PF BASE <= INCLUSION AMT and <= 15000. EPS/EDLI BASE capped at 15000 if INCLUSION > 15000.",
    "ESIC BASE = FINAL GROSS EARNED if ESIC APPLICABLE = YES and FINAL GROSS <= 21000.",
    "PF = 12% of PF BASE. ESIC = 0.75% of ESIC BASE (employee). PF PENSION = 8.33% of EPS BASE.",
    "HRA: min 5% of INCLUSION AMT; max 50% for Mumbai/Kolkata/Delhi/Chennai/Hyderabad/Pune/Ahmedabad/Bengaluru else 40%.",
    "PT Maharashtra MALE: <=7500 -> 0; 7501-10000 -> 175 (Mar-Jan) + 300 (Feb); >10000 -> 200 (Mar-Jan) + 300 (Feb).",
    "PT Maharashtra FEMALE: <=25000 -> 0; >25000 -> 200 (Mar-Jan) + 300 (Feb).",
    "MLWF: Rs 25/- deducted ONLY in June & December wage months if MLWF APPLICABLE = YES.",
]

CENTRAL_LAWS = ["PF", "ESIC", "MINIMUM_WAGES", "PAYMENT_OF_WAGES"]
STATE_LAWS = {"MAHARASHTRA": ["PT_MH", "MLWF"]}

PDF_DOC_TYPES = [
    ("pf_ecr", "PF ECR (Form 5A / Return)"),
    ("pf_challan", "PF Challan"),
    ("pf_paid_challan", "PF Paid Challan"),
    ("esic_contribution_history", "ESIC Contribution History"),
    ("esic_paid_challan", "ESIC Paid Challan"),
    ("pt_paid_challan", "Professional Tax Paid Challan"),
    ("pt_return", "Professional Tax Return"),
]


# ── Pydantic request/response models ──
class ContractorCreate(BaseModel):
    name: str
    legal_name: Optional[str] = None
    establishment_code: Optional[str] = None
    establishment_id: Optional[str] = None
    lin: Optional[str] = None
    pf_code: Optional[str] = None
    esic_code: Optional[str] = None
    pt_registration_no: Optional[str] = None
    mlwf_lin: Optional[str] = None
    gst_no: Optional[str] = None
    pan: Optional[str] = None
    address: Optional[str] = None
    state: Optional[str] = None
    contact_person: Optional[str] = None
    contact_email: EmailStr
    contact_phone: Optional[str] = None
    contribution_rate_pct: Optional[float] = None
    exemption_status: Optional[str] = None
    scope_of_work: Optional[str] = None


class ContractorUpdate(BaseModel):
    name: Optional[str] = None
    legal_name: Optional[str] = None
    establishment_code: Optional[str] = None
    establishment_id: Optional[str] = None
    lin: Optional[str] = None
    pf_code: Optional[str] = None
    esic_code: Optional[str] = None
    pt_registration_no: Optional[str] = None
    mlwf_lin: Optional[str] = None
    gst_no: Optional[str] = None
    pan: Optional[str] = None
    address: Optional[str] = None
    state: Optional[str] = None
    contact_person: Optional[str] = None
    contact_email: Optional[EmailStr] = None
    contact_phone: Optional[str] = None
    contribution_rate_pct: Optional[float] = None
    exemption_status: Optional[str] = None
    scope_of_work: Optional[str] = None
    status: Optional[str] = None


class AuditStartRequest(BaseModel):
    wage_month: str  # format: "JAN-2026"
    state: str = "MAHARASHTRA"


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
