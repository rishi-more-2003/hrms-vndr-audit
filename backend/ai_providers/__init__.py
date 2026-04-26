"""Provider-abstraction layer for all LLM calls in Saffron.

Goal: Decouple call sites (register_maker.ai_schema, vendor_audit.ai_extraction,
register_maker.data_sources) from the underlying LLM SDK. Switching from the
Emergent universal key to YOUR fine-tuned models on Gemini/OpenAI native APIs
becomes a single env-variable change — no application code is rewritten.

Phases (per user spec, Apr 2026):
  • P1 — Extraction (smaller, faster, fine-tunable): Gemini 1.5 Flash FT
         primary, GPT-4o-mini base fallback
  • P2 — Knowledge LLM (large, fine-tuned on labour + IT laws): GPT-4o FT
  • P3 — Audit-report generation: re-uses P2 model with different prompts
"""
from .base import AIProvider, LLMResult, FileAttachment, LLMError
from .router import run_task, get_active_config

__all__ = ["AIProvider", "LLMResult", "FileAttachment", "LLMError", "run_task", "get_active_config"]
