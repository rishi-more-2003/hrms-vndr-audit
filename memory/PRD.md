# HRMS Software - PRD

## Original Problem Statement
Build an HRMS with two-tier login, admin permissions, hierarchy approvals, Indian labour law compliance, statutory compliance master with template-based system for PF/ESIC/PT/LWF/TDS.

## Architecture
- Frontend: React 19 + Tailwind CSS + Shadcn/UI + Phosphor Icons
- Backend: FastAPI + MongoDB
- Auth: JWT (Admin/Employee)
- Storage: Emergent Object Storage

## Implemented Features

### Phase 1 - Core HRMS
- Two-tier auth, 10-module permission system, employee hierarchy, dashboard, CRUD, attendance, leave, reimbursements, recruitment, performance

### Phase 2 - Indian Compliance & Features
- Indian tax calculator (PF/ESIC/TDS/PT/CTC), leave balance tracking, document upload, notifications, onboarding, password reset

### Phase 3 - Organization & Statutory Compliance
- Organization setup: company info, locations, grades (Unskilled/Semi-skilled/Skilled/Highly Skilled), custom levels, shift master
- Setup wizard prompt on dashboard

### Phase 3.1 - Advanced Compliance Updates
- **PF Templates**: Conditional fields:
  - PF Exempted YES → shows Trust Name, Industry Type, Exemption Section/Date/Authority, Board Date/Term
  - EDLI Exempted YES → shows EDLI Master Policy, Premium, Payment Date, Policy Period, Insurer
  - Both hidden when NO
- **PT & LWF Templates**: Advanced slab configuration:
  - Deduction Frequency (from employee): monthly/quarterly/half-yearly
  - Payment Frequency (to government): monthly/quarterly/half-yearly
  - Slab Salary Basis Period: same_as_deduction / monthly / 3-month cumulative / 6-month cumulative / annual (handles Chennai-style 6-month salary slabs)
  - Deduction Method when frequencies differ: Spread (divide total across months) / Lump Sum
  - Exit/Separation Handling: Deduct from final salary / Company bears / Pro-rata
  - Custom salary slabs by Gender (Male/Female rates)

## Prioritized Backlog
### P0
- PDF payslip with template-based deductions
- Holiday calendar management
### P1
- Advanced analytics, leave carry-forward, bulk CSV import
### P2
- PWA, audit trail, multi-tenant
