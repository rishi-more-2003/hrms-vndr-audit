"""Phase 10 — Complementary security tests for Employee Self-Service.
Focuses on: malicious payload filtering, salary/statutory immutability via /me endpoints,
change-request approval audit, cross-employee data isolation, admin queue listing.
"""
import requests, pytest

def _url():
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().rstrip("/")

BASE_URL = _url()


def _login(email, pwd, login_as=None):
    body = {"email": email, "password": pwd}
    if login_as:
        body["login_as"] = login_as
    r = requests.post(f"{BASE_URL}/api/auth/login", json=body, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def admin_hdr():
    return _login("admin@hrms.com", "admin123", login_as="admin")


@pytest.fixture(scope="module")
def emp_hdr():
    return _login("employee@hrms.com", "emp123")


@pytest.fixture(scope="module")
def priya_hdr():
    return _login("priya@hrms.com", "priya123")


# ────────────────────────────────────────────────────────────
# Security: salary / statutory / KYC / hierarchy immutability
# ────────────────────────────────────────────────────────────
class TestSecurityImmutableFields:
    def test_malicious_salary_mutation_ignored(self, emp_hdr):
        # Snapshot BEFORE
        before = requests.get(f"{BASE_URL}/api/me/employee-profile", headers=emp_hdr).json()

        malicious = {
            "salary_ctc": 99999999,
            "basic": 50000,
            "pf_member": False,
            "esic_member": False,
            "uan_no": "999999999999",
            "pan": "ZZZZZ9999Z",
            "aadhaar": "999999999999",
            "employee_code": "HACKED",
            "first_name": "Hacker",
            "leave_approver_id": "self-approve-id",
            "salary_ac_no": "0000000000",
            "salary_ac_ifsc": "HACK0000001",
            "blood_group": "B+",  # legitimate editable
        }
        r = requests.put(f"{BASE_URL}/api/me/employee-profile", json=malicious, headers=emp_hdr)
        assert r.status_code == 200
        updated = r.json().get("updated_fields", [])
        # Only blood_group should be updated
        assert "blood_group" in updated
        for forbidden in ["salary_ctc", "basic", "pf_member", "esic_member", "uan_no",
                          "pan", "aadhaar", "employee_code", "first_name",
                          "leave_approver_id", "salary_ac_no", "salary_ac_ifsc"]:
            assert forbidden not in updated, f"{forbidden} must NOT be updated via self-service"

        # Snapshot AFTER — every protected field unchanged
        after = requests.get(f"{BASE_URL}/api/me/employee-profile", headers=emp_hdr).json()
        for k in ["salary_ctc", "basic", "pf_member", "esic_member", "uan_no", "pan",
                  "aadhaar", "employee_code", "leave_approver_id", "salary_ac_no",
                  "salary_ac_ifsc"]:
            assert before.get(k) == after.get(k), f"{k} was mutated via self-service! before={before.get(k)} after={after.get(k)}"

    def test_get_profile_no_mongo_id_leak(self, emp_hdr):
        r = requests.get(f"{BASE_URL}/api/me/employee-profile", headers=emp_hdr)
        assert r.status_code == 200
        assert "_id" not in r.json(), "_id must not leak to frontend"

    def test_change_request_rejects_editable_field(self, emp_hdr):
        # qualification is EDITABLE so it should NOT go through change-request path
        r = requests.post(f"{BASE_URL}/api/me/change-requests",
                          json={"changes": {"qualification": "PhD"}}, headers=emp_hdr)
        assert r.status_code == 400

    def test_change_request_accepts_protected_field(self, emp_hdr):
        r = requests.post(f"{BASE_URL}/api/me/change-requests",
                          json={"changes": {"pan": "ABCDE1111X"}, "reason": "pan updated"},
                          headers=emp_hdr)
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "pending"
        assert d["changes"]["pan"] == "ABCDE1111X"
        assert "_id" not in d

    def test_unauth_cannot_access_me_endpoints(self):
        for ep in ["/api/me/employee-profile", "/api/me/effective-policies",
                   "/api/me/change-requests"]:
            r = requests.get(f"{BASE_URL}{ep}")
            assert r.status_code in (401, 403), f"{ep} should require auth; got {r.status_code}"


# ────────────────────────────────────────────────────────────
# Admin approve flow applies to profile + audit log present
# ────────────────────────────────────────────────────────────
class TestAdminApproveFlow:
    def test_admin_can_list_pending_change_requests(self, emp_hdr, admin_hdr):
        # Create CR as employee
        requests.post(f"{BASE_URL}/api/me/change-requests",
                      json={"changes": {"pan": "QUEUE1234X"}, "reason": "queue test"},
                      headers=emp_hdr)
        r = requests.get(f"{BASE_URL}/api/employee-change-requests?status=pending", headers=admin_hdr)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert any(it.get("status") == "pending" for it in items), "At least one pending CR expected"

    def test_admin_approve_applies_to_profile_and_audit(self, emp_hdr, admin_hdr):
        # Create
        cr = requests.post(f"{BASE_URL}/api/me/change-requests",
                           json={"changes": {"pan": "APRVD1234X"}, "reason": "approve test"},
                           headers=emp_hdr).json()
        rid = cr["id"]
        # Approve
        r = requests.put(f"{BASE_URL}/api/employee-change-requests/{rid}/approve",
                         headers=admin_hdr)
        assert r.status_code == 200
        # Verify applied to profile (PAN is protected so only approval can set it)
        prof = requests.get(f"{BASE_URL}/api/me/employee-profile", headers=emp_hdr).json()
        assert prof.get("pan") == "APRVD1234X"
        # Audit log entry
        logs = requests.get(f"{BASE_URL}/api/audit-log?entity=employee", headers=admin_hdr).json()
        assert any(l.get("action") in ("change_request_approve", "change_request_approved",
                                        "change_request_applied", "self_profile_update") for l in logs)

    def test_admin_reject_leaves_profile_unchanged(self, emp_hdr, admin_hdr):
        before_pan = requests.get(f"{BASE_URL}/api/me/employee-profile",
                                  headers=emp_hdr).json().get("pan")
        cr = requests.post(f"{BASE_URL}/api/me/change-requests",
                           json={"changes": {"pan": "REJECT999X"}, "reason": "reject test"},
                           headers=emp_hdr).json()
        rid = cr["id"]
        r = requests.put(f"{BASE_URL}/api/employee-change-requests/{rid}/reject",
                         json={"reason": "insufficient proof"}, headers=admin_hdr)
        assert r.status_code == 200
        after_pan = requests.get(f"{BASE_URL}/api/me/employee-profile",
                                 headers=emp_hdr).json().get("pan")
        assert before_pan == after_pan  # unchanged


# ────────────────────────────────────────────────────────────
# Cross-user isolation: employee sees ONLY own change requests
# ────────────────────────────────────────────────────────────
class TestIsolation:
    def test_priya_cannot_see_rahul_change_requests(self, emp_hdr, priya_hdr):
        # Rahul (employee@) creates a uniquely identifiable CR
        requests.post(f"{BASE_URL}/api/me/change-requests",
                      json={"changes": {"pan": "RAHUL5555X"}, "reason": "rahul only"},
                      headers=emp_hdr)
        priya_reqs = requests.get(f"{BASE_URL}/api/me/change-requests",
                                  headers=priya_hdr).json()
        assert not any((r.get("changes") or {}).get("pan") == "RAHUL5555X" for r in priya_reqs), \
            "Priya must NOT see Rahul's change requests"

    def test_priya_cannot_access_admin_change_request_queue(self, priya_hdr):
        r = requests.get(f"{BASE_URL}/api/employee-change-requests?status=pending",
                         headers=priya_hdr)
        assert r.status_code in (401, 403), \
            f"Non-admin must not list admin CR queue; got {r.status_code}"


# ────────────────────────────────────────────────────────────
# Effective policies surface all 8 keys and includes approval hierarchy
# ────────────────────────────────────────────────────────────
class TestEffectivePolicies:
    def test_shape(self, emp_hdr):
        r = requests.get(f"{BASE_URL}/api/me/effective-policies", headers=emp_hdr)
        assert r.status_code == 200
        d = r.json()
        assert set(d.get("policies", {}).keys()) >= {"leave", "attendance", "overtime",
                                                       "reimbursement", "bonus", "gratuity"}
        assert "approval_hierarchy" in d
        assert "sources" in d


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
