"""AIProvider abstract interface + value types."""
from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class FileAttachment:
    """A file the LLM should read directly (PDFs for vision, images, etc.)."""
    path: str
    mime_type: str
    # When sending to providers without native file support, we fall back to
    # base64-encoding inline; provider implementations decide.


@dataclass
class LLMResult:
    text: str
    tokens_in: int
    tokens_out: int
    cost_inr: float
    model_used: str
    provider: str
    raw_response: Optional[dict] = field(default=None)
    attempts: int = 1                       # number of attempts (incl. fallbacks)
    used_fallback: bool = False             # True if fallback chain triggered


class LLMError(Exception):
    """Wrapper around any provider-side failure so router can decide fallback."""
    def __init__(self, provider: str, model: str, original: Exception):
        self.provider = provider
        self.model = model
        self.original = original
        super().__init__(f"{provider}/{model}: {original}")


class AIProvider(ABC):
    """Every concrete provider (Emergent, Google native, OpenAI native) implements
    a single `chat` coroutine that converts our generic call into provider-specific
    SDK calls and returns a normalized `LLMResult`.
    """

    name: str = "abstract"

    @abstractmethod
    async def chat(
        self,
        *,
        model: str,
        system: str,
        user: str,
        files: Optional[List[FileAttachment]] = None,
        session_id: str = "default",
        json_mode: bool = False,
    ) -> LLMResult:
        ...

    # ── Cost helpers — providers expose per-million USD rates ──
    USD_TO_INR = 83.0
    RATES: dict = {}  # subclass overrides: { model_substring: {"in": $/tok, "out": $/tok} }

    def estimate_inr(self, model: str, t_in: int, t_out: int) -> float:
        """Match by longest model-name substring (so 'ft:gpt-4o-mini-X' falls back to 'gpt-4o-mini')."""
        rate = None
        best_len = 0
        for k, v in self.RATES.items():
            if k in model and len(k) > best_len:
                rate = v
                best_len = len(k)
        if not rate:
            return 0.0
        usd = t_in * rate["in"] + t_out * rate["out"]
        return round(usd * self.USD_TO_INR, 6)

    @staticmethod
    def approx_tokens(text: str) -> int:
        """Cheap fallback when provider doesn't expose actual token counts."""
        return max(1, len(text or "") // 4)
