import requests
import sys
from datetime import datetime
import json

class HRMSAPITester:
    def __init__(self, base_url="https://talent-board-14.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.admin_token = None
        self.employee_token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []

    def run_test(self, name, method, endpoint, expected_status, data=None, token=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        if token:
            headers['Authorization'] = f'Bearer {token}'

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    return success, response.json()
                except:
                    return success, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                print(f"   Response: {response.text[:200]}")
                self.failed_tests.append(f"{name}: Expected {expected_status}, got {response.status_code}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            self.failed_tests.append(f"{name}: {str(e)}")
            return False, {}

    def test_admin_login(self):
        """Test admin login"""
        success, response = self.run_test(
            "Admin Login",
            "POST",
            "auth/login",
            200,
            data={"email": "admin@hrms.com", "password": "admin123", "login_as": "admin"}
        )
        if success and 'access_token' in response:
            self.admin_token = response['access_token']
            print(f"   Admin token obtained")
            return True
        return False

    def test_employee_login(self):
        """Test employee login"""
        success, response = self.run_test(
            "Employee Login (Rahul)",
            "POST",
            "auth/login",
            200,
            data={"email": "employee@hrms.com", "password": "emp123", "login_as": "employee"}
        )
        if success and 'access_token' in response:
            self.employee_token = response['access_token']
            print(f"   Employee token obtained")
            return True
        return False

    def test_cross_login_prevention(self):
        """Test that admin can't login via employee tab and vice versa"""
        # Admin trying to login via employee tab
        success, _ = self.run_test(
            "Admin Cross-Login Prevention",
            "POST",
            "auth/login",
            403,
            data={"email": "admin@hrms.com", "password": "admin123", "login_as": "employee"}
        )
        
        # Employee trying to login via admin tab
        success2, _ = self.run_test(
            "Employee Cross-Login Prevention",
            "POST",
            "auth/login",
            403,
            data={"email": "employee@hrms.com", "password": "emp123", "login_as": "admin"}
        )
        
        return success and success2

    def test_dashboard_stats(self):
        """Test dashboard stats endpoint"""
        success, response = self.run_test(
            "Dashboard Stats",
            "GET",
            "dashboard/stats",
            200,
            token=self.admin_token
        )
        if success:
            required_fields = ['total_employees', 'total_departments', 'pending_leaves', 'active_jobs']
            for field in required_fields:
                if field not in response:
                    print(f"   Missing field: {field}")
                    return False
            print(f"   Stats: {response}")
        return success

    def test_employees_endpoint(self):
        """Test employees CRUD operations"""
        # Get all employees
        success, employees = self.run_test(
            "Get All Employees",
            "GET",
            "employees",
            200,
            token=self.admin_token
        )
        
        if not success:
            return False
            
        print(f"   Found {len(employees)} employees")
        return True

    def test_departments_endpoint(self):
        """Test departments endpoint"""
        success, departments = self.run_test(
            "Get All Departments",
            "GET",
            "departments",
            200,
            token=self.admin_token
        )
        
        if success:
            print(f"   Found {len(departments)} departments")
        return success

    def test_hierarchy_endpoint(self):
        """Test hierarchy endpoint"""
        success, hierarchy = self.run_test(
            "Get Hierarchy",
            "GET",
            "hierarchy",
            200,
            token=self.admin_token
        )
        
        if success:
            print(f"   Hierarchy nodes: {len(hierarchy)}")
        return success

    def test_attendance_endpoints(self):
        """Test attendance endpoints"""
        # Get attendance records
        success, attendance = self.run_test(
            "Get Attendance Records",
            "GET",
            "attendance",
            200,
            token=self.employee_token
        )
        
        if success:
            print(f"   Found {len(attendance)} attendance records")
        return success

    def test_leave_endpoints(self):
        """Test leave management endpoints"""
        # Get leave requests
        success, leaves = self.run_test(
            "Get Leave Requests",
            "GET",
            "leaves",
            200,
            token=self.employee_token
        )
        
        if success:
            print(f"   Found {len(leaves)} leave requests")
        return success

    def test_reimbursement_endpoints(self):
        """Test reimbursement endpoints"""
        # Get reimbursements
        success, reimbs = self.run_test(
            "Get Reimbursements",
            "GET",
            "reimbursements",
            200,
            token=self.employee_token
        )
        
        if success:
            print(f"   Found {len(reimbs)} reimbursements")
        return success

    def test_auth_me_endpoint(self):
        """Test auth/me endpoint for both admin and employee"""
        # Test admin auth/me
        success1, admin_data = self.run_test(
            "Admin Auth Me",
            "GET",
            "auth/me",
            200,
            token=self.admin_token
        )
        
        # Test employee auth/me
        success2, emp_data = self.run_test(
            "Employee Auth Me",
            "GET",
            "auth/me",
            200,
            token=self.employee_token
        )
        
        if success1:
            print(f"   Admin role: {admin_data.get('role')}")
        if success2:
            print(f"   Employee role: {emp_data.get('role')}")
            
        return success1 and success2

    def test_indian_tax_calculator(self):
        """Test Indian tax calculator API"""
        success, response = self.run_test(
            "Indian Tax Calculator",
            "POST",
            "tax/calculate?basic=30000&hra=12000&da=5000&other=3000",
            200,
            token=self.admin_token
        )
        
        if success:
            required_fields = ['earnings', 'deductions', 'net_salary', 'ctc_monthly', 'ctc_annual']
            for field in required_fields:
                if field not in response:
                    print(f"   Missing field: {field}")
                    return False
            
            # Check earnings structure
            earnings = response.get('earnings', {})
            earnings_fields = ['basic_salary', 'hra', 'da', 'other_allowances', 'gross_salary']
            for field in earnings_fields:
                if field not in earnings:
                    print(f"   Missing earnings field: {field}")
                    return False
            
            # Check deductions structure
            deductions = response.get('deductions', {})
            deductions_fields = ['pf_employee', 'esic_employee', 'professional_tax', 'tds_monthly', 'total_deductions']
            for field in deductions_fields:
                if field not in deductions:
                    print(f"   Missing deductions field: {field}")
                    return False
            
            print(f"   Gross: ₹{earnings.get('gross_salary')}, Net: ₹{response.get('net_salary')}")
            print(f"   PF: ₹{deductions.get('pf_employee')}, TDS: ₹{deductions.get('tds_monthly')}")
        
        return success

    def test_leave_balance_endpoint(self):
        """Test leave balance endpoint"""
        # First get an employee ID
        success, employees = self.run_test(
            "Get Employees for Leave Balance",
            "GET",
            "employees",
            200,
            token=self.admin_token
        )
        
        if not success or not employees:
            print("   No employees found for leave balance test")
            return False
        
        employee_id = employees[0]['id']
        success, response = self.run_test(
            "Leave Balance",
            "GET",
            f"leave-balance/{employee_id}",
            200,
            token=self.admin_token
        )
        
        if success:
            balances = response.get('balances', {})
            if balances:
                print(f"   Leave types: {list(balances.keys())}")
                for leave_type, balance in balances.items():
                    if 'total' in balance and 'used' in balance and 'available' in balance:
                        print(f"   {leave_type}: {balance['available']}/{balance['total']} available")
                    else:
                        print(f"   Missing balance fields for {leave_type}")
                        return False
            else:
                print("   No leave balances found")
        
        return success

    def test_leave_policy_endpoint(self):
        """Test leave policy endpoint"""
        success, response = self.run_test(
            "Leave Policy",
            "GET",
            "leave-policy",
            200,
            token=self.admin_token
        )
        
        if success:
            expected_types = ['casual', 'sick', 'earned', 'maternity', 'paternity', 'unpaid']
            for leave_type in expected_types:
                if leave_type not in response:
                    print(f"   Missing leave type: {leave_type}")
                    return False
            print(f"   Policy: {response}")
        
        return success

    def test_notification_system(self):
        """Test notification system endpoints"""
        # Test unread count
        success1, response1 = self.run_test(
            "Notification Unread Count",
            "GET",
            "notifications/unread-count",
            200,
            token=self.employee_token
        )
        
        # Test get all notifications
        success2, response2 = self.run_test(
            "Get All Notifications",
            "GET",
            "notifications",
            200,
            token=self.employee_token
        )
        
        if success1:
            if 'count' not in response1:
                print("   Missing 'count' field in unread count response")
                return False
            print(f"   Unread notifications: {response1['count']}")
        
        if success2:
            print(f"   Total notifications: {len(response2)}")
        
        return success1 and success2

    def test_onboarding_checklist(self):
        """Test onboarding checklist API"""
        # First get an employee ID
        success, employees = self.run_test(
            "Get Employees for Onboarding",
            "GET",
            "employees",
            200,
            token=self.admin_token
        )
        
        if not success or not employees:
            print("   No employees found for onboarding test")
            return False
        
        employee_id = employees[0]['id']
        success, response = self.run_test(
            "Onboarding Checklist",
            "GET",
            f"onboarding/{employee_id}",
            200,
            token=self.admin_token
        )
        
        if success:
            required_fields = ['id', 'employee_id', 'items', 'overall_progress']
            for field in required_fields:
                if field not in response:
                    print(f"   Missing field: {field}")
                    return False
            
            items = response.get('items', [])
            print(f"   Checklist items: {len(items)}")
            print(f"   Overall progress: {response.get('overall_progress')}%")
            
            # Check item structure
            if items:
                item = items[0]
                item_fields = ['id', 'label', 'category', 'completed']
                for field in item_fields:
                    if field not in item:
                        print(f"   Missing item field: {field}")
                        return False
        
        return success

    def test_password_change(self):
        """Test password change API"""
        # Test with incorrect old password
        success1, _ = self.run_test(
            "Password Change (Wrong Old Password)",
            "POST",
            "auth/change-password?old_password=wrongpass&new_password=newpass123",
            400,
            token=self.employee_token
        )
        
        # Note: We won't test successful password change as it would break subsequent tests
        print("   Password change endpoint accessible (tested with wrong password)")
        return success1

    # ===== PHASE 3 ORGANIZATION TESTS =====
    def test_organization_endpoints(self):
        """Test organization setup endpoints"""
        # Get organization data
        success1, org_data = self.run_test(
            "Get Organization",
            "GET",
            "organization",
            200,
            token=self.admin_token
        )
        
        # Save organization data
        org_payload = {
            "name": "Test Company Ltd",
            "address": "123 Test Street, Test City",
            "nature_of_business": "Software Development"
        }
        success2, _ = self.run_test(
            "Save Organization",
            "POST",
            "organization",
            200,
            data=org_payload,
            token=self.admin_token
        )
        
        if success1:
            print(f"   Organization setup complete: {org_data.get('setup_complete', False)}")
        
        return success1 and success2

    def test_location_endpoints(self):
        """Test location CRUD operations"""
        # Get all locations
        success1, locations = self.run_test(
            "Get All Locations",
            "GET",
            "locations",
            200,
            token=self.admin_token
        )
        
        # Create a new location
        location_payload = {
            "name": "Test Location",
            "code": "TL001",
            "address": "Test Address"
        }
        success2, new_location = self.run_test(
            "Create Location",
            "POST",
            "locations",
            200,
            data=location_payload,
            token=self.admin_token
        )
        
        if success1:
            print(f"   Found {len(locations)} existing locations")
        if success2:
            print(f"   Created location: {new_location.get('name')}")
        
        return success1 and success2

    def test_employee_grades_endpoints(self):
        """Test employee grades endpoints"""
        # Get employee grades
        success1, grades = self.run_test(
            "Get Employee Grades",
            "GET",
            "employee-grades",
            200,
            token=self.admin_token
        )
        
        # Save employee grades
        grades_payload = [
            {"name": "Unskilled", "code": "USK", "order": 1},
            {"name": "Semi-skilled", "code": "SSK", "order": 2},
            {"name": "Skilled", "code": "SK", "order": 3},
            {"name": "Highly Skilled", "code": "HSK", "order": 4}
        ]
        success2, _ = self.run_test(
            "Save Employee Grades",
            "POST",
            "employee-grades",
            200,
            data=grades_payload,
            token=self.admin_token
        )
        
        if success1:
            print(f"   Found {len(grades)} employee grades")
        
        return success1 and success2

    def test_employee_levels_endpoints(self):
        """Test employee levels endpoints"""
        # Get employee levels
        success1, levels = self.run_test(
            "Get Employee Levels",
            "GET",
            "employee-levels",
            200,
            token=self.admin_token
        )
        
        # Save employee levels
        levels_payload = [
            {"name": "L1", "order": 1},
            {"name": "L2", "order": 2},
            {"name": "Senior", "order": 3}
        ]
        success2, _ = self.run_test(
            "Save Employee Levels",
            "POST",
            "employee-levels",
            200,
            data=levels_payload,
            token=self.admin_token
        )
        
        if success1:
            print(f"   Found {len(levels)} employee levels")
        
        return success1 and success2

    def test_shifts_endpoints(self):
        """Test shifts CRUD operations"""
        # Get all shifts
        success1, shifts = self.run_test(
            "Get All Shifts",
            "GET",
            "shifts",
            200,
            token=self.admin_token
        )
        
        # Create a new shift
        shift_payload = {
            "name": "Morning Shift",
            "start_time": "09:00",
            "end_time": "18:00",
            "break_duration": 60
        }
        success2, new_shift = self.run_test(
            "Create Shift",
            "POST",
            "shifts",
            200,
            data=shift_payload,
            token=self.admin_token
        )
        
        if success1:
            print(f"   Found {len(shifts)} existing shifts")
        if success2:
            print(f"   Created shift: {new_shift.get('name')}")
        
        return success1 and success2

    # ===== PHASE 3 COMPLIANCE TESTS =====
    def test_compliance_templates_pf(self):
        """Test PF compliance templates"""
        # Get PF templates
        success1, templates = self.run_test(
            "Get PF Templates",
            "GET",
            "compliance-templates/pf",
            200,
            token=self.admin_token
        )
        
        # Create PF template
        pf_payload = {
            "template_name": "Test PF Template",
            "pf_applicable": True,
            "pf_office": "Test PF Office",
            "pf_code_number": "PF001",
            "contribution_rate": 12,
            "wage_ceiling": 15000
        }
        success2, new_template = self.run_test(
            "Create PF Template",
            "POST",
            "compliance-templates/pf",
            200,
            data=pf_payload,
            token=self.admin_token
        )
        
        if success1:
            print(f"   Found {len(templates)} PF templates")
        if success2:
            print(f"   Created PF template: {new_template.get('template_name')}")
        
        return success1 and success2

    def test_compliance_templates_esic(self):
        """Test ESIC compliance templates"""
        # Get ESIC templates
        success1, templates = self.run_test(
            "Get ESIC Templates",
            "GET",
            "compliance-templates/esic",
            200,
            token=self.admin_token
        )
        
        # Create ESIC template
        esic_payload = {
            "template_name": "Test ESIC Template",
            "esic_code_no": "ESIC001",
            "employee_contribution": 0.75,
            "employer_contribution": 3.25,
            "wage_ceiling": 21000
        }
        success2, new_template = self.run_test(
            "Create ESIC Template",
            "POST",
            "compliance-templates/esic",
            200,
            data=esic_payload,
            token=self.admin_token
        )
        
        if success1:
            print(f"   Found {len(templates)} ESIC templates")
        if success2:
            print(f"   Created ESIC template: {new_template.get('template_name')}")
        
        return success1 and success2

    def test_compliance_templates_pt(self):
        """Test PT compliance templates"""
        # Get PT templates
        success1, templates = self.run_test(
            "Get PT Templates",
            "GET",
            "compliance-templates/pt",
            200,
            token=self.admin_token
        )
        
        # Create PT template with slabs
        pt_payload = {
            "template_name": "Test PT Template",
            "pt_code_no": "PT001",
            "jurisdiction_state": "Maharashtra",
            "deduction_frequency": "monthly",
            "slabs": [
                {"min_salary": 0, "max_salary": 10000, "male_rate": 0, "female_rate": 0},
                {"min_salary": 10001, "max_salary": 25000, "male_rate": 200, "female_rate": 150}
            ]
        }
        success2, new_template = self.run_test(
            "Create PT Template",
            "POST",
            "compliance-templates/pt",
            200,
            data=pt_payload,
            token=self.admin_token
        )
        
        if success1:
            print(f"   Found {len(templates)} PT templates")
        if success2:
            print(f"   Created PT template: {new_template.get('template_name')}")
        
        return success1 and success2

    def test_compliance_templates_lwf(self):
        """Test LWF compliance templates"""
        # Get LWF templates
        success1, templates = self.run_test(
            "Get LWF Templates",
            "GET",
            "compliance-templates/lwf",
            200,
            token=self.admin_token
        )
        
        # Create LWF template
        lwf_payload = {
            "template_name": "Test LWF Template",
            "lwf_code_no": "LWF001",
            "jurisdiction_state": "Maharashtra",
            "deduction_frequency": "monthly"
        }
        success2, new_template = self.run_test(
            "Create LWF Template",
            "POST",
            "compliance-templates/lwf",
            200,
            data=lwf_payload,
            token=self.admin_token
        )
        
        if success1:
            print(f"   Found {len(templates)} LWF templates")
        if success2:
            print(f"   Created LWF template: {new_template.get('template_name')}")
        
        return success1 and success2

    def test_compliance_templates_tds(self):
        """Test TDS compliance templates"""
        # Get TDS templates
        success1, templates = self.run_test(
            "Get TDS Templates",
            "GET",
            "compliance-templates/tds",
            200,
            token=self.admin_token
        )
        
        # Create TDS template
        tds_payload = {
            "template_name": "Test TDS Template",
            "tax_regime": "new_regime",
            "employer_tan": "ABCD12345E",
            "cess_rate": 4,
            "standard_deduction": 75000
        }
        success2, new_template = self.run_test(
            "Create TDS Template",
            "POST",
            "compliance-templates/tds",
            200,
            data=tds_payload,
            token=self.admin_token
        )
        
        if success1:
            print(f"   Found {len(templates)} TDS templates")
        if success2:
            print(f"   Created TDS template: {new_template.get('template_name')}")
        
        return success1 and success2

    def test_compliance_bulk_assignment(self):
        """Test bulk compliance template assignment"""
        # Get all compliance assignments
        success1, assignments = self.run_test(
            "Get All Compliance Assignments",
            "GET",
            "compliance-assignments",
            200,
            token=self.admin_token
        )
        
        # Test bulk assignment by department
        bulk_payload = {
            "assign_by": "department",
            "target_id": "test-dept-id",
            "templates": {
                "pf_template_id": "test-pf-template",
                "esic_template_id": "test-esic-template"
            }
        }
        success2, _ = self.run_test(
            "Bulk Assign Templates",
            "POST",
            "compliance-assignments/bulk",
            200,
            data=bulk_payload,
            token=self.admin_token
        )
        
        if success1:
            print(f"   Found {len(assignments)} compliance assignments")
        
        return success1 and success2

    # ===== NEW FEATURE TESTS FOR CONDITIONAL FIELDS =====
    def test_pf_conditional_fields(self):
        """Test PF template with conditional exemption fields"""
        # Test PF template with PF exemption enabled
        pf_exempted_payload = {
            "template_name": "PF Exempted Template",
            "pf_applicable": True,
            "pf_exempted": True,
            "trust_name": "Test Trust",
            "industry_type": "Software",
            "exemption_section": "Section 17",
            "exemption_date": "2024-01-01",
            "exemption_authority": "EPFO",
            "board_term": "3 years"
        }
        success1, pf_exempted = self.run_test(
            "Create PF Template with PF Exemption",
            "POST",
            "compliance-templates/pf",
            200,
            data=pf_exempted_payload,
            token=self.admin_token
        )
        
        # Test PF template with EDLI exemption enabled
        edli_exempted_payload = {
            "template_name": "EDLI Exempted Template",
            "pf_applicable": True,
            "edli_exempted": True,
            "edli_master_policy": "EDLI123456",
            "edli_premium": 50000,
            "edli_payment_date": "2024-03-31",
            "edli_policy_period": "2024-2025",
            "edli_insurer": "LIC of India"
        }
        success2, edli_exempted = self.run_test(
            "Create PF Template with EDLI Exemption",
            "POST",
            "compliance-templates/pf",
            200,
            data=edli_exempted_payload,
            token=self.admin_token
        )
        
        # Test PF template with both exemptions enabled
        both_exempted_payload = {
            "template_name": "Both Exemptions Template",
            "pf_applicable": True,
            "pf_exempted": True,
            "edli_exempted": True,
            "trust_name": "Combined Trust",
            "industry_type": "Manufacturing",
            "exemption_section": "Section 17",
            "edli_master_policy": "EDLI789012",
            "edli_premium": 75000
        }
        success3, both_exempted = self.run_test(
            "Create PF Template with Both Exemptions",
            "POST",
            "compliance-templates/pf",
            200,
            data=both_exempted_payload,
            token=self.admin_token
        )
        
        if success1:
            print(f"   PF exempted template: {pf_exempted.get('template_name')}")
            print(f"   Trust name: {pf_exempted.get('trust_name')}")
        if success2:
            print(f"   EDLI exempted template: {edli_exempted.get('template_name')}")
            print(f"   EDLI policy: {edli_exempted.get('edli_master_policy')}")
        if success3:
            print(f"   Both exemptions template: {both_exempted.get('template_name')}")
        
        return success1 and success2 and success3

    def test_pt_lwf_advanced_config(self):
        """Test PT/LWF templates with advanced configuration options"""
        # Test PT template with advanced configuration
        pt_advanced_payload = {
            "template_name": "Advanced PT Template",
            "pt_code_no": "PT_ADV_001",
            "jurisdiction_state": "Tamil Nadu",
            "jurisdiction_city": "Chennai",
            "deduction_frequency": "quarterly",
            "payment_frequency": "quarterly",
            "slab_salary_period": "half-yearly",
            "deduction_method": "lump",
            "exit_handling": "pro_rata",
            "slabs": [
                {"min_salary": 0, "max_salary": 15000, "male_rate": 0, "female_rate": 0},
                {"min_salary": 15001, "max_salary": 30000, "male_rate": 300, "female_rate": 200},
                {"min_salary": 30001, "max_salary": 50000, "male_rate": 500, "female_rate": 400}
            ]
        }
        success1, pt_advanced = self.run_test(
            "Create PT Template with Advanced Config",
            "POST",
            "compliance-templates/pt",
            200,
            data=pt_advanced_payload,
            token=self.admin_token
        )
        
        # Test LWF template with advanced configuration
        lwf_advanced_payload = {
            "template_name": "Advanced LWF Template",
            "lwf_code_no": "LWF_ADV_001",
            "jurisdiction_state": "Karnataka",
            "jurisdiction_city": "Bangalore",
            "deduction_frequency": "monthly",
            "payment_frequency": "half-yearly",
            "slab_salary_period": "annual",
            "deduction_method": "spread",
            "exit_handling": "company_bears",
            "slabs": [
                {"min_salary": 0, "max_salary": 25000, "male_rate": 20, "female_rate": 20},
                {"min_salary": 25001, "max_salary": 50000, "male_rate": 40, "female_rate": 40}
            ]
        }
        success2, lwf_advanced = self.run_test(
            "Create LWF Template with Advanced Config",
            "POST",
            "compliance-templates/lwf",
            200,
            data=lwf_advanced_payload,
            token=self.admin_token
        )
        
        if success1:
            print(f"   PT advanced template: {pt_advanced.get('template_name')}")
            print(f"   Deduction freq: {pt_advanced.get('deduction_frequency')}")
            print(f"   Payment freq: {pt_advanced.get('payment_frequency')}")
            print(f"   Salary period: {pt_advanced.get('slab_salary_period')}")
            print(f"   Deduction method: {pt_advanced.get('deduction_method')}")
            print(f"   Exit handling: {pt_advanced.get('exit_handling')}")
            print(f"   Slabs count: {len(pt_advanced.get('slabs', []))}")
        
        if success2:
            print(f"   LWF advanced template: {lwf_advanced.get('template_name')}")
            print(f"   Deduction freq: {lwf_advanced.get('deduction_frequency')}")
            print(f"   Exit handling: {lwf_advanced.get('exit_handling')}")
        
        return success1 and success2

def main():
    print("🚀 Starting HRMS Backend API Testing...")
    print("=" * 60)
    
    tester = HRMSAPITester()
    
    # Test authentication first
    print("\n📋 AUTHENTICATION TESTS")
    print("-" * 30)
    
    if not tester.test_admin_login():
        print("❌ Admin login failed, stopping tests")
        return 1
        
    if not tester.test_employee_login():
        print("❌ Employee login failed, stopping tests")
        return 1
    
    # Test cross-login prevention
    tester.test_cross_login_prevention()
    
    # Test auth/me endpoints
    tester.test_auth_me_endpoint()
    
    # Test core endpoints
    print("\n📋 CORE API TESTS")
    print("-" * 30)
    
    tester.test_dashboard_stats()
    tester.test_employees_endpoint()
    tester.test_departments_endpoint()
    tester.test_hierarchy_endpoint()
    tester.test_attendance_endpoints()
    tester.test_leave_endpoints()
    tester.test_reimbursement_endpoints()
    
    # Test Phase 2 features
    print("\n📋 PHASE 2 FEATURE TESTS")
    print("-" * 30)
    
    tester.test_indian_tax_calculator()
    tester.test_leave_balance_endpoint()
    tester.test_leave_policy_endpoint()
    tester.test_notification_system()
    tester.test_onboarding_checklist()
    tester.test_password_change()
    
    # Test Phase 3 features - Organization
    print("\n📋 PHASE 3 ORGANIZATION TESTS")
    print("-" * 30)
    
    tester.test_organization_endpoints()
    tester.test_location_endpoints()
    tester.test_employee_grades_endpoints()
    tester.test_employee_levels_endpoints()
    tester.test_shifts_endpoints()
    
    # Test Phase 3 features - Compliance
    print("\n📋 PHASE 3 COMPLIANCE TESTS")
    print("-" * 30)
    
    tester.test_compliance_templates_pf()
    tester.test_compliance_templates_esic()
    tester.test_compliance_templates_pt()
    tester.test_compliance_templates_lwf()
    tester.test_compliance_templates_tds()
    tester.test_compliance_bulk_assignment()
    
    # Test new conditional fields and advanced config
    print("\n📋 NEW FEATURE TESTS - CONDITIONAL FIELDS")
    print("-" * 30)
    
    tester.test_pf_conditional_fields()
    tester.test_pt_lwf_advanced_config()
    
    # Print final results
    print("\n" + "=" * 60)
    print(f"📊 FINAL RESULTS")
    print(f"Tests Run: {tester.tests_run}")
    print(f"Tests Passed: {tester.tests_passed}")
    print(f"Tests Failed: {tester.tests_run - tester.tests_passed}")
    print(f"Success Rate: {(tester.tests_passed/tester.tests_run*100):.1f}%")
    
    if tester.failed_tests:
        print(f"\n❌ FAILED TESTS:")
        for failure in tester.failed_tests:
            print(f"   - {failure}")
    
    return 0 if tester.tests_passed == tester.tests_run else 1

if __name__ == "__main__":
    sys.exit(main())