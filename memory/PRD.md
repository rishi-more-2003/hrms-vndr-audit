# HRMS Software - PRD

## Original Problem Statement
Build an HRMS software accessible via website and mobile. Two-tier login (Admin/Employee), with admin-controlled permissions, employee hierarchy for approvals, and future Indian labour law integration.

## Architecture
- **Frontend**: React 19 + Tailwind CSS + Shadcn/UI + Phosphor Icons
- **Backend**: FastAPI (Python) + MongoDB
- **Auth**: JWT-based with two roles (Admin/Employee)

## User Personas
1. **Admin** - Full access to all features, manages employees, permissions, hierarchy
2. **Employee** - Access only to modules permitted by admin

## Core Requirements
- Two-tier login system (Admin/Employee)
- Admin-controlled permission system per employee
- Hierarchical org chart for approval chains (leaves, reimbursements)
- Employee management, Attendance, Leave, Payroll, Recruitment, Performance, Reimbursements

## What's Been Implemented (Feb 2026)
- [x] Two-tier auth with Admin/Employee login tabs
- [x] Full permission system (8 toggleable modules per employee)
- [x] Employee hierarchy with reports_to chain
- [x] Approval chain logic (leave/reimbursement approvals follow hierarchy)
- [x] Dashboard with role-specific views (Admin stats vs Employee quick-access)
- [x] Employee CRUD with auto user account creation
- [x] Department & Designation management
- [x] Attendance (clock in/out)
- [x] Leave management (apply, approve/reject)
- [x] Reimbursement module (submit, approve, reject, disburse)
- [x] Recruitment (job postings, applications)
- [x] Performance (goals, reviews)
- [x] Responsive design (mobile-friendly)
- [x] Warm organic design theme (terracotta + sage green)

## Prioritized Backlog
### P0 (Next Sprint)
- Indian labour law integration (PF, ESIC, TDS compliance)
- Leave balance tracking with policy engine
- Payslip generation linked to actual salary structures

### P1
- Document upload/management (ID proofs, offer letters)
- Onboarding workflow/checklist
- Holiday calendar management
- Notification system (email/in-app)
- Password reset flow

### P2
- Advanced analytics & reports (charts, export)
- Bulk employee import (CSV)
- PWA support for mobile installation
- Audit trail logging
- Multi-company/tenant support

## Next Tasks
1. Integrate Indian labour law compliance (PF calculations, ESIC, TDS)
2. Add leave balance tracking with configurable leave policies
3. Implement payslip generation from salary structures
4. Add document upload functionality
5. Build notification system
