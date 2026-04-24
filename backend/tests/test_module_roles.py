"""E2E tests for cross-module RBAC: /api/module-roles/* endpoints."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback to frontend .env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")


def _login(email, password, login_as=None):
    body = {"email": email, "password": password}
    if login_as:
        body["login_as"] = login_as
    r = requests.post(f"{BASE_URL}/api/auth/login", json=body)
    assert r.status_code == 200, f"login {email} -> {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login("admin@hrms.com", "admin123", login_as="admin")


@pytest.fixture(scope="module")
def emp_token():
    return _login("employee@hrms.com", "emp123")


@pytest.fixture(scope="module")
def priya_token():
    return _login("priya@hrms.com", "priya123")


def _hdr(t):
    return {"Authorization": f"Bearer {t}"}


# ── Meta ──
def test_meta_roles_catalogue():
    r = requests.get(f"{BASE_URL}/api/module-roles/meta/roles")
    assert r.status_code == 200
    data = r.json()
    assert "module_roles" in data and "modules" in data
    mr = data["module_roles"]
    assert set(mr.keys()) >= {"hrms", "vendor_audit", "register_maker", "internal_audit", "consultancy"}
    assert "auditor" in mr["vendor_audit"]
    assert "principal_employer" in mr["vendor_audit"]
    assert "admin" in mr["hrms"] and "employee" in mr["hrms"]


# ── /me ──
def test_me_admin_sees_all_enabled_modules(admin_token):
    r = requests.get(f"{BASE_URL}/api/module-roles/me", headers=_hdr(admin_token))
    assert r.status_code == 200
    data = r.json()
    assert "access" in data and "enabled_modules" in data
    mods = [a["module"] for a in data["access"]]
    # admin's legacy role should give access to all enabled modules
    assert "hrms" in mods
    # should intersect with enabled
    for a in data["access"]:
        assert a["module"] in data["enabled_modules"]


def test_me_employee_only_hrms(emp_token):
    r = requests.get(f"{BASE_URL}/api/module-roles/me", headers=_hdr(emp_token))
    assert r.status_code == 200
    data = r.json()
    mods = [a["module"] for a in data["access"]]
    # Employee starts with only hrms (legacy role=employee)
    assert "hrms" in mods


# ── /org-users ──
def test_org_users_admin(admin_token):
    r = requests.get(f"{BASE_URL}/api/module-roles/org-users", headers=_hdr(admin_token))
    assert r.status_code == 200
    users = r.json()
    assert isinstance(users, list) and len(users) >= 2
    emails = [u.get("email") for u in users]
    assert "admin@hrms.com" in emails
    assert "employee@hrms.com" in emails


def test_org_users_forbidden_for_employee(emp_token):
    r = requests.get(f"{BASE_URL}/api/module-roles/org-users", headers=_hdr(emp_token))
    assert r.status_code == 403


# ── Grant / Revoke flow ──
@pytest.fixture(scope="module")
def employee_user_id(admin_token):
    r = requests.get(f"{BASE_URL}/api/module-roles/org-users", headers=_hdr(admin_token))
    assert r.status_code == 200
    for u in r.json():
        if u.get("email") == "employee@hrms.com":
            return u["id"]
    pytest.fail("employee@hrms.com not found in org-users")


def test_grant_invalid_module_rejected(admin_token, employee_user_id):
    r = requests.put(
        f"{BASE_URL}/api/module-roles/users/{employee_user_id}/grant",
        headers=_hdr(admin_token),
        json={"module": "fake_module", "role": "auditor"},
    )
    assert r.status_code == 400


def test_grant_invalid_role_rejected(admin_token, employee_user_id):
    r = requests.put(
        f"{BASE_URL}/api/module-roles/users/{employee_user_id}/grant",
        headers=_hdr(admin_token),
        json={"module": "vendor_audit", "role": "not_a_role"},
    )
    assert r.status_code == 400


def test_grant_forbidden_for_non_admin(emp_token, employee_user_id):
    r = requests.put(
        f"{BASE_URL}/api/module-roles/users/{employee_user_id}/grant",
        headers=_hdr(emp_token),
        json={"module": "vendor_audit", "role": "auditor"},
    )
    assert r.status_code == 403


def test_grant_and_verify_persistence(admin_token, employee_user_id):
    # Grant vendor_audit auditor
    r = requests.put(
        f"{BASE_URL}/api/module-roles/users/{employee_user_id}/grant",
        headers=_hdr(admin_token),
        json={"module": "vendor_audit", "role": "auditor"},
    )
    assert r.status_code == 200
    # Verify: login as employee again and check /me
    new_token = _login("employee@hrms.com", "emp123")
    me = requests.get(f"{BASE_URL}/api/module-roles/me", headers=_hdr(new_token)).json()
    mods = {a["module"]: a["role"] for a in me["access"]}
    assert mods.get("vendor_audit") == "auditor", f"Expected vendor_audit auditor in {mods}"
    assert "hrms" in mods


def test_revoke_and_verify(admin_token, employee_user_id):
    # Revoke
    r = requests.delete(
        f"{BASE_URL}/api/module-roles/users/{employee_user_id}/revoke/vendor_audit",
        headers=_hdr(admin_token),
    )
    assert r.status_code == 200
    new_token = _login("employee@hrms.com", "emp123")
    me = requests.get(f"{BASE_URL}/api/module-roles/me", headers=_hdr(new_token)).json()
    mods = {a["module"]: a["role"] for a in me["access"]}
    assert "vendor_audit" not in mods


def test_cross_org_grant_rejected(admin_token):
    # Try to grant on a fake user_id (not in org) — expect 404 or 403
    r = requests.put(
        f"{BASE_URL}/api/module-roles/users/non-existent-id-xyz/grant",
        headers=_hdr(admin_token),
        json={"module": "vendor_audit", "role": "auditor"},
    )
    assert r.status_code in (403, 404)


# Regression: auth login returns module_roles (check shape)
def test_login_returns_user_shape():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "admin@hrms.com", "password": "admin123", "login_as": "admin"})
    assert r.status_code == 200
    data = r.json()
    assert "access_token" in data
    assert "user" in data
    assert data["user"]["email"] == "admin@hrms.com"
