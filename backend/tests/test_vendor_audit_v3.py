"""Tests for Vendor Audit V3: email outbox, audit schedules, preview/impersonate."""
import sys, os, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import asyncio
import pytest
import requests
import secrets
from datetime import datetime, timedelta, timezone

BASE = os.environ.get("TEST_BASE_URL") or "http://localhost:8001"
API = f"{BASE}/api"


def _admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": "admin@hrms.com", "password": "admin123", "login_as": "admin"})
    return r.json()["access_token"]


def _auth(t): return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def admin():
    return _admin_token()


@pytest.fixture
def contractor(admin):
    email = f"test_{secrets.token_hex(4)}@example.com"
    r = requests.post(f"{API}/vendor-audit/contractors", headers=_auth(admin), json={
        "name": f"TestVendor_{secrets.token_hex(2)}",
        "contact_person": "Test Person",
        "contact_email": email,
        "state": "MAHARASHTRA",
    })
    assert r.status_code == 200, r.text
    data = r.json()
    yield {"id": data["contractor"]["id"], "email": email, "user_id": data["contractor"]["user_id"]}
    requests.delete(f"{API}/vendor-audit/contractors/{data['contractor']['id']}", headers=_auth(admin))


def test_welcome_email_generated_on_create(admin, contractor):
    r = requests.get(f"{API}/vendor-audit/email-outbox", headers=_auth(admin), params={"kind": "welcome"})
    assert r.status_code == 200
    emails = r.json()
    assert any(e["to"] == contractor["email"] and e["kind"] == "welcome" for e in emails)


def test_schedule_crud(admin, contractor):
    today = datetime.now().date()
    tomorrow = today + timedelta(days=1)
    r = requests.put(f"{API}/vendor-audit/contractors/{contractor['id']}/schedules", headers=_auth(admin), json={
        "schedules": [
            {"wage_month": "APR-2026", "window_open_date": today.isoformat(), "window_close_date": tomorrow.isoformat()},
            {"wage_month": "MAY-2026", "window_open_date": (today + timedelta(days=30)).isoformat(), "window_close_date": (today + timedelta(days=40)).isoformat()},
        ]
    })
    assert r.status_code == 200
    assert r.json()["inserted"] == 2
    # Upsert same — should be 0 new
    r = requests.put(f"{API}/vendor-audit/contractors/{contractor['id']}/schedules", headers=_auth(admin), json={
        "schedules": [{"wage_month": "APR-2026", "window_open_date": today.isoformat(), "window_close_date": tomorrow.isoformat()}]
    })
    assert r.json()["inserted"] == 0
    # List
    r = requests.get(f"{API}/vendor-audit/contractors/{contractor['id']}/schedules", headers=_auth(admin))
    scheds = r.json()
    assert len(scheds) == 2


def test_scheduler_run_now_opens_window(admin, contractor):
    today = datetime.now().date()
    requests.put(f"{API}/vendor-audit/contractors/{contractor['id']}/schedules", headers=_auth(admin), json={
        "schedules": [{"wage_month": "JUN-2026", "window_open_date": today.isoformat(), "window_close_date": (today + timedelta(days=5)).isoformat()}]
    })
    r = requests.post(f"{API}/vendor-audit/scheduler/run-now", headers=_auth(admin))
    assert r.status_code == 200
    result = r.json()
    assert result["opened"] >= 1
    # Audit created
    r = requests.get(f"{API}/vendor-audit/audits", headers=_auth(admin), params={"contractor_id": contractor["id"]})
    audits = r.json()
    assert any(a["wage_month"] == "JUN-2026" for a in audits)
    # Schedule now 'open'
    r = requests.get(f"{API}/vendor-audit/contractors/{contractor['id']}/schedules", headers=_auth(admin))
    scheds = r.json()
    jun = [s for s in scheds if s["wage_month"] == "JUN-2026"][0]
    assert jun["status"] == "open"
    # Outbox has audit_open email
    r = requests.get(f"{API}/vendor-audit/email-outbox", headers=_auth(admin), params={"kind": "audit_open"})
    assert any(e["meta"].get("contractor_id") == contractor["id"] and e["meta"].get("wage_month") == "JUN-2026" for e in r.json())


def test_preview_session_is_readonly(admin, contractor):
    r = requests.post(f"{API}/vendor-audit/contractors/{contractor['id']}/preview-session", headers=_auth(admin))
    assert r.status_code == 200
    data = r.json()
    assert data["mode"] == "preview"
    ptoken = data["access_token"]
    # Read OK
    r = requests.get(f"{API}/vendor-audit/audits", headers=_auth(ptoken))
    assert r.status_code == 200
    # Write BLOCKED
    r = requests.post(f"{API}/vendor-audit/audits/start", headers=_auth(ptoken),
                     json={"wage_month": "DEC-2099", "state": "MAHARASHTRA"})
    assert r.status_code == 403
    assert "preview" in r.json()["detail"].lower()


def test_impersonate_session_has_full_access(admin, contractor):
    r = requests.post(f"{API}/vendor-audit/contractors/{contractor['id']}/impersonate-session", headers=_auth(admin))
    assert r.status_code == 200
    data = r.json()
    assert data["mode"] == "impersonate"
    itoken = data["access_token"]
    # Write OK
    r = requests.post(f"{API}/vendor-audit/audits/start", headers=_auth(itoken),
                     json={"wage_month": "NOV-2099", "state": "MAHARASHTRA"})
    assert r.status_code == 200
    # Impersonation log has entry
    r = requests.get(f"{API}/vendor-audit/impersonation-log", headers=_auth(admin))
    logs = r.json()
    assert any(l["contractor_id"] == contractor["id"] and l["kind"] == "impersonate" for l in logs)


def test_contractor_cannot_access_preview_endpoint(admin, contractor):
    # Login as the contractor and ensure they can't hit the preview endpoint
    # Reset their password first to get a known one
    r = requests.post(f"{API}/vendor-audit/contractors/{contractor['id']}/reset-password", headers=_auth(admin))
    new_pass = r.json()["temp_password"]
    lr = requests.post(f"{API}/contractor/auth/login", json={"email": contractor["email"], "password": new_pass})
    ctoken = lr.json()["access_token"]
    r = requests.post(f"{API}/vendor-audit/contractors/{contractor['id']}/preview-session", headers=_auth(ctoken))
    assert r.status_code == 403
