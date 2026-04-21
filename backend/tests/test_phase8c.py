"""Tests for Phase 8C — Seed defaults + Policy↔Salary linkage."""
import os, requests, pytest

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


class TestSeedDefaults:
    def test_seed_is_idempotent(self, hdr):
        # First call: seeds (may create or skip depending on prior state)
        r1 = requests.post(f"{BASE_URL}/api/salary-components/seed-defaults", headers=hdr, timeout=30)
        assert r1.status_code == 200
        d1 = r1.json()
        assert "created" in d1 and "skipped_already_exists" in d1
        # Second call: must skip all (idempotent)
        r2 = requests.post(f"{BASE_URL}/api/salary-components/seed-defaults", headers=hdr, timeout=30)
        d2 = r2.json()
        assert d2["created"] == []
        assert len(d2["skipped_already_exists"]) == d2["total_kit"]

    def test_seed_contains_key_components(self, hdr):
        # After seeding, verify the kit is installed
        requests.post(f"{BASE_URL}/api/salary-components/seed-defaults", headers=hdr, timeout=30)
        r = requests.get(f"{BASE_URL}/api/salary-components", headers=hdr, timeout=30)
        codes = {c["code"] for c in r.json()}
        # Must contain all 3 OT variants + both PT states + key earnings + PF/ESIC
        for code in ["BASIC", "HRA", "OT_15", "OT_2X", "OT_3X", "PT_MH", "PT_TN", "PF_EMP", "ESIC_EMP", "BONUS_STAT"]:
            assert code in codes, f"Missing seeded component: {code}"

    def test_ot_components_have_group(self, hdr):
        r = requests.get(f"{BASE_URL}/api/salary-components", headers=hdr, timeout=30)
        ot_comps = [c for c in r.json() if c.get("code") in ("OT_15", "OT_2X", "OT_3X")]
        assert len(ot_comps) == 3
        for c in ot_comps:
            assert c["group"] == "Overtime"
            assert c.get("ot_config", {}).get("enabled") is True

    def test_pt_slabs_different_for_mh_vs_tn(self, hdr):
        r = requests.get(f"{BASE_URL}/api/salary-components", headers=hdr, timeout=30)
        mh = next(c for c in r.json() if c["code"] == "PT_MH")
        tn = next(c for c in r.json() if c["code"] == "PT_TN")
        assert mh["group"] == tn["group"] == "Professional Tax"
        assert mh["has_slabs"] and tn["has_slabs"]
        # Slab configuration differs — MH has gender differentiation, TN is progressive
        assert any(s.get("gender") == "female" for s in mh["slabs"])
        # TN top slab at different amount
        tn_slabs = tn["slabs"]
        assert any(s.get("fixed_amount") == 1250 for s in tn_slabs)


class TestPolicyLinks:
    def test_save_and_fetch_links(self, hdr):
        # Get first template
        templates = requests.get(f"{BASE_URL}/api/salary-templates", headers=hdr).json()
        if not templates:
            pytest.skip("no templates")
        t = templates[0]
        # Add bogus link IDs (non-existent, should be accepted and resolved to None/skipped)
        t["leave_policy_id"] = "test-link-leave-123"
        t["overtime_policy_id"] = "test-link-ot-456"
        r = requests.put(f"{BASE_URL}/api/salary-templates/{t['id']}", json=t, headers=hdr)
        assert r.status_code == 200

        # Resolve links
        r2 = requests.get(f"{BASE_URL}/api/salary-templates/{t['id']}/resolved-links", headers=hdr)
        assert r2.status_code == 200
        d = r2.json()
        assert d["salary_template"]["leave_policy_id"] == "test-link-leave-123"
        # Since IDs are fake, policy_links should be empty or not include them
        assert "leave" not in d["policy_links"]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
