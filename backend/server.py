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
