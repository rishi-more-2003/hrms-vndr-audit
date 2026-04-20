from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Query, UploadFile, File
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional, Dict
from enum import Enum
import os
import logging
from pathlib import Path
import uuid
import requests
from indian_tax import calculate_full_salary, calculate_pf, calculate_esic, calculate_professional_tax, calculate_income_tax
from payroll_calc import (
    calculate_statutory_bonus, calculate_gratuity, calculate_incentive,
    calculate_advance_schedule, calculate_loan_emi,
)
from storage import init_storage, put_object, get_object

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()
SECRET_KEY = os.environ.get('SECRET_KEY', 'your-secret-key-change-in-production')
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 1440

app = FastAPI()
api_router = APIRouter(prefix="/api")

# ── Enums ──
class UserRole(str, Enum):
    ADMIN = "admin"
    EMPLOYEE = "employee"

class LeaveType(str, Enum):
    CASUAL = "casual"
    SICK = "sick"
    EARNED = "earned"
    MATERNITY = "maternity"
    PATERNITY = "paternity"
    UNPAID = "unpaid"

class LeaveStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"

class AttendanceStatus(str, Enum):
    PRESENT = "present"
    ABSENT = "absent"
    HALF_DAY = "half_day"
    LEAVE = "leave"

class ReimbursementCategory(str, Enum):
    TRAVEL = "travel"
    FOOD = "food"
    MEDICAL = "medical"
    EQUIPMENT = "equipment"
    OTHER = "other"

class ReimbursementStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    DISBURSED = "disbursed"

class ApplicationStatus(str, Enum):
    APPLIED = "applied"
    SCREENING = "screening"
    INTERVIEW = "interview"
    OFFERED = "offered"
    REJECTED = "rejected"
    HIRED = "hired"

# Default permissions for a new employee
DEFAULT_PERMISSIONS = {
    "dashboard": True,
    "attendance": True,
    "leave": True,
    "payroll": True,
    "recruitment": False,
    "performance": True,
    "reimbursements": True,
    "employee_directory": True,
    "documents": True,
    "onboarding": True,
}

# Default leave policy (annual allocation)
DEFAULT_LEAVE_POLICY = {
    "casual": 12,
    "sick": 10,
    "earned": 15,
    "maternity": 182,
    "paternity": 15,
    "unpaid": 365,
}

# Onboarding checklist template
DEFAULT_ONBOARDING_CHECKLIST = [
    {"id": "doc_aadhaar", "label": "Upload Aadhaar Card", "category": "documents"},
    {"id": "doc_pan", "label": "Upload PAN Card", "category": "documents"},
    {"id": "doc_resume", "label": "Upload Resume", "category": "documents"},
    {"id": "doc_photo", "label": "Upload Passport Photo", "category": "documents"},
    {"id": "doc_offer", "label": "Sign Offer Letter", "category": "documents"},
    {"id": "bank_details", "label": "Submit Bank Account Details", "category": "finance"},
    {"id": "emergency_contact", "label": "Add Emergency Contact", "category": "personal"},
    {"id": "it_setup", "label": "IT Equipment Setup", "category": "it"},
    {"id": "team_intro", "label": "Team Introduction Meeting", "category": "orientation"},
    {"id": "policy_ack", "label": "Acknowledge Company Policies", "category": "compliance"},
]

# ── Pydantic Models ──
class UserLogin(BaseModel):
    email: EmailStr
    password: str
    login_as: UserRole = UserRole.EMPLOYEE

class UserRegister(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: UserRole = UserRole.EMPLOYEE

class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str
    role: UserRole
    permissions: Optional[Dict[str, bool]] = None
    created_at: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

class EmployeeCreate(BaseModel):
    employee_code: str
    first_name: str
    last_name: str
    email: EmailStr
    phone: str
    date_of_birth: str
    gender: str
    address: str
    department_id: str
    designation_id: str
    date_of_joining: str
    reports_to: Optional[str] = None
    employment_type: str
    password: str = "changeme123"

class EmployeeUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    department_id: Optional[str] = None
    designation_id: Optional[str] = None
    reports_to: Optional[str] = None
    employment_type: Optional[str] = None
    status: Optional[str] = None

class EmployeeResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    user_id: str
    employee_code: str
    first_name: str
    last_name: str
    email: str
    phone: str
    date_of_birth: str
    gender: str
    address: str
    department_id: str
    designation_id: str
    date_of_joining: str
    reports_to: Optional[str] = None
    employment_type: str
    status: str
    permissions: Dict[str, bool]
    created_at: str

class PermissionsUpdate(BaseModel):
    permissions: Dict[str, bool]

class DepartmentCreate(BaseModel):
    name: str
    description: Optional[str] = None

class DepartmentResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    description: Optional[str] = None
    created_at: str

class DesignationCreate(BaseModel):
    title: str
    description: Optional[str] = None
    level: Optional[int] = 1

class DesignationResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    title: str
    description: Optional[str] = None
    level: int
    created_at: str

class LeaveRequest(BaseModel):
    leave_type: LeaveType
    start_date: str
    end_date: str
    reason: str
    total_days: float

class LeaveResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    employee_id: str
    leave_type: LeaveType
    start_date: str
    end_date: str
    reason: str
    total_days: float
    status: LeaveStatus
    approved_by: Optional[str] = None
    approved_at: Optional[str] = None
    created_at: str

class AttendanceResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    employee_id: str
    date: str
    clock_in: str
    clock_out: Optional[str] = None
    total_hours: Optional[float] = None
    status: AttendanceStatus
    notes: Optional[str] = None

class SalaryStructureCreate(BaseModel):
    employee_id: str
    basic_salary: float
    hra: float
    da: float
    other_allowances: float
    pf_deduction: float
    esi_deduction: float
    tds_deduction: float
    professional_tax: float
    effective_from: str

class SalaryStructureResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    employee_id: str
    basic_salary: float
    hra: float
    da: float
    other_allowances: float
    gross_salary: float
    pf_deduction: float
    esi_deduction: float
    tds_deduction: float
    professional_tax: float
    total_deductions: float
    net_salary: float
    effective_from: str
    created_at: str

class PayslipResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    employee_id: str
    month: str
    year: int
    salary_structure_id: str
    total_working_days: int
    days_worked: float
    gross_salary: float
    total_deductions: float
    net_salary: float
    generated_at: str

class ReimbursementCreate(BaseModel):
    category: ReimbursementCategory
    amount: float
    description: str
    receipt_url: Optional[str] = None

class ReimbursementResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    employee_id: str
    category: ReimbursementCategory
    amount: float
    description: str
    receipt_url: Optional[str] = None
    status: ReimbursementStatus
    approved_by: Optional[str] = None
    approved_at: Optional[str] = None
    created_at: str

class JobPostingCreate(BaseModel):
    title: str
    department_id: str
    description: str
    requirements: str
    experience_required: str
    salary_range: str
    location: str
    employment_type: str

class JobPostingResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    title: str
    department_id: str
    description: str
    requirements: str
    experience_required: str
    salary_range: str
    location: str
    employment_type: str
    status: str
    posted_by: str
    posted_at: str

class ApplicationCreate(BaseModel):
    job_posting_id: str
    candidate_name: str
    candidate_email: EmailStr
    candidate_phone: str
    resume_url: Optional[str] = None
    cover_letter: Optional[str] = None
    experience_years: float

class ApplicationResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    job_posting_id: str
    candidate_name: str
    candidate_email: str
    candidate_phone: str
    resume_url: Optional[str] = None
    cover_letter: Optional[str] = None
    experience_years: float
    status: ApplicationStatus
    applied_at: str

class PerformanceGoalCreate(BaseModel):
    employee_id: str
    title: str
    description: str
    target_date: str
    weightage: int

class PerformanceGoalResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    employee_id: str
    title: str
    description: str
    target_date: str
    weightage: int
    status: str
    created_by: str
    created_at: str

class PerformanceReviewCreate(BaseModel):
    employee_id: str
    review_period: str
    rating: float
    comments: str
    strengths: str
    areas_of_improvement: str

class PerformanceReviewResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    employee_id: str
    review_period: str
    reviewer_id: str
    rating: float
    comments: str
    strengths: str
    areas_of_improvement: str
    created_at: str

class HierarchyNode(BaseModel):
    id: str
    employee_code: str
    first_name: str
    last_name: str
    designation: Optional[str] = None
    department: Optional[str] = None
    reports_to: Optional[str] = None
    subordinates: List[dict] = []


# ── Helpers ──
def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

def require_admin(current_user: dict):
    if current_user.get("role") != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

async def get_employee_by_user_id(user_id: str):
    return await db.employees.find_one({"user_id": user_id}, {"_id": 0})

async def get_approval_chain(employee_id: str) -> list:
    """Walk up the reports_to chain and return list of approver employee IDs."""
    chain = []
    current_id = employee_id
    visited = set()
    while current_id and current_id not in visited:
        visited.add(current_id)
        emp = await db.employees.find_one({"id": current_id}, {"_id": 0})
        if not emp or not emp.get("reports_to"):
            break
        chain.append(emp["reports_to"])
        current_id = emp["reports_to"]
    return chain

async def can_approve(approver_user_id: str, requester_employee_id: str) -> bool:
    """Check if approver is in the requester's approval chain or is admin."""
    approver_user = await db.users.find_one({"id": approver_user_id}, {"_id": 0})
    if approver_user and approver_user.get("role") == UserRole.ADMIN:
        return True
    approver_emp = await get_employee_by_user_id(approver_user_id)
    if not approver_emp:
        return False
    chain = await get_approval_chain(requester_employee_id)
    return approver_emp["id"] in chain


# ══════════════════════  AUTH  ══════════════════════
@api_router.post("/auth/register", response_model=UserResponse)
async def register(user_data: UserRegister):
    existing = await db.users.find_one({"email": user_data.email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "email": user_data.email,
        "password": hash_password(user_data.password),
        "full_name": user_data.full_name,
        "role": user_data.role,
        "permissions": DEFAULT_PERMISSIONS if user_data.role == UserRole.EMPLOYEE else None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user_doc)
    return UserResponse(
        id=user_doc["id"], email=user_doc["email"], full_name=user_doc["full_name"],
        role=user_doc["role"], permissions=user_doc["permissions"], created_at=user_doc["created_at"]
    )

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email}, {"_id": 0})
    if not user or not verify_password(credentials.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    # Enforce login_as role check
    if credentials.login_as == UserRole.ADMIN and user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="You are not authorized as admin")
    if credentials.login_as == UserRole.EMPLOYEE and user["role"] == UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin must login via Admin panel")

    token = create_access_token({"sub": user["id"], "role": user["role"]})
    # Fetch employee permissions if employee
    permissions = user.get("permissions", DEFAULT_PERMISSIONS)
    if user["role"] == UserRole.EMPLOYEE:
        emp = await get_employee_by_user_id(user["id"])
        if emp:
            permissions = emp.get("permissions", DEFAULT_PERMISSIONS)
    return TokenResponse(
        access_token=token, token_type="bearer",
        user=UserResponse(
            id=user["id"], email=user["email"], full_name=user["full_name"],
            role=user["role"], permissions=permissions, created_at=user["created_at"]
        )
    )

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    permissions = current_user.get("permissions", DEFAULT_PERMISSIONS)
    if current_user["role"] == UserRole.EMPLOYEE:
        emp = await get_employee_by_user_id(current_user["id"])
        if emp:
            permissions = emp.get("permissions", DEFAULT_PERMISSIONS)
    return UserResponse(
        id=current_user["id"], email=current_user["email"],
        full_name=current_user["full_name"], role=current_user["role"],
        permissions=permissions, created_at=current_user["created_at"]
    )


