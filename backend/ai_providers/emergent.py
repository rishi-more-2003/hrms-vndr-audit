"""Emergent universal-key provider — current default.

Wraps emergentintegrations' LlmChat. Routes Gemini / Claude / OpenAI / Sora calls
through Emergent's billing on the EMERGENT_LLM_KEY. Used as fallback when native
keys aren't configured.
"""
from __future__ import annotations
import os
from typing import List, Optional

from .base import AIProvider, LLMResult, FileAttachment, LLMError


class EmergentProvider(AIProvider):
    name = "emergent"

    # Approximate end-user pass-through rates for cost display.
    RATES = {
        "gemini-3-flash-preview": {"in": 0.30 / 1_000_000, "out": 2.50 / 1_000_000},
        "gemini-1.5-flash":       {"in": 0.075 / 1_000_000, "out": 0.30 / 1_000_000},
        "gemini-1.5-pro":         {"in": 1.25 / 1_000_000, "out": 5.00 / 1_000_000},
        "claude-sonnet-4-5":      {"in": 3.00 / 1_000_000, "out": 15.0 / 1_000_000},
        "gpt-4o":                 {"in": 2.50 / 1_000_000, "out": 10.0 / 1_000_000},
        "gpt-4o-mini":            {"in": 0.15 / 1_000_000, "out": 0.60 / 1_000_000},
    }

    async def chat(self, *, model: str, system: str, user: str,
                    files: Optional[List[FileAttachment]] = None,
                    session_id: str = "default", json_mode: bool = False) -> LLMResult:
        from emergentintegrations.llm.chat import LlmChat, UserMessage, FileContentWithMimeType

        api_key = os.environ.get("EMERGENT_LLM_KEY", "")
        if not api_key:
            raise LLMError(self.name, model, RuntimeError("EMERGENT_LLM_KEY not set"))

        # Pick provider based on model id
        if model.startswith("gemini"):
            sdk_provider = "gemini"
        elif model.startswith("claude"):
            sdk_provider = "anthropic"
        elif model.startswith(("gpt", "o1", "ft:gpt")):
            sdk_provider = "openai"
        else:
            sdk_provider = "gemini"

        chat = LlmChat(api_key=api_key, session_id=session_id, system_message=system).with_model(sdk_provider, model)

        # File attachments — only Gemini supports them via LlmChat
        file_contents = None
        if files and sdk_provider == "gemini":
            file_contents = [FileContentWithMimeType(file_path=f.path, mime_type=f.mime_type) for f in files]

        try:
            msg = UserMessage(text=user, file_contents=file_contents) if file_contents else UserMessage(text=user)
            text = await chat.send_message(msg)
            if not isinstance(text, str):
                text = str(text)
        except Exception as e:
            raise LLMError(self.name, model, e)

        # emergentintegrations doesn't expose actual token counts cleanly — approximate
        t_in = self.approx_tokens(system) + self.approx_tokens(user) + (1500 if file_contents else 0)
        t_out = self.approx_tokens(text)
        return LLMResult(
            text=text, tokens_in=t_in, tokens_out=t_out,
            cost_inr=self.estimate_inr(model, t_in, t_out),
            model_used=model, provider=self.name,
        )
