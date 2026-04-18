# HRMS Software - PRD

## Architecture
- Frontend: React 19 + Tailwind + Shadcn/UI + Phosphor Icons
- Backend: FastAPI + MongoDB, Auth: JWT, Storage: Emergent Object Storage

## Implemented (Phases 1-5)

### Core: Two-tier auth, permissions, hierarchy, CRUD, attendance, leave, reimbursements, recruitment, performance
### Indian Compliance: PF/ESIC/TDS/PT calculator, leave balance, documents, notifications, onboarding
### Organization: Setup wizard, locations, grades, levels, shifts
### Statutory Compliance: PF/ESIC/PT/LWF/TDS templates with conditional fields, bulk assign
### Policy Management (9 types):

**Leave Policy**: 6 leave types (CL/SL/EL/ML/PL/WFH) with frequency, application window, carry forward, encashment, clubbing, earned leave credit cycle, sick leave medical docs + auto-approval, maternity/paternity eligibility, WFH pay type, sandwich rule, holiday calendar

**Attendance Policy (Enhanced)**: Pay basis, month day calc (actual/fixed with discrepancy warning + 4 handling options), salary cycle, week offs (paid/unpaid + day selector), duty hours, late comer penalty (warning/half-day/quarter-day/proportional/accumulated), early departure penalty, double login handling (with manager approval for re-login), auto-logout (buffer + manager/employee alerts), shift-specific rules (grace/half-day/quarter-day/min hours/auto-absent), comp-off, biometric

**Overtime Policy**: Allowed toggle, fixed/calculative rates, OT factors (1x/1.5x/2x/3x/custom), actual/fixed day calculation basis, per-day/week/month/quarter caps, pre-approval, manager alerts, holiday OT rates

**Reimbursement Policy**: Claims allowed, min/max amounts, frequency limits, document requirements, direct/manager/hybrid approval modes with auto-approve thresholds, multi-level approval

**Bonus Policy**: Statutory/performance/festival/annual types, % of basic/gross/CTC, min days eligibility, statutory min/max, pro-rata
**Gratuity Policy**: Min years service, factor (15 days default), salary basis, max amount, auto-calc on exit
**Incentive Policy**: Fixed/percentage/slab/target-based, payment frequency, min target achievement, pro-rata
**Advance Policy**: Max % of salary, max amount, repayment months, interest, approval
**Loan Policy**: Max amount, salary multiple, repayment, simple/reducing interest, EMI deduction, multiple loans

## Test Credentials
- Admin: admin@hrms.com / admin123
- Employee: employee@hrms.com / emp123, priya@hrms.com / priya123
