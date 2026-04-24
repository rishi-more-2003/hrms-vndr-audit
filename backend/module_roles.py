"""Helpers + endpoints for module-role management across Saffron modules.

Roles per module:
- hrms: admin | employee
- vendor_audit: vendor | principal_employer | auditor
- register_maker: admin
- internal_audit: admin
- consultancy: admin | employee | consultant

Back-compat: legacy `user.role` ("admin" / "employee") applies to hrms by default.
A user can have roles across multiple modules via `module_roles: dict`.
"""
from __future__ import annotations
from typing import Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from saffron_saas import db, get_user, MODULES

# Role catalogue per module
MODULE_ROLES = {
    "hrms": ["admin", "employee"],
    "vendor_audit": ["vendor", "principal_employer", "auditor"],
    "register_maker": ["admin"],
    "internal_audit": ["admin"],
    "consultancy": ["admin", "employee", "consultant"],
}

module_role_router = APIRouter(prefix="/module-roles", tags=["module-roles"])


def _legacy_role_for_module(user: dict, module_key: str) -> Optional[str]:
    """Map legacy global `role` to a module role for backward compat."""
    legacy = user.get("role")
    if not legacy:
        return None
    if module_key == "hrms":
        return legacy if legacy in ("admin", "employee") else None
    if legacy == "admin":
        # Global admin gets admin equivalent in any module that has 'admin' role
        if "admin" in MODULE_ROLES.get(module_key, []):
            return "admin"
        # Vendor audit has no plain 'admin' — admin maps to principal_employer
        if module_key == "vendor_audit":
            return "principal_employer"
    return None


def resolve_module_role(user: dict, module_key: str) -> Optional[str]:
    """Find the role a user has in a given module, considering both module_roles map and legacy role."""
    mr = (user.get("module_roles") or {}).get(module_key)
    if mr:
        return mr
    return _legacy_role_for_module(user, module_key)


def accessible_modules(user: dict) -> List[Dict[str, str]]:
    """Return [{module, role}] for every module this user can access."""
    out = []
    module_roles = user.get("module_roles") or {}
    seen = set()
    for mk, role in module_roles.items():
        if role:
            out.append({"module": mk, "role": role}); seen.add(mk)
    # Legacy fallback — only add HRMS if not already present
    legacy = user.get("role")
    if legacy in ("admin", "employee") and "hrms" not in seen:
        out.append({"module": "hrms", "role": legacy}); seen.add("hrms")
    # Also give legacy admin access to all other modules the org has enabled (that's how admin worked before module_roles existed)
    if legacy == "admin":
        org_id = user.get("organization_id")
        # Note: org module enablement is checked downstream — we just expose the possibility here
        for mk in MODULE_ROLES.keys():
            if mk not in seen and "admin" in MODULE_ROLES[mk]:
                out.append({"module": mk, "role": "admin"}); seen.add(mk)
            elif mk not in seen and mk == "vendor_audit":
                out.append({"module": mk, "role": "principal_employer"}); seen.add(mk)
    return out


# ── Endpoints ──
class GrantModuleAccessRequest(BaseModel):
    module: str
    role: str


@module_role_router.get("/me")
async def my_module_roles(u=Depends(get_user)):
    """What modules+roles do I have?"""
    org_id = u.get("organization_id")
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0}) if org_id else None
    enabled = [k for k, v in (org or {}).get("modules", {}).items() if v]
    access = accessible_modules(u)
    # Intersect with org-enabled modules
    visible = [a for a in access if a["module"] in enabled]
    return {"access": visible, "enabled_modules": enabled, "organization": org}


@module_role_router.get("/org-users")
async def list_org_users(u=Depends(get_user)):
    """Admin-only: list all users in the org with their module roles."""
    if u.get("role") != "admin" and "admin" not in (u.get("module_roles") or {}).values():
        raise HTTPException(403, "Admin only")
    org_id = u.get("organization_id")
    if not org_id:
        raise HTTPException(400, "No organization context")
    users = await db.users.find({"organization_id": org_id}, {"_id": 0, "password": 0}).to_list(500)
    return users


@module_role_router.put("/users/{user_id}/grant")
async def grant_module_access(user_id: str, body: GrantModuleAccessRequest, u=Depends(get_user)):
    """Admin-only: grant/update a module role for a user in their org."""
    if u.get("role") != "admin" and "admin" not in (u.get("module_roles") or {}).values():
        raise HTTPException(403, "Admin only")
    if body.module not in MODULE_ROLES:
        raise HTTPException(400, f"Unknown module. Must be one of: {list(MODULE_ROLES.keys())}")
    if body.role not in MODULE_ROLES[body.module]:
        raise HTTPException(400, f"Invalid role for {body.module}. Must be one of: {MODULE_ROLES[body.module]}")
    target = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
    if not target:
        raise HTTPException(404, "User not found")
    if target.get("organization_id") != u.get("organization_id"):
        raise HTTPException(403, "Cannot modify users outside your organization")
    await db.users.update_one({"id": user_id}, {"$set": {f"module_roles.{body.module}": body.role}})
    return {"ok": True}


@module_role_router.delete("/users/{user_id}/revoke/{module}")
async def revoke_module_access(user_id: str, module: str, u=Depends(get_user)):
    if u.get("role") != "admin" and "admin" not in (u.get("module_roles") or {}).values():
        raise HTTPException(403, "Admin only")
    target = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not target or target.get("organization_id") != u.get("organization_id"):
        raise HTTPException(404, "User not found")
    await db.users.update_one({"id": user_id}, {"$unset": {f"module_roles.{module}": ""}})
    return {"ok": True}


@module_role_router.get("/meta/roles")
async def role_catalogue():
    return {"module_roles": MODULE_ROLES, "modules": [m["key"] for m in MODULES]}
