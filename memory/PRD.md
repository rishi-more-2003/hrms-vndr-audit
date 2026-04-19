# HRMS Software - PRD

## Architecture
- Frontend: React 19 + Tailwind + Shadcn/UI + Phosphor Icons
- Backend: FastAPI + MongoDB, Auth: JWT, Storage: Emergent Object Storage

## Implemented (Phases 1-6)

### Phase 1-3: Core HRMS, Indian Compliance, Organization & Statutory Compliance
### Phase 4-5: Policy Management (10 types), Enhanced Attendance Policy

### Phase 6 - Attendance Collection & Management
**Attendance Collection Policy Template** (new policy type):
- 8 collection methods (4 active + 4 hardware placeholders):
  - Self Clock-in/out, Admin/Manager Entry, Employee Month-End, Manager Month-End
  - Biometric FP, Face Scan, Geo-tagged, Card Tap (hardware ready)
- Primary/fallback method configuration, cross-method toggle
- Self clock-in settings: real-time only vs manual time selection (with approval)
- Month-end entry deadlines for employee and manager
- Missed punch: allowed toggle, approval required, correction window, monthly limit
- Double login/WFH method configuration

**Enhanced Attendance Backend APIs**:
- POST /api/attendance/clock-in (with method param) - real-time
- POST /api/attendance/clock-out (with method param)
- POST /api/attendance/manual-entry - employee selects date/times, pending approval
- POST /api/attendance/admin-entry - admin enters for any employee
- POST /api/attendance/bulk-entry - month-end bulk with upsert
- POST /api/attendance/missed-punch - correction request with reason
- GET/PUT /api/attendance/missed-punches - CRUD + approve/reject
- PUT /api/attendance/{id}/approve|reject - entry approval
- Every record tracks: collection_method, entry_status, approval_status, entered_by

**Enhanced Attendance Frontend**:
- Real-time Clock In/Out with method tracking
- Manual Time Entry dialog (date + in/out time, pending approval)
- Missed Punch Request dialog (date, punch type, correct time, reason)
- Admin Entry dialog (select employee, enter attendance)
- Month-End Bulk Entry dialog (full month table with all days)
- **Dual View**: Table (sortable, method + status columns) + Calendar (color-coded grid)
- Month selector, Pending Approvals section for admin/managers
- Collection method displayed on each record ("via Self Clock-in", "Admin Entry", etc.)

## Test Credentials
- Admin: admin@hrms.com / admin123
- Employee: employee@hrms.com / emp123, priya@hrms.com / priya123
