# HRMS Software - PRD

## Architecture
- Frontend: React 19 + Tailwind + Shadcn/UI + Phosphor Icons
- Backend: FastAPI + MongoDB, Auth: JWT, Storage: Emergent Object Storage, PDF: reportlab

## Implemented (Phases 1 → 8B)

### Phase 1-3 — Core HRMS, Indian Compliance, Organization & Statutory Compliance
### Phase 4-5 — Policy Management (10 types) + Enhanced Attendance Policy
### Phase 6 — Attendance Collection & Management
### Phase 7 — Salary Structure v1 (components, templates, compute engine)
### Phase 8A — P0 Payroll Completion
Bonus / Gratuity / Incentive / Advance / Loan calculation engines, Payslip PDF, Monthly Payroll Run, FnF Settlement.

### Phase 9 — Employee Profile v2 (Feb 21, 2026)

**Backend endpoints** (all with admin RBAC):
- `GET /employees/meta/last-code` — last created employee_code for manual-entry reference
- `GET /employees/meta/bulk-upload-template` — returns CSV header, mandatory + unique fields list
- `GET /employees/{id}/profile` — full profile dict (all 100+ fields, bypasses restrictive response model)
- `POST /employees/profile` — flexible create with mandatory + uniqueness validation
- `PUT /employees/{id}/profile` — flexible update
- `PUT /employees/{id}/approval-hierarchy` — sets leave / attendance / overtime / reimbursement / payroll approvers + general_manager
- `POST /employees/bulk-upload` — CSV-driven batch create with per-row pass/fail report
- `GET/POST/DELETE /employees/{id}/documents` — employee documents (general / recruitment / payslip / kyc / statutory / other categories)

**Uniqueness enforcement** across 13 fields (`employee_code, email, phone, pan, aadhaar, uan_no, pf_account_no, pension_account_no, edli_account_no, esic_account_no, lin_no, passport_no, driving_license_no`) — only checked against **active** employees; terminated/resigned/separated employees free up their identifiers for rejoiners.

**Frontend**:
- New `EmployeeProfileForm` component (12 tabs): Personal → Contact → Address → Employment → Salary & Bank → Statutory (PF/Pension/ESIC/PT/LWF + detailed sub-fields shown when members) → KYC/Identity → Voluntary PF/Pension → Previous Employment → Approval Hierarchy → Salary/Policy Assignment → Documents.
- **"Last Employee ID" hint** visible top-right during new employee creation.
- **CSV Template download** + **Bulk Upload** dialogs on EmployeesPage with per-row result display.
- Conditional required fields: PF member → UAN/PF A/C, ESIC member → ESIC A/C.
- "Same as correspondence address" toggle auto-copies fields.
- Permanent backward compat: `EmployeeResponse` now has optional fields so legacy records + new flexible ones both list cleanly.

### Phase 8C — Seed Kit + Policy↔Salary Linkage (Feb 21, 2026)
**Default Component Kit** (`POST /api/salary-components/seed-defaults`, idempotent):
22 opinionated components showcasing Phase 8B features:
- Earnings: Basic, DA (10% of Basic), HRA (40%), Conveyance, Special, Medical (attendance-independent)
- **Overtime group**: OT @ 1.5x / 2x / 3x with embedded `ot_config` (rate_type, factor, hours_per_day)
- **Bonus group**: Statutory Bonus / Performance Bonus / Festival Bonus
- Deductions: PF (auto-pair), ESIC (with applicability ≤ ₹21k rate gross), PT-MH (slab + gender differentiation), PT-TN (progressive semi-annual), LWF, TDS, Loan EMI, Advance EMI
- Provisions: Gratuity (4.81% of Basic), Leave Encashment (2%)
- UI: "Seed Defaults" button top-right on Salary Structure page.

**Policy ↔ Salary Template Linkage**:
- Salary template now accepts `leave_policy_id`, `attendance_policy_id`, `overtime_policy_id`, `reimbursement_policy_id`, `bonus_policy_id`, `gratuity_policy_id`.
- New endpoint `GET /api/salary-templates/{id}/resolved-links` returns the template with fully hydrated policy + compliance link objects.
- UI: "Policy Links" section inside Create/Edit Salary Template dialog with 6 dropdowns populated from each policy type.

### Phase 8B — Salary Compute v2 (Feb 21, 2026)
Major schema + engine overhaul per user's deep-dive requirements:

**Schema changes to `salary_components`:**
- Added: `group` (free-form label grouping related variants), `attracts_bonus`, `calc_basis_mode` (rate|earned), `applicability_basis_mode` (rate|earned), `applicability` object, `has_slabs`, `slabs[]`, `slab_salary_basis`, `calc_sources`, `calc_source_group`, `attendance_dependent`, `ot_config` (for overtime components).
- Removed: `is_statutory` (statutory behavior now driven purely by `auto_pair_key`).

