"""Additional sanity checks for salary-compute v2 matching user's sample scenarios."""
import os
import pytest
import requests


def _url():
    env = os.environ.get("REACT_APP_BACKEND_URL")
    if env:
        return env.strip().rstrip("/")
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().rstrip("/")


BASE_URL = _url()


@pytest.fixture(scope="module")
def hdr():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "admin@hrms.com", "password": "admin123", "login_as": "admin"},
        timeout=30,
    )
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _post(hdr, body):
    return requests.post(f"{BASE_URL}/api/salary-compute", json=body, headers=hdr, timeout=30).json()


# Scenario (a): Basic=20k, rate=30, earned=25 → earned basic 16666.67, PF 1500
def test_scenario_a_basic_prorate(hdr):
    d = _post(hdr, {
        "components": [
            {"enabled": True, "component_type": "earning", "code": "BASIC", "name": "Basic",
             "calc_type": "fixed_amount", "amount": 20000, "attracts_pf": True,
             "classification": "inclusion_wages"},
        ],
        "use_statutory_auto": True, "rate_days": 30, "earned_days": 25,
    })
    assert d["basic_earned_monthly"] == 16666.67
    assert d["statutory"]["pf"]["employee"] == 1500.0
    # Backward compat: basic_monthly == basic_earned_monthly
    assert d.get("basic_monthly") == d["basic_earned_monthly"]


# Scenario (c): 2 conveyance components grouped + Bonus at 10% of group
def test_scenario_c_group_bonus(hdr):
    d = _post(hdr, {
        "components": [
            {"enabled": True, "component_type": "earning", "code": "CONV1", "name": "Conv MH",
             "calc_type": "fixed_amount", "amount": 2000, "group": "Conveyance"},
            {"enabled": True, "component_type": "earning", "code": "CONV2", "name": "Conv TN",
             "calc_type": "fixed_amount", "amount": 1500, "group": "Conveyance"},
            {"enabled": True, "component_type": "earning", "code": "CBNS", "name": "Conv Bonus",
             "calc_type": "percentage_of_group:Conveyance", "percentage": 10},
        ],
        "use_statutory_auto": False,
    })
    bns = next(e for e in d["earnings"] if e["code"] == "CBNS")
    assert bns["amount"] == 350.0


# Scenario (d): slab with salary_from=10001 at 200 and 18000 gross picks that
def test_scenario_d_slab_selection(hdr):
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


# Backward-compat alias: pf_wages_monthly
def test_backward_compat_aliases(hdr):
    d = _post(hdr, {
        "components": [
            {"enabled": True, "component_type": "earning", "code": "BASIC", "name": "Basic",
             "calc_type": "fixed_amount", "amount": 20000, "attracts_pf": True,
             "classification": "inclusion_wages"},
        ],
        "use_statutory_auto": True, "rate_days": 30, "earned_days": 30,
    })
    assert "pf_wages_monthly" in d or "pf_wages_earned_monthly" in d


# Full month attendance_factor should be 1.0
def test_full_attendance_factor(hdr):
    d = _post(hdr, {
        "components": [
            {"enabled": True, "component_type": "earning", "code": "BASIC", "name": "Basic",
             "calc_type": "fixed_amount", "amount": 10000},
        ],
        "use_statutory_auto": False, "rate_days": 30, "earned_days": 30,
    })
    assert d["attendance_factor"] == 1.0
