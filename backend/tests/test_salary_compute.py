"""Backend tests for Salary Structure + Compute engine (Indian Labour Law accuracy)."""
import os
import uuid
import pytest
import requests
from pathlib import Path

# Load REACT_APP_BACKEND_URL from frontend/.env if not set in env
def _load_backend_url():
    url = os.environ.get("REACT_APP_BACKEND_URL", "").strip()
    if url:
        return url
    envf = Path("/app/frontend/.env")
    if envf.exists():
        for line in envf.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""

BASE_URL = _load_backend_url().rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@hrms.com", "password": "admin123", "login_as": "admin"}


# ── Fixtures ──────────────────────────────────────────────────────────────
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=20)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"No token: {r.json()}"
    return tok


@pytest.fixture(scope="session")
def client(admin_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"})
    return s


# ── Basic regression ──────────────────────────────────────────────────────
class TestAuthAndRegression:
    def test_login_admin(self):
        r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "access_token" in data or "token" in data

    @pytest.mark.parametrize("ep", [
        "/salary-components",
        "/salary-templates",
        "/salary-assignments",
        "/compliance-templates/pf",
        "/policy-templates/leave",
        "/attendance",
    ])
    def test_regression_endpoints(self, client, ep):
        r = client.get(f"{API}{ep}", timeout=20)
        assert r.status_code in (200, 204), f"{ep} → {r.status_code} {r.text[:200]}"


# ── Auto-pairing (PF paired_provisions) ───────────────────────────────────
class TestAutoPair:
    def test_pf_auto_pair_returns_paired_provisions(self, client):
        payload = {
            "code": f"TEST_PF_DED_{uuid.uuid4().hex[:6]}",
            "name": "TEST PF Employee (Auto-Pair)",
            "component_type": "deduction",
            "category": "statutory",
            "is_statutory": True,
            "calc_type": "percentage_of_basic",
            "default_percentage": 12,
            "auto_pair_key": "pf",
            "classification": "statutory",
        }
        r = client.post(f"{API}/salary-components", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "paired_provisions" in data, "Missing paired_provisions in response"
        expected = {"pf_employer_provision", "pf_admin_charges_provision", "pf_edli_charges_provision"}
        got = set(data["paired_provisions"])
        assert expected.issubset(got), f"Expected {expected}, got {got}"
        # Sanity: union of auto_created + already_present should match paired_provisions
        assert set(data.get("auto_created_provisions", []) + data.get("already_present_provisions", [])) == got
        # Cleanup
        client.delete(f"{API}/salary-components/{data['id']}", timeout=10)

    def test_esic_auto_pair(self, client):
        payload = {
            "code": f"TEST_ESIC_DED_{uuid.uuid4().hex[:6]}",
            "name": "TEST ESIC Employee (Auto-Pair)",
            "component_type": "deduction",
            "category": "statutory",
            "is_statutory": True,
            "calc_type": "percentage_of_gross",
            "default_percentage": 0.75,
            "auto_pair_key": "esic",
        }
        r = client.post(f"{API}/salary-components", json=payload, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert "esic_employer_provision" in data.get("paired_provisions", [])
        client.delete(f"{API}/salary-components/{data['id']}", timeout=10)


# ── Salary Compute: Indian Labour Law accuracy ────────────────────────────
def _earning(code, name, amount=None, percentage=None, calc="fixed_amount",
             attracts_pf=False, attracts_esic=False, attracts_pt=False, attracts_tds=False):
    c = {
        "enabled": True, "component_type": "earning",
        "code": code, "name": name, "calc_type": calc,
        "classification": "inclusion_wages",
        "attracts_pf": attracts_pf, "attracts_esic": attracts_esic,
        "attracts_pt": attracts_pt, "attracts_tds": attracts_tds,
    }
    if amount is not None:
        c["amount"] = amount
    if percentage is not None:
        c["percentage"] = percentage
    return c


class TestSalaryComputeAccuracy:
    def test_sample_scenario_high_gross(self, client):
        """Basic=20000, HRA=40% basic, Special=10000, Conv=5% of gross → gross=39900"""
        components = [
            _earning("BASIC", "Basic", amount=20000, attracts_pf=True, attracts_pt=True, attracts_tds=True),
            _earning("HRA", "HRA", percentage=40, calc="percentage_of_basic", attracts_tds=True),
            _earning("SPL", "Special Allowance", amount=10000, attracts_tds=True),
            _earning("CONV", "Conveyance", percentage=5, calc="percentage_of_gross", attracts_tds=True),
        ]
        r = client.post(f"{API}/salary-compute", json={"components": components, "use_statutory_auto": True}, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()

        assert d["basic_monthly"] == 20000
        # HRA = 8000, SPL=10000, BASIC=20000 → subtotal=38000, CONV=5% of 38000=1900
        assert d["gross_monthly"] == 39900, f"gross_monthly expected 39900 got {d['gross_monthly']}"

        # PF: min(20000, 15000) * 12% = 1800
        pf_emp = next((x["amount"] for x in d["deductions"] if x["code"] == "PF_EMP"), None)
        assert pf_emp == 1800, f"PF employee expected 1800, got {pf_emp}"

        # PF employer 1800, admin 75, edli 75
        provisions = {p["code"]: p["amount"] for p in d["provisions"]}
        assert provisions.get("PF_ER") == 1800
        assert provisions.get("PF_ADMIN") == 75
        assert provisions.get("PF_EDLI") == 75

        # ESIC: gross > 21000 → not applicable
        esic_applicable = d["statutory"]["esic"]["applicable"]
        assert esic_applicable is False
        esic_codes = [x["code"] for x in d["deductions"] if x["code"] == "ESIC_EMP"]
        assert esic_codes == []

        # PT: gross 39900 → 200
        pt = next((x["amount"] for x in d["deductions"] if x["code"] == "PT"), None)
        assert pt == 200

        # TDS: annual taxable (gross*12=478800) - std ded 75000 = 403800 ≤ 7L → 0 via 87A
        tds = next((x["amount"] for x in d["deductions"] if x["code"] == "TDS"), 0)
        assert tds == 0, f"TDS expected 0 (87A rebate), got {tds}"

        # Totals
        assert d["total_deductions_monthly"] == 2000  # 1800 PF + 200 PT
        assert d["net_monthly"] == 37900
        assert d["ctc_monthly"] == 41850  # 39900 + 1950 provisions

    def test_esic_applicable_below_threshold(self, client):
        """gross 18000 → ESIC applies"""
        components = [
            _earning("BASIC", "Basic", amount=10000, attracts_pf=True, attracts_esic=True),
            _earning("HRA", "HRA", amount=5000, attracts_esic=True),
            _earning("SPL", "Special", amount=3000, attracts_esic=True),
        ]
        r = client.post(f"{API}/salary-compute", json={"components": components}, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["gross_monthly"] == 18000
        assert d["statutory"]["esic"]["applicable"] is True
        esic_emp = next((x["amount"] for x in d["deductions"] if x["code"] == "ESIC_EMP"), None)
        esic_er = next((p["amount"] for p in d["provisions"] if p["code"] == "ESIC_ER"), None)
        assert esic_emp == round(18000 * 0.0075, 2) == 135.0
        assert esic_er == round(18000 * 0.0325, 2) == 585.0

    def test_pf_wage_ceiling_applied(self, client):
        """Basic 50000: PF on ceiling 15000 → 1800 not 6000"""
        comps = [_earning("BASIC", "Basic", amount=50000, attracts_pf=True)]
        r = client.post(f"{API}/salary-compute", json={"components": comps}, timeout=30)
        assert r.status_code == 200
        d = r.json()
        pf_emp = next((x["amount"] for x in d["deductions"] if x["code"] == "PF_EMP"), None)
        assert pf_emp == 1800, f"Expected 1800 (capped), got {pf_emp}"

    def test_pt_slabs_maharashtra(self, client):
        for gross, expected_pt in [(5000, 0), (9000, 175), (15000, 200)]:
            comps = [_earning("BASIC", "Basic", amount=gross)]
            r = client.post(f"{API}/salary-compute", json={"components": comps}, timeout=30)
            assert r.status_code == 200
            d = r.json()
            pt = next((x["amount"] for x in d["deductions"] if x["code"] == "PT"), 0)
            assert pt == expected_pt, f"gross={gross}: PT expected {expected_pt}, got {pt}"

    def test_tds_87a_rebate_boundary(self, client):
        """Annual taxable (after 75k std ded) exactly 7L → tax 0 via 87A"""
        # Need gross*12 - 75000 == 700000 → gross = 775000/12 ≈ 64583.33
        comps = [_earning("BASIC", "Basic", amount=64583, attracts_tds=True)]
        r = client.post(f"{API}/salary-compute", json={"components": comps}, timeout=30)
        assert r.status_code == 200
        d = r.json()
        tds = next((x["amount"] for x in d["deductions"] if x["code"] == "TDS"), 0)
        assert tds == 0, f"Expected 0 tax at 87A boundary, got {tds}"

    def test_tds_marginal_relief_above_rebate(self, client):
        """Just above 7L taxable → marginal relief ensures tax ≤ (taxable - 7L)"""
        # Gross monthly such that annual_gross - 75000 = 710000 (10k over threshold) → gross=65417 per month
        comps = [_earning("BASIC", "Basic", amount=65417, attracts_tds=True)]
        r = client.post(f"{API}/salary-compute", json={"components": comps}, timeout=30)
        assert r.status_code == 200
        d = r.json()
        stat = d["statutory"]["tds"]
        annual_taxable = stat["annual_taxable"] - 75000  # post std deduction
        over = annual_taxable - 700000
        monthly_tds = stat["monthly_tds"]
        # Annual tax ≤ over (marginal relief); plus 4% cess. Monthly = (tax+cess)/12.
        annual_cap = over * 1.04 / 12 + 1  # allow rounding
        assert monthly_tds <= annual_cap, f"marginal relief breached: monthly {monthly_tds} cap {annual_cap}"

    def test_totals_identity(self, client):
        """net = gross - deductions; ctc = gross + provisions"""
        comps = [
            _earning("BASIC", "Basic", amount=25000, attracts_pf=True),
            _earning("HRA", "HRA", percentage=40, calc="percentage_of_basic"),
        ]
        r = client.post(f"{API}/salary-compute", json={"components": comps}, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert round(d["gross_monthly"] - d["total_deductions_monthly"], 2) == d["net_monthly"]
        assert round(d["gross_monthly"] + d["total_provisions_monthly"], 2) == d["ctc_monthly"]

    def test_per_component_breakdown_structure(self, client):
        comps = [
            _earning("BASIC", "Basic", amount=20000, attracts_pf=True),
            _earning("HRA", "HRA", percentage=40, calc="percentage_of_basic"),
        ]
        r = client.post(f"{API}/salary-compute", json={"components": comps}, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d.get("earnings"), list) and len(d["earnings"]) == 2
        assert isinstance(d.get("deductions"), list)
        assert isinstance(d.get("provisions"), list)
        hra = next(e for e in d["earnings"] if e["code"] == "HRA")
        assert hra["amount"] == 8000
        assert hra["calc_type"] == "percentage_of_basic"


# ── Salary Template & Component CRUD sanity ──────────────────────────────
class TestSalaryCRUD:
    def test_component_crud(self, client):
        payload = {
            "code": f"TEST_C_{uuid.uuid4().hex[:6]}",
            "name": "TEST Component",
            "component_type": "earning",
            "calc_type": "fixed_amount",
            "default_value": 1000,
        }
        r = client.post(f"{API}/salary-components", json=payload, timeout=15)
        assert r.status_code == 200
        cid = r.json()["id"]

        r2 = client.put(f"{API}/salary-components/{cid}", json={"name": "TEST Updated"}, timeout=15)
        assert r2.status_code == 200

        r3 = client.get(f"{API}/salary-components", timeout=15)
        assert any(c["id"] == cid and c.get("name") == "TEST Updated" for c in r3.json())

        r4 = client.delete(f"{API}/salary-components/{cid}", timeout=15)
        assert r4.status_code == 200

    def test_template_crud(self, client):
        r = client.post(f"{API}/salary-templates", json={
            "name": f"TEST Template {uuid.uuid4().hex[:6]}",
            "description": "test",
            "components": [],
        }, timeout=15)
        assert r.status_code == 200
        tid = r.json()["id"]

        r2 = client.put(f"{API}/salary-templates/{tid}", json={"description": "updated"}, timeout=15)
        assert r2.status_code == 200

        r3 = client.get(f"{API}/salary-templates/{tid}", timeout=15)
        assert r3.status_code == 200 and r3.json()["description"] == "updated"

        r4 = client.delete(f"{API}/salary-templates/{tid}", timeout=15)
        assert r4.status_code == 200
