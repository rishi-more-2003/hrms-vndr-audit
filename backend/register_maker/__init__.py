"""Register Maker module — AI-learned statutory register generation.

Phase A (current): Categories + template upload + AI schema extraction (preview).
Phase B (next):    Compatibility check vs uploaded data sheet + register generation.
Phase C (future):  Cross-tenant template fingerprint library (zero-AI re-use).
"""
from .routes import register_maker_router

__all__ = ["register_maker_router"]
