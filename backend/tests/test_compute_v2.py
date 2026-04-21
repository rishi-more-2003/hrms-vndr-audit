"""salary-compute v2: Rate/Earned, applicability, group, slabs — via live HTTP."""
import os
import pytest
import requests

def _url():
    env = os.environ.get("REACT_APP_BACKEND_URL")
    if env: return env.strip().rstrip("/")
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


def _post(hdr, body):
    return requests.post(f"{BASE_URL}/api/salary-compute", json=body, headers=hdr, timeout=30).json()


class TestRateEarned:
    def test_loss_of_pay_prorates(self, hdr):
        d = _post(hdr, {
            "components": [
                {"enabled": True, "component_type": "earning", "code": "BASIC", "name": "Basic",
                 "calc_type": "fixed_amount", "amount": 20000, "attracts_pf": True,
                 "classification": "inclusion_wages"},
                {"enabled": True, "component_type": "earning", "code": "HRA", "name": "HRA",
                 "calc_type": "percentage_of_basic", "percentage": 40,
                 "classification": "inclusion_wages"},
            ],
            "use_statutory_auto": True, "rate_days": 30, "earned_days": 25,
        })
        assert d["attendance_factor"] == 0.8333
        assert d["basic_rate_monthly"] == 20000.0
        assert d["basic_earned_monthly"] == 16666.67
        assert d["gross_rate_monthly"] == 28000.0
        assert d["gross_monthly"] == 23333.34
        assert d["statutory"]["pf"]["base_used_rate"] == 15000
        assert d["statutory"]["pf"]["base_used_earned"] == 12500.0
        assert d["statutory"]["pf"]["employee"] == 1500.0

    def test_full_attendance(self, hdr):
        d = _post(hdr, {
            "components": [
                {"enabled": True, "component_type": "earning", "code": "BASIC", "name": "Basic",
                 "calc_type": "fixed_amount", "amount": 20000, "attracts_pf": True},
            ],
            "use_statutory_auto": True, "rate_days": 30, "earned_days": 30,
        })
        assert d["gross_monthly"] == d["gross_rate_monthly"]
        assert d["statutory"]["pf"]["employee"] == 1800.0


class TestApplicability:
    def test_skips_when_fails(self, hdr):
        d = _post(hdr, {
            "components": [
                {"enabled": True, "component_type": "earning", "code": "BASIC", "name": "Basic",
                 "calc_type": "fixed_amount", "amount": 25000, "classification": "inclusion_wages"},
                {"enabled": True, "component_type": "deduction", "code": "CUSTOM_ESIC",
                 "name": "Custom ESIC", "calc_type": "percentage_of_gross", "percentage": 0.75,
                 "applicability": {"enabled": True, "basis": "gross", "basis_mode": "rate",
                                   "operator": "less_than_equal", "value_min": 21000}},
            ],
            "use_statutory_auto": False,
        })
        assert len(d["skipped_components"]) == 1
        assert d["skipped_components"][0]["code"] == "CUSTOM_ESIC"
        assert d["deductions"] == []

    def test_applies_when_passes(self, hdr):
        d = _post(hdr, {
            "components": [
                {"enabled": True, "component_type": "earning", "code": "BASIC", "name": "Basic",
                 "calc_type": "fixed_amount", "amount": 15000, "classification": "inclusion_wages"},
                {"enabled": True, "component_type": "deduction", "code": "CUSTOM_ESIC",
                 "name": "Custom ESIC", "calc_type": "percentage_of_gross", "percentage": 0.75,
                 "applicability": {"enabled": True, "basis": "gross", "basis_mode": "rate",
                                   "operator": "less_than_equal", "value_min": 21000}},
            ],
            "use_statutory_auto": False,
        })
        assert d["skipped_components"] == []
        assert d["deductions"][0]["amount"] == 112.5


