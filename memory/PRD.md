# HRMS Software - PRD

## Original Problem Statement
Build an HRMS software with two-tier login (Admin/Employee), admin-controlled permissions, employee hierarchy for approvals, Indian labour law compliance, document management, notifications, onboarding, organization setup, and statutory compliance master with template-based system.

## Architecture
- **Frontend**: React 19 + Tailwind CSS + Shadcn/UI + Phosphor Icons
- **Backend**: FastAPI (Python) + MongoDB
- **Auth**: JWT-based with two roles (Admin/Employee)
- **Storage**: Emergent Object Storage for document uploads

## What's Been Implemented

### Phase 1 - Core HRMS (Apr 2026)
- [x] Two-tier auth (Admin/Employee login tabs)
- [x] Permission system (10 toggleable modules per employee)
- [x] Employee hierarchy with reports_to chain
- [x] Dashboard, Employee CRUD, Departments, Designations
- [x] Attendance, Leave, Reimbursement, Recruitment, Performance

### Phase 2 - Indian Compliance & Features (Apr 2026)
- [x] Indian Tax: PF, ESIC, TDS (New Tax Regime 2024-25), PT, CTC calculator
- [x] Leave balance tracking with configurable policies
- [x] Document upload (Aadhaar, PAN, resume, certificates)
- [x] In-app notifications with bell icon
- [x] Onboarding checklist, Password reset

### Phase 3 - Organization Setup & Statutory Compliance (Apr 2026)
- [x] **Organization Details**: Company info, locations/sub-units, employee grades (Unskilled/Semi-skilled/Skilled/Highly Skilled), customizable employee levels, shift master with timings
- [x] **Setup Wizard**: Prompt on dashboard when org not configured
- [x] **Statutory Compliance Templates** (5 types, each with full CRUD):
  - **PF Templates**: PF applicable, office, code, coverage dates, contribution rate (default 12%), EDLI details, exemption info, signatory, wage ceiling, admin charges
  - **ESIC Templates**: Code, commencement date, local office, employee/employer contribution rates, wage ceiling, signatory, dispensary
  - **PT Templates**: Code, jurisdiction state/city, custom salary+gender slabs, configurable deduction frequency (monthly/quarterly/half-yearly)
  - **LWF Templates**: Code, jurisdiction, custom salary slabs, configurable frequency
  - **TDS Templates**: Tax regime (new/old), employer TAN/PAN, standard deduction, cess rate, Section 192 compliance
- [x] **Template Assignment**: Individual employee + bulk assign by location/department

## Prioritized Backlog
### P0
- PDF payslip download with template-based deductions
- Email/SMS notifications
- Holiday calendar management
### P1
- Advanced analytics with Recharts
- Leave carry-forward/encashment
- Bulk employee import (CSV)
### P2
- PWA support, Audit trail, Multi-tenant
