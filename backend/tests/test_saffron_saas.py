"""Saffron SaaS — multi-module platform sanity tests."""
import os, sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import requests, secrets

BASE = os.environ.get("TEST_BASE_URL") or "http://localhost:8001"
API = f"{BASE}/api"


def test_meta_modules_public():
    r = requests.get(f"{API}/saas/meta/modules")
    assert r.status_code == 200
    d = r.json()
    assert d["brand"]["name"] == "Saffron Services"
    assert len(d["modules"]) == 5
    keys = {m["key"] for m in d["modules"]}
    assert keys == {"hrms", "vendor_audit", "register_maker", "internal_audit", "consultancy"}
    assert len(d["bundles"]) == 3


def test_contact_lead():
    r = requests.post(f"{API}/saas/contact", json={
        "name": "Test Lead", "email": f"lead_{secrets.token_hex(3)}@test.com",
        "message": "Hello"
    })
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_signup_and_trial():
    email = f"trial_{secrets.token_hex(4)}@test.com"
    r = requests.post(f"{API}/saas/signup", json={
        "company_name": f"TestCo_{secrets.token_hex(2)}", "admin_name": "Alice",
        "admin_email": email, "password": "Str0ngPassword!",
        "selected_modules": ["hrms", "vendor_audit"],
    })
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["organization"]["subscription_status"] == "trial"
    assert d["organization"]["modules"]["hrms"] is True
    assert d["organization"]["modules"]["register_maker"] is False
    # Duplicate email -> 400
    r2 = requests.post(f"{API}/saas/signup", json={
        "company_name": "X", "admin_name": "A", "admin_email": email, "password": "pass1234",
    })
    assert r2.status_code == 400


def test_platform_admin_login_and_gating():
    r = requests.post(f"{API}/platform-admin/auth/login", json={
        "email": "founder@saffronservices.in", "password": "saffron123",
    })
    assert r.status_code == 200
    pt = r.json()["access_token"]
    # Stats OK
    r = requests.get(f"{API}/platform-admin/stats", headers={"Authorization": f"Bearer {pt}"})
    assert r.status_code == 200
    # Wrong-role gate: admin token shouldn't access platform-admin endpoints
    admin = requests.post(f"{API}/auth/login", json={"email": "admin@hrms.com", "password": "admin123", "login_as": "admin"}).json()["access_token"]
    r = requests.get(f"{API}/platform-admin/stats", headers={"Authorization": f"Bearer {admin}"})
    assert r.status_code == 403


def test_me_organization_for_logged_in_admin():
    admin = requests.post(f"{API}/auth/login", json={"email": "admin@hrms.com", "password": "admin123", "login_as": "admin"}).json()["access_token"]
    r = requests.get(f"{API}/saas/me/organization", headers={"Authorization": f"Bearer {admin}"})
    assert r.status_code == 200
    d = r.json()
    assert d["organization"] is not None
    assert "enabled_modules" in d
