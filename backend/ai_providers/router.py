"""Task router — picks the right provider+model per task, runs primary,
falls back to secondary on error, and logs usage.

Tasks → Phase mapping:
  template_schema      → P1   (small extractor)
  data_normalize       → P1
  field_mapping        → P1
  document_extract     → P1
  audit_report         → P3   (uses the P2 knowledge LLM)
  legal_qa             → P2   (knowledge LLM direct query)

Per-phase config is read from environment, overridable per-tenant via the
`organizations.ai_overrides` field (added later — for now env wins).
"""
from __future__ import annotations
import logging
import os
from typing import List, Optional

from .base import AIProvider, LLMResult, FileAttachment, LLMError
from .emergent import EmergentProvider
from .google_native import GoogleNativeProvider
from .openai_native import OpenAINativeProvider
from . import usage_logger

logger = logging.getLogger(__name__)


PROVIDERS: dict[str, AIProvider] = {
    "emergent": EmergentProvider(),
    "google_native": GoogleNativeProvider(),
    "openai_native": OpenAINativeProvider(),
}


# task → phase mapping
TASK_TO_PHASE = {
    "template_schema": "P1",
    "data_normalize":  "P1",
    "field_mapping":   "P1",
    "document_extract": "P1",
    "audit_report":     "P3",
    "legal_qa":         "P2",
}


def _env(key: str, default: str = "") -> str:
    return os.environ.get(key, default).strip()


def get_active_config() -> dict:
    """Snapshot of currently active routing config — useful for /platform-admin/ai-config."""
    cfg = {}
    for phase in ("P1", "P2", "P3"):
        cfg[phase] = {
            "primary": {
                "provider": _env(f"AI_{phase}_PROVIDER", "emergent"),
                "model": _env(f"AI_{phase}_MODEL", _default_model(phase)),
            },
            "fallback": {
                "provider": _env(f"AI_{phase}_FALLBACK_PROVIDER", "emergent"),
                "model": _env(f"AI_{phase}_FALLBACK_MODEL", _default_fallback(phase)),
            },
        }
    cfg["keys_present"] = {
        "EMERGENT_LLM_KEY": bool(_env("EMERGENT_LLM_KEY")),
        "GOOGLE_API_KEY": bool(_env("GOOGLE_API_KEY")),
        "OPENAI_API_KEY": bool(_env("OPENAI_API_KEY")),
    }
    return cfg


def _default_model(phase: str) -> str:
    return {
        "P1": "gemini-3-flash-preview",
        "P2": "claude-sonnet-4-5-20250929",
        "P3": "claude-sonnet-4-5-20250929",
    }[phase]


def _default_fallback(phase: str) -> str:
    return {
        "P1": "claude-sonnet-4-5-20250929",
        "P2": "gemini-3-flash-preview",
        "P3": "gemini-3-flash-preview",
    }[phase]


async def run_task(
    *,
    task: str,
    system: str,
    user: str,
    files: Optional[List[FileAttachment]] = None,
    session_id: str = "default",
    json_mode: bool = False,
    organization_id: Optional[str] = None,
    user_id: Optional[str] = None,
    meta: Optional[dict] = None,
    escalate: bool = False,
) -> LLMResult:
    """Single entry point for all LLM calls in Saffron.

    Resolves task → phase → primary provider+model → runs. On any LLMError, retries
    with the configured fallback. Logs every attempt to ai_usage_logs.

    `escalate=True` swaps primary↔fallback (use this for "I tried the small model,
    confidence was low, give me the strong one" patterns).
    """
    phase = TASK_TO_PHASE.get(task, "P1")
    primary_provider_name = _env(f"AI_{phase}_PROVIDER", "emergent")
    primary_model = _env(f"AI_{phase}_MODEL", _default_model(phase))
    fb_provider_name = _env(f"AI_{phase}_FALLBACK_PROVIDER", "emergent")
    fb_model = _env(f"AI_{phase}_FALLBACK_MODEL", _default_fallback(phase))

    if escalate:
        # Swap primary↔fallback so the "strong" model goes first.
        primary_provider_name, fb_provider_name = fb_provider_name, primary_provider_name
        primary_model, fb_model = fb_model, primary_model

    chain = [(primary_provider_name, primary_model)]
    if (fb_provider_name, fb_model) != (primary_provider_name, primary_model):
        chain.append((fb_provider_name, fb_model))

    last_error: Optional[Exception] = None
    attempt = 0
    for provider_name, model in chain:
        attempt += 1
        provider = PROVIDERS.get(provider_name)
        if not provider:
            logger.warning(f"Unknown provider '{provider_name}', skipping")
            continue
        try:
            result = await provider.chat(
                model=model, system=system, user=user, files=files,
                session_id=session_id, json_mode=json_mode,
            )
            result.attempts = attempt
            result.used_fallback = attempt > 1
            await usage_logger.log_call(
                task=task, phase=phase, provider=result.provider, model=result.model_used,
                tokens_in=result.tokens_in, tokens_out=result.tokens_out, cost_inr=result.cost_inr,
                organization_id=organization_id, user_id=user_id,
                used_fallback=result.used_fallback, attempts=attempt, success=True, meta=meta,
            )
            return result
        except LLMError as e:
            last_error = e
            await usage_logger.log_call(
                task=task, phase=phase, provider=provider_name, model=model,
                tokens_in=0, tokens_out=0, cost_inr=0.0,
                organization_id=organization_id, user_id=user_id,
                used_fallback=(attempt > 1), attempts=attempt, success=False, error=str(e),
                meta=meta,
            )
            logger.warning(f"[{phase}/{task}] {provider_name}/{model} failed → trying fallback. err={e}")
            continue
        except Exception as e:
            last_error = e
            logger.exception(f"[{phase}/{task}] unexpected error in {provider_name}")
            continue

    # All attempts failed
    raise RuntimeError(f"All providers failed for task={task} phase={phase}: {last_error}")
