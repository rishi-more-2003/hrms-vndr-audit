# HRMS Software - PRD

## Architecture
- Frontend: React 19 + Tailwind + Shadcn/UI + Phosphor Icons
- Backend: FastAPI + MongoDB, Auth: JWT, Storage: Emergent Object Storage

## Implemented (Phases 1-7)

### Phase 1-3: Core HRMS, Indian Compliance, Organization & Statutory Compliance
### Phase 4-5: Policy Management (10 types), Enhanced Attendance Policy
### Phase 6: Attendance Collection & Management (clock-in/out, manual, missed-punch, bulk month-end, dual view)

### Phase 7 - Salary Structure (Feb 19, 2026 — hardened)
**Components library**: Earnings, Deductions, Provisions with category (standard/statutory), statutory badges (PF/ESIC/PT/LWF/OT/TDS), classification (inclusion_wages / exclusion / others), calc_type (fixed_amount, percentage_of_basic, percentage_of_gross, percentage_of_ctc), fixed vs variable, allow-direct-entry flag.

**Auto-pairing**: Creating a deduction with `auto_pair_key` (pf | esic | lwf) auto-creates partner provisions:
- PF → pf_employer_provision, pf_admin_charges_provision, pf_edli_charges_provision
- ESIC → esic_employer_provision
- LWF → lwf_employer_provision
Response returns both `auto_created_provisions` (newly created) and `paired_provisions` (full set including already-existing), so the UI always reflects the statutory pairing state.

**Salary Templates**: Group enabled components with per-component `calc_type`, amount/percentage, classification, statutory attracts flags. Optional linking of compliance templates (PF/ESIC/PT/LWF/TDS) per salary template for accurate slab-based computation.

**Bulk Assignment**: Assign a salary template to all employees in a location or department.

**Indian Labour Law-compliant Compute Engine** (`POST /api/salary-compute`):
- 2-pass earnings calc: fixed + % of basic (determines subtotal), then % of gross, then % of CTC.
- PF: 12% of min(pf_wages, ₹15,000) — employee + employer + 0.5% admin + 0.5% EDLI.
- ESIC: only if gross ≤ ₹21,000 → 0.75% employee + 3.25% employer.
- Professional Tax: slab-based per state (Maharashtra default: 0 / 175 / 200).
- TDS: New Regime 2024-25 with 75k std deduction, 87A rebate (≤ 7L = 0 tax) + marginal relief; honours custom slabs from linked TDS template.
- Returns per-component `amount` + totals: gross/net/CTC monthly + annual + full statutory summary.
- `use_statutory_auto=false` allows manual-only mode (user-supplied deductions/provisions only).

### Phase 8 (planned) - Deep Bonus/Gratuity/Advance/Loan policies (generic forms already exist; to deepen with Indian labour law specifics per user approval)

## Key APIs
- `POST /api/salary-components` — CRUD + auto-pairing
- `POST /api/salary-templates` — CRUD
- `POST /api/salary-compute` — authoritative calculation (backend-side)
- `POST /api/salary-assignments/bulk` — assign template by location / department / explicit list
- `POST /api/compliance-templates/{type}` — PF/ESIC/PT/LWF/TDS slab configs
- `POST /api/policy-templates/{type}` — 10 policy types

## Test Credentials
- Admin: admin@hrms.com / admin123 (login_as: "admin")
- Employee: employee@hrms.com / emp123
- Employee: priya@hrms.com / priya123 (manager of Rahul)

## Tests
- `/app/backend/tests/test_salary_compute.py` — 19 pytest tests verifying Indian statutory accuracy (PF ceiling, ESIC threshold, PT slabs, TDS 87A rebate + marginal relief, totals identity, auto-pairing).

## Backlog
- **P0** Deepen Bonus / Gratuity / Incentive / Advance / Loan policies with Indian labour law specifics (Payment of Bonus Act 1965, Gratuity Act 1972).
- **P1** Hardware/biometric attendance integrations.
- **P2** Mobile/PWA responsiveness pass.
- **Refactor** Split `server.py` (>2200 lines) into `routes/` modules: salary.py, policies.py, attendance.py, compliance.py, auth.py.
