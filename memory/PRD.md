# HRMS Software - PRD

## Original Problem Statement
Build an HRMS software accessible via website and mobile. Two-tier login (Admin/Employee), with admin-controlled permissions, employee hierarchy for approvals, Indian labour law compliance, document management, notifications, and onboarding.

## Architecture
- **Frontend**: React 19 + Tailwind CSS + Shadcn/UI + Phosphor Icons
- **Backend**: FastAPI (Python) + MongoDB
- **Auth**: JWT-based with two roles (Admin/Employee)
- **Storage**: Emergent Object Storage for document uploads

## User Personas
1. **Admin** - Full access to all features, manages employees, permissions, hierarchy
2. **Employee** - Access only to modules permitted by admin

## What's Been Implemented

### Phase 1 (Apr 2026)
- [x] Two-tier auth (Admin/Employee login tabs)
- [x] Permission system (10 toggleable modules per employee)
- [x] Employee hierarchy with reports_to chain
- [x] Approval chain logic (leave/reimbursement approvals)
- [x] Dashboard with role-specific views
- [x] Employee CRUD with auto user account creation
- [x] Department & Designation management
- [x] Attendance (clock in/out)
- [x] Leave management (apply, approve/reject)
- [x] Reimbursement module (submit, approve, reject, disburse)
- [x] Recruitment (job postings, applications)
- [x] Performance (goals, reviews)

### Phase 2 (Apr 2026)
- [x] Indian Labour Law Compliance
  - PF: 12% employee + 12% employer on basic
  - ESIC: 0.75% employee + 3.25% employer (for salary <= 21K)
  - TDS: New Tax Regime 2024-25 slabs with standard deduction
  - Professional Tax: Maharashtra slab rates
  - Full salary calculator with CTC breakdown
- [x] Leave Balance Tracking
  - Configurable leave policies (annual allocation per type)
  - Auto-deduction on approval, 6 leave types
  - Balance cards showing available/used/total
- [x] Payslip Auto-Generation with Indian deductions
- [x] Document Upload (Aadhaar, PAN, resume, certificates)
  - Emergent Object Storage integration
  - Upload, download, soft-delete
- [x] In-app Notification System
  - Bell icon with unread count
  - Notifications on leave/reimbursement approvals
  - Mark as read functionality
- [x] Self-service Password Change
- [x] Admin Password Reset for employees
- [x] Employee Onboarding Checklist
  - 10-item default checklist (documents, finance, IT, compliance)
  - Progress tracking with percentage
  - Admin can view any employee's checklist

## Prioritized Backlog
### P0
- Email/SMS notifications (integrate with SendGrid/Twilio)
- PDF payslip download/print
- Leave carry-forward and encashment logic

### P1
- Holiday calendar management
- Advanced analytics with charts (Recharts)
- Bulk employee import (CSV)
- PWA support for mobile installation

### P2
- Audit trail logging
- Multi-company/tenant support
- Integration with accounting software
- Advanced reporting and exports
