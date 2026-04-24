# Saffron Services — Labour-Law Compliance SaaS Platform

## Vision
Unified labour-law compliance SaaS for Indian employers. Five modules, one platform, bundle-based pricing. Built by labour-law consultants (your firm), sold to employers who need end-to-end statutory compliance.

## Architecture
- **Frontend**: React 19 + Tailwind + Shadcn/UI + Phosphor Icons. Warm earth-tone palette (saffron-to-gold gradients).
- **Backend**: FastAPI + MongoDB (Motor async), JWT auth (bcrypt), APScheduler (daily tasks), pdfplumber + openpyxl + reportlab
- **Multi-tenancy**: `organizations` collection. Every client = one org with subscription + enabled modules map. Legacy data backfilled into a default platform org.
- **Four user roles**: `platform_admin` (Saffron founders), `admin` (tenant HR/ops), `employee`, `contractor` (vendor audit)

## 5 Modules

### 1. HRMS ✅ — Phases 1-10 complete
Payroll, attendance, leave, employee self-service, 12-tab employee profile, Salary Structure v2, Payroll Runs, Payslip PDFs, F&F backend engine.

### 2. Vendor Labour Audit ✅ — V1+V2+V3 complete
Contractor portal, 7 PDF parsers (PF ECR / Challan / Paid / ESIC Contribution History / Paid / PT Paid / Return), employee-level rule engine (PF, ESIC, PT-MH, MLWF, Min Wages, Structure, Payment of Wages, cross-document), PF/ESIC/PT statutory registers, email outbox, auto audit windows (APScheduler daily), preview + impersonate.

### 3. Register Maker 🚧 — Stub (Coming Soon)
Will auto-generate statutory registers across central + state labour laws from a single Excel upload.

### 4. Internal Labour Audit 🚧 — Stub (Coming Soon)
Will continuously self-audit the tenant's own payroll & statutory compliance.

### 5. Consultancy Desk 🚧 — Stub (Coming Soon)
Will provide a ticket/document-vault system for labour-law queries (PF/ESIC/PT).

## Saffron SaaS Platform Scaffolding ✅ (Apr 23, 2026)

### Marketing & Acquisition
- **Landing page** (`/`) — hero, 5 modules, pricing (3 bundles: Starter ₹199, Compliance ₹549, Complete ₹799), stats, why-us, contact form with lead capture
- **Contact form** (`POST /api/saas/contact`) writes to `contact_leads` collection → visible to Platform Admin

### Self-Serve Trial
- **Signup** (`/signup`) → `POST /api/saas/signup` creates org + first admin user with 14-day trial, selected modules enabled
- Auto-login + redirect to first selected module's dashboard
- `GET /api/saas/me/organization` returns tenant context (modules, trial status) for gating

### 5 Branded Login Portals
- `/hrms/login`, `/vendor-audit/login`, `/register-maker/login`, `/internal-audit/login`, `/consultancy/login`
- Shared user identity under the hood — single login works across all subscribed modules
- Module icon + tagline + themed (warm or dark) background per module
- `/login` central **Module Chooser** if user doesn't know which portal to use
- Admin AND employee credentials both accepted (login_as is optional — backend only enforces it on the legacy `/auth` tab-switcher)

### Cross-Module RBAC ✅ (Apr 24, 2026)
- `users.module_roles: {hrms, vendor_audit, register_maker, internal_audit, consultancy}` per-module role map
- Per-module roles: hrms [admin, employee] · vendor_audit [vendor, principal_employer, auditor] · register_maker [admin] · internal_audit [admin] · consultancy [admin, employee, consultant]
- Admin-only `/module-access` page inside HRMS to grant/revoke module roles
- `ModuleRoute` gate in App.js uses `AuthContext.hasModuleAccess(moduleKey)` — checks module_roles + legacy admin fallback
- Shared `ModuleSwitcher` dropdown mounted in HRMS Layout topbar AND ModuleShell header; only shown when user has 2+ accessible modules
- Endpoints: `GET /api/module-roles/{me,org-users,meta/roles}`, `PUT /api/module-roles/users/{id}/grant`, `DELETE /api/module-roles/users/{id}/revoke/{module}` (400 on unknown module)
- `/auth/login` and `/auth/me` now return `module_roles` + `organization_id` in user object

