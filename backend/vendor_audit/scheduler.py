"""Daily scheduler for audit window open/close + reminders."""
from __future__ import annotations
import os
import logging
import uuid
from datetime import datetime, date, timezone
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from .email_service import send_email, tmpl_audit_open, tmpl_audit_reminder, tmpl_audit_closed

logger = logging.getLogger("audit_scheduler")

_scheduler: Optional[AsyncIOScheduler] = None


def _portal_url() -> str:
    return os.environ.get("PUBLIC_URL", "https://talent-board-14.preview.emergentagent.com") + "/contractor/login"


async def process_windows(db, today: Optional[date] = None) -> dict:
    """Idempotent daily pass. Called by scheduler OR admin manually via API."""
    today = today or datetime.now(timezone.utc).date()
    opened = 0
    closed = 0
    reminded = 0
    today_iso = today.isoformat()

    # ── OPEN ──
    async for sched in db.audit_schedules.find({"window_open_date": today_iso, "status": "scheduled"}):
        contractor = await db.contractors.find_one({"id": sched["contractor_id"]}, {"_id": 0})
        if not contractor:
            await db.audit_schedules.update_one({"id": sched["id"]}, {"$set": {"status": "orphaned"}})
            continue
        # Create draft audit if not exists
        existing = await db.audit_runs.find_one({"contractor_id": sched["contractor_id"], "wage_month": sched["wage_month"]})
        if not existing:
            aid = str(uuid.uuid4())
            await db.audit_runs.insert_one({
                "id": aid, "contractor_id": contractor["id"], "contractor_name": contractor.get("name", ""),
                "wage_month": sched["wage_month"], "state": contractor.get("state", "MAHARASHTRA"),
                "status": "draft", "created_at": datetime.now(timezone.utc).isoformat(),
                "created_by": "scheduler", "rows": [], "documents": {}, "parsed_documents": {},
                "audit_result": None, "manual_overrides": {},
                "schedule_id": sched["id"], "auto_created": True,
            })
            audit_id = aid
        else:
            audit_id = existing["id"]
        # Email the contractor
        t = tmpl_audit_open(contractor.get("name", "Contractor"), sched["wage_month"], sched["window_close_date"], _portal_url())
        await send_email(db, contractor["contact_email"], t["subject"], t["html"], body_text=t["text"],
                         kind="audit_open", meta={"contractor_id": contractor["id"], "audit_id": audit_id, "wage_month": sched["wage_month"]})
        await db.audit_schedules.update_one({"id": sched["id"]}, {"$set": {"status": "open", "audit_id": audit_id, "opened_at": datetime.now(timezone.utc).isoformat()}})
        opened += 1

    # ── REMIND (3 days before close) ──
    three_days_out = (today.fromordinal(today.toordinal() + 3)).isoformat()
    async for sched in db.audit_schedules.find({"window_close_date": three_days_out, "status": "open"}):
        contractor = await db.contractors.find_one({"id": sched["contractor_id"]}, {"_id": 0})
        if not contractor: continue
        t = tmpl_audit_reminder(contractor.get("name", "Contractor"), sched["wage_month"], sched["window_close_date"], 3, _portal_url())
        await send_email(db, contractor["contact_email"], t["subject"], t["html"], body_text=t["text"],
                         kind="audit_reminder", meta={"contractor_id": contractor["id"], "audit_id": sched.get("audit_id"), "wage_month": sched["wage_month"]})
        reminded += 1

    # ── CLOSE ──
    async for sched in db.audit_schedules.find({"window_close_date": today_iso, "status": "open"}):
        contractor = await db.contractors.find_one({"id": sched["contractor_id"]}, {"_id": 0})
        audit = await db.audit_runs.find_one({"id": sched.get("audit_id", "")}, {"_id": 0}) if sched.get("audit_id") else None
        submitted = False
        if audit:
            # Auto-submit if in 'uploaded' or 'audited' state
            if audit.get("status") in ("uploaded", "audited"):
                await db.audit_runs.update_one({"id": audit["id"]}, {"$set": {
                    "status": "submitted", "submitted_at": datetime.now(timezone.utc).isoformat(),
                    "auto_submitted": True,
                }})
                submitted = True
            elif audit.get("status") == "draft":
                await db.audit_runs.update_one({"id": audit["id"]}, {"$set": {
                    "status": "missed", "missed_at": datetime.now(timezone.utc).isoformat(),
                }})
        if contractor:
            t = tmpl_audit_closed(contractor.get("name", "Contractor"), sched["wage_month"], submitted, _portal_url())
            await send_email(db, contractor["contact_email"], t["subject"], t["html"], body_text=t["text"],
                             kind="audit_closed", meta={"contractor_id": contractor["id"], "audit_id": sched.get("audit_id"), "wage_month": sched["wage_month"], "submitted": submitted})
        await db.audit_schedules.update_one({"id": sched["id"]}, {"$set": {"status": "closed", "closed_at": datetime.now(timezone.utc).isoformat(), "auto_submitted": submitted}})
        closed += 1

    return {"date": today_iso, "opened": opened, "reminded": reminded, "closed": closed}


def start_scheduler(db):
    global _scheduler
    if _scheduler and _scheduler.running:
        return _scheduler
    _scheduler = AsyncIOScheduler(timezone="Asia/Kolkata")
    async def _run():
        try: await process_windows(db)
        except Exception as e: logger.error(f"Scheduler failed: {e}")
    _scheduler.add_job(_run, CronTrigger(hour=6, minute=0), id="vendor_audit_daily", replace_existing=True)
    _scheduler.start()
    logger.info("Vendor audit scheduler started (daily 06:00 IST)")
    return _scheduler