class TestGroupBased:
    def test_percentage_of_group(self, hdr):
        d = _post(hdr, {
            "components": [
                {"enabled": True, "component_type": "earning", "code": "CONV1", "name": "Conv MH",
                 "calc_type": "fixed_amount", "amount": 2000, "group": "Conveyance"},
                {"enabled": True, "component_type": "earning", "code": "CONV2", "name": "Conv TN",
                 "calc_type": "fixed_amount", "amount": 1500, "group": "Conveyance"},
                {"enabled": True, "component_type": "earning", "code": "BASIC", "name": "Basic",
                 "calc_type": "fixed_amount", "amount": 10000},
                {"enabled": True, "component_type": "earning", "code": "CBNS", "name": "Conv Bonus",
                 "calc_type": "percentage_of_group:Conveyance", "percentage": 10},
            ],
            "use_statutory_auto": False,
        })
        assert d["gross_monthly"] == 13850.0
        assert next(e for e in d["earnings"] if e["code"] == "CBNS")["amount"] == 350.0

    def test_percentage_of_club(self, hdr):
        d = _post(hdr, {
            "components": [
                {"enabled": True, "component_type": "earning", "code": "BASIC", "name": "Basic",
                 "calc_type": "fixed_amount", "amount": 10000},
                {"enabled": True, "component_type": "earning", "code": "DA", "name": "DA",
                 "calc_type": "fixed_amount", "amount": 5000},
                {"enabled": True, "component_type": "deduction", "code": "CLUB_DED",
                 "name": "Club-based", "calc_type": "percentage_of_club", "percentage": 10,
                 "calc_sources": ["BASIC", "DA"]},
            ],
            "use_statutory_auto": False,
        })
        assert d["deductions"][0]["amount"] == 1500.0


class TestSlabs:
    def test_slab_salary_band(self, hdr):
        d = _post(hdr, {
            "components": [
                {"enabled": True, "component_type": "earning", "code": "BASIC", "name": "Basic",
                 "calc_type": "fixed_amount", "amount": 18000, "classification": "inclusion_wages"},
                {"enabled": True, "component_type": "deduction", "code": "PT_MH", "name": "PT MH",
                 "has_slabs": True, "slab_salary_basis": "gross",
                 "slabs": [
                     {"salary_from": 0, "salary_to": 7500, "fixed_amount": 0},
                     {"salary_from": 7501, "salary_to": 10000, "fixed_amount": 175},
                     {"salary_from": 10001, "salary_to": None, "fixed_amount": 200},
                 ]},
            ],
            "use_statutory_auto": False,
        })
        assert d["deductions"][0]["amount"] == 200.0

    def test_slab_gender_filter(self, hdr):
        body = {
            "components": [
                {"enabled": True, "component_type": "earning", "code": "BASIC", "name": "Basic",
                 "calc_type": "fixed_amount", "amount": 12000},
                {"enabled": True, "component_type": "deduction", "code": "G_SLAB",
                 "name": "G Slab", "has_slabs": True, "slab_salary_basis": "gross",
                 "slabs": [
                     {"gender": "female", "salary_from": 0, "salary_to": None, "fixed_amount": 0},
                     {"gender": "male", "salary_from": 0, "salary_to": None, "fixed_amount": 100},
                 ]},
            ],
            "use_statutory_auto": False, "employee": {"gender": "female"},
        }
        d = _post(hdr, body)
        assert d["deductions"][0]["amount"] == 0.0
        body["employee"] = {"gender": "male"}
        d2 = _post(hdr, body)
        assert d2["deductions"][0]["amount"] == 100.0


class TestBonusAttracts:
    def test_bonus_flag_in_breakdown(self, hdr):
        d = _post(hdr, {
            "components": [
                {"enabled": True, "component_type": "earning", "code": "BASIC", "name": "Basic",
                 "calc_type": "fixed_amount", "amount": 10000, "attracts_bonus": True},
                {"enabled": True, "component_type": "earning", "code": "HRA", "name": "HRA",
                 "calc_type": "fixed_amount", "amount": 4000, "attracts_bonus": False},
            ],
            "use_statutory_auto": False,
        })
        basic = next(e for e in d["earnings"] if e["code"] == "BASIC")
        hra = next(e for e in d["earnings"] if e["code"] == "HRA")
        assert basic["attracts_bonus"] is True
        assert hra["attracts_bonus"] is False


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
