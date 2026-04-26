"""E2E tests for Register Maker — Phase A (categories, templates, AI study).

Uses live HTTP against REACT_APP_BACKEND_URL like other Saffron test files.
LLM is exercised live for one happy-path test (cheap on Gemini Flash).
Other tests stay deterministic / catch validation errors only.
"""
import io
import os
import time
import pytest
import requests
import openpyxl

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login {email} -> {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login("admin@hrms.com", "admin123")


@pytest.fixture(scope="module")
def emp_token():
    return _login("priya@hrms.com", "priya123")  # plain employee, no module roles


def _h(t):
    return {"Authorization": f"Bearer {t}"}


def _xlsx_bytes():
    """Build a richer test register so the LLM has enough signal to extract the schema."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Wage Register Form A"
    ws["A1"] = "Wage Register — Form A (Minimum Wages Act, 1948)"
    ws.merge_cells("A1:F1")
    ws["A2"] = "Employer Name:"
    ws["A3"] = "Establishment Address:"
    ws["A4"] = "Wage Period:"
    headers = ["S.No", "Employee Name", "Designation", "Days Worked",
               "Basic Wage (Rs)", "DA (Rs)", "Gross Wage (Rs)",
               "Deductions (Rs)", "Net Paid (Rs)", "Date of Payment"]
    for i, h in enumerate(headers, start=1):
        ws.cell(row=6, column=i).value = h
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


@pytest.fixture(scope="module", autouse=True)
def cleanup_at_end(admin_token):
    """Wipe register-maker test data created by this module at the end."""
    yield
    h = _h(admin_token)
    # delete templates first (FK to categories)
    tpls = requests.get(f"{BASE_URL}/api/register-maker/templates", headers=h).json()
    for t in tpls:
        if t.get("name", "").startswith("PYTEST "):
            requests.delete(f"{BASE_URL}/api/register-maker/templates/{t['id']}", headers=h)
    cats = requests.get(f"{BASE_URL}/api/register-maker/categories", headers=h).json()
    for c in cats:
        if c.get("name", "").startswith("PYTEST "):
            requests.delete(f"{BASE_URL}/api/register-maker/categories/{c['id']}", headers=h)


def test_meta_reference(admin_token):
    r = requests.get(f"{BASE_URL}/api/register-maker/meta/reference", headers=_h(admin_token))
    assert r.status_code == 200
    d = r.json()
    assert "Maharashtra" in d["states"]
    assert any("Minimum Wages" in lw for lw in d["laws"])


def test_employee_blocked(emp_token):
    r = requests.get(f"{BASE_URL}/api/register-maker/categories", headers=_h(emp_token))
    assert r.status_code == 403


def test_unauth_blocked():
    r = requests.get(f"{BASE_URL}/api/register-maker/categories")
    assert r.status_code in (401, 403)


def test_category_crud(admin_token):
    h = _h(admin_token)
    r = requests.post(f"{BASE_URL}/api/register-maker/categories", headers=h, json={
        "name": "PYTEST Cat A", "state": "Maharashtra", "law": "Minimum Wages Act, 1948",
        "tags": ["wage", "monthly"],
    })
    assert r.status_code == 200, r.text
    cat = r.json()
    assert cat["state"] == "Maharashtra" and "wage" in cat["tags"]

    r = requests.get(f"{BASE_URL}/api/register-maker/categories", headers=h)
    items = r.json()
    found = next((x for x in items if x["id"] == cat["id"]), None)
    assert found and found["template_count"] == 0

    r = requests.put(f"{BASE_URL}/api/register-maker/categories/{cat['id']}", headers=h, json={"name": "PYTEST Renamed"})
    assert r.status_code == 200 and r.json()["name"] == "PYTEST Renamed"

    r = requests.delete(f"{BASE_URL}/api/register-maker/categories/{cat['id']}", headers=h)
    assert r.status_code == 200


def test_invalid_parent(admin_token):
    r = requests.post(f"{BASE_URL}/api/register-maker/categories", headers=_h(admin_token),
                      json={"name": "PYTEST X", "parent_id": "non-existent"})
    assert r.status_code == 400


def test_template_upload_and_ai_study_live(admin_token):
    """Live AI study (Gemini Flash) — verify schema is extracted with confidence > 0.5."""
    h = _h(admin_token)
    cat = requests.post(f"{BASE_URL}/api/register-maker/categories", headers=h,
                        json={"name": "PYTEST Live"}).json()
    files = {"file": ("test.xlsx", _xlsx_bytes(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    data = {"name": "PYTEST Live Form", "category_id": cat["id"], "register_form_code": "TEST"}
    r = requests.post(f"{BASE_URL}/api/register-maker/templates", headers=h, files=files, data=data)
    assert r.status_code == 200, r.text
    tpl = r.json()
    assert tpl["ai_status"] == "pending"
    assert "file_b64" not in tpl

    # Wait for background AI study (Gemini Flash typically responds in 3-15s)
    deadline = time.time() + 60
    final = tpl
    while time.time() < deadline:
        time.sleep(2)
        rr = requests.get(f"{BASE_URL}/api/register-maker/templates/{tpl['id']}", headers=h)
        final = rr.json()
        if final.get("ai_status") in ("ready", "failed"):
            break

    assert final["ai_status"] == "ready", f"ai_status={final.get('ai_status')} err={final.get('ai_error')}"
    sch = final["ai_schema"]
    assert sch["columns"] and len(sch["columns"]) >= 3, "expected at least 3 columns extracted"
    assert sch["confidence"] > 0.5
    assert final["ai_cost_inr"] >= 0


def test_template_upload_invalid_filetype(admin_token):
    h = _h(admin_token)
    cat = requests.post(f"{BASE_URL}/api/register-maker/categories", headers=h,
                        json={"name": "PYTEST FT"}).json()
    files = {"file": ("test.txt", b"hello", "text/plain")}
    data = {"name": "PYTEST X", "category_id": cat["id"]}
    r = requests.post(f"{BASE_URL}/api/register-maker/templates", headers=h, files=files, data=data)
    assert r.status_code == 400


def test_template_upload_invalid_category(admin_token):
    files = {"file": ("test.xlsx", _xlsx_bytes(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    data = {"name": "PYTEST X", "category_id": "no-such-cat"}
    r = requests.post(f"{BASE_URL}/api/register-maker/templates", headers=_h(admin_token), files=files, data=data)
    assert r.status_code == 400


def test_category_delete_blocked_when_templates_exist(admin_token):
    h = _h(admin_token)
    cat = requests.post(f"{BASE_URL}/api/register-maker/categories", headers=h,
                        json={"name": "PYTEST DEL"}).json()
    files = {"file": ("t.xlsx", _xlsx_bytes(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    data = {"name": "PYTEST T1", "category_id": cat["id"]}
    requests.post(f"{BASE_URL}/api/register-maker/templates", headers=h, files=files, data=data)
    r = requests.delete(f"{BASE_URL}/api/register-maker/categories/{cat['id']}", headers=h)
    assert r.status_code == 400 and "Cannot delete" in r.json()["detail"]


def test_stats(admin_token):
    r = requests.get(f"{BASE_URL}/api/register-maker/stats", headers=_h(admin_token))
    assert r.status_code == 200
    d = r.json()
    assert "categories" in d and "templates" in d and "ai_usage" in d


def test_estimate_inr_costs():
    """Direct unit test on the cost estimator (no HTTP)."""
    import sys
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    sys.path.insert(0, "/app/backend")
    from register_maker.ai_schema import estimate_inr, GEMINI_FLASH, CLAUDE_SONNET
    flash = estimate_inr(GEMINI_FLASH, 800, 1000)
    sonnet = estimate_inr(CLAUDE_SONNET, 800, 1000)
    assert 0 < flash < 1.0
    assert sonnet > flash and sonnet < 5.0
