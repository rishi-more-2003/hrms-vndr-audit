"""Tests for Employee Profile v2 — mandatory/unique validation, bulk upload, hierarchy, documents."""
import os, requests, pytest, uuid

def _url():
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().rstrip("/")

BASE_URL = _url()


@pytest.fixture(scope="module")
def hdr():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email":"admin@hrms.com","password":"admin123","login_as":"admin"}, timeout=30)
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _valid_payload():
    suf = uuid.uuid4().hex[:6].upper()
    return {
        "employee_code": f"TST_{suf}",
        "first_name": "Test", "last_name": "User",
        "email": f"test_{suf}@hrms.com",
        "gender": "male", "date_of_birth": "1990-01-01",
        "nationality": "Indian",
        "date_of_joining": "2026-01-01",
        "location_id": "L1", "designation_id": "D1", "department_id": "DEP1",
        "employment_type": "permanent", "phone": f"999{suf}9",
        "salary_payment_mode": "bank",
        "corr_address_line1": "Addr", "corr_address_city": "Mumbai", "corr_address_pincode": "400001",
        "pan": f"ABCDE1{suf[:4]}", "aadhaar": f"12341234{suf[:4]}",
    }


class TestMeta:
    def test_last_code(self, hdr):
        r = requests.get(f"{BASE_URL}/api/employees/meta/last-code", headers=hdr)
        assert r.status_code == 200
        assert "last_code" in r.json()

    def test_bulk_template_header(self, hdr):
        r = requests.get(f"{BASE_URL}/api/employees/meta/bulk-upload-template", headers=hdr)
        d = r.json()
        assert "header" in d and "mandatory" in d and "unique" in d
        assert "employee_code" in d["mandatory"]
        assert "uan_no" in d["unique"]


class TestProfileCRUD:
    def test_mandatory_validation(self, hdr):
        r = requests.post(f"{BASE_URL}/api/employees/profile", json={"first_name": "x"}, headers=hdr)
        assert r.status_code == 400
        d = r.json()["detail"]
        assert "fields" in d
        assert "employee_code" in d["fields"]

    def test_create_and_fetch(self, hdr):
        p = _valid_payload()
        r = requests.post(f"{BASE_URL}/api/employees/profile", json=p, headers=hdr)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["employee_code"] == p["employee_code"]
        # Fetch full profile
        r2 = requests.get(f"{BASE_URL}/api/employees/{d['id']}/profile", headers=hdr)
        assert r2.status_code == 200
        assert r2.json()["pan"] == p["pan"]

    def test_unique_employee_code_blocked(self, hdr):
        p1 = _valid_payload()
        requests.post(f"{BASE_URL}/api/employees/profile", json=p1, headers=hdr)
        # Second with same code but different unique fields
        p2 = _valid_payload()
        p2["employee_code"] = p1["employee_code"]
        r = requests.post(f"{BASE_URL}/api/employees/profile", json=p2, headers=hdr)
        assert r.status_code == 409
        viol = r.json()["detail"]["violations"]
        assert any(v["field"] == "employee_code" for v in viol)

    def test_unique_pan_blocked(self, hdr):
        p1 = _valid_payload()
        requests.post(f"{BASE_URL}/api/employees/profile", json=p1, headers=hdr)
        p2 = _valid_payload()
        p2["pan"] = p1["pan"]
        r = requests.post(f"{BASE_URL}/api/employees/profile", json=p2, headers=hdr)
        assert r.status_code == 409
        viol = r.json()["detail"]["violations"]
        assert any(v["field"] == "pan" for v in viol)

    def test_rejoin_exemption(self, hdr):
        """When an employee is terminated, their unique fields can be reused."""
        p1 = _valid_payload()
        r1 = requests.post(f"{BASE_URL}/api/employees/profile", json=p1, headers=hdr)
        emp_id = r1.json()["id"]
        # Terminate them
        r_upd = requests.put(f"{BASE_URL}/api/employees/{emp_id}/profile",
                             json={**p1, "status": "terminated"}, headers=hdr)
        assert r_upd.status_code == 200
        # New employee with same code should now succeed
        p2 = _valid_payload()
        p2["employee_code"] = p1["employee_code"]
        p2["pan"] = p1["pan"]
        r2 = requests.post(f"{BASE_URL}/api/employees/profile", json=p2, headers=hdr)
        assert r2.status_code == 200, r2.text


class TestBulkUpload:
    def test_bulk_create(self, hdr):
        rows = [_valid_payload() for _ in range(3)]
        r = requests.post(f"{BASE_URL}/api/employees/bulk-upload",
                          json={"rows": rows, "continue_on_error": True}, headers=hdr)
        assert r.status_code == 200
        d = r.json()
        assert d["total"] == 3
        assert d["succeeded"] == 3

    def test_bulk_partial_failure(self, hdr):
        p1 = _valid_payload()
        requests.post(f"{BASE_URL}/api/employees/profile", json=p1, headers=hdr)
        # Mix: 1 dup + 1 good
        rows = [p1, _valid_payload()]
        r = requests.post(f"{BASE_URL}/api/employees/bulk-upload",
                          json={"rows": rows, "continue_on_error": True}, headers=hdr)
        d = r.json()
        assert d["succeeded"] == 1 and d["failed"] == 1


class TestHierarchy:
    def test_set_approval_hierarchy(self, hdr):
        p = _valid_payload()
        r = requests.post(f"{BASE_URL}/api/employees/profile", json=p, headers=hdr)
        emp_id = r.json()["id"]
        r2 = requests.put(f"{BASE_URL}/api/employees/{emp_id}/approval-hierarchy",
                          json={"leave_approver_id": "mgr-1", "overtime_approver_id": "mgr-2"}, headers=hdr)
        assert r2.status_code == 200
        d = r2.json()["set"]
        assert d["leave_approver_id"] == "mgr-1"
        assert d["overtime_approver_id"] == "mgr-2"


class TestDocuments:
    def test_document_crud(self, hdr):
        p = _valid_payload()
        r = requests.post(f"{BASE_URL}/api/employees/profile", json=p, headers=hdr)
        emp_id = r.json()["id"]
        # Add
        r2 = requests.post(f"{BASE_URL}/api/employees/{emp_id}/documents",
                           json={"file_url": "https://x.com/f.pdf", "file_name": "test.pdf",
                                 "category": "recruitment"}, headers=hdr)
        assert r2.status_code == 200
        doc_id = r2.json()["id"]
        # List
        r3 = requests.get(f"{BASE_URL}/api/employees/{emp_id}/documents", headers=hdr)
        assert len(r3.json()) >= 1
        # Filter
        r4 = requests.get(f"{BASE_URL}/api/employees/{emp_id}/documents?category=recruitment", headers=hdr)
        assert len(r4.json()) >= 1
        # Delete
        r5 = requests.delete(f"{BASE_URL}/api/employees/{emp_id}/documents/{doc_id}", headers=hdr)
        assert r5.status_code == 200


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