# ══════════════════════  EMPLOYEES  ══════════════════════
@api_router.post("/employees", response_model=EmployeeResponse)
async def create_employee(employee: EmployeeCreate, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    # Create a user account for the employee
    existing = await db.users.find_one({"email": employee.email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "email": employee.email,
        "password": hash_password(employee.password),
        "full_name": f"{employee.first_name} {employee.last_name}",
        "role": UserRole.EMPLOYEE,
        "permissions": DEFAULT_PERMISSIONS,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user_doc)

    emp_id = str(uuid.uuid4())
    emp_doc = {
        "id": emp_id,
        "user_id": user_id,
        "employee_code": employee.employee_code,
        "first_name": employee.first_name,
        "last_name": employee.last_name,
        "email": employee.email,
        "phone": employee.phone,
        "date_of_birth": employee.date_of_birth,
        "gender": employee.gender,
        "address": employee.address,
        "department_id": employee.department_id,
        "designation_id": employee.designation_id,
        "date_of_joining": employee.date_of_joining,
        "reports_to": employee.reports_to,
        "employment_type": employee.employment_type,
        "status": "active",
        "permissions": DEFAULT_PERMISSIONS,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.employees.insert_one(emp_doc)
    return EmployeeResponse(**emp_doc)

@api_router.get("/employees", response_model=List[EmployeeResponse])
async def get_employees(current_user: dict = Depends(get_current_user)):
    employees = await db.employees.find({}, {"_id": 0}).to_list(1000)
    for emp in employees:
        if "permissions" not in emp:
            emp["permissions"] = DEFAULT_PERMISSIONS
    return [EmployeeResponse(**emp) for emp in employees]

@api_router.get("/employees/{employee_id}", response_model=EmployeeResponse)
async def get_employee(employee_id: str, current_user: dict = Depends(get_current_user)):
    employee = await db.employees.find_one({"id": employee_id}, {"_id": 0})
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    if "permissions" not in employee:
        employee["permissions"] = DEFAULT_PERMISSIONS
    return EmployeeResponse(**employee)

@api_router.put("/employees/{employee_id}")
async def update_employee(employee_id: str, update: EmployeeUpdate, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    existing = await db.employees.find_one({"id": employee_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Employee not found")
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if update_data:
        await db.employees.update_one({"id": employee_id}, {"$set": update_data})
    updated = await db.employees.find_one({"id": employee_id}, {"_id": 0})
    if "permissions" not in updated:
        updated["permissions"] = DEFAULT_PERMISSIONS
    return EmployeeResponse(**updated)

@api_router.put("/employees/{employee_id}/permissions")
async def update_employee_permissions(employee_id: str, body: PermissionsUpdate, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    existing = await db.employees.find_one({"id": employee_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Employee not found")
    await db.employees.update_one({"id": employee_id}, {"$set": {"permissions": body.permissions}})
    return {"message": "Permissions updated successfully"}

@api_router.put("/employees/{employee_id}/reports-to")
async def update_reports_to(employee_id: str, reports_to: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    existing = await db.employees.find_one({"id": employee_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Employee not found")
    # Prevent circular reference
    if reports_to == employee_id:
        raise HTTPException(status_code=400, detail="Employee cannot report to themselves")
    await db.employees.update_one({"id": employee_id}, {"$set": {"reports_to": reports_to}})
    return {"message": "Reporting structure updated"}


# ══════════════════════  HIERARCHY  ══════════════════════
@api_router.get("/hierarchy")
async def get_hierarchy(current_user: dict = Depends(get_current_user)):
    employees = await db.employees.find({"status": "active"}, {"_id": 0}).to_list(1000)
    departments = {d["id"]: d["name"] for d in await db.departments.find({}, {"_id": 0}).to_list(1000)}
    designations = {d["id"]: d["title"] for d in await db.designations.find({}, {"_id": 0}).to_list(1000)}

    emp_map = {}
    for emp in employees:
        emp_map[emp["id"]] = {
            "id": emp["id"],
            "employee_code": emp["employee_code"],
            "first_name": emp["first_name"],
            "last_name": emp["last_name"],
            "designation": designations.get(emp.get("designation_id"), ""),
            "department": departments.get(emp.get("department_id"), ""),
            "reports_to": emp.get("reports_to"),
            "subordinates": []
        }

    roots = []
    for emp_id, node in emp_map.items():
        parent_id = node["reports_to"]
        if parent_id and parent_id in emp_map:
            emp_map[parent_id]["subordinates"].append(node)
        else:
            roots.append(node)

    return roots


# ══════════════════════  DEPARTMENTS  ══════════════════════
@api_router.post("/departments", response_model=DepartmentResponse)
async def create_department(dept: DepartmentCreate, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    dept_id = str(uuid.uuid4())
    dept_doc = dept.model_dump()
    dept_doc["id"] = dept_id
    dept_doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.departments.insert_one(dept_doc)
    return DepartmentResponse(**dept_doc)

@api_router.get("/departments", response_model=List[DepartmentResponse])
async def get_departments(current_user: dict = Depends(get_current_user)):
    departments = await db.departments.find({}, {"_id": 0}).to_list(1000)
    return [DepartmentResponse(**dept) for dept in departments]

@api_router.post("/designations", response_model=DesignationResponse)
async def create_designation(desig: DesignationCreate, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    desig_id = str(uuid.uuid4())
    desig_doc = desig.model_dump()
    desig_doc["id"] = desig_id
    desig_doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.designations.insert_one(desig_doc)
    return DesignationResponse(**desig_doc)

@api_router.get("/designations", response_model=List[DesignationResponse])
async def get_designations(current_user: dict = Depends(get_current_user)):
    designations = await db.designations.find({}, {"_id": 0}).to_list(1000)
    return [DesignationResponse(**desig) for desig in designations]


# ══════════════════════  ATTENDANCE (ENHANCED)  ══════════════════════
COLLECTION_METHODS = ["self_clockin", "admin_entry", "employee_month_end", "manager_month_end",
                      "biometric_fingerprint", "biometric_face", "geo_tagged", "card_tap", "manual_time_select"]
ENTRY_STATUSES = ["active", "pending_approval", "approved", "rejected"]

@api_router.post("/attendance/clock-in")
async def clock_in(method: str = "self_clockin", current_user: dict = Depends(get_current_user)):
    emp = await get_employee_by_user_id(current_user["id"])
    if not emp:
        raise HTTPException(status_code=400, detail="Employee profile not found")
    today = datetime.now(timezone.utc).date().isoformat()
    existing = await db.attendance.find_one({"employee_id": emp["id"], "date": today, "is_active": True}, {"_id": 0})
    if existing and existing.get("clock_in") and not existing.get("clock_out"):
        raise HTTPException(status_code=400, detail="Already clocked in today")
    att_id = str(uuid.uuid4())
    att_doc = {
        "id": att_id, "employee_id": emp["id"], "date": today,
        "clock_in": datetime.now(timezone.utc).isoformat(),
        "clock_out": None, "total_hours": None,
        "status": AttendanceStatus.PRESENT, "notes": None,
        "collection_method": method, "entry_status": "active",
        "entered_by": current_user["id"], "is_active": True,
        "approval_status": None, "approved_by": None
    }
    await db.attendance.insert_one(att_doc)
    return {"message": "Clocked in successfully", "attendance": {k: v for k, v in att_doc.items() if k != "_id"}}

@api_router.post("/attendance/clock-out")
async def clock_out(method: str = "self_clockin", current_user: dict = Depends(get_current_user)):
    emp = await get_employee_by_user_id(current_user["id"])
    if not emp:
        raise HTTPException(status_code=400, detail="Employee profile not found")
    today = datetime.now(timezone.utc).date().isoformat()
    existing = await db.attendance.find_one({"employee_id": emp["id"], "date": today, "is_active": True}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=400, detail="No clock-in record found")
    if existing.get("clock_out"):
        raise HTTPException(status_code=400, detail="Already clocked out")
    clock_out_time = datetime.now(timezone.utc)
    clock_in_time = datetime.fromisoformat(existing["clock_in"])
    total_hours = (clock_out_time - clock_in_time).total_seconds() / 3600
    await db.attendance.update_one(
        {"id": existing["id"]},
        {"$set": {"clock_out": clock_out_time.isoformat(), "total_hours": round(total_hours, 2),
                  "collection_method_out": method}}
    )
    return {"message": "Clocked out successfully", "total_hours": round(total_hours, 2)}

# Manual time entry (employee selects date + times, pending approval)
@api_router.post("/attendance/manual-entry")
async def manual_attendance_entry(data: dict, current_user: dict = Depends(get_current_user)):
    emp = await get_employee_by_user_id(current_user["id"])
    if not emp:
        raise HTTPException(status_code=400, detail="Employee profile not found")
    date = data.get("date")
    clock_in_time = data.get("clock_in")
    clock_out_time = data.get("clock_out")
    reason = data.get("reason", "")
    if not date or not clock_in_time:
        raise HTTPException(status_code=400, detail="Date and clock-in time required")
    total_hours = None
    if clock_in_time and clock_out_time:
        try:
            ci = datetime.fromisoformat(clock_in_time)
            co = datetime.fromisoformat(clock_out_time)
            total_hours = round((co - ci).total_seconds() / 3600, 2)
        except Exception:
            pass
    att_id = str(uuid.uuid4())
    needs_approval = data.get("needs_approval", True)
    att_doc = {
        "id": att_id, "employee_id": emp["id"], "date": date,
        "clock_in": clock_in_time, "clock_out": clock_out_time,
        "total_hours": total_hours, "status": AttendanceStatus.PRESENT,
        "notes": reason, "collection_method": "manual_time_select",
        "entry_status": "pending_approval" if needs_approval else "active",
        "entered_by": current_user["id"], "is_active": True,
        "approval_status": "pending" if needs_approval else "approved",
        "approved_by": None
    }
    await db.attendance.insert_one(att_doc)
    return {"message": "Manual entry submitted" + (" (pending approval)" if needs_approval else ""),
            "attendance": {k: v for k, v in att_doc.items() if k != "_id"}}

# Admin/Manager entry for an employee
@api_router.post("/attendance/admin-entry")
async def admin_attendance_entry(data: dict, current_user: dict = Depends(get_current_user)):
    employee_id = data.get("employee_id")
    if not employee_id:
        raise HTTPException(status_code=400, detail="employee_id required")
    if not await can_approve(current_user["id"], employee_id):
        raise HTTPException(status_code=403, detail="Not authorized")
    date = data.get("date")
    clock_in_time = data.get("clock_in")
    clock_out_time = data.get("clock_out")
    total_hours = None
    if clock_in_time and clock_out_time:
        try:
            ci = datetime.fromisoformat(clock_in_time)
            co = datetime.fromisoformat(clock_out_time)
            total_hours = round((co - ci).total_seconds() / 3600, 2)
        except Exception:
            pass
    att_id = str(uuid.uuid4())
    att_doc = {
        "id": att_id, "employee_id": employee_id, "date": date,
        "clock_in": clock_in_time, "clock_out": clock_out_time,
        "total_hours": total_hours, "status": AttendanceStatus.PRESENT,
        "notes": data.get("reason", ""), "collection_method": "admin_entry",
        "entry_status": "active", "entered_by": current_user["id"],
        "is_active": True, "approval_status": "approved", "approved_by": current_user["id"]
    }
    await db.attendance.insert_one(att_doc)
    return {"message": "Attendance entered for employee", "attendance": {k: v for k, v in att_doc.items() if k != "_id"}}

# Bulk month-end entry
@api_router.post("/attendance/bulk-entry")
async def bulk_attendance_entry(data: dict, current_user: dict = Depends(get_current_user)):
    employee_id = data.get("employee_id")
    entries = data.get("entries", [])  # [{date, clock_in, clock_out}, ...]
    entry_by = data.get("entry_by", "employee")  # "employee" or "manager"
    needs_approval = data.get("needs_approval", True)

    if entry_by == "employee":
        emp = await get_employee_by_user_id(current_user["id"])
        if not emp:
            raise HTTPException(status_code=400, detail="Employee not found")
        employee_id = emp["id"]
    elif not await can_approve(current_user["id"], employee_id):
        raise HTTPException(status_code=403, detail="Not authorized")

    method = "employee_month_end" if entry_by == "employee" else "manager_month_end"
    count = 0
    for entry in entries:
        total_hours = None
        if entry.get("clock_in") and entry.get("clock_out"):
            try:
                ci = datetime.fromisoformat(entry["clock_in"])
                co = datetime.fromisoformat(entry["clock_out"])
                total_hours = round((co - ci).total_seconds() / 3600, 2)
            except Exception:
                pass
        att_id = str(uuid.uuid4())
        att_doc = {
            "id": att_id, "employee_id": employee_id, "date": entry.get("date"),
            "clock_in": entry.get("clock_in"), "clock_out": entry.get("clock_out"),
            "total_hours": total_hours, "status": AttendanceStatus.PRESENT,
            "notes": entry.get("notes", ""), "collection_method": method,
            "entry_status": "pending_approval" if needs_approval else "active",
            "entered_by": current_user["id"], "is_active": True,
            "approval_status": "pending" if needs_approval else "approved",
            "approved_by": None
        }
        # Upsert: replace if date exists
        existing = await db.attendance.find_one({"employee_id": employee_id, "date": entry.get("date")}, {"_id": 0})
        if existing:
            await db.attendance.update_one({"id": existing["id"]}, {"$set": att_doc})
        else:
            await db.attendance.insert_one(att_doc)
        count += 1
    return {"message": f"{count} entries submitted", "needs_approval": needs_approval}

# Missed punch correction
@api_router.post("/attendance/missed-punch")
async def missed_punch_request(data: dict, current_user: dict = Depends(get_current_user)):
    emp = await get_employee_by_user_id(current_user["id"])
    if not emp:
        raise HTTPException(status_code=400, detail="Employee not found")
    date = data.get("date")
    punch_type = data.get("punch_type", "clock_out")  # clock_in or clock_out
    punch_time = data.get("punch_time")
    reason = data.get("reason", "")
    req_id = str(uuid.uuid4())
    req_doc = {
        "id": req_id, "employee_id": emp["id"], "date": date,
        "punch_type": punch_type, "punch_time": punch_time,
        "reason": reason, "status": "pending",
        "requested_by": current_user["id"],
        "approved_by": None, "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.missed_punches.insert_one(req_doc)
    # Notify manager
    if emp.get("reports_to"):
        mgr = await db.employees.find_one({"id": emp["reports_to"]}, {"_id": 0})
        if mgr:
            await create_notification(mgr["user_id"], "Missed Punch Request",
                f"{emp['first_name']} {emp['last_name']} requested a missed {punch_type} correction for {date}", "info")
    return {"message": "Missed punch request submitted", "id": req_id}

@api_router.get("/attendance/missed-punches")
async def get_missed_punches(current_user: dict = Depends(get_current_user)):
    if current_user["role"] == UserRole.ADMIN:
        punches = await db.missed_punches.find({}, {"_id": 0}).to_list(1000)
    else:
        emp = await get_employee_by_user_id(current_user["id"])
        if not emp:
            return []
        sub_ids = [e["id"] for e in await db.employees.find({"reports_to": emp["id"]}, {"_id": 0}).to_list(1000)]
        all_ids = [emp["id"]] + sub_ids
        punches = await db.missed_punches.find({"employee_id": {"$in": all_ids}}, {"_id": 0}).to_list(1000)
    return punches

@api_router.put("/attendance/missed-punches/{req_id}/approve")
async def approve_missed_punch(req_id: str, current_user: dict = Depends(get_current_user)):
    req = await db.missed_punches.find_one({"id": req_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if not await can_approve(current_user["id"], req["employee_id"]):
        raise HTTPException(status_code=403, detail="Not authorized")
    # Apply the correction
    att = await db.attendance.find_one({"employee_id": req["employee_id"], "date": req["date"]}, {"_id": 0})
    if att:
        update_data = {req["punch_type"]: req["punch_time"]}
        if req["punch_type"] == "clock_out" and att.get("clock_in"):
            try:
                ci = datetime.fromisoformat(att["clock_in"])
                co = datetime.fromisoformat(req["punch_time"])
                update_data["total_hours"] = round((co - ci).total_seconds() / 3600, 2)
            except Exception:
                pass
        await db.attendance.update_one({"id": att["id"]}, {"$set": update_data})
    await db.missed_punches.update_one({"id": req_id}, {"$set": {"status": "approved", "approved_by": current_user["id"]}})
    # Notify employee
    emp = await db.employees.find_one({"id": req["employee_id"]}, {"_id": 0})
    if emp:
        await create_notification(emp["user_id"], "Missed Punch Approved",
            f"Your missed {req['punch_type']} for {req['date']} has been approved.", "success")
    return {"message": "Missed punch approved and applied"}

@api_router.put("/attendance/missed-punches/{req_id}/reject")
async def reject_missed_punch(req_id: str, current_user: dict = Depends(get_current_user)):
    req = await db.missed_punches.find_one({"id": req_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    await db.missed_punches.update_one({"id": req_id}, {"$set": {"status": "rejected", "approved_by": current_user["id"]}})
    return {"message": "Missed punch rejected"}

# Approve pending attendance entries
@api_router.put("/attendance/{att_id}/approve")
async def approve_attendance_entry(att_id: str, current_user: dict = Depends(get_current_user)):
    att = await db.attendance.find_one({"id": att_id}, {"_id": 0})
    if not att:
        raise HTTPException(status_code=404, detail="Attendance entry not found")
    if not await can_approve(current_user["id"], att["employee_id"]):
        raise HTTPException(status_code=403, detail="Not authorized")
    await db.attendance.update_one({"id": att_id}, {"$set": {"entry_status": "active", "approval_status": "approved", "approved_by": current_user["id"]}})
    return {"message": "Attendance entry approved"}

@api_router.put("/attendance/{att_id}/reject")
async def reject_attendance_entry(att_id: str, current_user: dict = Depends(get_current_user)):
    att = await db.attendance.find_one({"id": att_id}, {"_id": 0})
    if not att:
        raise HTTPException(status_code=404, detail="Attendance entry not found")
    await db.attendance.update_one({"id": att_id}, {"$set": {"entry_status": "rejected", "approval_status": "rejected", "approved_by": current_user["id"]}})
    return {"message": "Attendance entry rejected"}

@api_router.get("/attendance")
async def get_attendance(employee_id: Optional[str] = None, month: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    if current_user["role"] == UserRole.ADMIN:
        query = {}
        if employee_id:
            query["employee_id"] = employee_id
    else:
        emp = await get_employee_by_user_id(current_user["id"])
        query = {"employee_id": emp["id"]} if emp else {"employee_id": "none"}
    if month:
        query["date"] = {"$regex": f"^{month}"}
    attendance = await db.attendance.find(query, {"_id": 0}).sort("date", -1).to_list(1000)
    return attendance


# ══════════════════════  LEAVES  ══════════════════════
@api_router.post("/leaves", response_model=LeaveResponse)
async def apply_leave(leave: LeaveRequest, current_user: dict = Depends(get_current_user)):
    emp = await get_employee_by_user_id(current_user["id"])
    if not emp:
        raise HTTPException(status_code=400, detail="Employee profile not found")
    leave_id = str(uuid.uuid4())
    leave_doc = leave.model_dump()
    leave_doc["id"] = leave_id
    leave_doc["employee_id"] = emp["id"]
    leave_doc["status"] = LeaveStatus.PENDING
    leave_doc["approved_by"] = None
    leave_doc["approved_at"] = None
    leave_doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.leaves.insert_one(leave_doc)
    return LeaveResponse(**leave_doc)

@api_router.get("/leaves", response_model=List[LeaveResponse])
async def get_leaves(current_user: dict = Depends(get_current_user)):
    if current_user["role"] == UserRole.ADMIN:
        leaves = await db.leaves.find({}, {"_id": 0}).to_list(1000)
    else:
        emp = await get_employee_by_user_id(current_user["id"])
        if not emp:
            return []
        # Show own leaves + leaves from subordinates
        subordinate_ids = [e["id"] for e in await db.employees.find({"reports_to": emp["id"]}, {"_id": 0}).to_list(1000)]
        all_ids = [emp["id"]] + subordinate_ids
        leaves = await db.leaves.find({"employee_id": {"$in": all_ids}}, {"_id": 0}).to_list(1000)
    return [LeaveResponse(**leave) for leave in leaves]

@api_router.put("/leaves/{leave_id}/approve")
async def approve_leave(leave_id: str, current_user: dict = Depends(get_current_user)):
    leave = await db.leaves.find_one({"id": leave_id}, {"_id": 0})
    if not leave:
        raise HTTPException(status_code=404, detail="Leave request not found")
    if not await can_approve(current_user["id"], leave["employee_id"]):
        raise HTTPException(status_code=403, detail="Not authorized to approve this leave")
    await db.leaves.update_one(
        {"id": leave_id},
        {"$set": {"status": LeaveStatus.APPROVED, "approved_by": current_user["id"],
                  "approved_at": datetime.now(timezone.utc).isoformat()}}
    )
    # Update leave balance
    balance = await db.leave_balances.find_one({"employee_id": leave["employee_id"]}, {"_id": 0})
    if balance:
        lt = leave["leave_type"]
        balances = balance.get("balances", {})
        if lt in balances:
            balances[lt]["used"] = balances[lt].get("used", 0) + leave["total_days"]
            balances[lt]["available"] = balances[lt]["total"] - balances[lt]["used"]
            await db.leave_balances.update_one({"employee_id": leave["employee_id"]}, {"$set": {"balances": balances}})
    # Notification
    emp = await db.employees.find_one({"id": leave["employee_id"]}, {"_id": 0})
    if emp:
        await create_notification(emp["user_id"], "Leave Approved", f"Your {leave['leave_type']} leave has been approved.", "success")
    return {"message": "Leave approved successfully"}

@api_router.put("/leaves/{leave_id}/reject")
async def reject_leave(leave_id: str, current_user: dict = Depends(get_current_user)):
    leave = await db.leaves.find_one({"id": leave_id}, {"_id": 0})
    if not leave:
        raise HTTPException(status_code=404, detail="Leave request not found")
    if not await can_approve(current_user["id"], leave["employee_id"]):
        raise HTTPException(status_code=403, detail="Not authorized to reject this leave")
    await db.leaves.update_one(
        {"id": leave_id},
        {"$set": {"status": LeaveStatus.REJECTED, "approved_by": current_user["id"],
                  "approved_at": datetime.now(timezone.utc).isoformat()}}
    )
    emp = await db.employees.find_one({"id": leave["employee_id"]}, {"_id": 0})
    if emp:
        await create_notification(emp["user_id"], "Leave Rejected", f"Your {leave['leave_type']} leave has been rejected.", "warning")
    return {"message": "Leave rejected"}


# ══════════════════════  REIMBURSEMENTS  ══════════════════════
@api_router.post("/reimbursements", response_model=ReimbursementResponse)
async def create_reimbursement(reimb: ReimbursementCreate, current_user: dict = Depends(get_current_user)):
    emp = await get_employee_by_user_id(current_user["id"])
    if not emp:
        raise HTTPException(status_code=400, detail="Employee profile not found")
    reimb_id = str(uuid.uuid4())
    reimb_doc = reimb.model_dump()
    reimb_doc["id"] = reimb_id
    reimb_doc["employee_id"] = emp["id"]
    reimb_doc["status"] = ReimbursementStatus.PENDING
    reimb_doc["approved_by"] = None
    reimb_doc["approved_at"] = None
    reimb_doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.reimbursements.insert_one(reimb_doc)
    return ReimbursementResponse(**reimb_doc)

@api_router.get("/reimbursements", response_model=List[ReimbursementResponse])
async def get_reimbursements(current_user: dict = Depends(get_current_user)):
    if current_user["role"] == UserRole.ADMIN:
        reimbs = await db.reimbursements.find({}, {"_id": 0}).to_list(1000)
    else:
        emp = await get_employee_by_user_id(current_user["id"])
        if not emp:
            return []
        subordinate_ids = [e["id"] for e in await db.employees.find({"reports_to": emp["id"]}, {"_id": 0}).to_list(1000)]
        all_ids = [emp["id"]] + subordinate_ids
        reimbs = await db.reimbursements.find({"employee_id": {"$in": all_ids}}, {"_id": 0}).to_list(1000)
    return [ReimbursementResponse(**r) for r in reimbs]

@api_router.put("/reimbursements/{reimb_id}/approve")
async def approve_reimbursement(reimb_id: str, current_user: dict = Depends(get_current_user)):
    reimb = await db.reimbursements.find_one({"id": reimb_id}, {"_id": 0})
    if not reimb:
        raise HTTPException(status_code=404, detail="Reimbursement not found")
    if not await can_approve(current_user["id"], reimb["employee_id"]):
        raise HTTPException(status_code=403, detail="Not authorized to approve")
    await db.reimbursements.update_one(
        {"id": reimb_id},
        {"$set": {"status": ReimbursementStatus.APPROVED, "approved_by": current_user["id"],
                  "approved_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"message": "Reimbursement approved"}

@api_router.put("/reimbursements/{reimb_id}/reject")
async def reject_reimbursement(reimb_id: str, current_user: dict = Depends(get_current_user)):
    reimb = await db.reimbursements.find_one({"id": reimb_id}, {"_id": 0})
    if not reimb:
        raise HTTPException(status_code=404, detail="Reimbursement not found")
    if not await can_approve(current_user["id"], reimb["employee_id"]):
        raise HTTPException(status_code=403, detail="Not authorized to reject")
    await db.reimbursements.update_one(
        {"id": reimb_id},
        {"$set": {"status": ReimbursementStatus.REJECTED, "approved_by": current_user["id"],
                  "approved_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"message": "Reimbursement rejected"}

@api_router.put("/reimbursements/{reimb_id}/disburse")
async def disburse_reimbursement(reimb_id: str, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    reimb = await db.reimbursements.find_one({"id": reimb_id}, {"_id": 0})
    if not reimb:
        raise HTTPException(status_code=404, detail="Reimbursement not found")
    if reimb["status"] != ReimbursementStatus.APPROVED:
        raise HTTPException(status_code=400, detail="Only approved reimbursements can be disbursed")
    await db.reimbursements.update_one({"id": reimb_id}, {"$set": {"status": ReimbursementStatus.DISBURSED}})
    return {"message": "Reimbursement disbursed"}


# ══════════════════════  INDIAN TAX CALCULATOR  ══════════════════════
@api_router.post("/tax/calculate")
async def calculate_tax(basic: float, hra: float, da: float, other: float, current_user: dict = Depends(get_current_user)):
    result = calculate_full_salary(basic, hra, da, other)
    return result

@api_router.post("/salaries", response_model=SalaryStructureResponse)
async def create_salary_structure(salary: SalaryStructureCreate, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    salary_id = str(uuid.uuid4())
    salary_doc = salary.model_dump()
    salary_doc["id"] = salary_id
    # Use Indian tax calculation
    tax_calc = calculate_full_salary(salary.basic_salary, salary.hra, salary.da, salary.other_allowances)
    salary_doc["gross_salary"] = tax_calc["earnings"]["gross_salary"]
    salary_doc["pf_deduction"] = tax_calc["deductions"]["pf_employee"]
    salary_doc["esi_deduction"] = tax_calc["deductions"]["esic_employee"]
    salary_doc["tds_deduction"] = tax_calc["deductions"]["tds_monthly"]
    salary_doc["professional_tax"] = tax_calc["deductions"]["professional_tax"]
    salary_doc["total_deductions"] = tax_calc["deductions"]["total_deductions"]
    salary_doc["net_salary"] = tax_calc["net_salary"]
    salary_doc["employer_pf"] = tax_calc["deductions"]["pf_employer"]
    salary_doc["employer_esic"] = tax_calc["deductions"]["esic_employer"]
    salary_doc["ctc_monthly"] = tax_calc["ctc_monthly"]
    salary_doc["ctc_annual"] = tax_calc["ctc_annual"]
    salary_doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.salaries.insert_one(salary_doc)
    return SalaryStructureResponse(**salary_doc)


# ══════════════════════  LEAVE BALANCE  ══════════════════════
@api_router.get("/leave-balance/{employee_id}")
async def get_leave_balance(employee_id: str, current_user: dict = Depends(get_current_user)):
    balance = await db.leave_balances.find_one({"employee_id": employee_id}, {"_id": 0})
    if not balance:
        # Initialize with default policy
        balance = {
            "id": str(uuid.uuid4()),
            "employee_id": employee_id,
            "balances": {k: {"total": v, "used": 0, "available": v} for k, v in DEFAULT_LEAVE_POLICY.items()},
            "year": datetime.now(timezone.utc).year,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.leave_balances.insert_one(balance)
    return {k: v for k, v in balance.items() if k != "_id"}

@api_router.put("/leave-policy")
async def update_leave_policy(policy: Dict[str, int], current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    await db.leave_policies.update_one(
        {"type": "default"},
        {"$set": {"policy": policy, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True
    )
    return {"message": "Leave policy updated"}

@api_router.get("/leave-policy")
async def get_leave_policy(current_user: dict = Depends(get_current_user)):
    policy = await db.leave_policies.find_one({"type": "default"}, {"_id": 0})
    return policy.get("policy", DEFAULT_LEAVE_POLICY) if policy else DEFAULT_LEAVE_POLICY


# ══════════════════════  PAYSLIP GENERATION  ══════════════════════
@api_router.post("/payslips/generate")
async def generate_payslip(employee_id: str, month: str, year: int, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    salary = await db.salaries.find_one({"employee_id": employee_id}, {"_id": 0})
    if not salary:
        raise HTTPException(status_code=404, detail="Salary structure not found")
    # Check for existing payslip
    existing = await db.payslips.find_one({"employee_id": employee_id, "month": month, "year": year}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Payslip already generated for this period")
    # Calculate working days
    att_count = await db.attendance.count_documents({
        "employee_id": employee_id,
        "date": {"$regex": f"^{year}-{month.zfill(2)}"}
    })
    days_worked = att_count if att_count > 0 else 22
    payslip_id = str(uuid.uuid4())
    payslip_doc = {
        "id": payslip_id, "employee_id": employee_id, "month": month, "year": year,
        "salary_structure_id": salary["id"], "total_working_days": 22, "days_worked": days_worked,
        "basic_salary": salary.get("basic_salary", 0),
        "hra": salary.get("hra", 0),
        "da": salary.get("da", 0),
        "other_allowances": salary.get("other_allowances", 0),
        "gross_salary": salary["gross_salary"],
        "pf_deduction": salary.get("pf_deduction", 0),
        "esi_deduction": salary.get("esi_deduction", 0),
        "tds_deduction": salary.get("tds_deduction", 0),
        "professional_tax": salary.get("professional_tax", 0),
        "total_deductions": salary["total_deductions"],
        "net_salary": salary["net_salary"],
        "generated_at": datetime.now(timezone.utc).isoformat()
    }
    await db.payslips.insert_one(payslip_doc)
    return PayslipResponse(**payslip_doc)


# ══════════════════════  DOCUMENT MANAGEMENT  ══════════════════════
@api_router.post("/documents/upload")
async def upload_document(
    employee_id: str,
    document_type: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    ext = file.filename.split(".")[-1] if "." in file.filename else "bin"
    path = f"hrms-app/documents/{employee_id}/{uuid.uuid4()}.{ext}"
    data = await file.read()
    try:
        result = put_object(path, data, file.content_type or "application/octet-stream")
        doc_id = str(uuid.uuid4())
        doc_record = {
            "id": doc_id,
            "employee_id": employee_id,
            "document_type": document_type,
            "original_filename": file.filename,
            "storage_path": result["path"],
            "content_type": file.content_type,
            "size": result.get("size", len(data)),
            "uploaded_by": current_user["id"],
            "is_deleted": False,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.documents.insert_one(doc_record)
        return {"id": doc_id, "filename": file.filename, "path": result["path"], "document_type": document_type}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@api_router.get("/documents/{employee_id}")
async def get_employee_documents(employee_id: str, current_user: dict = Depends(get_current_user)):
    docs = await db.documents.find({"employee_id": employee_id, "is_deleted": False}, {"_id": 0}).to_list(100)
    return docs

@api_router.get("/documents/download/{doc_id}")
async def download_document(doc_id: str, current_user: dict = Depends(get_current_user)):
    record = await db.documents.find_one({"id": doc_id, "is_deleted": False}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="Document not found")
    try:
        data, content_type = get_object(record["storage_path"])
        return Response(content=data, media_type=record.get("content_type", content_type),
                       headers={"Content-Disposition": f"attachment; filename={record['original_filename']}"})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Download failed: {str(e)}")

@api_router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, current_user: dict = Depends(get_current_user)):
    await db.documents.update_one({"id": doc_id}, {"$set": {"is_deleted": True}})
    return {"message": "Document deleted"}


# ══════════════════════  RECRUITMENT  ══════════════════════
@api_router.post("/jobs", response_model=JobPostingResponse)
async def create_job_posting(job: JobPostingCreate, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    job_id = str(uuid.uuid4())
    job_doc = job.model_dump()
    job_doc["id"] = job_id
    job_doc["status"] = "active"
    job_doc["posted_by"] = current_user["id"]
    job_doc["posted_at"] = datetime.now(timezone.utc).isoformat()
    await db.job_postings.insert_one(job_doc)
    return JobPostingResponse(**job_doc)

@api_router.get("/jobs", response_model=List[JobPostingResponse])
async def get_job_postings(current_user: dict = Depends(get_current_user)):
    jobs = await db.job_postings.find({"status": "active"}, {"_id": 0}).to_list(1000)
    return [JobPostingResponse(**job) for job in jobs]

@api_router.post("/applications", response_model=ApplicationResponse)
async def submit_application(application: ApplicationCreate):
    app_id = str(uuid.uuid4())
    app_doc = application.model_dump()
    app_doc["id"] = app_id
    app_doc["status"] = ApplicationStatus.APPLIED
    app_doc["applied_at"] = datetime.now(timezone.utc).isoformat()
    await db.applications.insert_one(app_doc)
    return ApplicationResponse(**app_doc)

@api_router.get("/applications", response_model=List[ApplicationResponse])
async def get_applications(job_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    query = {"job_posting_id": job_id} if job_id else {}
    apps = await db.applications.find(query, {"_id": 0}).to_list(1000)
    return [ApplicationResponse(**a) for a in apps]

@api_router.put("/applications/{app_id}/status")
async def update_application_status(app_id: str, status: ApplicationStatus, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    await db.applications.update_one({"id": app_id}, {"$set": {"status": status}})
    return {"message": "Application status updated"}


# ══════════════════════  PERFORMANCE  ══════════════════════
@api_router.post("/performance/goals", response_model=PerformanceGoalResponse)
async def create_performance_goal(goal: PerformanceGoalCreate, current_user: dict = Depends(get_current_user)):
    goal_id = str(uuid.uuid4())
    goal_doc = goal.model_dump()
    goal_doc["id"] = goal_id
    goal_doc["status"] = "active"
    goal_doc["created_by"] = current_user["id"]
    goal_doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.performance_goals.insert_one(goal_doc)
    return PerformanceGoalResponse(**goal_doc)

@api_router.get("/performance/goals", response_model=List[PerformanceGoalResponse])
async def get_performance_goals(employee_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    if current_user["role"] == UserRole.ADMIN:
        query = {"employee_id": employee_id} if employee_id else {}
    else:
        emp = await get_employee_by_user_id(current_user["id"])
        query = {"employee_id": emp["id"]} if emp else {"employee_id": "none"}
    goals = await db.performance_goals.find(query, {"_id": 0}).to_list(1000)
    return [PerformanceGoalResponse(**g) for g in goals]

@api_router.post("/performance/reviews", response_model=PerformanceReviewResponse)
async def create_performance_review(review: PerformanceReviewCreate, current_user: dict = Depends(get_current_user)):
    review_id = str(uuid.uuid4())
    review_doc = review.model_dump()
    review_doc["id"] = review_id
    review_doc["reviewer_id"] = current_user["id"]
    review_doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.performance_reviews.insert_one(review_doc)
    return PerformanceReviewResponse(**review_doc)

@api_router.get("/performance/reviews", response_model=List[PerformanceReviewResponse])
async def get_performance_reviews(employee_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    if current_user["role"] == UserRole.ADMIN:
        query = {"employee_id": employee_id} if employee_id else {}
    else:
        emp = await get_employee_by_user_id(current_user["id"])
        query = {"employee_id": emp["id"]} if emp else {"employee_id": "none"}
    reviews = await db.performance_reviews.find(query, {"_id": 0}).to_list(1000)
    return [PerformanceReviewResponse(**r) for r in reviews]

@api_router.get("/salaries/{employee_id}", response_model=SalaryStructureResponse)
async def get_salary_structure(employee_id: str, current_user: dict = Depends(get_current_user)):
    salary = await db.salaries.find_one({"employee_id": employee_id}, {"_id": 0})
    if not salary:
        raise HTTPException(status_code=404, detail="Salary structure not found")
    return SalaryStructureResponse(**salary)

@api_router.get("/payslips/{employee_id}", response_model=List[PayslipResponse])
async def get_payslips(employee_id: str, current_user: dict = Depends(get_current_user)):
    payslips = await db.payslips.find({"employee_id": employee_id}, {"_id": 0}).to_list(1000)
    return [PayslipResponse(**ps) for ps in payslips]


# ══════════════════════  DASHBOARD  ══════════════════════
@api_router.get("/dashboard/stats")
async def get_dashboard_stats(current_user: dict = Depends(get_current_user)):
    total_employees = await db.employees.count_documents({"status": "active"})
    total_departments = await db.departments.count_documents({})
    pending_leaves = await db.leaves.count_documents({"status": LeaveStatus.PENDING})
    active_jobs = await db.job_postings.count_documents({"status": "active"})
    pending_reimbursements = await db.reimbursements.count_documents({"status": ReimbursementStatus.PENDING})
    today = datetime.now(timezone.utc).date().isoformat()
    present_today = await db.attendance.count_documents({"date": today, "status": AttendanceStatus.PRESENT})
    return {
        "total_employees": total_employees,
        "total_departments": total_departments,
        "pending_leaves": pending_leaves,
        "active_jobs": active_jobs,
        "pending_reimbursements": pending_reimbursements,
        "present_today": present_today,
        "attendance_percentage": round((present_today / total_employees * 100) if total_employees > 0 else 0, 2)
    }


# ══════════════════════  NOTIFICATIONS  ══════════════════════
@api_router.get("/notifications")
async def get_notifications(current_user: dict = Depends(get_current_user)):
    notifs = await db.notifications.find(
        {"user_id": current_user["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return notifs

@api_router.put("/notifications/{notif_id}/read")
async def mark_notification_read(notif_id: str, current_user: dict = Depends(get_current_user)):
    await db.notifications.update_one({"id": notif_id}, {"$set": {"read": True}})
    return {"message": "Notification marked as read"}

@api_router.put("/notifications/read-all")
async def mark_all_notifications_read(current_user: dict = Depends(get_current_user)):
    await db.notifications.update_many({"user_id": current_user["id"]}, {"$set": {"read": True}})
    return {"message": "All notifications marked as read"}

@api_router.get("/notifications/unread-count")
async def get_unread_count(current_user: dict = Depends(get_current_user)):
    count = await db.notifications.count_documents({"user_id": current_user["id"], "read": False})
    return {"count": count}

async def create_notification(user_id: str, title: str, message: str, notif_type: str = "info"):
    notif = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "title": title,
        "message": message,
        "type": notif_type,
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.notifications.insert_one(notif)


# ══════════════════════  PASSWORD RESET  ══════════════════════
@api_router.post("/auth/change-password")
async def change_password(old_password: str, new_password: str, current_user: dict = Depends(get_current_user)):
    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0})
    if not user or not verify_password(old_password, user["password"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    await db.users.update_one({"id": current_user["id"]}, {"$set": {"password": hash_password(new_password)}})
    return {"message": "Password changed successfully"}

@api_router.post("/auth/reset-password")
async def admin_reset_password(employee_email: EmailStr, new_password: str, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    user = await db.users.find_one({"email": employee_email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await db.users.update_one({"email": employee_email}, {"$set": {"password": hash_password(new_password)}})
    return {"message": f"Password reset for {employee_email}"}


# ══════════════════════  ONBOARDING CHECKLIST  ══════════════════════
@api_router.get("/onboarding/{employee_id}")
async def get_onboarding_checklist(employee_id: str, current_user: dict = Depends(get_current_user)):
    checklist = await db.onboarding.find_one({"employee_id": employee_id}, {"_id": 0})
    if not checklist:
        checklist = {
            "id": str(uuid.uuid4()),
            "employee_id": employee_id,
            "items": [{**item, "completed": False, "completed_at": None} for item in DEFAULT_ONBOARDING_CHECKLIST],
            "overall_progress": 0,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.onboarding.insert_one(checklist)
    return {k: v for k, v in checklist.items() if k != "_id"}

@api_router.put("/onboarding/{employee_id}/item/{item_id}")
async def update_onboarding_item(employee_id: str, item_id: str, completed: bool, current_user: dict = Depends(get_current_user)):
    checklist = await db.onboarding.find_one({"employee_id": employee_id}, {"_id": 0})
    if not checklist:
        raise HTTPException(status_code=404, detail="Checklist not found")
    items = checklist.get("items", [])
    for item in items:
        if item["id"] == item_id:
            item["completed"] = completed
            item["completed_at"] = datetime.now(timezone.utc).isoformat() if completed else None
            break
    completed_count = sum(1 for i in items if i["completed"])
    progress = round((completed_count / len(items)) * 100) if items else 0
    await db.onboarding.update_one(
        {"employee_id": employee_id},
        {"$set": {"items": items, "overall_progress": progress}}
    )
    return {"message": "Checklist updated", "progress": progress}


# ══════════════════════  ORGANIZATION DETAILS  ══════════════════════
@api_router.get("/organization")
async def get_organization(current_user: dict = Depends(get_current_user)):
    org = await db.organization.find_one({"type": "main"}, {"_id": 0})
    return org or {"setup_complete": False}

@api_router.post("/organization")
async def save_organization(data: dict, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    data["type"] = "main"
    data["setup_complete"] = True
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.organization.update_one({"type": "main"}, {"$set": data}, upsert=True)
    return {"message": "Organization saved"}

# Locations
@api_router.get("/locations")
async def get_locations(current_user: dict = Depends(get_current_user)):
    return await db.locations.find({}, {"_id": 0}).to_list(1000)

@api_router.post("/locations")
async def create_location(data: dict, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    data["id"] = str(uuid.uuid4())
    data["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.locations.insert_one(data)
    return {k: v for k, v in data.items() if k != "_id"}

@api_router.put("/locations/{loc_id}")
async def update_location(loc_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    await db.locations.update_one({"id": loc_id}, {"$set": data})
    return {"message": "Location updated"}

@api_router.delete("/locations/{loc_id}")
async def delete_location(loc_id: str, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    await db.locations.delete_one({"id": loc_id})
    return {"message": "Location deleted"}

# Employee Grades
@api_router.get("/employee-grades")
async def get_employee_grades(current_user: dict = Depends(get_current_user)):
    return await db.employee_grades.find({}, {"_id": 0}).to_list(1000)

@api_router.post("/employee-grades")
async def save_employee_grades(grades: List[dict], current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    await db.employee_grades.delete_many({})
    for g in grades:
        g["id"] = g.get("id", str(uuid.uuid4()))
    if grades:
        await db.employee_grades.insert_many(grades)
    return {"message": "Grades saved"}

# Employee Levels
@api_router.get("/employee-levels")
async def get_employee_levels(current_user: dict = Depends(get_current_user)):
    return await db.employee_levels.find({}, {"_id": 0}).to_list(1000)

@api_router.post("/employee-levels")
async def save_employee_levels(levels: List[dict], current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    await db.employee_levels.delete_many({})
    for l in levels:
        l["id"] = l.get("id", str(uuid.uuid4()))
    if levels:
        await db.employee_levels.insert_many(levels)
    return {"message": "Levels saved"}

# Shifts
@api_router.get("/shifts")
async def get_shifts(current_user: dict = Depends(get_current_user)):
    return await db.shifts.find({}, {"_id": 0}).to_list(1000)

@api_router.post("/shifts")
async def create_shift(data: dict, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    data["id"] = str(uuid.uuid4())
    data["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.shifts.insert_one(data)
    return {k: v for k, v in data.items() if k != "_id"}

@api_router.put("/shifts/{shift_id}")
async def update_shift(shift_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    await db.shifts.update_one({"id": shift_id}, {"$set": data})
    return {"message": "Shift updated"}

@api_router.delete("/shifts/{shift_id}")
async def delete_shift(shift_id: str, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    await db.shifts.delete_one({"id": shift_id})
    return {"message": "Shift deleted"}


# ══════════════════════  STATUTORY COMPLIANCE TEMPLATES  ══════════════════════
# Generic CRUD for all template types: pf, esic, pt, lwf, tds
TEMPLATE_COLLECTIONS = {
    "pf": "pf_templates",
    "esic": "esic_templates",
    "pt": "pt_templates",
    "lwf": "lwf_templates",
    "tds": "tds_templates",
}

POLICY_COLLECTIONS = {
    "leave": "leave_policy_templates",
    "attendance": "attendance_policy_templates",
    "attendance_collection": "att_collection_policy_templates",
    "overtime": "overtime_policy_templates",
    "reimbursement": "reimbursement_policy_templates",
    "bonus": "bonus_policy_templates",
    "gratuity": "gratuity_policy_templates",
    "incentive": "incentive_policy_templates",
    "advance": "advance_policy_templates",
    "loan": "loan_policy_templates",
}

@api_router.get("/compliance-templates/{template_type}")
async def get_compliance_templates(template_type: str, current_user: dict = Depends(get_current_user)):
    col = TEMPLATE_COLLECTIONS.get(template_type)
    if not col:
        raise HTTPException(status_code=400, detail="Invalid template type")
    templates = await db[col].find({}, {"_id": 0}).to_list(1000)
    return templates

@api_router.post("/compliance-templates/{template_type}")
async def create_compliance_template(template_type: str, data: dict, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    col = TEMPLATE_COLLECTIONS.get(template_type)
    if not col:
        raise HTTPException(status_code=400, detail="Invalid template type")
    data["id"] = str(uuid.uuid4())
    data["template_type"] = template_type
    data["created_at"] = datetime.now(timezone.utc).isoformat()
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db[col].insert_one(data)
    return {k: v for k, v in data.items() if k != "_id"}

@api_router.put("/compliance-templates/{template_type}/{template_id}")
async def update_compliance_template(template_type: str, template_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    col = TEMPLATE_COLLECTIONS.get(template_type)
    if not col:
        raise HTTPException(status_code=400, detail="Invalid template type")
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db[col].update_one({"id": template_id}, {"$set": data})
    return {"message": "Template updated"}

@api_router.delete("/compliance-templates/{template_type}/{template_id}")
async def delete_compliance_template(template_type: str, template_id: str, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    col = TEMPLATE_COLLECTIONS.get(template_type)
    if not col:
        raise HTTPException(status_code=400, detail="Invalid template type")
    await db[col].delete_one({"id": template_id})
    # Remove assignments referencing this template
    await db.compliance_assignments.update_many(
        {f"{template_type}_template_id": template_id},
        {"$unset": {f"{template_type}_template_id": ""}}
    )
    return {"message": "Template deleted"}


# ══════════════════════  COMPLIANCE TEMPLATE ASSIGNMENTS  ══════════════════════
@api_router.get("/compliance-assignments/{employee_id}")
async def get_compliance_assignment(employee_id: str, current_user: dict = Depends(get_current_user)):
    assignment = await db.compliance_assignments.find_one({"employee_id": employee_id}, {"_id": 0})
    return assignment or {"employee_id": employee_id}

@api_router.put("/compliance-assignments/{employee_id}")
async def update_compliance_assignment(employee_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    data["employee_id"] = employee_id
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.compliance_assignments.update_one(
        {"employee_id": employee_id}, {"$set": data}, upsert=True
    )
    return {"message": "Assignment updated"}

@api_router.post("/compliance-assignments/bulk")
async def bulk_assign_compliance(data: dict, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    assign_by = data.get("assign_by")  # "location", "department", or "employees"
    target_id = data.get("target_id")  # location_id or department_id
    employee_ids = data.get("employee_ids", [])  # direct employee list
    templates = data.get("templates", {})  # {"pf_template_id": "...", "esic_template_id": "...", etc.}

    if assign_by == "location":
        emps = await db.employees.find({"location_id": target_id, "status": "active"}, {"_id": 0}).to_list(1000)
        employee_ids = [e["id"] for e in emps]
    elif assign_by == "department":
        emps = await db.employees.find({"department_id": target_id, "status": "active"}, {"_id": 0}).to_list(1000)
        employee_ids = [e["id"] for e in emps]

    count = 0
    for emp_id in employee_ids:
        update_data = {**templates, "employee_id": emp_id, "updated_at": datetime.now(timezone.utc).isoformat()}
        await db.compliance_assignments.update_one(
            {"employee_id": emp_id}, {"$set": update_data}, upsert=True
        )
        count += 1
    return {"message": f"Templates assigned to {count} employees"}

@api_router.get("/compliance-assignments")
async def get_all_compliance_assignments(current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    return await db.compliance_assignments.find({}, {"_id": 0}).to_list(1000)


# ══════════════════════  POLICY TEMPLATES  ══════════════════════
@api_router.get("/policy-templates/{policy_type}")
async def get_policy_templates(policy_type: str, current_user: dict = Depends(get_current_user)):
    col = POLICY_COLLECTIONS.get(policy_type)
    if not col:
        raise HTTPException(status_code=400, detail="Invalid policy type")
    return await db[col].find({}, {"_id": 0}).to_list(1000)

@api_router.post("/policy-templates/{policy_type}")
async def create_policy_template(policy_type: str, data: dict, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    col = POLICY_COLLECTIONS.get(policy_type)
    if not col:
        raise HTTPException(status_code=400, detail="Invalid policy type")
    data["id"] = str(uuid.uuid4())
    data["policy_type"] = policy_type
    data["created_at"] = datetime.now(timezone.utc).isoformat()
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db[col].insert_one(data)
    return {k: v for k, v in data.items() if k != "_id"}

@api_router.put("/policy-templates/{policy_type}/{template_id}")
async def update_policy_template(policy_type: str, template_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    col = POLICY_COLLECTIONS.get(policy_type)
    if not col:
        raise HTTPException(status_code=400, detail="Invalid policy type")
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db[col].update_one({"id": template_id}, {"$set": data})
    return {"message": "Policy template updated"}

@api_router.delete("/policy-templates/{policy_type}/{template_id}")
async def delete_policy_template(policy_type: str, template_id: str, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    col = POLICY_COLLECTIONS.get(policy_type)
    if not col:
        raise HTTPException(status_code=400, detail="Invalid policy type")
    await db[col].delete_one({"id": template_id})
    await db.policy_assignments.update_many(
        {f"{policy_type}_template_id": template_id},
        {"$unset": {f"{policy_type}_template_id": ""}}
    )
    return {"message": "Policy template deleted"}

# ══════════════════════  POLICY ASSIGNMENTS  ══════════════════════
@api_router.get("/policy-assignments/{employee_id}")
async def get_policy_assignment(employee_id: str, current_user: dict = Depends(get_current_user)):
    assignment = await db.policy_assignments.find_one({"employee_id": employee_id}, {"_id": 0})
    return assignment or {"employee_id": employee_id}

@api_router.put("/policy-assignments/{employee_id}")
async def update_policy_assignment(employee_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    data["employee_id"] = employee_id
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.policy_assignments.update_one({"employee_id": employee_id}, {"$set": data}, upsert=True)
    return {"message": "Policy assignment updated"}

@api_router.post("/policy-assignments/bulk")
async def bulk_assign_policy(data: dict, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    assign_by = data.get("assign_by")
    target_id = data.get("target_id")
    employee_ids = data.get("employee_ids", [])
    templates = data.get("templates", {})
    if assign_by == "location":
        emps = await db.employees.find({"location_id": target_id, "status": "active"}, {"_id": 0}).to_list(1000)
        employee_ids = [e["id"] for e in emps]
    elif assign_by == "department":
        emps = await db.employees.find({"department_id": target_id, "status": "active"}, {"_id": 0}).to_list(1000)
        employee_ids = [e["id"] for e in emps]
    count = 0
    for emp_id in employee_ids:
        update_data = {**templates, "employee_id": emp_id, "updated_at": datetime.now(timezone.utc).isoformat()}
        await db.policy_assignments.update_one({"employee_id": emp_id}, {"$set": update_data}, upsert=True)
        count += 1
    return {"message": f"Policies assigned to {count} employees"}

@api_router.get("/policy-assignments")
async def get_all_policy_assignments(current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    return await db.policy_assignments.find({}, {"_id": 0}).to_list(1000)


# ══════════════════════  SALARY STRUCTURE  ══════════════════════
# Auto-paired components: adding a deduction auto-creates related provisions
AUTO_PAIRS = {
    "pf": ["pf_employer_provision", "pf_admin_charges_provision", "pf_edli_charges_provision"],
    "esic": ["esic_employer_provision"],
    "lwf": ["lwf_employer_provision"],
}

# Salary Components Library
@api_router.get("/salary-components")
async def get_salary_components(current_user: dict = Depends(get_current_user)):
    return await db.salary_components.find({}, {"_id": 0}).to_list(1000)

# Default percentages for auto-paired statutory provisions
AUTO_PAIR_DEFAULTS = {
    "pf_employer_provision": {"label": "PF Employer Contribution", "percentage": 12.0, "calc_type": "percentage_of_basic", "description": "3.67% EPF + 8.33% EPS capped at basic ₹15,000"},
    "pf_admin_charges_provision": {"label": "PF Admin Charges", "percentage": 0.5, "calc_type": "percentage_of_basic", "description": "Employer admin charges on EPF"},
    "pf_edli_charges_provision": {"label": "EDLI Charges", "percentage": 0.5, "calc_type": "percentage_of_basic", "description": "Employee Deposit Linked Insurance, capped at basic ₹15,000"},
    "esic_employer_provision": {"label": "ESIC Employer Contribution", "percentage": 3.25, "calc_type": "percentage_of_gross", "description": "Only applicable when gross ≤ ₹21,000"},
    "lwf_employer_provision": {"label": "LWF Employer Contribution", "percentage": 0.0, "calc_type": "fixed_amount", "description": "State-specific fixed amount"},
}

@api_router.post("/salary-components")
async def create_salary_component(data: dict, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    data["id"] = str(uuid.uuid4())
    data["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.salary_components.insert_one(data)
    result = {k: v for k, v in data.items() if k != "_id"}
    # Auto-pair: if deduction with auto_pair_key, create provision components
    pair_key = data.get("auto_pair_key")
    if pair_key and pair_key in AUTO_PAIRS:
        auto_created = []
        already_present = []
        for prov_code in AUTO_PAIRS[pair_key]:
            existing = await db.salary_components.find_one({"code": prov_code}, {"_id": 0})
            if not existing:
                defaults = AUTO_PAIR_DEFAULTS.get(prov_code, {})
                prov = {
                    "id": str(uuid.uuid4()), "code": prov_code,
                    "name": defaults.get("label", prov_code.replace("_", " ").title()),
                    "component_type": "provision", "category": "statutory",
                    "is_statutory": True, "paired_with": data["id"],
                    "calc_type": defaults.get("calc_type", "percentage_of_basic"),
                    "default_value": 0,
                    "default_percentage": defaults.get("percentage", 0),
                    "is_fixed": True, "allow_direct_entry": False,
                    "attracts_pf": False, "attracts_esic": False, "attracts_pt": False,
                    "attracts_lwf": False, "attracts_ot": False, "attracts_tds": False,
                    "classification": "others",
                    "description": defaults.get("description", ""),
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                await db.salary_components.insert_one(prov)
                auto_created.append(prov_code)
            else:
                already_present.append(prov_code)
        # Always report the full pairing outcome, whether newly created or already existing
        result["auto_created_provisions"] = auto_created
        result["paired_provisions"] = auto_created + already_present
        result["already_present_provisions"] = already_present
    return result

@api_router.put("/salary-components/{comp_id}")
async def update_salary_component(comp_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.salary_components.update_one({"id": comp_id}, {"$set": data})
    return {"message": "Component updated"}

@api_router.delete("/salary-components/{comp_id}")
async def delete_salary_component(comp_id: str, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    await db.salary_components.delete_one({"id": comp_id})
    return {"message": "Component deleted"}

# Salary Templates
@api_router.get("/salary-templates")
async def get_salary_templates(current_user: dict = Depends(get_current_user)):
    return await db.salary_templates.find({}, {"_id": 0}).to_list(1000)

@api_router.get("/salary-templates/{template_id}")
async def get_salary_template(template_id: str, current_user: dict = Depends(get_current_user)):
    t = await db.salary_templates.find_one({"id": template_id}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    return t

@api_router.post("/salary-templates")
async def create_salary_template(data: dict, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    data["id"] = str(uuid.uuid4())
    data["created_at"] = datetime.now(timezone.utc).isoformat()
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.salary_templates.insert_one(data)
    return {k: v for k, v in data.items() if k != "_id"}

@api_router.put("/salary-templates/{template_id}")
async def update_salary_template(template_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.salary_templates.update_one({"id": template_id}, {"$set": data})
    return {"message": "Template updated"}

@api_router.delete("/salary-templates/{template_id}")
async def delete_salary_template(template_id: str, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    await db.salary_templates.delete_one({"id": template_id})
    return {"message": "Template deleted"}

# Salary Template Assignments
@api_router.get("/salary-assignments/{employee_id}")
async def get_salary_assignment(employee_id: str, current_user: dict = Depends(get_current_user)):
    a = await db.salary_assignments.find_one({"employee_id": employee_id}, {"_id": 0})
    return a or {"employee_id": employee_id}

@api_router.put("/salary-assignments/{employee_id}")
async def update_salary_assignment(employee_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    data["employee_id"] = employee_id
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.salary_assignments.update_one({"employee_id": employee_id}, {"$set": data}, upsert=True)
    return {"message": "Salary template assigned"}

@api_router.post("/salary-assignments/bulk")
async def bulk_assign_salary(data: dict, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    assign_by = data.get("assign_by")
    target_id = data.get("target_id")
    template_id = data.get("salary_template_id")
    employee_ids = data.get("employee_ids", [])
    if assign_by == "location":
        emps = await db.employees.find({"location_id": target_id, "status": "active"}, {"_id": 0}).to_list(1000)
        employee_ids = [e["id"] for e in emps]
    elif assign_by == "department":
        emps = await db.employees.find({"department_id": target_id, "status": "active"}, {"_id": 0}).to_list(1000)
        employee_ids = [e["id"] for e in emps]
    count = 0
    for emp_id in employee_ids:
        await db.salary_assignments.update_one(
            {"employee_id": emp_id},
            {"$set": {"employee_id": emp_id, "salary_template_id": template_id, "updated_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True
        )
        count += 1
    return {"message": f"Salary template assigned to {count} employees"}

@api_router.get("/salary-assignments")
async def get_all_salary_assignments(current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    return await db.salary_assignments.find({}, {"_id": 0}).to_list(1000)

# ── Indian Payroll Constants (statutory caps) ──
PF_WAGE_CEILING = 15000      # EPFO: PF computed on min(basic+da, 15000)
ESIC_WAGE_CEILING = 21000    # ESIC: applicable only when gross ≤ 21000
PF_EPS_CAP = 1250            # 8.33% of 15000 capped at 1250 for EPS
PF_ADMIN_RATE = 0.005        # 0.5% admin charges
PF_EDLI_RATE = 0.005         # 0.5% EDLI charges (capped at 15000)
PF_EMPLOYEE_RATE = 0.12      # 12%
PF_EMPLOYER_RATE = 0.12      # 12% (3.67% EPF + 8.33% EPS)
ESIC_EMPLOYEE_RATE = 0.0075  # 0.75%
ESIC_EMPLOYER_RATE = 0.0325  # 3.25%


def _eval_pt_from_template(pt_template: dict, gross_monthly: float) -> float:
    """Evaluate Professional Tax from a compliance template's slabs. Fallback to defaults."""
    if not pt_template:
        # Maharashtra default (INR/month based on gross)
        if gross_monthly <= 7500:
            return 0
        if gross_monthly <= 10000:
            return 175
        return 200
    slabs = pt_template.get("slabs") or []
    for s in slabs:
        low = float(s.get("from", 0) or 0)
        high = s.get("to")
        high = float(high) if high not in (None, "", "inf") else float("inf")
        if low <= gross_monthly <= high:
            return float(s.get("amount", 0) or 0)
    return 0


def _eval_lwf_from_template(lwf_template: dict) -> dict:
    """Return {employee, employer} LWF from template."""
    if not lwf_template:
        return {"employee": 0, "employer": 0}
    return {
        "employee": float(lwf_template.get("employee_amount", 0) or 0),
        "employer": float(lwf_template.get("employer_amount", 0) or 0),
    }


def _eval_tds_monthly(annual_taxable_income: float, tds_template: dict = None) -> float:
    """Evaluate monthly TDS from annual taxable income using New Regime (or template slabs)."""
    # Import lazily to avoid circulars
    from indian_tax import calculate_income_tax
    if tds_template and tds_template.get("slabs"):
        # Use template slabs if provided; slabs modeled as (from exclusive, to inclusive, rate%)
        taxable = max(0, annual_taxable_income - float(tds_template.get("standard_deduction", 75000)))
        tax = 0.0
        for s in tds_template["slabs"]:
            low = float(s.get("from", 0) or 0)
            high = s.get("to")
            high = float(high) if high not in (None, "", "inf") else float("inf")
            rate = float(s.get("rate", 0) or 0)
            rate = rate / 100 if rate > 1 else rate
            if taxable <= 0:
                break
            slab_width = high - low
            slab_amount = min(taxable, slab_width)
            tax += slab_amount * rate
            taxable -= slab_amount
        cess = tax * 0.04
        return round((tax + cess) / 12, 2)
    return calculate_income_tax(annual_taxable_income)["monthly_tds"]


# Salary Calculator - compute salary from template (Indian Labour Law compliant)
@api_router.post("/salary-compute")
async def compute_salary(data: dict, current_user: dict = Depends(get_current_user)):
    """
    Compute salary breakdown. Returns per-component computed amounts + totals.
    Supports:
      - fixed_amount, percentage_of_basic, percentage_of_gross, percentage_of_ctc
      - Statutory overrides via compliance template IDs (PF/ESIC/PT/LWF/TDS)
      - PF wage ceiling (₹15,000), ESIC threshold (₹21,000)
      - New Regime TDS slabs (2024-25) with rebate u/s 87A
    """
    components = data.get("components", [])
    pay_type = data.get("pay_type", "monthly")
    ctc_annual_override = float(data.get("ctc_annual") or 0)
    use_statutory_auto = bool(data.get("use_statutory_auto", True))

    # Fetch assigned compliance templates if passed (for accurate slab-based calc)
    async def _get_tpl(col_key: str, tid: str):
        if not tid:
            return None
        col = TEMPLATE_COLLECTIONS.get(col_key)
        if not col:
            return None
        return await db[col].find_one({"id": tid}, {"_id": 0})

    pf_tpl   = await _get_tpl("pf", data.get("pf_template_id"))
    esic_tpl = await _get_tpl("esic", data.get("esic_template_id"))
    pt_tpl   = await _get_tpl("pt", data.get("pt_template_id"))
    lwf_tpl  = await _get_tpl("lwf", data.get("lwf_template_id"))
    tds_tpl  = await _get_tpl("tds", data.get("tds_template_id"))

    # ── Phase 1: Identify basic and compute deterministic earnings ──
    def _is_enabled(c):
        return c.get("enabled") is not False

    def _find_basic(comps):
        for c in comps:
            if not _is_enabled(c) or c.get("component_type") != "earning":
                continue
            code = (c.get("code") or "").upper()
            name = (c.get("name") or "").lower()
            if code == "BASIC" or code.startswith("BASIC_") or (code == "" and "basic" in name):
                return c
        return None

    basic_comp = _find_basic(components)
    basic_amount = 0.0
    if basic_comp:
        if basic_comp.get("calc_type") == "fixed_amount":
            basic_amount = float(basic_comp.get("amount") or 0)
        elif basic_comp.get("calc_type") == "percentage_of_ctc" and ctc_annual_override > 0:
            basic_amount = round((ctc_annual_override / 12) * float(basic_comp.get("percentage") or 0) / 100, 2)

    # ── Phase 2: Compute earnings ──
    # Pass 1: fixed + % of basic (derive deterministic subtotal)
    earnings_breakdown = []
    for c in components:
        if not _is_enabled(c) or c.get("component_type") != "earning":
            continue
        ct = c.get("calc_type", "fixed_amount")
        if ct == "fixed_amount":
            amt = float(c.get("amount") or 0)
        elif ct == "percentage_of_basic":
            amt = round(basic_amount * float(c.get("percentage") or 0) / 100, 2)
        elif ct == "percentage_of_ctc" and ctc_annual_override > 0:
            amt = round((ctc_annual_override / 12) * float(c.get("percentage") or 0) / 100, 2)
        else:
            amt = None  # to be filled in pass 2
        earnings_breakdown.append({
            "component_id": c.get("component_id") or c.get("id"),
            "code": c.get("code"), "name": c.get("name"),
            "calc_type": ct, "percentage": float(c.get("percentage") or 0),
            "classification": c.get("classification", "inclusion_wages"),
            "attracts_pf": bool(c.get("attracts_pf")),
            "attracts_esic": bool(c.get("attracts_esic")),
            "attracts_pt": bool(c.get("attracts_pt")),
            "attracts_tds": bool(c.get("attracts_tds")),
            "is_statutory_computed": False,
            "amount": amt,
        })

    subtotal_before_gross_pct = sum(e["amount"] for e in earnings_breakdown if e["amount"] is not None)
    # Pass 2: % of gross (only earnings)
    for e in earnings_breakdown:
        if e["amount"] is None and e["calc_type"] == "percentage_of_gross":
            e["amount"] = round(subtotal_before_gross_pct * e["percentage"] / 100, 2)
    for e in earnings_breakdown:
        if e["amount"] is None:
            e["amount"] = 0.0

    gross_monthly = round(sum(e["amount"] for e in earnings_breakdown), 2)
    pf_wages = round(sum(e["amount"] for e in earnings_breakdown if e["attracts_pf"]), 2)
    # PF wages are typically basic (+DA if basic itself is zero). Fallback to basic_amount.
    if pf_wages == 0 and basic_amount > 0:
        pf_wages = basic_amount

    # ── Phase 3: Compute deductions & provisions ──
    deductions_breakdown = []
    provisions_breakdown = []

    # User-provided deductions (fixed or %-based)
    for c in components:
        if not _is_enabled(c) or c.get("component_type") not in ("deduction", "provision"):
            continue
        # Skip statutory ones here; computed authoritatively below.
        # Only skip when the component is explicitly flagged as statutory OR has a valid auto_pair_key.
        ak = (c.get("auto_pair_key") or "").lower()
        is_stat_user = bool(c.get("is_statutory")) or ak in ("pf", "esic", "lwf")
        if use_statutory_auto and is_stat_user:
            continue
        ct = c.get("calc_type", "fixed_amount")
        if ct == "fixed_amount":
            amt = float(c.get("amount") or 0)
        elif ct == "percentage_of_basic":
            amt = round(basic_amount * float(c.get("percentage") or 0) / 100, 2)
        elif ct == "percentage_of_gross":
            amt = round(gross_monthly * float(c.get("percentage") or 0) / 100, 2)
        elif ct == "percentage_of_ctc" and ctc_annual_override > 0:
            amt = round((ctc_annual_override / 12) * float(c.get("percentage") or 0) / 100, 2)
        else:
            amt = 0.0
        entry = {
            "component_id": c.get("component_id") or c.get("id"),
            "code": c.get("code"), "name": c.get("name"),
            "calc_type": ct, "percentage": float(c.get("percentage") or 0),
            "is_statutory_computed": False,
            "amount": amt,
        }
        if c.get("component_type") == "deduction":
            deductions_breakdown.append(entry)
        else:
            provisions_breakdown.append(entry)

    # ── Phase 3b: Statutory authoritative computation (if enabled) ──
    statutory = {}
    if use_statutory_auto:
        # PF: employee 12% of min(pf_wages, 15000)
        pf_base = min(pf_wages, PF_WAGE_CEILING)
        pf_emp_rate = float((pf_tpl or {}).get("employee_rate", PF_EMPLOYEE_RATE * 100)) / 100
        pf_er_rate  = float((pf_tpl or {}).get("employer_rate", PF_EMPLOYER_RATE * 100)) / 100
        pf_admin    = float((pf_tpl or {}).get("admin_rate", PF_ADMIN_RATE * 100)) / 100
        pf_edli     = float((pf_tpl or {}).get("edli_rate", PF_EDLI_RATE * 100)) / 100
        pf_cap_applies = (pf_tpl or {}).get("apply_wage_ceiling", True)
        base_for_pf = pf_base if pf_cap_applies else pf_wages

        pf_employee  = round(base_for_pf * pf_emp_rate, 2) if pf_wages > 0 else 0
        pf_employer  = round(base_for_pf * pf_er_rate, 2) if pf_wages > 0 else 0
        pf_admin_amt = round(base_for_pf * pf_admin, 2) if pf_wages > 0 else 0
        pf_edli_amt  = round(base_for_pf * pf_edli, 2) if pf_wages > 0 else 0

        if pf_employee > 0:
            deductions_breakdown.append({"code": "PF_EMP", "name": "Provident Fund (Employee)",
                                         "calc_type": "percentage_of_basic", "percentage": pf_emp_rate * 100,
                                         "is_statutory_computed": True, "amount": pf_employee})
            provisions_breakdown.append({"code": "PF_ER", "name": "PF Employer Contribution",
                                         "calc_type": "percentage_of_basic", "percentage": pf_er_rate * 100,
                                         "is_statutory_computed": True, "amount": pf_employer})
            provisions_breakdown.append({"code": "PF_ADMIN", "name": "PF Admin Charges",
                                         "calc_type": "percentage_of_basic", "percentage": pf_admin * 100,
                                         "is_statutory_computed": True, "amount": pf_admin_amt})
            provisions_breakdown.append({"code": "PF_EDLI", "name": "EDLI Charges",
                                         "calc_type": "percentage_of_basic", "percentage": pf_edli * 100,
                                         "is_statutory_computed": True, "amount": pf_edli_amt})

        statutory["pf"] = {"wages": pf_wages, "base_used": base_for_pf, "employee": pf_employee,
                          "employer": pf_employer, "admin": pf_admin_amt, "edli": pf_edli_amt,
                          "eps_capped_at": PF_EPS_CAP}

        # ESIC: only if gross ≤ 21000 (or template threshold)
        esic_threshold = float((esic_tpl or {}).get("threshold_gross", ESIC_WAGE_CEILING))
        esic_emp_rate = float((esic_tpl or {}).get("employee_rate", ESIC_EMPLOYEE_RATE * 100)) / 100
        esic_er_rate  = float((esic_tpl or {}).get("employer_rate", ESIC_EMPLOYER_RATE * 100)) / 100
        esic_applicable = gross_monthly <= esic_threshold and gross_monthly > 0
        esic_employee = round(gross_monthly * esic_emp_rate, 2) if esic_applicable else 0
        esic_employer = round(gross_monthly * esic_er_rate, 2) if esic_applicable else 0
        if esic_applicable:
            deductions_breakdown.append({"code": "ESIC_EMP", "name": "ESIC (Employee)",
                                         "calc_type": "percentage_of_gross", "percentage": esic_emp_rate * 100,
                                         "is_statutory_computed": True, "amount": esic_employee})
            provisions_breakdown.append({"code": "ESIC_ER", "name": "ESIC Employer Contribution",
                                         "calc_type": "percentage_of_gross", "percentage": esic_er_rate * 100,
                                         "is_statutory_computed": True, "amount": esic_employer})
        statutory["esic"] = {"applicable": esic_applicable, "threshold": esic_threshold,
                             "employee": esic_employee, "employer": esic_employer}

        # Professional Tax (slab-based per state)
        pt_amount = _eval_pt_from_template(pt_tpl, gross_monthly)
        if pt_amount > 0:
            deductions_breakdown.append({"code": "PT", "name": "Professional Tax",
                                         "calc_type": "slab", "percentage": 0,
                                         "is_statutory_computed": True, "amount": pt_amount})
        statutory["pt"] = {"amount": pt_amount}

        # LWF (state-specific, usually fixed)
        lwf = _eval_lwf_from_template(lwf_tpl)
        if lwf["employee"] > 0:
            deductions_breakdown.append({"code": "LWF_EMP", "name": "Labour Welfare Fund (Employee)",
                                         "calc_type": "fixed_amount", "percentage": 0,
                                         "is_statutory_computed": True, "amount": lwf["employee"]})
        if lwf["employer"] > 0:
            provisions_breakdown.append({"code": "LWF_ER", "name": "LWF Employer Contribution",
                                         "calc_type": "fixed_amount", "percentage": 0,
                                         "is_statutory_computed": True, "amount": lwf["employer"]})
        statutory["lwf"] = lwf

        # TDS (monthly from annual projection)
        # Annual taxable = sum of earnings that attract TDS * 12 (or gross * 12 if none tagged)
        tds_earnings_monthly = sum(e["amount"] for e in earnings_breakdown if e["attracts_tds"])
        if tds_earnings_monthly == 0:
            tds_earnings_monthly = gross_monthly
        annual_taxable = tds_earnings_monthly * 12
        tds_monthly = _eval_tds_monthly(annual_taxable, tds_tpl)
        if tds_monthly > 0:
            deductions_breakdown.append({"code": "TDS", "name": "Income Tax (TDS)",
                                         "calc_type": "slab_annual", "percentage": 0,
                                         "is_statutory_computed": True, "amount": tds_monthly})
        statutory["tds"] = {"annual_taxable": round(annual_taxable, 2), "monthly_tds": tds_monthly}

    # ── Phase 4: Totals ──
    total_deductions = round(sum(d["amount"] for d in deductions_breakdown), 2)
    total_provisions = round(sum(p["amount"] for p in provisions_breakdown), 2)
    net_monthly = round(gross_monthly - total_deductions, 2)
    ctc_monthly = round(gross_monthly + total_provisions, 2)

    result = {
        "earnings": earnings_breakdown,
        "deductions": deductions_breakdown,
        "provisions": provisions_breakdown,
        "basic_monthly": round(basic_amount, 2),
        "pf_wages_monthly": round(pf_wages, 2),
        "gross_monthly": gross_monthly,
        "total_deductions_monthly": total_deductions,
        "total_provisions_monthly": total_provisions,
        "net_monthly": net_monthly,
        "ctc_monthly": ctc_monthly,
        "gross_annual": round(gross_monthly * 12, 2),
        "total_deductions_annual": round(total_deductions * 12, 2),
        "net_annual": round(net_monthly * 12, 2),
        "ctc_annual": round(ctc_monthly * 12, 2),
        "statutory": statutory,
    }
    if pay_type == "daily":
        result["gross_daily"] = round(gross_monthly / 30, 2)
        result["net_daily"] = round(net_monthly / 30, 2)
    return result


# ══════════════════════  BONUS / GRATUITY / INCENTIVE / ADVANCE / LOAN  ══════════════════════

@api_router.post("/bonus/compute")
async def compute_bonus(data: dict, current_user: dict = Depends(get_current_user)):
    """Payment of Bonus Act 1965: compute annual statutory bonus."""
    wage = float(data.get("monthly_wage") or 0)
    days = int(data.get("days_worked") or 365)
    rate = data.get("bonus_rate")
    elig = data.get("eligibility_ceiling")
    calc = data.get("calc_ceiling")
    rate = float(rate) if rate not in (None, "") else None
    elig = float(elig) if elig not in (None, "") else None
    calc = float(calc) if calc not in (None, "") else None
    return calculate_statutory_bonus(wage, days, rate, elig, calc)


@api_router.post("/gratuity/compute")
async def compute_gratuity(data: dict, current_user: dict = Depends(get_current_user)):
    """Payment of Gratuity Act 1972: compute gratuity on exit."""
    wage = float(data.get("last_drawn_wage") or 0)
    years = float(data.get("years_of_service") or 0)
    reason = data.get("exit_reason") or "resignation"
    days_per_year = data.get("days_per_year")
    divisor = data.get("divisor")
    cap = data.get("statutory_cap")
    return calculate_gratuity(wage, years, reason,
                              int(days_per_year) if days_per_year else None,
                              int(divisor) if divisor else None,
                              float(cap) if cap else None)


@api_router.post("/incentive/compute")
async def compute_incentive(data: dict, current_user: dict = Depends(get_current_user)):
    """Incentive / Commission computation."""
    return calculate_incentive(
        achievement_percent=float(data.get("achievement_percent") or 0),
        target_amount=float(data.get("target_amount") or 0),
        incentive_type=data.get("incentive_type", "fixed"),
        fixed_amount=float(data.get("fixed_amount") or 0),
        percentage_rate=float(data.get("percentage_rate") or 0),
        min_achievement=float(data.get("min_achievement") or 0),
        prorata=bool(data.get("prorata", True)),
        slabs=data.get("slabs") or [],
    )


@api_router.post("/advance/compute")
async def compute_advance(data: dict, current_user: dict = Depends(get_current_user)):
    """Salary Advance EMI schedule."""
    return calculate_advance_schedule(
        advance_amount=float(data.get("advance_amount") or 0),
        monthly_salary=float(data.get("monthly_salary") or 0),
        repayment_months=int(data.get("repayment_months") or 1),
        interest_rate_pa=float(data.get("interest_rate_pa") or 0),
        max_advance_pct=float(data.get("max_advance_pct") or 50),
    )


@api_router.post("/loan/compute")
async def compute_loan(data: dict, current_user: dict = Depends(get_current_user)):
    """Employee Loan EMI schedule (reducing balance or simple interest)."""
    return calculate_loan_emi(
        principal=float(data.get("principal") or 0),
        rate_pa=float(data.get("rate_pa") or 0),
        tenure_months=int(data.get("tenure_months") or 1),
        interest_type=data.get("interest_type", "reducing_balance"),
        max_emi_pct=float(data["max_emi_pct"]) if data.get("max_emi_pct") not in (None, "") else None,
        monthly_salary=float(data["monthly_salary"]) if data.get("monthly_salary") not in (None, "") else None,
    )


# ══════════════════════  EMPLOYEE ADVANCE / LOAN RECORDS  ══════════════════════
# Track active advances and loans with repayment progress

@api_router.get("/advances")
async def get_advances(employee_id: str = None, current_user: dict = Depends(get_current_user)):
    q = {}
    if employee_id:
        q["employee_id"] = employee_id
    elif current_user["role"] != UserRole.ADMIN:
        q["employee_id"] = current_user["id"]
    return await db.advances.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)


@api_router.post("/advances")
async def create_advance(data: dict, current_user: dict = Depends(get_current_user)):
    data["id"] = str(uuid.uuid4())
    data["created_at"] = datetime.now(timezone.utc).isoformat()
    data["status"] = data.get("status", "pending")
    data["paid_installments"] = 0
    # Compute schedule
    sched = calculate_advance_schedule(
        advance_amount=float(data.get("advance_amount") or 0),
        monthly_salary=float(data.get("monthly_salary") or 0),
        repayment_months=int(data.get("repayment_months") or 1),
        interest_rate_pa=float(data.get("interest_rate_pa") or 0),
        max_advance_pct=float(data.get("max_advance_pct") or 50),
    )
    data["schedule"] = sched
    await db.advances.insert_one(data)
    return {k: v for k, v in data.items() if k != "_id"}


@api_router.put("/advances/{advance_id}")
async def update_advance(advance_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.advances.update_one({"id": advance_id}, {"$set": data})
    return {"message": "Advance updated"}


@api_router.delete("/advances/{advance_id}")
async def delete_advance(advance_id: str, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    await db.advances.delete_one({"id": advance_id})
    return {"message": "Advance deleted"}


@api_router.get("/loans")
async def get_loans(employee_id: str = None, current_user: dict = Depends(get_current_user)):
    q = {}
    if employee_id:
        q["employee_id"] = employee_id
    elif current_user["role"] != UserRole.ADMIN:
        q["employee_id"] = current_user["id"]
    return await db.loans.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)


@api_router.post("/loans")
async def create_loan(data: dict, current_user: dict = Depends(get_current_user)):
    data["id"] = str(uuid.uuid4())
    data["created_at"] = datetime.now(timezone.utc).isoformat()
    data["status"] = data.get("status", "pending")
    data["paid_installments"] = 0
    sched = calculate_loan_emi(
        principal=float(data.get("principal") or 0),
        rate_pa=float(data.get("rate_pa") or 0),
        tenure_months=int(data.get("tenure_months") or 1),
        interest_type=data.get("interest_type", "reducing_balance"),
        max_emi_pct=float(data["max_emi_pct"]) if data.get("max_emi_pct") not in (None, "") else None,
        monthly_salary=float(data["monthly_salary"]) if data.get("monthly_salary") not in (None, "") else None,
    )
    data["schedule"] = sched
    await db.loans.insert_one(data)
    return {k: v for k, v in data.items() if k != "_id"}


@api_router.put("/loans/{loan_id}")
async def update_loan(loan_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.loans.update_one({"id": loan_id}, {"$set": data})
    return {"message": "Loan updated"}


@api_router.delete("/loans/{loan_id}")
async def delete_loan(loan_id: str, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    await db.loans.delete_one({"id": loan_id})
    return {"message": "Loan deleted"}


# ══════════════════════  PAYSLIP PDF  ══════════════════════

def _build_payslip_pdf(payslip: dict) -> bytes:
    """Generate a styled payslip PDF from the compute result + employee metadata."""
    from io import BytesIO
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18*mm, rightMargin=18*mm, topMargin=18*mm, bottomMargin=18*mm)
    styles = getSampleStyleSheet()
    h = ParagraphStyle("H", parent=styles["Heading1"], fontSize=18, textColor=colors.HexColor("#2A2624"), spaceAfter=6)
    sub = ParagraphStyle("Sub", parent=styles["Normal"], fontSize=10, textColor=colors.HexColor("#6A625E"), spaceAfter=12)
    lbl = ParagraphStyle("Lbl", parent=styles["Normal"], fontSize=8, textColor=colors.HexColor("#A28B7A"))
    val = ParagraphStyle("Val", parent=styles["Normal"], fontSize=10, textColor=colors.HexColor("#2A2624"))

    story = []
    emp = payslip.get("employee", {})
    period = payslip.get("period", {})
    compute = payslip.get("compute", {})
    org = payslip.get("organization", {})

    story.append(Paragraph(org.get("name", "Organization"), h))
    story.append(Paragraph(f"Payslip for {period.get('month', '')} {period.get('year', '')}", sub))

    # Employee header
    emp_data = [
        ["Employee", emp.get("full_name", "-"), "Employee Code", emp.get("employee_code", "-")],
        ["Designation", emp.get("designation", "-"), "Department", emp.get("department_name", "-")],
        ["PAN", emp.get("pan", "-"), "PF Number", emp.get("pf_number", "-")],
        ["Bank A/C", emp.get("bank_account", "-"), "Pay Period", f"{period.get('month','')}/{period.get('year','')}"],
    ]
    t = Table(emp_data, colWidths=[32*mm, 52*mm, 32*mm, 52*mm])
    t.setStyle(TableStyle([
        ("FONTSIZE", (0,0), (-1,-1), 9),
        ("TEXTCOLOR", (0,0), (0,-1), colors.HexColor("#A28B7A")),
        ("TEXTCOLOR", (2,0), (2,-1), colors.HexColor("#A28B7A")),
        ("TEXTCOLOR", (1,0), (1,-1), colors.HexColor("#2A2624")),
        ("TEXTCOLOR", (3,0), (3,-1), colors.HexColor("#2A2624")),
        ("ROWBACKGROUNDS", (0,0), (-1,-1), [colors.HexColor("#F9F6F0"), colors.white]),
        ("BOX", (0,0), (-1,-1), 0.5, colors.HexColor("#E8E2D9")),
        ("INNERGRID", (0,0), (-1,-1), 0.3, colors.HexColor("#E8E2D9")),
        ("LEFTPADDING", (0,0), (-1,-1), 6),
        ("RIGHTPADDING", (0,0), (-1,-1), 6),
        ("TOPPADDING", (0,0), (-1,-1), 4),
        ("BOTTOMPADDING", (0,0), (-1,-1), 4),
    ]))
    story.append(t)
    story.append(Spacer(1, 8))

    # Earnings + Deductions tables side by side
    earnings = compute.get("earnings", [])
    deductions = compute.get("deductions", [])
    provisions = compute.get("provisions", [])

    def _rupee(n):
        return f"₹ {float(n or 0):,.2f}"

    earnings_rows = [["Earnings", "Amount"]] + [[e.get("name", ""), _rupee(e.get("amount", 0))] for e in earnings]
    earnings_rows.append(["Gross Earnings", _rupee(compute.get("gross_monthly", 0))])

    deductions_rows = [["Deductions", "Amount"]] + [[d.get("name", ""), _rupee(d.get("amount", 0))] for d in deductions]
    deductions_rows.append(["Total Deductions", _rupee(compute.get("total_deductions_monthly", 0))])

    # Balance row counts
    maxr = max(len(earnings_rows), len(deductions_rows))
    while len(earnings_rows) < maxr: earnings_rows.insert(-1, ["", ""])
    while len(deductions_rows) < maxr: deductions_rows.insert(-1, ["", ""])

    e_table = Table(earnings_rows, colWidths=[55*mm, 30*mm])
    d_table = Table(deductions_rows, colWidths=[55*mm, 30*mm])
    def _style_tbl(tbl):
        tbl.setStyle(TableStyle([
            ("FONTSIZE", (0,0), (-1,-1), 9),
            ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#2A2624")),
            ("TEXTCOLOR", (0,0), (-1,0), colors.white),
            ("BACKGROUND", (0,-1), (-1,-1), colors.HexColor("#F9F6F0")),
            ("FONTNAME", (0,-1), (-1,-1), "Helvetica-Bold"),
            ("ALIGN", (1,0), (1,-1), "RIGHT"),
            ("BOX", (0,0), (-1,-1), 0.5, colors.HexColor("#E8E2D9")),
            ("INNERGRID", (0,0), (-1,-1), 0.3, colors.HexColor("#E8E2D9")),
            ("LEFTPADDING", (0,0), (-1,-1), 6),
            ("RIGHTPADDING", (0,0), (-1,-1), 6),
            ("TOPPADDING", (0,0), (-1,-1), 4),
            ("BOTTOMPADDING", (0,0), (-1,-1), 4),
        ]))
    _style_tbl(e_table); _style_tbl(d_table)
    both = Table([[e_table, d_table]], colWidths=[90*mm, 90*mm])
    both.setStyle(TableStyle([("VALIGN", (0,0), (-1,-1), "TOP"), ("LEFTPADDING", (0,0), (-1,-1), 0), ("RIGHTPADDING", (0,0), (-1,-1), 0)]))
    story.append(both)
    story.append(Spacer(1, 10))

    # Net pay box
    net = compute.get("net_monthly", 0)
    net_table = Table([["NET PAY", _rupee(net)]], colWidths=[90*mm, 90*mm])
    net_table.setStyle(TableStyle([
        ("FONTSIZE", (0,0), (-1,-1), 14),
        ("BACKGROUND", (0,0), (-1,-1), colors.HexColor("#D96C5B")),
        ("TEXTCOLOR", (0,0), (-1,-1), colors.white),
        ("FONTNAME", (0,0), (-1,-1), "Helvetica-Bold"),
        ("ALIGN", (1,0), (1,0), "RIGHT"),
        ("TOPPADDING", (0,0), (-1,-1), 10),
        ("BOTTOMPADDING", (0,0), (-1,-1), 10),
        ("LEFTPADDING", (0,0), (-1,-1), 12),
        ("RIGHTPADDING", (0,0), (-1,-1), 12),
    ]))
    story.append(net_table)
    story.append(Spacer(1, 12))

    # Employer provisions (CTC breakup)
    if provisions:
        prov_rows = [["Employer Contributions (CTC)", "Amount"]] + [[p.get("name",""), _rupee(p.get("amount",0))] for p in provisions]
        prov_rows.append(["Total CTC", _rupee(compute.get("ctc_monthly", 0))])
        p_table = Table(prov_rows, colWidths=[130*mm, 50*mm])
        _style_tbl(p_table)
        story.append(p_table)
        story.append(Spacer(1, 10))

    # Footer
    story.append(Paragraph("This is a computer-generated payslip and does not require a signature.", lbl))

    doc.build(story)
    return buf.getvalue()


@api_router.post("/payslip/generate")
async def generate_payslip(data: dict, current_user: dict = Depends(get_current_user)):
    """
    Generate a Payslip PDF for an employee for a given month.
    Payload: {employee_id, month, year, components (optional override), pay_type, use_statutory_auto, ...}
    Returns: PDF bytes (application/pdf).
    """
    employee_id = data.get("employee_id")
    month = int(data.get("month") or datetime.now(timezone.utc).month)
    year = int(data.get("year") or datetime.now(timezone.utc).year)

    # Permission: employees can only generate their own
    if current_user["role"] != UserRole.ADMIN and current_user["id"] != employee_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    emp = await db.employees.find_one({"id": employee_id}, {"_id": 0}) or {}
    if not emp:
        # Fallback: user record
        emp = await db.users.find_one({"id": employee_id}, {"_id": 0}) or {}

    # Load department name
    dept_name = "-"
    if emp.get("department_id"):
        dept = await db.departments.find_one({"id": emp["department_id"]}, {"_id": 0})
        if dept: dept_name = dept.get("name", "-")

    # Load org
    org = await db.organization.find_one({}, {"_id": 0}) or {"name": "Organization"}

    # Load assigned salary template if components not provided
    components = data.get("components")
    assignment = await db.salary_assignments.find_one({"employee_id": employee_id}, {"_id": 0})
    tmpl = None
    if assignment and assignment.get("salary_template_id"):
        tmpl = await db.salary_templates.find_one({"id": assignment["salary_template_id"]}, {"_id": 0})
    if components is None and tmpl:
        components = tmpl.get("components", [])
    if components is None:
        components = []

    # Compute via the same logic
    compute_payload = {
        "components": components,
        "pay_type": data.get("pay_type") or (tmpl.get("pay_type") if tmpl else "monthly"),
        "use_statutory_auto": data.get("use_statutory_auto", True) if tmpl is None else tmpl.get("use_statutory_auto", True),
        "pf_template_id": (tmpl or {}).get("pf_template_id"),
        "esic_template_id": (tmpl or {}).get("esic_template_id"),
        "pt_template_id": (tmpl or {}).get("pt_template_id"),
        "lwf_template_id": (tmpl or {}).get("lwf_template_id"),
        "tds_template_id": (tmpl or {}).get("tds_template_id"),
    }
    compute = await compute_salary(compute_payload, current_user)

    import calendar as _cal
    payslip = {
        "employee": {
            "full_name": emp.get("full_name") or emp.get("email", "Employee"),
            "employee_code": emp.get("employee_code", emp.get("id", "")[:8]),
            "designation": emp.get("designation", "-"),
            "department_name": dept_name,
            "pan": emp.get("pan", "-"),
            "pf_number": emp.get("pf_number", "-"),
            "bank_account": emp.get("bank_account", "-"),
        },
        "organization": {"name": org.get("name", "Organization")},
        "period": {"month": _cal.month_name[month], "year": year},
        "compute": compute,
    }

    pdf_bytes = _build_payslip_pdf(payslip)
    filename = f"payslip_{employee_id}_{year}_{month:02d}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


# ══════════════════════  MONTHLY PAYROLL RUN  ══════════════════════

@api_router.get("/payroll/runs")
async def list_payroll_runs(current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    return await db.payroll_runs.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)


@api_router.get("/payroll/runs/{run_id}")
async def get_payroll_run(run_id: str, current_user: dict = Depends(get_current_user)):
    run = await db.payroll_runs.find_one({"id": run_id}, {"_id": 0})
    if not run:
        raise HTTPException(status_code=404, detail="Payroll run not found")
    if current_user["role"] != UserRole.ADMIN:
        # filter to own line
        run["line_items"] = [li for li in run.get("line_items", []) if li.get("employee_id") == current_user["id"]]
    return run


@api_router.post("/payroll/runs")
async def create_payroll_run(data: dict, current_user: dict = Depends(get_current_user)):
    """
    Create a Monthly Payroll Run.
    Payload: {month, year, employee_ids (optional — else all active employees)}
    For each employee:
      - Loads assigned salary template (or skips if none)
      - Computes salary via /salary-compute logic
      - Records line item
    """
    require_admin(current_user)
    month = int(data.get("month") or datetime.now(timezone.utc).month)
    year = int(data.get("year") or datetime.now(timezone.utc).year)
    employee_ids = data.get("employee_ids") or []

    if not employee_ids:
        emps = await db.employees.find({"status": "active"}, {"_id": 0}).to_list(5000)
        employee_ids = [e["id"] for e in emps]

    line_items = []
    total_gross = total_deductions = total_net = total_ctc = 0.0
    skipped = []

    for emp_id in employee_ids:
        assignment = await db.salary_assignments.find_one({"employee_id": emp_id}, {"_id": 0})
        if not assignment or not assignment.get("salary_template_id"):
            skipped.append({"employee_id": emp_id, "reason": "no salary template assigned"})
            continue
        tmpl = await db.salary_templates.find_one({"id": assignment["salary_template_id"]}, {"_id": 0})
        if not tmpl:
            skipped.append({"employee_id": emp_id, "reason": "template not found"})
            continue

        compute_payload = {
            "components": tmpl.get("components", []),
            "pay_type": tmpl.get("pay_type", "monthly"),
            "use_statutory_auto": tmpl.get("use_statutory_auto", True),
            "pf_template_id": tmpl.get("pf_template_id"),
            "esic_template_id": tmpl.get("esic_template_id"),
            "pt_template_id": tmpl.get("pt_template_id"),
            "lwf_template_id": tmpl.get("lwf_template_id"),
            "tds_template_id": tmpl.get("tds_template_id"),
        }
        result = await compute_salary(compute_payload, current_user)

        emp = await db.employees.find_one({"id": emp_id}, {"_id": 0}) or {}
        line_items.append({
            "employee_id": emp_id,
            "full_name": emp.get("full_name", ""),
            "employee_code": emp.get("employee_code", ""),
            "template_id": tmpl.get("id"),
            "template_name": tmpl.get("template_name"),
            "gross_monthly": result.get("gross_monthly", 0),
            "total_deductions_monthly": result.get("total_deductions_monthly", 0),
            "total_provisions_monthly": result.get("total_provisions_monthly", 0),
            "net_monthly": result.get("net_monthly", 0),
            "ctc_monthly": result.get("ctc_monthly", 0),
            "earnings": result.get("earnings", []),
            "deductions": result.get("deductions", []),
            "provisions": result.get("provisions", []),
            "statutory": result.get("statutory", {}),
        })
        total_gross += result.get("gross_monthly", 0)
        total_deductions += result.get("total_deductions_monthly", 0)
        total_net += result.get("net_monthly", 0)
        total_ctc += result.get("ctc_monthly", 0)

    run = {
        "id": str(uuid.uuid4()),
        "month": month, "year": year,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user["id"],
        "status": "draft",  # draft | frozen | paid
        "employee_count": len(line_items),
        "skipped": skipped,
        "totals": {
            "gross": round(total_gross, 2),
            "deductions": round(total_deductions, 2),
            "net": round(total_net, 2),
            "ctc": round(total_ctc, 2),
        },
        "line_items": line_items,
    }
    await db.payroll_runs.insert_one(run)
    return {k: v for k, v in run.items() if k != "_id"}


@api_router.put("/payroll/runs/{run_id}/freeze")
async def freeze_payroll_run(run_id: str, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    await db.payroll_runs.update_one({"id": run_id}, {"$set": {"status": "frozen",
                                                                "frozen_at": datetime.now(timezone.utc).isoformat()}})
    return {"message": "Payroll run frozen"}


@api_router.put("/payroll/runs/{run_id}/mark-paid")
async def mark_payroll_paid(run_id: str, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    await db.payroll_runs.update_one({"id": run_id}, {"$set": {"status": "paid",
                                                                "paid_at": datetime.now(timezone.utc).isoformat()}})
    return {"message": "Payroll run marked paid"}


@api_router.delete("/payroll/runs/{run_id}")
async def delete_payroll_run(run_id: str, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    # Only allow deletion if still in draft
    run = await db.payroll_runs.find_one({"id": run_id}, {"_id": 0})
    if run and run.get("status") != "draft":
        raise HTTPException(status_code=400, detail="Cannot delete frozen/paid run")
    await db.payroll_runs.delete_one({"id": run_id})
    return {"message": "Payroll run deleted"}


# ══════════════════════  FULL & FINAL SETTLEMENT  ══════════════════════

@api_router.post("/fnf/compute")
async def compute_fnf(data: dict, current_user: dict = Depends(get_current_user)):
    """
    Full & Final Settlement computation on employee exit.
    Payload: {employee_id, last_working_date, last_drawn_basic, years_of_service,
              leave_balance_days, unpaid_salary_days, notice_period_days_pending,
              exit_reason, notice_period_recovery_per_day, pending_reimbursements, outstanding_loans}
    """
    require_admin(current_user)
    employee_id = data.get("employee_id")
    last_wage = float(data.get("last_drawn_basic") or 0)
    years = float(data.get("years_of_service") or 0)
    leave_days = float(data.get("leave_balance_days") or 0)
    unpaid_days = float(data.get("unpaid_salary_days") or 0)
    notice_pending = float(data.get("notice_period_days_pending") or 0)
    exit_reason = data.get("exit_reason") or "resignation"
    reimburse = float(data.get("pending_reimbursements") or 0)
    loans = float(data.get("outstanding_loans") or 0)

    # 1. Unpaid salary
    per_day = last_wage / 26 if last_wage else 0
    unpaid_salary = round(per_day * unpaid_days, 2)

    # 2. Leave encashment (leave balance × per day basic)
    leave_encashment = round(per_day * leave_days, 2)

    # 3. Gratuity (if eligible)
    g = calculate_gratuity(last_wage, years, exit_reason)

    # 4. Notice period recovery (if shortfall)
    notice_recovery = round(per_day * notice_pending, 2)

    # 5. Outstanding dues = loans + advance remaining
    # Already summed in `loans` input

    total_payable = unpaid_salary + leave_encashment + (g.get("gratuity_amount", 0) if g.get("eligible") else 0) + reimburse
    total_recoverable = notice_recovery + loans
    net_fnf = round(total_payable - total_recoverable, 2)

    return {
        "employee_id": employee_id,
        "exit_reason": exit_reason,
        "payable": {
            "unpaid_salary": unpaid_salary,
            "leave_encashment": leave_encashment,
            "gratuity": g,
            "pending_reimbursements": reimburse,
            "total_payable": round(total_payable, 2),
        },
        "recoverable": {
            "notice_period_recovery": notice_recovery,
            "outstanding_loans_advances": loans,
            "total_recoverable": round(total_recoverable, 2),
        },
        "net_fnf": net_fnf,
        "status": "payable" if net_fnf >= 0 else "recoverable",
    }


# ── Mount ──
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

@app.on_event("startup")
async def startup_event():
    try:
        init_storage()
        logger.info("Storage initialized at startup")
    except Exception as e:
        logger.warning(f"Storage init failed at startup: {e}")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
