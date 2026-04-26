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
    # Delete in reverse FK order: generations → data-sources → templates → categories
    for ep in ("generations", "data-sources", "templates", "categories"):
        items = requests.get(f"{BASE_URL}/api/register-maker/{ep}", headers=h).json()
        for it in items:
            label = it.get("label") or it.get("name") or ""
            if "PYTEST" in label:
                requests.delete(f"{BASE_URL}/api/register-maker/{ep}/{it['id']}", headers=h)


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


# ════════════════ PHASE B — Data sheets + Generation ════════════════

def _data_xlsx_bytes():
    """A small payroll data sheet with 4 employees."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Payroll Data"
    ws["A1"] = "Payroll — March 2026"
    ws["A2"] = "Establishment: Acme Manufacturing Pvt Ltd, Pune, MH"
    headers = ["Emp Code", "Employee Name", "Designation", "Days Worked",
               "Basic", "DA", "Gross", "Deductions", "Net Pay", "Pay Date"]
    for i, h in enumerate(headers, 1):
        ws.cell(row=4, column=i).value = h
    rows = [
        ("E001", "Rahul", "Operator", 26, 15000, 5000, 20000, 2400, 17600, "2026-03-31"),
        ("E002", "Priya", "Supervisor", 26, 22000, 6000, 28000, 3360, 24640, "2026-03-31"),
    ]
    for ri, row in enumerate(rows, 5):
        for ci, v in enumerate(row, 1):
            ws.cell(row=ri, column=ci).value = v
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_data_source_upload_and_normalize_live(admin_token):
    h = _h(admin_token)
    files = {"file": ("data.xlsx", _data_xlsx_bytes(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    data = {"label": "PYTEST Mar26 Payroll"}
    r = requests.post(f"{BASE_URL}/api/register-maker/data-sources", headers=h, files=files, data=data)
    assert r.status_code == 200, r.text
    ds = r.json()
    assert ds["ai_status"] == "pending"
    assert "file_b64" not in ds
    # Wait for AI normalization
    deadline = time.time() + 60
    final = ds
    while time.time() < deadline:
        time.sleep(2)
        rr = requests.get(f"{BASE_URL}/api/register-maker/data-sources/{ds['id']}", headers=h)
        final = rr.json()
        if final.get("ai_status") in ("ready", "failed"):
            break
    assert final["ai_status"] == "ready", f"err={final.get('ai_error')}"
    norm = final.get("normalized") or {}
    assert len(norm.get("records") or []) >= 1
    assert any("name" in (k or "") for k in (norm.get("available_fields") or []))


def test_data_source_invalid_filetype(admin_token):
    files = {"file": ("data.txt", b"hello", "text/plain")}
    r = requests.post(f"{BASE_URL}/api/register-maker/data-sources", headers=_h(admin_token), files=files)
    assert r.status_code == 400


def test_full_generation_pipeline_live(admin_token):
    """End-to-end: category → template → data sheet → generation → download."""
    h = _h(admin_token)
    # Category
    cat = requests.post(f"{BASE_URL}/api/register-maker/categories", headers=h,
                        json={"name": "PYTEST E2E"}).json()
    # Template
    tfiles = {"file": ("tpl.xlsx", _xlsx_bytes(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    tdata = {"name": "PYTEST E2E Tpl", "category_id": cat["id"], "register_form_code": "Form A"}
    tpl_id = requests.post(f"{BASE_URL}/api/register-maker/templates", headers=h, files=tfiles, data=tdata).json()["id"]
    # Data
    dfiles = {"file": ("data.xlsx", _data_xlsx_bytes(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    ddata = {"label": "PYTEST E2E Data"}
    ds_id = requests.post(f"{BASE_URL}/api/register-maker/data-sources", headers=h, files=dfiles, data=ddata).json()["id"]

    # Wait for both AI studies
    deadline = time.time() + 90
    while time.time() < deadline:
        time.sleep(3)
        ts = requests.get(f"{BASE_URL}/api/register-maker/templates/{tpl_id}", headers=h).json()["ai_status"]
        ds_status = requests.get(f"{BASE_URL}/api/register-maker/data-sources/{ds_id}", headers=h).json()["ai_status"]
        if ts == "ready" and ds_status == "ready":
            break
        if ts == "failed" or ds_status == "failed":
            pytest.fail(f"AI study failed: tpl={ts} ds={ds_status}")

    # Create generation
    gen = requests.post(f"{BASE_URL}/api/register-maker/generations", headers=h, json={
        "data_source_ids": [ds_id], "template_ids": [tpl_id], "label": "PYTEST E2E Gen",
    }).json()
    assert gen["status"] == "queued"
    gen_id = gen["id"]

    # Wait for generation
    deadline = time.time() + 90
    final = gen
    while time.time() < deadline:
        time.sleep(2)
        final = requests.get(f"{BASE_URL}/api/register-maker/generations/{gen_id}", headers=h).json()
        if final["status"] in ("ready", "failed"):
            break
    assert final["status"] == "ready", f"err={final.get('error')}"
    assert len(final["results"]) == 1
    res = final["results"][0]
    assert res["status"] == "ready"
    assert res["rows_written"] >= 1
    assert res["output_id"]

    # Download the output xlsx
    r = requests.get(f"{BASE_URL}/api/register-maker/outputs/{res['output_id']}/download", headers=h)
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    assert len(r.content) > 1000  # non-trivial xlsx
    # Open it and verify structure
    wb = openpyxl.load_workbook(io.BytesIO(r.content))
    ws = wb.active
    assert ws.max_row >= 6  # header + at least 1 data row


def test_generation_rejects_invalid_ids(admin_token):
    r = requests.post(f"{BASE_URL}/api/register-maker/generations", headers=_h(admin_token), json={
        "data_source_ids": ["nope"], "template_ids": ["nope"],
    })
    assert r.status_code == 400


def test_generation_requires_picks(admin_token):
    r = requests.post(f"{BASE_URL}/api/register-maker/generations", headers=_h(admin_token), json={
        "data_source_ids": [], "template_ids": [],
    })
    assert r.status_code == 400


def test_employee_blocked_phase_b(emp_token):
    h = _h(emp_token)
    assert requests.get(f"{BASE_URL}/api/register-maker/data-sources", headers=h).status_code == 403
    assert requests.get(f"{BASE_URL}/api/register-maker/generations", headers=h).status_code == 403

    from register_maker.ai_schema import estimate_inr, GEMINI_FLASH, CLAUDE_SONNET
    flash = estimate_inr(GEMINI_FLASH, 800, 1000)
    sonnet = estimate_inr(CLAUDE_SONNET, 800, 1000)
    assert 0 < flash < 1.0
    assert sonnet > flash and sonnet < 5.0
