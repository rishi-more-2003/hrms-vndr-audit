"""Email service — Outbox pattern.

All outbound emails are written to the `email_outbox` Mongo collection for admin visibility.
If RESEND_API_KEY or SENDGRID_API_KEY is set in env, actual delivery is attempted as a best-effort;
otherwise the outbox is the source of truth (zero-cost dev/demo mode).
"""
from __future__ import annotations
import os
import uuid
import logging
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
import httpx

logger = logging.getLogger("email_service")


async def send_email(db, to: str, subject: str, body_html: str, *,
                     body_text: Optional[str] = None,
                     kind: str = "transactional",
                     meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Enqueue an email. Returns the outbox record."""
    record = {
        "id": str(uuid.uuid4()),
        "to": to,
        "subject": subject,
        "body_html": body_html,
        "body_text": body_text or "",
        "kind": kind,
        "meta": meta or {},
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": "queued",
        "provider": None,
        "provider_message_id": None,
        "error": None,
    }

    resend_key = os.environ.get("RESEND_API_KEY")
    sendgrid_key = os.environ.get("SENDGRID_API_KEY")
    from_email = os.environ.get("EMAIL_FROM", "onboarding@resend.dev")
    from_name = os.environ.get("EMAIL_FROM_NAME", "Vendor Audit Portal")

    if resend_key:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    "https://api.resend.com/emails",
                    headers={"Authorization": f"Bearer {resend_key}", "Content-Type": "application/json"},
                    json={"from": f"{from_name} <{from_email}>", "to": [to], "subject": subject, "html": body_html},
                )
                if resp.status_code in (200, 201, 202):
                    d = resp.json()
                    record.update({"status": "sent", "provider": "resend", "provider_message_id": d.get("id")})
                else:
                    record.update({"status": "failed", "provider": "resend", "error": f"HTTP {resp.status_code}: {resp.text[:200]}"})
        except Exception as e:
            record.update({"status": "failed", "provider": "resend", "error": str(e)[:300]})
    elif sendgrid_key:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    "https://api.sendgrid.com/v3/mail/send",
                    headers={"Authorization": f"Bearer {sendgrid_key}", "Content-Type": "application/json"},
                    json={
                        "personalizations": [{"to": [{"email": to}]}],
                        "from": {"email": from_email, "name": from_name},
                        "subject": subject,
                        "content": [{"type": "text/html", "value": body_html}],
                    },
                )
                if resp.status_code in (200, 202):
                    record.update({"status": "sent", "provider": "sendgrid"})
                else:
                    record.update({"status": "failed", "provider": "sendgrid", "error": f"HTTP {resp.status_code}: {resp.text[:200]}"})
        except Exception as e:
            record.update({"status": "failed", "provider": "sendgrid", "error": str(e)[:300]})
    else:
        # No provider configured — outbox-only mode
        record["status"] = "outbox_only"
        record["provider"] = "outbox"

    await db.email_outbox.insert_one(dict(record))
    record.pop("_id", None)
    return record


# ── Templates ──
def tmpl_welcome(contractor_name: str, email: str, temp_password: str, portal_url: str) -> Dict[str, str]:
    html = f"""
    <div style="font-family:Inter,system-ui,Arial,sans-serif;background:#FDFBF9;padding:28px;color:#2A2624">
      <div style="max-width:540px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;border:1px solid #E8E2D9">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px">
          <div style="width:40px;height:40px;border-radius:10px;background:#D96C5B;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700">🛡</div>
          <div><div style="font-size:10px;letter-spacing:2px;color:#D96C5B;font-weight:700;text-transform:uppercase">Contractor Portal</div><div style="font-size:18px;font-weight:600">Vendor Audit</div></div>
        </div>
        <h1 style="font-size:22px;margin:0 0 8px">Welcome, {contractor_name}</h1>
        <p style="margin:0 0 18px;color:#6A625E">Your audit portal is ready. Use the credentials below to sign in. You'll be prompted to change the password on first login.</p>
        <div style="background:#F9F6F0;border-radius:12px;padding:16px;margin:16px 0;font-family:monospace;font-size:13px">
          <div style="color:#A28B7A;font-size:10px;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Portal URL</div>
          <div style="color:#2A2624;word-break:break-all">{portal_url}</div>
          <div style="color:#A28B7A;font-size:10px;text-transform:uppercase;letter-spacing:1px;margin-top:12px;margin-bottom:4px">Email</div>
          <div style="color:#2A2624">{email}</div>
          <div style="color:#A28B7A;font-size:10px;text-transform:uppercase;letter-spacing:1px;margin-top:12px;margin-bottom:4px">Temporary Password</div>
          <div style="color:#D96C5B;font-weight:700">{temp_password}</div>
        </div>
        <a href="{portal_url}" style="display:inline-block;background:#D96C5B;color:#fff;text-decoration:none;padding:10px 22px;border-radius:8px;font-weight:600">Sign in now</a>
        <p style="margin-top:24px;font-size:12px;color:#A28B7A">If you didn't expect this email, you can safely ignore it.</p>
      </div>
    </div>
    """
    text = f"Welcome {contractor_name}. Portal: {portal_url}\nEmail: {email}\nTemp password: {temp_password}"
    return {"subject": f"Your Vendor Audit portal access — {contractor_name}", "html": html, "text": text}


def tmpl_audit_open(contractor_name: str, wage_month: str, close_date: str, portal_url: str) -> Dict[str, str]:
    html = f"""
    <div style="font-family:Inter,system-ui,Arial,sans-serif;background:#FDFBF9;padding:28px;color:#2A2624">
      <div style="max-width:540px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;border:1px solid #E8E2D9">
        <div style="font-size:10px;letter-spacing:2px;color:#D96C5B;font-weight:700;text-transform:uppercase;margin-bottom:6px">Audit window open</div>
        <h1 style="font-size:22px;margin:0 0 8px">{wage_month} audit is ready for submission</h1>
        <p style="color:#6A625E">Hi {contractor_name}, your monthly audit window for <b>{wage_month}</b> has opened. Please upload your payroll Excel and statutory PDFs before <b>{close_date}</b>.</p>
        <a href="{portal_url}" style="display:inline-block;background:#D96C5B;color:#fff;text-decoration:none;padding:10px 22px;border-radius:8px;font-weight:600;margin-top:10px">Start Upload</a>
      </div>
    </div>
    """
    return {"subject": f"Audit window open — {wage_month}", "html": html, "text": f"{wage_month} audit open. Close: {close_date}. {portal_url}"}


def tmpl_audit_reminder(contractor_name: str, wage_month: str, close_date: str, days_left: int, portal_url: str) -> Dict[str, str]:
    html = f"""
    <div style="font-family:Inter,system-ui,Arial,sans-serif;background:#FDFBF9;padding:28px;color:#2A2624">
      <div style="max-width:540px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;border:1px solid #E8E2D9">
        <div style="font-size:10px;letter-spacing:2px;color:#E8B25C;font-weight:700;text-transform:uppercase">⏰ Reminder</div>
        <h1 style="font-size:22px;margin:6px 0 8px">{days_left} day(s) left to submit {wage_month} audit</h1>
        <p style="color:#6A625E">Hi {contractor_name}, your audit window for <b>{wage_month}</b> closes on <b>{close_date}</b>. Please complete your submission before the deadline.</p>
        <a href="{portal_url}" style="display:inline-block;background:#D96C5B;color:#fff;text-decoration:none;padding:10px 22px;border-radius:8px;font-weight:600;margin-top:10px">Open Portal</a>
      </div>
    </div>
    """
    return {"subject": f"Reminder: {wage_month} audit closes in {days_left} day(s)", "html": html, "text": f"{wage_month} audit closes {close_date}. {portal_url}"}


def tmpl_audit_closed(contractor_name: str, wage_month: str, submitted: bool, portal_url: str) -> Dict[str, str]:
    status_msg = "Your audit was auto-submitted to the principal employer." if submitted else "⚠️ No submission received — audit flagged as MISSED."
    html = f"""
    <div style="font-family:Inter,system-ui,Arial,sans-serif;background:#FDFBF9;padding:28px;color:#2A2624">
      <div style="max-width:540px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;border:1px solid #E8E2D9">
        <div style="font-size:10px;letter-spacing:2px;color:#2A2624;font-weight:700;text-transform:uppercase">Audit window closed</div>
        <h1 style="font-size:22px;margin:6px 0 8px">{wage_month} audit window is now closed</h1>
        <p style="color:#6A625E">Hi {contractor_name}, the submission window for <b>{wage_month}</b> has closed. {status_msg}</p>
        <a href="{portal_url}" style="display:inline-block;background:#2A2624;color:#fff;text-decoration:none;padding:10px 22px;border-radius:8px;font-weight:600;margin-top:10px">View Audit</a>
      </div>
    </div>
    """
    return {"subject": f"{wage_month} audit window closed", "html": html, "text": f"{wage_month} audit closed. {status_msg}"}
