"""Backend tests for Saffron SaaS Demo Booking endpoints.

Endpoints under test:
  GET  /api/saas/demo-request/availability?date=YYYY-MM-DD
  POST /api/saas/demo-request
"""
import os
import requests
from datetime import date, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


def _next_weekday(offset_days=14, avoid_sunday=True):
    """Pick a future date well past today's bookings to avoid clashes."""
    d = date.today() + timedelta(days=offset_days)
    while avoid_sunday and d.weekday() == 6:
        d += timedelta(days=1)
    return d.isoformat()


def _next_sunday():
    d = date.today() + timedelta(days=1)
    while d.weekday() != 6:
        d += timedelta(days=1)
    return d.isoformat()


# ───────── availability ─────────
class TestAvailability:
    def test_availability_future_weekday_returns_slots(self):
        target = _next_weekday(21)
        r = requests.get(f"{API}/saas/demo-request/availability", params={"date": target})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["date"] == target
        assert isinstance(data["slots"], list)
        assert len(data["slots"]) > 0
        # Should be HH:MM strings
        assert all(isinstance(s, str) and ":" in s for s in data["slots"])

    def test_availability_sunday_returns_empty(self):
        sun = _next_sunday()
        r = requests.get(f"{API}/saas/demo-request/availability", params={"date": sun})
        assert r.status_code == 200
        data = r.json()
        assert data["slots"] == []
        assert data.get("reason") == "closed_sunday"

    def test_availability_past_returns_empty(self):
        past = (date.today() - timedelta(days=2)).isoformat()
        r = requests.get(f"{API}/saas/demo-request/availability", params={"date": past})
        assert r.status_code == 200
        assert r.json()["slots"] == []
        assert r.json().get("reason") == "past"

    def test_availability_bad_date_format(self):
        r = requests.get(f"{API}/saas/demo-request/availability", params={"date": "2026/05/07"})
        assert r.status_code == 400


# ───────── post demo-request ─────────
class TestSubmitDemoRequest:
    def _payload(self, d, slot, name="TEST_BD"):
        return {
            "name": f"{name} User",
            "email": "test_bd@example.com",
            "phone": "+919999999999",
            "company": "TEST Pvt Ltd",
            "designation": "Compliance Manager",
            "company_size": "51-200",
            "industry": "IT / ITES",
            "interested_modules": ["hrms", "vendor_audit"],
            "request_type": "demo",
            "preferred_date": d,
            "preferred_slot": slot,
            "notes": "Automated test booking",
            "referral_source": "Google Search",
        }

    def test_create_demo_request_success(self):
        # Use an unusual offset (~25 days) and the last-but-one slot to dodge clashes
        target = _next_weekday(25)
        avail = requests.get(f"{API}/saas/demo-request/availability", params={"date": target}).json()
        slots = avail.get("slots", [])
        assert slots, "Expected slots on a future weekday"
        slot = slots[-1]  # pick last open slot
        r = requests.post(f"{API}/saas/demo-request", json=self._payload(target, slot))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert "message" in body
        assert isinstance(body["id"], str) and len(body["id"]) > 0
        # Slot should now be removed from availability
        avail2 = requests.get(f"{API}/saas/demo-request/availability", params={"date": target}).json()
        assert slot not in avail2["slots"]

    def test_double_booking_returns_409(self):
        target = _next_weekday(28)
        avail = requests.get(f"{API}/saas/demo-request/availability", params={"date": target}).json()
        slots = avail.get("slots", [])
        assert slots
        slot = slots[0]
        r1 = requests.post(f"{API}/saas/demo-request", json=self._payload(target, slot, name="TEST_FIRST"))
        assert r1.status_code == 200, r1.text
        r2 = requests.post(f"{API}/saas/demo-request", json=self._payload(target, slot, name="TEST_DUP"))
        assert r2.status_code == 409, r2.text

    def test_past_date_rejected(self):
        past = (date.today() - timedelta(days=3)).isoformat()
        r = requests.post(f"{API}/saas/demo-request", json=self._payload(past, "10:00"))
        assert r.status_code == 400

    def test_sunday_rejected(self):
        sun = _next_sunday()
        r = requests.post(f"{API}/saas/demo-request", json=self._payload(sun, "10:00"))
        assert r.status_code == 400

    def test_invalid_slot_rejected(self):
        target = _next_weekday(35)
        r = requests.post(f"{API}/saas/demo-request", json=self._payload(target, "23:59"))
        assert r.status_code == 400

    def test_missing_required_fields(self):
        target = _next_weekday(35)
        bad = {"name": "x", "preferred_date": target, "preferred_slot": "10:00"}
        r = requests.post(f"{API}/saas/demo-request", json=bad)
        assert r.status_code == 422
