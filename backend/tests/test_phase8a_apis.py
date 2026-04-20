"""Phase 8A — integration tests hitting real HTTP endpoints through the public URL.
Covers: bonus, gratuity, incentive, advance, loan compute + CRUD, payslip PDF,
payroll runs, FnF compute.
"""
import os
import pytest
import requests

def _read_base_url():
    env = os.environ.get("REACT_APP_BACKEND_URL")
    if env:
        return env.strip().rstrip("/")
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL not configured")


BASE_URL = _read_base_url()

ADMIN = {"email": "admin@hrms.com", "password": "admin123", "login_as": "admin"}
EMP = {"email": "employee@hrms.com", "password": "emp123", "login_as": "employee"}


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed {r.status_code}: {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def admin_token():
    return _login(ADMIN)


@pytest.fixture(scope="session")
def emp_token():
    try:
        return _login(EMP)
    except Exception:
        pytest.skip("employee login unavailable")


@pytest.fixture
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ═══════════════════════  Bonus compute  ═══════════════════════
class TestBonusCompute:
    def test_min_rate(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/bonus/compute", headers=admin_headers,
                          json={"monthly_wage": 18000, "days_worked": 365})
        assert r.status_code == 200
        d = r.json()
        assert d["eligible"] is True
        assert d["bonus_amount"] == 6997.20

    def test_ineligible(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/bonus/compute", headers=admin_headers,
                          json={"monthly_wage": 25000, "days_worked": 365})
        assert r.status_code == 200
        assert r.json()["eligible"] is False

    def test_max_clamp(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/bonus/compute", headers=admin_headers,
                          json={"monthly_wage": 15000, "days_worked": 365, "bonus_rate": 0.5})
        assert r.status_code == 200
        assert r.json()["bonus_rate_applied"] == 0.20


# ═══════════════════════  Gratuity compute  ═══════════════════════
class TestGratuityCompute:
    def test_standard(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/gratuity/compute", headers=admin_headers,
                          json={"last_drawn_wage": 50000, "years_of_service": 7.5,
                                "exit_reason": "resignation"})
        assert r.status_code == 200
        d = r.json()
        assert d["eligible"] is True
        assert d["effective_years"] == 8
        assert d["gratuity_amount"] == 230769.23

    def test_below_5yr(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/gratuity/compute", headers=admin_headers,
                          json={"last_drawn_wage": 50000, "years_of_service": 4.4})
        assert r.json()["eligible"] is False

    def test_death_waiver(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/gratuity/compute", headers=admin_headers,
                          json={"last_drawn_wage": 50000, "years_of_service": 2.5,
                                "exit_reason": "death"})
        assert r.json()["eligible"] is True

    def test_cap(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/gratuity/compute", headers=admin_headers,
                          json={"last_drawn_wage": 200000, "years_of_service": 25})
        d = r.json()
        assert d["cap_applied"] is True
        assert d["gratuity_amount"] == 2000000


# ═══════════════════════  Incentive  ═══════════════════════
class TestIncentiveCompute:
    def test_percentage(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/incentive/compute", headers=admin_headers,
                          json={"achievement_percent": 120, "target_amount": 1000000,
                                "incentive_type": "percentage", "percentage_rate": 5})
        assert r.json()["incentive_amount"] == 60000

    def test_min_not_met(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/incentive/compute", headers=admin_headers,
                          json={"achievement_percent": 40, "target_amount": 1000000,
                                "incentive_type": "fixed", "fixed_amount": 50000,
                                "min_achievement": 50})
        assert r.json()["eligible"] is False


# ═══════════════════════  Advance / Loan compute  ═══════════════════════
class TestAdvanceLoanCompute:
    def test_advance_ok(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/advance/compute", headers=admin_headers,
                          json={"advance_amount": 20000, "monthly_salary": 60000,
                                "repayment_months": 4, "interest_rate_pa": 0})
        d = r.json()
        assert d["approved"] is True
        assert d["monthly_emi"] == 5000.0

    def test_advance_exceeds_max(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/advance/compute", headers=admin_headers,
                          json={"advance_amount": 40000, "monthly_salary": 60000,
                                "repayment_months": 6, "max_advance_pct": 50})
        assert r.json()["approved"] is False

    def test_loan_reducing(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/loan/compute", headers=admin_headers,
                          json={"principal": 100000, "rate_pa": 10, "tenure_months": 24,
                                "interest_type": "reducing_balance"})
        d = r.json()
        assert d["approved"] is True
        assert d["monthly_emi"] == 4614.49

    def test_loan_simple(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/loan/compute", headers=admin_headers,
                          json={"principal": 100000, "rate_pa": 10, "tenure_months": 24,
                                "interest_type": "simple"})
        assert r.json()["monthly_emi"] == 5000.0


# ═══════════════════════  Advance / Loan CRUD  ═══════════════════════
class TestAdvanceLoanCRUD:
    def test_advance_crud(self, admin_headers):
        payload = {"employee_id": "TEST_emp_adv", "advance_amount": 10000,
                   "monthly_salary": 50000, "repayment_months": 5,
                   "interest_rate_pa": 0}
        r = requests.post(f"{BASE_URL}/api/advances", headers=admin_headers, json=payload)
        assert r.status_code == 200, r.text
        rec = r.json()
        assert "id" in rec
        assert "schedule" in rec and rec["schedule"].get("approved") is True
        assert rec["schedule"]["monthly_emi"] == 2000.0
        aid = rec["id"]

        # list
        r = requests.get(f"{BASE_URL}/api/advances", headers=admin_headers,
                        params={"employee_id": "TEST_emp_adv"})
        assert r.status_code == 200
        assert any(a["id"] == aid for a in r.json())

        # delete
        r = requests.delete(f"{BASE_URL}/api/advances/{aid}", headers=admin_headers)
        assert r.status_code == 200

    def test_loan_crud(self, admin_headers):
        payload = {"employee_id": "TEST_emp_loan", "principal": 100000,
                   "rate_pa": 10, "tenure_months": 24,
                   "interest_type": "reducing_balance"}
        r = requests.post(f"{BASE_URL}/api/loans", headers=admin_headers, json=payload)
        assert r.status_code == 200, r.text
        rec = r.json()
        assert rec["schedule"]["monthly_emi"] == 4614.49
        lid = rec["id"]

        r = requests.delete(f"{BASE_URL}/api/loans/{lid}", headers=admin_headers)
        assert r.status_code == 200


# ═══════════════════════  Payslip PDF  ═══════════════════════
class TestPayslip:
    def test_admin_generate_pdf(self, admin_headers, admin_token):
        # Use admin's own id as target (admin bypasses permission check anyway)
        me = requests.get(f"{BASE_URL}/api/auth/me", headers=admin_headers).json()
        payload = {"employee_id": me.get("id"), "month": 1, "year": 2026,
                   "components": [
                       {"code": "basic", "name": "Basic", "calc_type": "fixed", "amount": 20000, "category": "earning"},
                       {"code": "hra", "name": "HRA", "calc_type": "percentage", "percentage": 40, "base_code": "basic", "category": "earning"},
                   ],
                   "pay_type": "monthly",
                   "use_statutory_auto": True}
        r = requests.post(f"{BASE_URL}/api/payslip/generate", headers=admin_headers, json=payload, timeout=60)
        assert r.status_code == 200, r.text[:500]
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:4] == b"%PDF"

    def test_employee_forbidden_for_other(self, emp_token):
        headers = {"Authorization": f"Bearer {emp_token}"}
        payload = {"employee_id": "some-other-admin-id-xxx", "month": 1, "year": 2026}
        r = requests.post(f"{BASE_URL}/api/payslip/generate", headers=headers, json=payload, timeout=30)
        assert r.status_code == 403


