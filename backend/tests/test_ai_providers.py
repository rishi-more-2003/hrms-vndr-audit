"""Tests for the AI provider abstraction layer."""
import os
import pytest
import requests
from unittest.mock import patch, AsyncMock

import sys
sys.path.insert(0, "/app/backend")

BASE_URL = ""
with open("/app/frontend/.env") as f:
    for line in f:
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().rstrip("/")


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200
    return r.json()["access_token"]


def test_router_active_config_via_platform_admin():
    """Platform admin can view the active routing — exposes provider/model per phase."""
    r = requests.post(f"{BASE_URL}/api/platform-admin/auth/login",
                       json={"email": "founder@saffronservices.in", "password": "saffron123"})
    assert r.status_code == 200, r.text
    pt = r.json()["access_token"]
    cfg = requests.get(f"{BASE_URL}/api/platform-admin/ai-config",
                        headers={"Authorization": f"Bearer {pt}"}).json()
    assert "P1" in cfg and "P2" in cfg and "P3" in cfg
    assert cfg["P1"]["primary"]["provider"] in ("emergent", "google_native", "openai_native")
    assert cfg["keys_present"]["EMERGENT_LLM_KEY"] is True


def test_router_unauthorized_blocked():
    """Non-platform-admin cannot view AI config."""
    admin = _login("admin@hrms.com", "admin123")
    r = requests.get(f"{BASE_URL}/api/platform-admin/ai-config",
                      headers={"Authorization": f"Bearer {admin}"})
    assert r.status_code == 403


def test_provider_name_resolution():
    """All three providers are registered."""
    from ai_providers.router import PROVIDERS
    assert set(PROVIDERS.keys()) == {"emergent", "google_native", "openai_native"}


def test_default_models_per_phase():
    from ai_providers.router import _default_model, _default_fallback
    # Phase 1 default should be the cheap small model
    assert _default_model("P1").startswith("gemini")
    # Phase 2 default should be a strong model
    assert _default_model("P2").startswith("claude")


def test_estimate_inr_calculation():
    """Per-million-token rate math is sane."""
    from ai_providers.emergent import EmergentProvider
    p = EmergentProvider()
    inr = p.estimate_inr("gemini-3-flash-preview", 10_000, 5_000)
    assert 0 < inr < 5  # well below ₹5 for 15k tokens
    inr2 = p.estimate_inr("claude-sonnet-4-5-20250929", 10_000, 5_000)
    assert inr2 > inr  # Sonnet costlier than Flash


def test_unknown_model_returns_zero_cost():
    """If a model isn't in the rate table, cost is 0 (don't crash)."""
    from ai_providers.emergent import EmergentProvider
    p = EmergentProvider()
    inr = p.estimate_inr("custom-fine-tuned-foo", 1000, 500)
    assert inr == 0.0


def test_native_provider_without_key_raises():
    """Without GOOGLE_API_KEY set, GoogleNativeProvider raises a friendly LLMError."""
    import asyncio
    from ai_providers.google_native import GoogleNativeProvider
    from ai_providers.base import LLMError
    p = GoogleNativeProvider()
    # Force key to empty for this test
    saved = os.environ.get("GOOGLE_API_KEY", "")
    os.environ["GOOGLE_API_KEY"] = ""
    try:
        async def run():
            await p.chat(model="gemini-1.5-flash", system="x", user="y")
        with pytest.raises(LLMError):
            asyncio.run(run())
    finally:
        if saved:
            os.environ["GOOGLE_API_KEY"] = saved
        else:
            os.environ.pop("GOOGLE_API_KEY", None)


def test_router_falls_back_on_primary_failure():
    """If primary provider raises, router retries with fallback."""
    import asyncio
    from ai_providers.base import LLMError, LLMResult
    from ai_providers import router

    fake_primary = AsyncMock(side_effect=LLMError("emergent", "x", RuntimeError("primary down")))
    fake_fallback = AsyncMock(return_value=LLMResult(
        text="hello", tokens_in=10, tokens_out=5, cost_inr=0.01,
        model_used="fallback-model", provider="emergent",
    ))

    fake_provider = type("P", (), {"chat": fake_primary})()
    fake_provider2 = type("P", (), {"chat": fake_fallback})()

    with patch.dict(router.PROVIDERS, {"emergent": fake_provider}, clear=False):
        # First call uses primary which fails; chain only has primary if env
        # has same provider for primary+fallback — so override fallback to a different one
        with patch.dict(os.environ, {
            "AI_P1_PROVIDER": "emergent", "AI_P1_MODEL": "primary-x",
            "AI_P1_FALLBACK_PROVIDER": "fb-fake", "AI_P1_FALLBACK_MODEL": "fallback-x",
        }):
            with patch.dict(router.PROVIDERS, {"fb-fake": fake_provider2}, clear=False):
                async def run():
                    return await router.run_task(task="document_extract", system="s", user="u")
                result = asyncio.run(run())
                assert result.text == "hello"
                assert result.used_fallback is True
                assert result.attempts == 2


def test_escalate_swaps_primary_fallback():
    """escalate=True puts the fallback first in the chain."""
    import asyncio
    from ai_providers.base import LLMResult
    from ai_providers import router

    primary_mock = AsyncMock(return_value=LLMResult(
        text="primary-text", tokens_in=1, tokens_out=1, cost_inr=0,
        model_used="p", provider="emergent",
    ))
    fallback_mock = AsyncMock(return_value=LLMResult(
        text="fallback-text", tokens_in=1, tokens_out=1, cost_inr=0,
        model_used="f", provider="fb-fake",
    ))
    p1 = type("P", (), {"chat": primary_mock})()
    p2 = type("P", (), {"chat": fallback_mock})()

    with patch.dict(router.PROVIDERS, {"emergent": p1, "fb-fake": p2}, clear=False):
        with patch.dict(os.environ, {
            "AI_P1_PROVIDER": "emergent", "AI_P1_MODEL": "p",
            "AI_P1_FALLBACK_PROVIDER": "fb-fake", "AI_P1_FALLBACK_MODEL": "f",
        }):
            async def run():
                return await router.run_task(task="document_extract", system="s", user="u", escalate=True)
            result = asyncio.run(run())
            # When escalate=True, fallback runs first
            assert result.text == "fallback-text"
            assert result.model_used == "f"
