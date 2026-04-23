# HRMS + Vendor Audit Platform — PRD

## Architecture
- Frontend: React 19 + Tailwind + Shadcn/UI + Phosphor Icons
- Backend: FastAPI + MongoDB (Motor async), Auth: JWT (bcrypt), Storage: Emergent Object Storage, PDF: reportlab + pdfplumber, Excel: openpyxl
- Three user roles: `admin` (principal employer), `employee`, `contractor` (vendor)

## Implemented

### HRMS (Phases 1 → 10 ✅)
Phase 1-3 — Core HRMS, Indian Compliance, Organization & Statutory Compliance
Phase 4-5 — Policy Management (10 types) + Enhanced Attendance Policy
Phase 6 — Attendance Collection & Management
Phase 7 — Salary Structure v1
Phase 8A — Payroll Completion (Bonus/Gratuity/Incentive/Advance/Loan + Payslip PDF + Monthly Payroll Run + F&F backend)
Phase 8B — Salary Compute v2 (Rate/Earned, Applicability, Slabs, Groups)
Phase 8C — Default Component Kit + Policy ↔ Salary Template Linkage
Phase 9 — Employee Profile v2 (12 tabs, 100+ fields, bulk upload, document vault, approval hierarchy)
Phase 10 — Employee Self-Service (my-profile page, field locks, change-request queue with admin approval)

### Vendor Audit v1+v2 ✅ (Apr 22, 2026)
**Concept**: Principal employers (IT cos) hire contractors for non-core work (Housekeeping/Security/Canteen). Contractor employees work on principal's premises but are on contractor's payroll. Principal is legally responsible for statutory compliance of contractor employees. This module is the automated auditor.

**Backend** (`/app/backend/vendor_audit/`):
- `models.py` — 179-column `VENDOR_SHEET_COLUMNS`, 7 `PDF_DOC_TYPES`, Pydantic request models
- `parsers.py` — `parse_vendor_excel()` + 7 PDF parsers (PF ECR, PF Challan, PF Paid Challan, ESIC Contribution History, ESIC Paid Challan, PT Paid Challan, PT Return). Strict text-extraction rejects scanned PDFs.
- `rules.py` — employee-level rule engine: PF (UAN, cap, EPS, EDLI, 12% check), ESIC (0.75% + threshold), PT Maharashtra (male/female, Feb slab), MLWF (Jun/Dec), Min Wages (state floor), Structure (HRA metro/non-metro, Basic ≥ 50%, net sanity), Payment of Wages (date), Cross-document (ECR ≥ rows, ESIC paid ≥ expected).
- `registers.py` — PF/ESIC/PT register Excel builders
- `routes.py` — full CRUD for contractors + audit lifecycle (draft → uploaded → audited → submitted → approved/rejected)

**Frontend**:
- `/vendor-audit` (admin) — contractor CRUD + audit list + stats
- `/contractor/login` — dark branded portal
- `/contractor/dashboard` — welcome, establishment info, audit list, change-password
- `/contractor/audits/:id` + `/vendor-audit/audits/:id` — shared 4-tab audit run page (Upload / Review Extracted / Findings / Registers)

**Security**:
- Contractor JWT scoped — 403 on admin endpoints
- Contractor can only view/edit own audits
- HRMS endpoints reject contractor tokens
- Admin-invite-only contractor creation with temp password (must_change_password flag, mandatory change on first login)

**Testing**: 46/46 pytest passing (27 rule unit tests + 19 e2e integration tests). Full E2E verified: create contractor → contractor login → change password → start audit → upload Excel → upload PDF → review extracted → run audit (rule codes trigger correctly) → download registers → submit → admin approve.

**Supported Laws (phase 1)**:
- Central: PF (EPF/EPS/EDLI/Admin), ESIC, Minimum Wages Act, Payment of Wages Act
- State: Maharashtra PT (with Feb slab + half-yearly), Maharashtra LWF

## Test Credentials
See `/app/memory/test_credentials.md`.

## Roadmap

### 🔴 P0 — Vendor Audit Phase 3 (polish + scale)
- More state PT laws (Karnataka, Tamil Nadu, Gujarat, West Bengal, Telangana)
- More central laws: Bonus Act, Gratuity Act, CLRA
- Govt-format registers (Form A/B/Muster Roll/Form 5A/Form 32)
- Professional PDF audit report export
- Bulk contractor onboarding via CSV
- PDF parsing refinement per govt template variants
- Email/SMS for contractor invites (currently credentials shown to admin)

### 🟠 P0 — HRMS tech debt
- `server.py` refactor (3,679 lines → `/app/backend/routes/` split)
- F&F Settlement UI

### 🟡 P1 — HRMS new modules
- Recruitment / ATS
- Performance Management (OKRs)

### 🟢 P2
- Reports Module (PF-ECR / Form 24Q / Payroll Register)
- Dashboard Analytics, Biometric sync, Mobile PWA
- Slab overlap validation, component-code uniqueness

## Recent Fixes
- **Apr 22, 2026** — Salary Template dialog: fixed clipped scroll + compute guard.
- **Apr 22, 2026** — Vendor Audit: `run_full_audit` falls back to audit-level wage_month when row lacks it.

## Vendor Audit V3 ✅ (Apr 23, 2026)
- **Email outbox pattern** — zero-cost. All emails (welcome, audit-open, 3-day reminder, audit-closed) write to `email_outbox` Mongo collection. Admin views in new "Email Outbox" tab. Optional Resend / SendGrid delivery via `RESEND_API_KEY` / `SENDGRID_API_KEY` + `EMAIL_FROM` env vars (plug-and-play, no code change).
- **Auto audit window** — APScheduler daily job (06:00 IST). Admin sets per-contractor yearly schedule via bulk editor (default: open = 5th of next month, close = +10 days). On open day: auto-creates draft audit + emails contractor. 3 days before close: reminder email. On close day: auto-submits if 'uploaded/audited', marks 'missed' if 'draft' + emails closure notice.
- **Preview + Impersonate** — Admin can open contractor portal in new tab with short-lived (30 min) JWT:
  - Preview (`preview:true` claim) — read-only, all write endpoints return 403
  - Impersonate — full access, logged to `impersonation_log` audit trail
  - URL hash handoff (`#impersonate=TOKEN&mode=preview&from=NAME`) cleanly transitions session
  - Top banner clearly indicates session type with "Exit to admin" action
- **Tests**: 52/52 pytest (27 rules + 19 e2e + 6 v3)
