"""OpenAI native provider — uses YOUR OPENAI_API_KEY.

Supports BASE models (gpt-4o, gpt-4o-mini, o1) AND fine-tuned models
(model id like 'ft:gpt-4o-2024-08-06:saffron::abc123').

Fine-tuning is done via OpenAI's fine-tuning API (https://platform.openai.com).
Once a job completes, OpenAI returns the fine-tuned model ID — drop it into the
AI_P1_MODEL / AI_P2_MODEL env var and the router picks it up immediately.
"""
from __future__ import annotations
import base64
import os
from typing import List, Optional

from .base import AIProvider, LLMResult, FileAttachment, LLMError


class OpenAINativeProvider(AIProvider):
    name = "openai_native"

    RATES = {
        "gpt-4o":            {"in": 2.50 / 1_000_000, "out": 10.0 / 1_000_000},
        "gpt-4o-mini":       {"in": 0.15 / 1_000_000, "out": 0.60 / 1_000_000},
        "o1":                {"in": 15.0 / 1_000_000, "out": 60.0 / 1_000_000},
        "o1-mini":           {"in": 3.00 / 1_000_000, "out": 12.0 / 1_000_000},
        # Fine-tuned bills at base rate × surcharge per OpenAI pricing (Apr 2026)
        "ft:gpt-4o-mini":    {"in": 0.30 / 1_000_000, "out": 1.20 / 1_000_000},
        "ft:gpt-4o":         {"in": 3.75 / 1_000_000, "out": 15.0 / 1_000_000},
    }

    async def chat(self, *, model: str, system: str, user: str,
                    files: Optional[List[FileAttachment]] = None,
                    session_id: str = "default", json_mode: bool = False) -> LLMResult:
        api_key = os.environ.get("OPENAI_API_KEY", "")
        if not api_key:
            raise LLMError(self.name, model, RuntimeError("OPENAI_API_KEY not set"))

        try:
            from openai import AsyncOpenAI
        except ImportError as e:
            raise LLMError(self.name, model, e)

        client = AsyncOpenAI(api_key=api_key)

        # Build messages array. Files attached as image_url data: URLs (vision).
        # PDFs aren't natively supported on chat completions for fine-tuned models;
        # rely on the upstream pipeline to extract & pass text. (We never attach a
        # PDF directly to OpenAI here; the call site sends already-parsed text.)
        content: list = [{"type": "text", "text": user}]
        if files:
            for f in files:
                if f.mime_type.startswith("image/"):
                    with open(f.path, "rb") as fh:
                        b64 = base64.b64encode(fh.read()).decode()
                    content.append({"type": "image_url", "image_url": {"url": f"data:{f.mime_type};base64,{b64}"}})
                # PDFs / docx not attached natively here — pre-extracted upstream

        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": content if any(c["type"] != "text" for c in content) else user},
        ]

        kwargs: dict = {"model": model, "messages": messages}
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}

        try:
            resp = await client.chat.completions.create(**kwargs)
            text = resp.choices[0].message.content or ""
            usage = resp.usage
            t_in = int(usage.prompt_tokens or 0) if usage else self.approx_tokens(system) + self.approx_tokens(user)
            t_out = int(usage.completion_tokens or 0) if usage else self.approx_tokens(text)
        except Exception as e:
            raise LLMError(self.name, model, e)

        return LLMResult(
            text=text, tokens_in=t_in, tokens_out=t_out,
            cost_inr=self.estimate_inr(model, t_in, t_out),
            model_used=model, provider=self.name,
        )