### Platform Admin Portal (hidden, founder-only)
- `/platform-admin/login` — dark branded portal
- Credentials: `founder@saffronservices.in` / `saffron123` (seeded on startup)
- Dashboard: total orgs, trial vs active, new leads count
- **Organizations** tab — list all tenants, per-org "Manage" dialog to toggle 5 modules + edit subscription (trial/active/expired/canceled, plan, trial_ends_at)
- **Leads** tab — contact-form submissions with status tracking

### Multi-Tenant Backend
- `organizations` collection: `{id, name, slug, modules: {hrms, vendor_audit, ...}: bool, subscription_status, plan, trial_ends_at, contact_email}`
- Default org (`saffron-default-org`) owns all legacy data for backward compat
- Platform admin endpoints: `/api/platform-admin/{organizations,organizations/{id}/modules,organizations/{id}/subscription,contact-leads,stats}`

## Testing (Apr 24, 2026)
- Backend: 87/87 pytest green (68 prior + 19 cross-module RBAC incl. Optional login_as, response-shape, revoke 400)
  - 5 Saffron SaaS
  - 27 Vendor Audit rules
  - 19 Vendor Audit e2e
  - 6 Vendor Audit V3
  - 11 Employee Self-Service
  - 19 Module Roles + Auth (cross-module RBAC)
- Frontend: E2E verified via testing_agent_v3_fork (iteration_16) — admin + employee logins on /hrms/login, Module Switcher shown for multi-module employees + hidden for single-module, ModuleRoute gates module dashboards correctly

## Recent Fixes
- **Apr 24, 2026** — Cross-module RBAC frontend wiring (ModuleRoute replacing AdminRoute, ModuleSwitcher in Layout topbar, ModuleLoginPage no longer hardcodes login_as='admin').
- **Apr 22, 2026** — Salary Template dialog scroll fix + compute guard.
- **Apr 22, 2026** — Vendor Audit: `run_full_audit` falls back to audit-level wage_month.

## Next Priorities

### 🔴 P0 — This week
- **Self-serve Stripe payment** — plug test key (`sk_test_emergent` already in env), let trial → paid upgrade work end-to-end. Stripe Checkout + webhook → updates `subscription_status` = "active".
- **Module-gate enforcement on frontend** — route guards that check `saas/me/organization.enabled_modules` and redirect to "Module not in your plan" if tenant hasn't subscribed.
- **Tenant scoping on existing HRMS + Vendor Audit data** — add `organization_id` filter to all list endpoints (currently still global).

### 🟠 P0 — Individual module builds
- **Register Maker** — 10-15 Indian labour-law register formats, Excel-template-driven, per-state variants
- **Internal Labour Audit** — reuse Vendor Audit rule engine against tenant's own payroll
- **Consultancy Desk** — ticket system + document vault, client + their employees can raise tickets

### 🟡 P1 — HRMS leftovers
- `server.py` refactor (3,709 lines → `/app/backend/routes/` split)
- F&F Settlement UI
- More central laws (Bonus, Gratuity, CLRA)
- Multi-state PT slabs (KA/TN/GJ/WB/TG)
- Govt-format statutory registers (Form A/B/Muster Roll/Form 5A/Form 32)

### 🟢 P2 — Growth
- Email delivery via Resend / SendGrid (env flag ready — just add API key)
- Dashboard analytics (submission-lag trend, most common findings, contractor leaderboard)
- Recruitment / ATS, Performance / OKRs, Mobile PWA
- Bulk contractor CSV onboarding
