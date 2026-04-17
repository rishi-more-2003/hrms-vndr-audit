# HRMS Software - PRD

## Architecture
- Frontend: React 19 + Tailwind CSS + Shadcn/UI + Phosphor Icons
- Backend: FastAPI + MongoDB
- Auth: JWT (Admin/Employee), Storage: Emergent Object Storage

## What's Been Implemented

### Phase 1 - Core HRMS
- Two-tier auth (Admin/Employee), 10-module permissions, employee hierarchy, CRUD, attendance, leave, reimbursements, recruitment, performance

### Phase 2 - Indian Compliance
- Indian tax calculator (PF/ESIC/TDS/PT/CTC), leave balance, document upload, notifications, onboarding

### Phase 3 - Organization & Statutory Compliance
- Organization setup (company info, locations, grades, levels, shifts)
- Compliance templates: PF (conditional PF/EDLI exemption fields), ESIC, PT (advanced slabs + frequency + exit handling), LWF (same), TDS
- Template assignment: individual + bulk by location/department

### Phase 4 - Policy Management (Current)
- **Leave Policy Templates** with per-type configuration:
  - Casual/Sick/Earned/Maternity/Paternity/WFH
  - Total allowed + frequency (weekly/monthly/quarterly/half-yearly/yearly)
  - Application window (days prior)
  - Carry forward (toggle + max limit), Encashment, Clubbing rules
  - Earned Leave: credit cycle, paid days per credit
  - Sick Leave: reporting window, medical docs threshold + frequency, auto-approve vs manager approval
  - Maternity/Paternity: eligibility min days worked, document requirements
  - WFH: enabled toggle, full/partial pay with percentage
  - Sandwich Rule, Negative Balance option
  - Holiday Calendar: date, name, type (national/state/festival/company)

- **Attendance Policy Templates**:
  - Pay basis (daily/monthly)
  - Month day calculation (actual/fixed 30/fixed 26/custom)
  - Salary cycle (start day + end day)
  - Week offs: count per week, specific days (Sun-Sat selector), paid/unpaid
  - Shift-specific rules: grace period, half-day after hours, min hours full day, auto-absent time
  - Comp-off for holiday/week-off work with validity
  - Late mark tracking (marks → half day conversion + frequency)
  - Early departure tracking, Biometric mandatory toggle

- **Policy Assignment**: Same as compliance - individual + bulk by location/department

## Test Credentials
- Admin: admin@hrms.com / admin123
- Employee (Rahul): employee@hrms.com / emp123
- Employee (Priya): priya@hrms.com / priya123

## Backlog
### P0 - Remaining policy types: Overtime, Reimbursement, Bonus, Gratuity, Incentive/Commission, Advance, Loan
### P1 - PDF payslip, Holiday calendar integration, Analytics
### P2 - PWA, Audit trail, Multi-tenant
