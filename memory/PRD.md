# HRMS Software — PRD

## Architecture
- Frontend: React 19 + Tailwind + Shadcn/UI + Phosphor Icons
- Backend: FastAPI + MongoDB (Motor async), Auth: JWT, Storage: Emergent Object Storage, PDF: reportlab

## Implemented (Phases 1 → 10 ✅)

### Phase 1-3 — Core HRMS, Indian Compliance, Organization & Statutory Compliance
### Phase 4-5 — Policy Management (10 types) + Enhanced Attendance Policy
### Phase 6 — Attendance Collection & Management
### Phase 7 — Salary Structure v1 (components, templates, compute engine)
### Phase 8A — P0 Payroll Completion
Bonus / Gratuity / Incentive / Advance / Loan calc engines, Payslip PDF, Monthly Payroll Run, F&F Settlement backend engine.

### Phase 8B — Salary Compute v2 (Rate/Earned, Applicability, Slabs, Groups)
### Phase 8C — Default Component Kit + Policy ↔ Salary Template Linkage
### Phase 9 — Employee Profile v2 (12 tabs, 100+ fields, bulk upload, documents, approval hierarchy)

### Phase 10 — Employee Self-Service ✅ (Feb 22, 2026 — VERIFIED GREEN)

**Backend** (22/22 pytest passing — test_employee_selfservice.py + test_selfservice_security.py):
- `GET /api/employees/me/profile` — returns full self-profile (no _id leak, all pass-through fields)
- `PUT /api/employees/me/profile` — whitelist-filtered update (only EMP_EDITABLE fields applied; salary/statutory/KYC silently dropped server-side)
- `POST /api/employees/me/profile/request-change` — queues a change request
- `GET /api/employees/me/documents`, `GET /api/employees/me/effective-policies`
- Admin: `GET /api/employee-change-requests?status=pending`, `PUT /api/employee-change-requests/{id}/approve|reject` with audit log

**Frontend** (iteration_12.json — 100% green):
- `/my-profile` page wraps `EmployeeProfileForm` with `selfMode=true`
- Sidebar (`Layout.js`) shows "My Profile" for all non-admin users (permission filter now bypasses `my_profile` module)
- **6 locked tabs** (Employment, Salary & Bank, Statutory, KYC/Identity, Voluntary, Previous Emp) wrapped in `<fieldset disabled={selfMode}>` — HTML5 cascades `:disabled` to every input/select/switch; editable tabs (Personal/Contact/Address) remain interactive.
- **Request Change** uses a proper shadcn `Dialog` with field-picker Select, Value input, Reason textarea — NO more `window.prompt`. `PROTECTED_FIELDS_BY_TAB` drives the per-tab field options.
- "My Change Requests" list renders PENDING/APPROVED/REJECTED badges with reasons on the My Profile page.

## Test Credentials
- Admin: admin@hrms.com / admin123 (login_as: "admin")
- Employee: employee@hrms.com / emp123 (Rahul)
- Employee: priya@hrms.com / priya123 (Priya — Rahul's manager)

## Test coverage
- Backend: 22/22 self-service tests + 81/81 earlier salary/payroll/profile tests = 103/103 pytest
- Frontend E2E: iteration_10 (salary v2), iteration_11 (self-service — 3 bugs), iteration_12 (all 3 bugs fixed ✅)

## Roadmap (approved — in order)

### 🔴 P0 — `server.py` Refactor (3,678 lines, blocker for future modules)
Split into `/app/backend/routes/` (auth, employees, salary, policies, payroll, attendance, self_service, compliance, documents).

### 🟠 P0 — Full & Final Settlement UI
Backend engine exists. Build UI: exit trigger → leave encashment preview → gratuity → notice adjustment → LWF/PT pro-rata → final payslip PDF.

### 🟡 P1 — Recruitment / ATS
Job posts, candidates, pipeline stages, offer letters.

### 🟡 P1 — Performance Management
Goals, KRAs/OKRs, 1-on-1s, review cycles.

### 🟢 P2 — Reports Module
Headcount, attendance muster, payroll register, PF-ECR, ESIC return, PT, Form 24Q in govt formats.

### 🟢 P2 — Dashboard Analytics (charts)
### 🟢 P2 — Biometric / RFID hardware sync (currently mocked)
### 🟢 P2 — Mobile / PWA compliance pass

## Known minor code-review notes (non-blocking)
- EmployeeProfileForm.js now ~720 lines — consider per-tab component split.
- Slab overlap/gap validation at save-time (salary components).
- Component code uniqueness across classifications.
- Payroll Run BackgroundTask for 100+ employees.
