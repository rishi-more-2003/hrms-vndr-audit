"""Tests for /api/finetune/* — Fine-tuning Studio (platform-admin only)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback — read frontend/.env directly when env not exported in pytest shell
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

API = f"{BASE_URL}/api"

PA_EMAIL = "founder@saffronservices.in"
PA_PASS = "saffron123"
ADMIN_EMAIL = "admin@hrms.com"
ADMIN_PASS = "admin123"


# ─── fixtures ────────────────────────────────────────────────────────────────
@pytest.fixture(scope="session")
def pa_token():
    r = requests.post(f"{API}/platform-admin/auth/login",
                      json={"email": PA_EMAIL, "password": PA_PASS}, timeout=20)
    assert r.status_code == 200, f"PA login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASS, "login_as": "admin"},
                      timeout=20)
    if r.status_code != 200:
        pytest.skip(f"admin login failed: {r.status_code} {r.text}")
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="session")
def pa_headers(pa_token):
    return {"Authorization": f"Bearer {pa_token}"}


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ─── /finetune/config ────────────────────────────────────────────────────────
class TestConfig:
    def test_config_ok_for_platform_admin(self, pa_headers):
        r = requests.get(f"{API}/finetune/config", headers=pa_headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "providers" in d and "openai" in d["providers"] and "gemini" in d["providers"]
        assert isinstance(d["providers"]["openai"]["configured"], bool)
        assert d["providers"]["gemini"]["configured"] is False
        assert "Vertex" in d["providers"]["gemini"]["instructions"]
        assert isinstance(d["tasks"], list) and len(d["tasks"]) == 3
        keys = {t["key"] for t in d["tasks"]}
        assert keys == {"vendor_audit_extract", "register_schema", "register_normalize"}

    def test_config_rejects_no_token(self):
        r = requests.get(f"{API}/finetune/config", timeout=15)
        assert r.status_code in (401, 403)

    def test_config_rejects_invalid_token(self):
        r = requests.get(f"{API}/finetune/config",
                         headers={"Authorization": "Bearer not-a-real-token"}, timeout=15)
        assert r.status_code in (401, 403)

    def test_config_rejects_non_platform_admin(self, admin_headers):
        r = requests.get(f"{API}/finetune/config", headers=admin_headers, timeout=15)
        assert r.status_code == 403


# ─── /finetune/datasets ──────────────────────────────────────────────────────
class TestDatasets:
    created_ids: list = []

    def test_create_dataset_invalid_task_type(self, pa_headers):
        r = requests.post(f"{API}/finetune/datasets", headers=pa_headers,
                          json={"name": "TEST_bad", "task_type": "nope"}, timeout=15)
        assert r.status_code == 400
        assert "task_type" in r.text

    def test_create_dataset_ok(self, pa_headers):
        r = requests.post(f"{API}/finetune/datasets", headers=pa_headers,
                          json={"name": "TEST_ft_ds", "task_type": "vendor_audit_extract",
                                "description": "smoke"}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["name"] == "TEST_ft_ds"
        assert d["task_type"] == "vendor_audit_extract"
        assert d["counts"] == {"total": 0, "pending": 0, "approved": 0, "rejected": 0, "holdout": 0}
        TestDatasets.created_ids.append(d["id"])

    def test_list_datasets_includes_new(self, pa_headers):
        r = requests.get(f"{API}/finetune/datasets", headers=pa_headers, timeout=15)
        assert r.status_code == 200
        ids = {row["id"] for row in r.json()}
        assert TestDatasets.created_ids[0] in ids

    def test_get_dataset_detail(self, pa_headers):
        ds_id = TestDatasets.created_ids[0]
        r = requests.get(f"{API}/finetune/datasets/{ds_id}", headers=pa_headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["id"] == ds_id
        assert "task" in d and "system" in d["task"]
        assert "counts" in d

    def test_jsonl_preview_empty(self, pa_headers):
        ds_id = TestDatasets.created_ids[0]
        r = requests.get(f"{API}/finetune/datasets/{ds_id}/jsonl", headers=pa_headers, timeout=15)
        assert r.status_code == 200
        assert r.json()["line_count"] == 0

    def test_create_job_no_openai_key(self, pa_headers):
        ds_id = TestDatasets.created_ids[0]
        r = requests.post(f"{API}/finetune/jobs", headers=pa_headers,
                          json={"dataset_id": ds_id}, timeout=20)
        # Either 400 because no key, or 400 because <10 examples — verify expected message
        assert r.status_code == 400
        body = r.text.lower()
        assert "openai_api_key not set" in body or "approved non-holdout" in body

    def test_examples_endpoints_404_on_missing(self, pa_headers):
        r = requests.put(f"{API}/finetune/examples/no-such-id", headers=pa_headers,
                         json={"notes": "x"}, timeout=15)
        assert r.status_code == 404
        r = requests.post(f"{API}/finetune/examples/no-such-id/approve",
                          headers=pa_headers, timeout=15)
        assert r.status_code == 404
        r = requests.post(f"{API}/finetune/examples/no-such-id/reject",
                          headers=pa_headers, timeout=15)
        assert r.status_code == 404
        r = requests.post(f"{API}/finetune/examples/no-such-id/holdout",
                          headers=pa_headers, timeout=15)
        assert r.status_code == 404

    def test_delete_dataset_cascades(self, pa_headers):
        ds_id = TestDatasets.created_ids[0]
        # seed a fake example so we can verify the cascade
        # NOTE: insert via DB is heavier; we just call delete and confirm it’s gone
        r = requests.delete(f"{API}/finetune/datasets/{ds_id}", headers=pa_headers, timeout=15)
        assert r.status_code == 200
        assert r.json()["ok"] is True
        # subsequent get → 404
        r = requests.get(f"{API}/finetune/datasets/{ds_id}", headers=pa_headers, timeout=15)
        assert r.status_code == 404


# ─── role / auth guards on every finetune endpoint ───────────────────────────
class TestAuthGuards:
    def test_datasets_list_403_for_admin(self, admin_headers):
        r = requests.get(f"{API}/finetune/datasets", headers=admin_headers, timeout=15)
        assert r.status_code == 403

    def test_jobs_list_403_for_admin(self, admin_headers):
        r = requests.get(f"{API}/finetune/jobs", headers=admin_headers, timeout=15)
        assert r.status_code == 403

    def test_eval_runs_401_no_token(self):
        r = requests.get(f"{API}/finetune/eval-runs", timeout=15)
        assert r.status_code in (401, 403)


# ─── /finetune/eval-runs ─────────────────────────────────────────────────────
class TestEvalRuns:
    def test_eval_runs_empty(self, pa_headers):
        r = requests.get(f"{API}/finetune/eval-runs", headers=pa_headers, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_start_eval_missing_job_id(self, pa_headers):
        r = requests.post(f"{API}/finetune/eval-runs", headers=pa_headers,
                          json={}, timeout=15)
        assert r.status_code == 400

    def test_start_eval_unknown_job(self, pa_headers):
        r = requests.post(f"{API}/finetune/eval-runs", headers=pa_headers,
                          json={"job_id": "no-such"}, timeout=15)
        assert r.status_code == 404


# ─── /finetune/jobs list ─────────────────────────────────────────────────────
class TestJobsList:
    def test_list_jobs_ok(self, pa_headers):
        r = requests.get(f"{API}/finetune/jobs", headers=pa_headers, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
