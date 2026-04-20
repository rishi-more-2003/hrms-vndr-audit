# HRMS Software - PRD

## Architecture
- Frontend: React 19 + Tailwind + Shadcn/UI + Phosphor Icons
- Backend: FastAPI + MongoDB, Auth: JWT, Storage: Emergent Object Storage, PDF: reportlab

## Implemented (Phases 1-8A)

### Phase 1-3: Core HRMS, Indian Compliance, Organization & Statutory Compliance
### Phase 4-5: Policy Management (10 types), Enhanced Attendance Policy
### Phase 6: Attendance Collection & Management (clock-in/out, manual, missed-punch, bulk month-end, dual view)
### Phase 7: Salary Structure (components + templates + compute engine, Indian Labour Law-compliant)

### Phase 8A — P0 Payroll Completion (Feb 20, 2026)
**New calculation engines** in `/app/backend/payroll_calc.py`:
- **Bonus** (Payment of Bonus Act 1965): ₹21k eligibility ceiling, ₹7k calc ceiling, 8.33–20% band, pro-rata.
- **Gratuity** (Payment of Gratuity Act 1972): 15/26 formula, 5-yr rule (waived on death/disability), ₹20L cap.
- **Incentive/Commission**: fixed, percentage, slab-based, target-based with min-achievement.
- **Salary Advance**: EMI schedule with interest, max % of salary eligibility.
- **Employee Loan**: reducing-balance / simple interest, EMI % cap eligibility.

**New endpoints**:
- `POST /api/bonus/compute`, `/gratuity/compute`, `/incentive/compute`, `/advance/compute`, `/loan/compute`
- `/api/advances` and `/api/loans` CRUD (with auto-computed schedule; re-computes on financial-field update)
- `POST /api/payslip/generate` → returns **styled PDF** (reportlab) with earnings/deductions/net pay/provisions
- `/api/payroll/runs` CRUD — **Monthly Payroll Run engine**: processes all assigned employees, records skipped; freeze → paid workflow; duplicate-period guard (409 unless `force: true`)
- `POST /api/fnf/compute` — **Full & Final Settlement**: unpaid salary + leave encashment + gratuity + reimbursements − notice recovery − outstanding loans

**New UI**: `/payroll-runs` admin page (PayrollRunPage.js) with:
- Month/year create dialog with duplicate-period force-confirm
- Run cards (draft/frozen/paid status)
- Expandable line items showing earnings/deductions/provisions per employee
- Per-employee Payslip PDF download button
- Freeze, Mark-Paid, Delete workflow

**Security**:
- `/advances` & `/loans` GET enforces own-scope for employees; admins can filter by any employee_id
- `/payslip/generate` validates employee_id; employees forbidden to generate others' payslips

## Test coverage
- `/app/backend/tests/test_salary_compute.py` — 19 tests (Phase 7)
- `/app/backend/tests/test_payroll_calc.py` — 29 tests (pure functions)
- `/app/backend/tests/test_phase8a_apis.py` — 19 HTTP integration tests
- **Total: 67/67 passing** ✅

## Test Credentials
- Admin: admin@hrms.com / admin123 (login_as: "admin")
- Employee: employee@hrms.com / emp123
- Employee: priya@hrms.com / priya123 (manager of Rahul)

## Remaining Roadmap (user approved "all of the above")

### Phase 8B (next) — Workflow polish
- "Assign Salary Template" shortcut from employee list (so Payroll Runs actually populate)
- Payslip generation from Payroll Run (currently wired; needs seeded-data happy-path demo)

### Phase 9 — Reports & Analytics (P2 from suggestions)
- Dashboard charts (headcount, attrition, attendance trends, leave util, salary cost per dept)
- Govt-format reports: PF ECR, ESIC Monthly Return, PT return, TDS Form 24Q, Salary Register
- Audit log per entity

### Phase 10 — HR Module Expansion
- Recruitment/ATS, Performance Mgmt (KRAs/OKRs), L&D, Employee Self-Service extensions
- Document vault per employee

### Phase 11 — Platform & Security
- **Refactor** `server.py` (2800+ lines) → modular `routes/`
- Move `_build_payslip_pdf` to `payslip_pdf.py`
- Background jobs for large payroll runs (>100 employees)
- RBAC permission matrix UI, 2FA, session management, Google Auth
- CI pytest GitHub Actions

### Phase 12 — Mobile & SaaS
- Mobile/PWA responsiveness
- Multi-tenant support if selling SaaS
- Theming (dark mode, logo/color per tenant)
- Biometric / Geo-tagged attendance hardware
- What-if CTC calculator for recruiters

## Known minor issues (non-blocking)
- Dialog accessibility: React dev warning persists despite hidden-description fix (cosmetic only)
- Payroll Run for 100+ employees runs synchronously — should move to background task
- Run cards show "0 employees" when no salary templates assigned — empty-state copy could clarify