**Calculation engine additions:**
- New calc types: `percentage_of_inclusion`, `percentage_of_exclusion`, `percentage_of_group:<name>`, `percentage_of_club` (with `calc_sources` codes).
- **Rate vs Earned salary**: `rate_days` (scheduled) & `earned_days` (actual attended) drive a per-component attendance factor. Each component declares `calc_basis_mode` & `applicability_basis_mode` so admin controls whether the formula/applicability uses the ideal full-month rate or actual earned value.
  - Example: ESIC applies if **rate** inclusion ≤ ₹21k; ESIC amount computed on **earned** gross.
- **Applicability filter**: skip component entirely when employee's salary fails a min/max rule; basis = gross/inclusion/exclusion/basic/ctc/group/club; operator = <, ≤, >, ≥, between. Skipped components reported in `skipped_components[]`.
- **Slab engine** for deductions/provisions: per-slab parameters `gender`, `min_age/max_age`, `employee_category`, `salary_from/to`, `fixed_amount` OR `rate_pct` + `rate_on`. Slab salary basis configurable.
- PF/ESIC/PT statutory auto-calc now rate/earned-aware: PF cap ₹15k by rate, computed on earned; ESIC threshold checked by rate gross; PT slab pro-rated for attendance.

**UI overhaul** (`SalaryStructurePage.js`):
- Component dialog fully rebuilt with: Group input, Classification, Calc Basis (Rate/Earned), Applicability section (toggle + basis + mode + operator + value[+max]), Slab builder (toggle + per-slab row with Gender/Age/Category/Salary-Range/Fixed-or-%), Attracts row with **Bonus** alongside PF/ESIC/PT/LWF/OT/TDS, Overtime Configuration block (shown when group='overtime', migrating config from Policy → component), Attendance-Dependent switch.
- Statutory pill removed from component list; group badge, slabs badge, applicability badge added.

## Test coverage — 81/81 passing
- `/app/backend/tests/test_salary_compute.py` (19) — Phase 7 regression
- `/app/backend/tests/test_payroll_calc.py` (29) — Bonus/Gratuity/Incentive/Advance/Loan pure functions
- `/app/backend/tests/test_phase8a_apis.py` (19) — HTTP integration
- `/app/backend/tests/test_compute_v2.py` (9) — Rate/Earned, applicability, group, slab, bonus attracts
- `/app/backend/tests/test_compute_v2_extra.py` (5) — user's sample scenarios a/b/c/d reproduction
- Verified exact values: Basic=20k/25-of-30-days → PF emp ₹1500; 2-component Conveyance group + 10% Bonus → ₹350; PT slab 18k gross → ₹200; 25k basic + ESIC≤21k applicability → ESIC skipped.

## Test Credentials
- Admin: admin@hrms.com / admin123 (login_as: "admin")
- Employee: employee@hrms.com / emp123
- Employee: priya@hrms.com / priya123 (manager of Rahul)

## Remaining Roadmap (user approved "all of the above" on prior turn)

### Phase 8C — Link Policies ↔ Salary Templates (P0, user-flagged as missing)
- Salary template to link leave_template_id, attendance_template_id, overtime_template_id, bonus_template_id (already links PF/ESIC/PT/LWF/TDS compliance templates).
- Resolve links during salary-compute so policy rules (e.g., overtime factor) drive calculations.

### Phase 9 — Reports & Analytics
- Dashboard charts, PF-ECR / ESIC return / PT / TDS Form 24Q / Salary Register, Audit log.

### Phase 10 — HR Module Expansion
- Recruitment/ATS, Performance (OKR), L&D, Document vault, Self-service.

### Phase 11 — Platform & Security
- Refactor `server.py` (now 3000+ lines) into `/backend/modules/salary_engine/*.py`, split SalaryStructurePage.js into ComponentDialog/TemplateDialog/SlabBuilder/ApplicabilityBuilder.
- Background jobs for large payroll runs.
- RBAC matrix UI, 2FA, sessions, Google Auth.

### Phase 12 — Mobile / SaaS / Extras
- PWA, multi-tenant, theming, biometric hardware, What-if CTC calculator, slab overlap/gap validation, component-code uniqueness guards.

## Known code-review suggestions (non-blocking, from iter_10)
- Slab overlap validation at save-time
- Component code uniqueness
- Monolithic server.py and SalaryStructurePage.js refactor
- Payroll Run background task for 100+ employees
