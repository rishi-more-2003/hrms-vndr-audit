"""Saffron Services — Multi-module SaaS platform.
Organizations, subscriptions, module gating, self-serve signup, platform admin.
"""
from __future__ import annotations
import os
import re
import uuid
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, field_validator
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from jose import jwt

_mongo_url = os.environ["MONGO_URL"]
_client = AsyncIOMotorClient(_mongo_url)
db = _client[os.environ["DB_NAME"]]

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
SECRET_KEY = os.environ.get("SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
PLATFORM_ADMIN_EMAIL = os.environ.get("PLATFORM_ADMIN_EMAIL", "founder@saffronservices.in")
PLATFORM_ADMIN_PASSWORD = os.environ.get("PLATFORM_ADMIN_PASSWORD", "saffron123")

MODULES = [
    {"key": "hrms", "label": "HRMS", "price_monthly": 199, "description": "Complete HR management — payroll, attendance, leave, employee self-service", "tagline": "Pay & people, simplified", "icon": "Users"},
    {"key": "vendor_audit", "label": "Vendor Labour Audit", "price_monthly": 299, "description": "Automated compliance audits for contractor workforces — PF, ESIC, PT, MLWF", "tagline": "Virtual statutory auditor", "icon": "ShieldCheck"},
    {"key": "register_maker", "label": "Register Maker", "price_monthly": 99, "description": "Auto-generate statutory registers across central + state labour laws from a single Excel", "tagline": "Registers in 60 seconds", "icon": "Scroll"},
    {"key": "internal_audit", "label": "Internal Labour Audit", "price_monthly": 249, "description": "Continuous self-audit engine for your own payroll & statutory compliance", "tagline": "Audit-ready, always", "icon": "CheckSquare"},
    {"key": "consultancy", "label": "Consultancy Desk", "price_monthly": 149, "description": "Raise tickets with our labour-law consultants — PF/ESIC/PT queries, document vault", "tagline": "Experts on speed-dial", "icon": "ChatCircleText"},
]

BUNDLES = [
    {"key": "starter", "label": "Starter", "modules": ["hrms"], "price_monthly": 199, "save": 0},
    {"key": "compliance", "label": "Compliance", "modules": ["vendor_audit", "register_maker", "internal_audit"], "price_monthly": 549, "save": 98},
    {"key": "complete", "label": "Complete SaffronSuite", "modules": ["hrms", "vendor_audit", "register_maker", "internal_audit", "consultancy"], "price_monthly": 799, "save": 296, "featured": True},
]

DEFAULT_ORG_ID = "saffron-default-org"


# ── Routes ──
saas_router = APIRouter(prefix="/saas", tags=["saffron-saas"])
platform_router = APIRouter(prefix="/platform-admin", tags=["platform-admin"])

from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
security = HTTPBearer()


async def get_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        uid = payload.get("sub")
        user = await db.users.find_one({"id": uid}, {"_id": 0, "password": 0})
        if not user:
            raise HTTPException(401, "User not found")
        return user
    except Exception:
        raise HTTPException(401, "Invalid token")


def _mint_token(user_id: str, role: str, **extra) -> str:
    payload = {"sub": user_id, "role": role, "exp": datetime.now(timezone.utc) + timedelta(hours=24), **extra}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


async def ensure_default_org():
    """Stamps legacy data with a default org so existing admin+employees keep working."""
    existing = await db.organizations.find_one({"id": DEFAULT_ORG_ID})
    if existing:
        return existing
    now = datetime.now(timezone.utc).isoformat()
    org = {
        "id": DEFAULT_ORG_ID, "name": "Saffron Services (Platform Default)", "slug": "saffron-default",
        "subscription_status": "active", "plan": "complete", "trial_ends_at": None,
        "modules": {m["key"]: True for m in MODULES},
        "contact_email": PLATFORM_ADMIN_EMAIL, "created_at": now,
        "source": "legacy-migration",
    }
    await db.organizations.insert_one(org)
    # Backfill users without org_id
    await db.users.update_many({"organization_id": {"$exists": False}}, {"$set": {"organization_id": DEFAULT_ORG_ID}})
    await db.employees.update_many({"organization_id": {"$exists": False}}, {"$set": {"organization_id": DEFAULT_ORG_ID}})
    await db.contractors.update_many({"organization_id": {"$exists": False}}, {"$set": {"organization_id": DEFAULT_ORG_ID}})
    org.pop("_id", None)
    return org


async def ensure_platform_admin():
    """Idempotent platform-admin seed."""
    existing = await db.users.find_one({"email": PLATFORM_ADMIN_EMAIL})
    now = datetime.now(timezone.utc).isoformat()
    if existing:
        if existing.get("role") != "platform_admin":
            await db.users.update_one({"id": existing["id"]}, {"$set": {"role": "platform_admin"}})
        return
    await db.users.insert_one({
        "id": str(uuid.uuid4()), "email": PLATFORM_ADMIN_EMAIL, "full_name": "Saffron Founder",
        "role": "platform_admin", "password": pwd_context.hash(PLATFORM_ADMIN_PASSWORD),
        "must_change_password": False, "created_at": now, "permissions": None,
        "organization_id": None,
    })


# ══════════════════════════ PUBLIC — META (landing page) ══════════════════════════
@saas_router.get("/meta/modules")
async def get_modules():
    return {"modules": MODULES, "bundles": BUNDLES, "brand": {
        "name": "Saffron Services", "tagline": "India's unified labour-law compliance platform",
        "support_email": "hello@saffronservices.in",
    }}


class ContactLead(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None
    company: Optional[str] = None
    message: str
    interested_modules: Optional[List[str]] = []


@saas_router.post("/contact")
async def submit_contact(body: ContactLead):
    lead = body.model_dump()
    lead["id"] = str(uuid.uuid4())
    lead["created_at"] = datetime.now(timezone.utc).isoformat()
    lead["status"] = "new"
    await db.contact_leads.insert_one(lead)
    return {"ok": True, "message": "We'll get back to you within one business day."}


# ══════════════════════════ DEMO / CONSULTANCY BOOKING ══════════════════════════
class DemoRequest(BaseModel):
    name: str
    email: EmailStr
    phone: str
    company: str
    designation: Optional[str] = None
    company_size: Optional[str] = None         # "1-10", "11-50", "51-200", "201-500", "500+"
    industry: Optional[str] = None
    interested_modules: List[str] = []         # ["hrms","vendor_audit","register_maker","internal_audit","consultancy"]
    request_type: str = "demo"                 # "demo" | "consultancy"
    preferred_date: str                        # ISO date YYYY-MM-DD
    preferred_slot: str                        # one of TIME_SLOTS keys
    timezone: str = "Asia/Kolkata"
    notes: Optional[str] = None
    referral_source: Optional[str] = None      # "google","linkedin","referral","other"


# Business hours: Mon–Sat, 10:00–18:00 IST. Saturdays we cap at 14:00.
TIME_SLOTS_WEEKDAY = ["10:00", "10:30", "11:00", "11:30", "12:00", "12:30",
                      "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30"]
TIME_SLOTS_SATURDAY = ["10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30"]


@saas_router.get("/demo-request/availability")
async def demo_availability(date: str):
    """Return open time slots for a given date. Public endpoint.

    `date` = YYYY-MM-DD. Returns empty list for Sundays / past dates.
    Already-booked slots are removed.
    """
    try:
        d = datetime.strptime(date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(400, "date must be YYYY-MM-DD")
    today = datetime.now(timezone.utc).date()
    if d < today:
        return {"date": date, "slots": [], "reason": "past"}
    weekday = d.weekday()  # 0=Mon, 6=Sun
    if weekday == 6:
        return {"date": date, "slots": [], "reason": "closed_sunday"}
    slots = TIME_SLOTS_SATURDAY if weekday == 5 else TIME_SLOTS_WEEKDAY
    # Remove already-booked slots (simple double-booking guard)
    booked = await db.demo_requests.find(
        {"preferred_date": date, "status": {"$in": ["new", "scheduled", "confirmed"]}},
        {"_id": 0, "preferred_slot": 1},
    ).to_list(200)
    booked_slots = {b["preferred_slot"] for b in booked}
    open_slots = [s for s in slots if s not in booked_slots]
    return {"date": date, "weekday": weekday, "slots": open_slots, "booked_count": len(booked_slots)}


@saas_router.post("/demo-request")
async def submit_demo_request(body: DemoRequest):
    # Validate preferred_date is not in the past + slot is in our table
    try:
        d = datetime.strptime(body.preferred_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(400, "preferred_date must be YYYY-MM-DD")
    today = datetime.now(timezone.utc).date()
    if d < today:
        raise HTTPException(400, "Cannot book a slot in the past")
    weekday = d.weekday()
    if weekday == 6:
        raise HTTPException(400, "We are closed on Sundays — please pick another day")
    valid_slots = TIME_SLOTS_SATURDAY if weekday == 5 else TIME_SLOTS_WEEKDAY
    if body.preferred_slot not in valid_slots:
        raise HTTPException(400, "Selected time slot is not available on that day")
    # Reject duplicate slot
    clash = await db.demo_requests.find_one({
        "preferred_date": body.preferred_date, "preferred_slot": body.preferred_slot,
        "status": {"$in": ["new", "scheduled", "confirmed"]},
    }, {"_id": 0, "id": 1})
    if clash:
        raise HTTPException(409, "That slot was just booked — please pick another one")

    doc = body.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    doc["status"] = "new"            # new → scheduled → confirmed → completed | cancelled
    doc["assigned_to"] = None
    await db.demo_requests.insert_one(doc)
    # Drop a copy in the legacy contact_leads stream too (for the existing leads dashboard)
    legacy = {
        "id": doc["id"],
        "name": doc["name"], "email": doc["email"], "phone": doc.get("phone"),
        "company": doc.get("company"), "message": doc.get("notes") or f"Demo requested for {body.preferred_date} {body.preferred_slot}",
        "interested_modules": doc.get("interested_modules") or [],
        "created_at": doc["created_at"], "status": "new",
        "lead_type": "demo_request",
    }
    await db.contact_leads.insert_one(legacy)

    return {"ok": True, "message": f"Booked! We'll confirm by email within 1 business day for {body.preferred_date} at {body.preferred_slot} IST.",
            "id": doc["id"]}


# ══════════════════════════ SELF-SERVE SIGNUP (14-day trial) ══════════════════════════
class SignupRequest(BaseModel):
    company_name: str
    admin_name: str
    admin_email: EmailStr
    password: str
    phone: Optional[str] = None
    industry: Optional[str] = None
    size: Optional[str] = None
    selected_modules: Optional[List[str]] = None  # if None -> all modules (full trial)

    @field_validator("password")
    @classmethod
    def _pw_len(cls, v):
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


def _slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s or secrets.token_hex(4)


@saas_router.post("/signup")
async def signup(body: SignupRequest):
    if await db.users.find_one({"email": body.admin_email}):
        raise HTTPException(400, f"A user with email {body.admin_email} already exists")
    now = datetime.now(timezone.utc)
    trial_end = (now + timedelta(days=14)).isoformat()
    org_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())
    slug_base = _slugify(body.company_name)
    slug = slug_base
    i = 1
    while await db.organizations.find_one({"slug": slug}):
        i += 1; slug = f"{slug_base}-{i}"
    enabled_keys = body.selected_modules or [m["key"] for m in MODULES]
    modules_map = {m["key"]: (m["key"] in enabled_keys) for m in MODULES}
    await db.organizations.insert_one({
        "id": org_id, "name": body.company_name, "slug": slug,
        "industry": body.industry, "size": body.size,
        "contact_email": body.admin_email, "contact_phone": body.phone,
        "subscription_status": "trial", "trial_ends_at": trial_end,
        "plan": "trial", "modules": modules_map,
        "created_at": now.isoformat(), "source": "self-serve",
    })
    await db.users.insert_one({
        "id": user_id, "email": body.admin_email, "full_name": body.admin_name,
        "role": "admin", "password": pwd_context.hash(body.password),
        "organization_id": org_id, "must_change_password": False,
        "created_at": now.isoformat(), "permissions": None, "phone": body.phone,
    })
    token = _mint_token(user_id, "admin", org=org_id)
    return {
        "access_token": token, "token_type": "bearer",
        "user": {"id": user_id, "email": body.admin_email, "full_name": body.admin_name, "role": "admin"},
        "organization": {"id": org_id, "name": body.company_name, "slug": slug,
                         "subscription_status": "trial", "trial_ends_at": trial_end, "modules": modules_map},
    }


# ══════════════════════════ USER-CONTEXT: my org + modules ══════════════════════════
@saas_router.get("/me/organization")
async def my_org(u=Depends(get_user)):
    oid = u.get("organization_id")
    if not oid:
        oid = DEFAULT_ORG_ID
    org = await db.organizations.find_one({"id": oid}, {"_id": 0})
    if not org:
        await ensure_default_org()
        org = await db.organizations.find_one({"id": DEFAULT_ORG_ID}, {"_id": 0})
    # Compute available modules
    mods = org.get("modules", {}) if org else {}
    trial_ends = org.get("trial_ends_at") if org else None
    expired = False
    if org and org.get("subscription_status") == "trial" and trial_ends:
        try:
            if datetime.fromisoformat(trial_ends.replace("Z", "+00:00")) < datetime.now(timezone.utc):
                expired = True
        except Exception:
            pass
    return {
        "organization": org, "trial_expired": expired,
        "enabled_modules": [k for k, v in mods.items() if v],
        "all_modules": MODULES,
    }


# ══════════════════════════ PLATFORM ADMIN ══════════════════════════
def require_platform_admin(u):
    if u.get("role") != "platform_admin":
        raise HTTPException(403, "Platform admin only")


class PlatformLoginRequest(BaseModel):
    email: EmailStr
    password: str


@platform_router.post("/auth/login")
async def platform_login(body: PlatformLoginRequest):
    u = await db.users.find_one({"email": body.email, "role": "platform_admin"}, {"_id": 0})
    if not u or not pwd_context.verify(body.password, u["password"]):
        raise HTTPException(401, "Invalid credentials")
    token = _mint_token(u["id"], "platform_admin")
    return {"access_token": token, "token_type": "bearer",
            "user": {"id": u["id"], "email": u["email"], "full_name": u["full_name"], "role": "platform_admin"}}


@platform_router.get("/organizations")
async def list_orgs(u=Depends(get_user)):
    require_platform_admin(u)
    orgs = await db.organizations.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    # Attach user count per org
    for o in orgs:
        o["user_count"] = await db.users.count_documents({"organization_id": o["id"]})
    return orgs


class ModuleToggleRequest(BaseModel):
    modules: dict  # {hrms: bool, vendor_audit: bool, ...}


@platform_router.put("/organizations/{org_id}/modules")
async def update_modules(org_id: str, body: ModuleToggleRequest, u=Depends(get_user)):
    require_platform_admin(u)
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    if not org: raise HTTPException(404, "Organization not found")
    updated_modules = {**org.get("modules", {}), **body.modules}
    await db.organizations.update_one({"id": org_id}, {"$set": {
        "modules": updated_modules, "updated_at": datetime.now(timezone.utc).isoformat(),
    }})
    return {"ok": True, "modules": updated_modules}


class SubscriptionUpdateRequest(BaseModel):
    subscription_status: str  # trial | active | expired | canceled
    plan: Optional[str] = None  # starter | compliance | complete | custom
    trial_ends_at: Optional[str] = None
    notes: Optional[str] = None


@platform_router.put("/organizations/{org_id}/subscription")
async def update_subscription(org_id: str, body: SubscriptionUpdateRequest, u=Depends(get_user)):
    require_platform_admin(u)
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    if not org: raise HTTPException(404, "Organization not found")
    patch = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    patch["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.organizations.update_one({"id": org_id}, {"$set": patch})
    return {"ok": True, **patch}


@platform_router.get("/contact-leads")
async def list_leads(u=Depends(get_user)):
    require_platform_admin(u)
    return await db.contact_leads.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)


@platform_router.put("/contact-leads/{lead_id}")
async def update_lead(lead_id: str, body: dict, u=Depends(get_user)):
    require_platform_admin(u)
    patch = {k: v for k, v in body.items() if v is not None}
    patch["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.contact_leads.update_one({"id": lead_id}, {"$set": patch})
    return {"ok": True}


@platform_router.get("/demo-requests")
async def list_demo_requests(u=Depends(get_user), status: Optional[str] = None):
    """List demo / consultancy bookings. Optional ?status=new|scheduled|confirmed|completed|cancelled."""
    require_platform_admin(u)
    q = {}
    if status:
        q["status"] = status
    return await db.demo_requests.find(q, {"_id": 0}).sort("preferred_date", -1).to_list(500)


@platform_router.put("/demo-requests/{req_id}")
async def update_demo_request(req_id: str, body: dict, u=Depends(get_user)):
    """Update status / assigned_to / internal notes on a demo request."""
    require_platform_admin(u)
    allowed = {k: v for k, v in body.items() if k in ("status", "assigned_to", "internal_notes")}
    if not allowed:
        raise HTTPException(400, "Nothing to update")
    allowed["updated_at"] = datetime.now(timezone.utc).isoformat()
    res = await db.demo_requests.update_one({"id": req_id}, {"$set": allowed})
    if res.matched_count == 0:
        raise HTTPException(404, "Demo request not found")
    return {"ok": True}


@platform_router.get("/stats")
async def platform_stats(u=Depends(get_user)):
    require_platform_admin(u)
    total_orgs = await db.organizations.count_documents({})
    trial_orgs = await db.organizations.count_documents({"subscription_status": "trial"})
    active_orgs = await db.organizations.count_documents({"subscription_status": "active"})
    leads = await db.contact_leads.count_documents({"status": "new"})
    new_demos = await db.demo_requests.count_documents({"status": "new"})
    upcoming_demos = await db.demo_requests.count_documents({
        "status": {"$in": ["new", "scheduled", "confirmed"]},
        "preferred_date": {"$gte": datetime.now(timezone.utc).date().isoformat()},
    })
    return {
        "total_organizations": total_orgs,
        "trial": trial_orgs, "active": active_orgs,
        "new_leads": leads,
        "new_demo_requests": new_demos,
        "upcoming_demos": upcoming_demos,
    }



@platform_router.get("/ai-config")
async def platform_ai_config(u=Depends(get_user)):
    """View active LLM routing configuration (per-phase provider + model)."""
    require_platform_admin(u)
    from ai_providers import get_active_config
    return get_active_config()


@platform_router.get("/ai-usage")
async def platform_ai_usage(u=Depends(get_user), days: int = 30):
    """Aggregate AI usage cost across all calls in the last `days`."""
    require_platform_admin(u)
    from ai_providers.usage_logger import aggregate_usage
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    return await aggregate_usage({"created_at": {"$gte": cutoff}})
