"""Fine-tuning Studio — bring-your-own-key fine-tuning for Saffron's AI tasks.

Supports OpenAI fine-tuning (gpt-4o-mini, gpt-4.1-mini) end-to-end. Gemini
fine-tuning is surfaced as a tile but requires Vertex AI (deprecated in the
google-generativeai API-key path as of May 2025).

Workflow:
1. Create dataset (vendor_audit_extract / register_schema / register_normalize)
2. Upload PDF/Excel files; system runs current AI to bootstrap a candidate
   output, stored as a *pending* example.
3. Human reviews + edits the JSON ground truth in the UI; clicks Approve.
4. Mark a few examples as `holdout` (eval set, excluded from training).
5. Create a job → backend builds JSONL → uploads to OpenAI → creates FT job →
   polls every 60s in the background. On success the fine-tuned model id is
   stored on the job.
6. Run an eval → backend runs the base model and the fine-tuned model on each
   holdout example, computes JSON field-level F1, and exposes side-by-side
   pairs for blind human judgment.
"""
from .routes import finetune_router
from .scheduler import poll_inflight_jobs

__all__ = ["finetune_router", "poll_inflight_jobs"]
