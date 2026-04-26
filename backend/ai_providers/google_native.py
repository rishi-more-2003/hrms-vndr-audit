"""Google Gemini native provider — uses YOUR GOOGLE_API_KEY.

Supports BASE Gemini models (gemini-1.5-flash, gemini-1.5-pro) AND your
fine-tuned models (resource name 'tunedModels/saffron-extract-v3').

Fine-tuning Gemini today goes through Google AI Studio (https://aistudio.google.com)
or Vertex AI. The model resource name returned by both starts with 'tunedModels/'
and is invoked via the standard generate_content API.
"""
from __future__ import annotations
import asyncio
import os
from typing import List, Optional

from .base import AIProvider, LLMResult, FileAttachment, LLMError


class GoogleNativeProvider(AIProvider):
    name = "google_native"

    # Public AI Studio rates — Vertex AI rates differ slightly. Tune later.
    RATES = {
        "gemini-1.5-flash": {"in": 0.075 / 1_000_000, "out": 0.30 / 1_000_000},
        "gemini-1.5-pro":   {"in": 1.25 / 1_000_000, "out": 5.00 / 1_000_000},
        "gemini-2.0-flash": {"in": 0.10 / 1_000_000, "out": 0.40 / 1_000_000},
        # Fine-tuned models bill at the BASE model rate per Google docs (Apr 2026)
        "tunedModels":      {"in": 0.075 / 1_000_000, "out": 0.30 / 1_000_000},
    }

    async def chat(self, *, model: str, system: str, user: str,
                    files: Optional[List[FileAttachment]] = None,
                    session_id: str = "default", json_mode: bool = False) -> LLMResult:
        api_key = os.environ.get("GOOGLE_API_KEY", "")
        if not api_key:
            raise LLMError(self.name, model, RuntimeError("GOOGLE_API_KEY not set — use 'emergent' provider until you provision one"))

        # Lazy import so backend boots even if user hasn't installed (it's already installed via emergentintegrations)
        try:
            import google.generativeai as genai
        except ImportError as e:
            raise LLMError(self.name, model, e)

        genai.configure(api_key=api_key)

        contents: list = []
        if files:
            for f in files:
                # Upload file (supports PDFs/images natively)
                try:
                    uploaded = genai.upload_file(path=f.path, mime_type=f.mime_type)
                    contents.append(uploaded)
                except Exception as e:
                    raise LLMError(self.name, model, e)
        contents.append(user)

        gen_config = {}
        if json_mode:
            gen_config["response_mime_type"] = "application/json"

        try:
            gm = genai.GenerativeModel(model_name=model, system_instruction=system, generation_config=gen_config or None)
            # genai sync API — wrap in run_in_executor
            loop = asyncio.get_event_loop()
            resp = await loop.run_in_executor(None, lambda: gm.generate_content(contents))
            text = (resp.text or "") if hasattr(resp, "text") else str(resp)
            usage = getattr(resp, "usage_metadata", None)
            if usage and hasattr(usage, "prompt_token_count"):
                t_in = int(usage.prompt_token_count or 0)
                t_out = int(usage.candidates_token_count or 0)
            else:
                t_in = self.approx_tokens(system) + self.approx_tokens(user)
                t_out = self.approx_tokens(text)
        except Exception as e:
            raise LLMError(self.name, model, e)

        return LLMResult(
            text=text, tokens_in=t_in, tokens_out=t_out,
            cost_inr=self.estimate_inr(model, t_in, t_out),
            model_used=model, provider=self.name,
        )
