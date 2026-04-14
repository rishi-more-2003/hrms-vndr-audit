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