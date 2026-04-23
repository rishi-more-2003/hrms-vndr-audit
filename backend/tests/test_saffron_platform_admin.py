"""Saffron SaaS — platform admin org/module CRUD persistence tests (iter 14)."""
import os, secrets, requests

BASE = os.environ.get("TEST_BASE_URL") or "http://localhost:8001"
API = f"{BASE}/api"


def _platform_token():
    r = requests.post(f"{API}/platform-admin/auth/login",
                      json={"email": "founder@saffronservices.in", "password": "saffron123"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _admin_token():
    r = requests.post(f"{API}/auth/login",
                      json={"email": "admin@hrms.com", "password": "admin123", "login_as": "admin"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


# ── default org has all 5 modules + active ──
def test_default_org_has_all_modules_active():
    token = _admin_token()
    r = requests.get(f"{API}/saas/me/organization", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    d = r.json()
    org = d["organization"]
    assert org["subscription_status"] == "active"
    for k in ["hrms", "vendor_audit", "register_maker", "internal_audit", "consultancy"]:
        assert org["modules"].get(k) is True, f"{k} should be True on default org"
    assert set(d["enabled_modules"]) >= {"hrms", "vendor_audit", "register_maker", "internal_audit", "consultancy"}


# ── public endpoints don't require auth ──
def test_public_no_auth_required():
    assert requests.get(f"{API}/saas/meta/modules").status_code == 200
    assert requests.post(f"{API}/saas/contact", json={
        "name": "Noauth Lead", "email": f"na_{secrets.token_hex(3)}@test.com",
        "message": "hi"}).status_code == 200
    # Signup public (create temporary org, don't persist - but we can't easily rollback; use throwaway email)
    r = requests.post(f"{API}/saas/signup", json={
        "company_name": f"Public NoAuthCo_{secrets.token_hex(2)}",
        "admin_name": "Pub", "admin_email": f"pub_{secrets.token_hex(3)}@test.com",
        "password": "pass12345",
    })
    assert r.status_code == 200


# ── platform admin: list orgs with user_count ──
def test_list_organizations_has_user_count():
    pt = _platform_token()
    r = requests.get(f"{API}/platform-admin/organizations", headers={"Authorization": f"Bearer {pt}"})
    assert r.status_code == 200
    orgs = r.json()
    assert len(orgs) >= 1
    for o in orgs:
        assert "user_count" in o
        assert "modules" in o


# ── stats endpoint ──
def test_platform_stats():
    pt = _platform_token()
    r = requests.get(f"{API}/platform-admin/stats", headers={"Authorization": f"Bearer {pt}"})
    assert r.status_code == 200
    s = r.json()
    for k in ["total_organizations", "trial", "active", "new_leads"]:
        assert k in s
        assert isinstance(s[k], int)


# ── module toggle persists (create org via signup, toggle, verify) ──
def test_module_toggle_persists():
    # New org
    email = f"toggle_{secrets.token_hex(3)}@test.com"
    r = requests.post(f"{API}/saas/signup", json={
        "company_name": f"ToggleCo_{secrets.token_hex(2)}",
        "admin_name": "Tog", "admin_email": email, "password": "pass12345",
        "selected_modules": ["hrms"],
    })
    assert r.status_code == 200
    org_id = r.json()["organization"]["id"]

    pt = _platform_token()
    # Enable vendor_audit + consultancy
    r = requests.put(f"{API}/platform-admin/organizations/{org_id}/modules",
                     headers={"Authorization": f"Bearer {pt}"},
                     json={"modules": {"vendor_audit": True, "consultancy": True}})
    assert r.status_code == 200
    returned = r.json()["modules"]
    assert returned["vendor_audit"] is True
    assert returned["consultancy"] is True
    assert returned["hrms"] is True  # preserved

    # GET verifies persistence
    r = requests.get(f"{API}/platform-admin/organizations", headers={"Authorization": f"Bearer {pt}"})
    found = next((o for o in r.json() if o["id"] == org_id), None)
    assert found, "org not found in list"
    assert found["modules"]["vendor_audit"] is True
    assert found["modules"]["consultancy"] is True


# ── subscription update persists ──
def test_subscription_update_persists():
    email = f"sub_{secrets.token_hex(3)}@test.com"
    r = requests.post(f"{API}/saas/signup", json={
        "company_name": f"SubCo_{secrets.token_hex(2)}",
        "admin_name": "S", "admin_email": email, "password": "pass12345",
    })
    org_id = r.json()["organization"]["id"]
    pt = _platform_token()
    r = requests.put(f"{API}/platform-admin/organizations/{org_id}/subscription",
                     headers={"Authorization": f"Bearer {pt}"},
                     json={"subscription_status": "active", "plan": "complete"})
    assert r.status_code == 200
    r = requests.get(f"{API}/platform-admin/organizations", headers={"Authorization": f"Bearer {pt}"})
    found = next((o for o in r.json() if o["id"] == org_id), None)
    assert found["subscription_status"] == "active"
    assert found["plan"] == "complete"


# ── security gating for all platform-admin endpoints with regular admin token ──
def test_security_admin_token_blocked_from_all_platform_admin():
    admin = _admin_token()
    h = {"Authorization": f"Bearer {admin}"}
    for path in ["/platform-admin/stats", "/platform-admin/organizations",
                 "/platform-admin/contact-leads"]:
        r = requests.get(f"{API}{path}", headers=h)
        assert r.status_code == 403, f"{path} returned {r.status_code} — expected 403"


# ── signup weak password rejected ──
def test_signup_weak_password_rejected():
    r = requests.post(f"{API}/saas/signup", json={
        "company_name": "Weak", "admin_name": "W",
        "admin_email": f"weak_{secrets.token_hex(3)}@test.com", "password": "short",
    })
    assert r.status_code == 422


# ── contact lead persisted (visible to platform admin) ──
def test_contact_lead_visible_to_platform_admin():
    token_hex = secrets.token_hex(3)
    unique_msg = f"iter14_contact_{token_hex}"
    r = requests.post(f"{API}/saas/contact", json={
        "name": "Iter14 Tester", "email": f"iter14_{token_hex}@test.com",
        "message": unique_msg, "company": "Iter14 Co",
    })
    assert r.status_code == 200
    pt = _platform_token()
    r = requests.get(f"{API}/platform-admin/contact-leads", headers={"Authorization": f"Bearer {pt}"})
    assert r.status_code == 200
    leads = r.json()
    assert any(l.get("message") == unique_msg for l in leads), "contact lead not persisted in DB"