# ═══════════════════════  Payroll Run  ═══════════════════════
class TestPayrollRun:
    def test_create_list_delete(self, admin_headers):
        # Create with empty employee list filter — backend will list skipped if none have template
        r = requests.post(f"{BASE_URL}/api/payroll/runs", headers=admin_headers,
                          json={"month": 1, "year": 2026, "employee_ids": ["NON_EXISTENT_ID_XYZ"]})
        assert r.status_code == 200, r.text
        run = r.json()
        assert run["status"] == "draft"
        assert isinstance(run.get("skipped"), list)
        assert len(run["skipped"]) == 1
        run_id = run["id"]

        # list
        r = requests.get(f"{BASE_URL}/api/payroll/runs", headers=admin_headers)
        assert r.status_code == 200
        assert any(x["id"] == run_id for x in r.json())

        # freeze
        r = requests.put(f"{BASE_URL}/api/payroll/runs/{run_id}/freeze", headers=admin_headers)
        assert r.status_code == 200

        # delete after freeze should be rejected (400)
        r = requests.delete(f"{BASE_URL}/api/payroll/runs/{run_id}", headers=admin_headers)
        assert r.status_code == 400, f"frozen run should not be deletable, got {r.status_code}"

        # mark paid
        r = requests.put(f"{BASE_URL}/api/payroll/runs/{run_id}/mark-paid", headers=admin_headers)
        assert r.status_code == 200

        # cleanup: set back to draft directly via mongo? — Skip. Leave test record.
        # Test a separate draft can be deleted:
        r2 = requests.post(f"{BASE_URL}/api/payroll/runs", headers=admin_headers,
                           json={"month": 1, "year": 2026, "employee_ids": ["NON_EXISTENT_ID_Y"]})
        rid2 = r2.json()["id"]
        d = requests.delete(f"{BASE_URL}/api/payroll/runs/{rid2}", headers=admin_headers)
        assert d.status_code == 200


# ═══════════════════════  FnF  ═══════════════════════
class TestFnF:
    def test_sample_value(self, admin_headers):
        payload = {
            "employee_id": "TEST_emp_fnf",
            "last_drawn_basic": 50000,
            "years_of_service": 7,
            "leave_balance_days": 15,
            "unpaid_salary_days": 10,
            "notice_period_days_pending": 5,
            "exit_reason": "resignation",
            "pending_reimbursements": 3000,
            "outstanding_loans": 20000,
        }
        r = requests.post(f"{BASE_URL}/api/fnf/compute", headers=admin_headers, json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["payable"]["gratuity"]["eligible"] is True
        assert d["net_fnf"] == 223384.62


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
