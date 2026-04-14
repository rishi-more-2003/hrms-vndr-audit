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