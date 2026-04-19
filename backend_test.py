#!/usr/bin/env python3

import requests
import sys
import json
from datetime import datetime

class SalaryStructureAPITester:
    def __init__(self, base_url="https://talent-board-14.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.created_components = []
        self.created_templates = []

    def run_test(self, name, method, endpoint, expected_status, data=None, params=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, params=params)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, params=params)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, params=params)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, params=params)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    return True, response.json() if response.text else {}
                except:
                    return True, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    print(f"   Response: {response.text}")
                except:
                    pass
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_admin_login(self):
        """Test admin login and get token"""
        print("\n🔐 Testing Admin Login...")
        success, response = self.run_test(
            "Admin Login",
            "POST",
            "auth/login",
            200,
            data={"email": "admin@hrms.com", "password": "admin123", "login_as": "admin"}
        )
        if success and 'access_token' in response:
            self.token = response['access_token']
            print(f"✅ Admin login successful, token obtained")
            return True
        print(f"❌ Admin login failed")
        return False

    def test_salary_components_crud(self):
        """Test salary components CRUD operations"""
        print("\n📊 Testing Salary Components CRUD...")
        
        # 1. Get initial components
        success, components = self.run_test("Get Components", "GET", "salary-components", 200)
        if not success:
            return False
        
        initial_count = len(components)
        print(f"   Initial components count: {initial_count}")

        # 2. Create Basic Salary (Earning)
        basic_data = {
            "name": "Basic Salary",
            "code": "BASIC",
            "component_type": "earning",
            "category": "standard",
            "is_statutory": False,
            "calc_type": "fixed_amount",
            "default_value": 25000,
            "default_percentage": 0,
            "is_fixed": True,
            "is_variable": False,
            "allow_direct_entry": False,
            "attracts_pf": True,
            "attracts_esic": True,
            "attracts_pt": True,
            "attracts_lwf": False,
            "attracts_ot": True,
            "attracts_tds": True,
            "classification": "inclusion_wages"
        }
        
        success, basic_comp = self.run_test("Create Basic Salary", "POST", "salary-components", 200, basic_data)
        if success and 'id' in basic_comp:
            self.created_components.append(basic_comp['id'])
            print(f"   Created Basic Salary component: {basic_comp['id']}")
        else:
            return False

        # 3. Create HRA (Earning)
        hra_data = {
            "name": "House Rent Allowance",
            "code": "HRA",
            "component_type": "earning",
            "category": "standard",
            "is_statutory": False,
            "calc_type": "percentage_of_basic",
            "default_value": 0,
            "default_percentage": 40,
            "is_fixed": True,
            "is_variable": False,
            "allow_direct_entry": True,
            "attracts_pf": False,
            "attracts_esic": False,
            "attracts_pt": True,
            "attracts_lwf": False,
            "attracts_ot": False,
            "attracts_tds": True,
            "classification": "inclusion_wages"
        }
        
        success, hra_comp = self.run_test("Create HRA", "POST", "salary-components", 200, hra_data)
        if success and 'id' in hra_comp:
            self.created_components.append(hra_comp['id'])
            print(f"   Created HRA component: {hra_comp['id']}")
        else:
            return False

        # 4. Create PF Deduction with auto-pairing
        pf_data = {
            "name": "Provident Fund",
            "code": "PF",
            "component_type": "deduction",
            "category": "statutory",
            "is_statutory": True,
            "auto_pair_key": "pf",
            "calc_type": "percentage_of_basic",
            "default_value": 0,
            "default_percentage": 12,
            "is_fixed": True,
            "is_variable": False,
            "allow_direct_entry": False,
            "attracts_pf": False,
            "attracts_esic": False,
            "attracts_pt": False,
            "attracts_lwf": False,
            "attracts_ot": False,
            "attracts_tds": False,
            "classification": "exclusion"
        }
        
        success, pf_comp = self.run_test("Create PF with Auto-pairing", "POST", "salary-components", 200, pf_data)
        if success and 'id' in pf_comp:
            self.created_components.append(pf_comp['id'])
            print(f"   Created PF component: {pf_comp['id']}")
            if 'auto_created_provisions' in pf_comp:
                print(f"   Auto-created provisions: {pf_comp['auto_created_provisions']}")
            else:
                print("   ⚠️  No auto-created provisions found")
        else:
            return False

        # 5. Verify components were created
        success, updated_components = self.run_test("Get Updated Components", "GET", "salary-components", 200)
        if success:
            new_count = len(updated_components)
            print(f"   Updated components count: {new_count}")
            if new_count > initial_count:
                print(f"   ✅ Components increased by {new_count - initial_count}")
            else:
                print(f"   ⚠️  Component count didn't increase as expected")

        # 6. Update a component
        if self.created_components:
            update_data = {"default_value": 30000}
            success, _ = self.run_test("Update Component", "PUT", f"salary-components/{self.created_components[0]}", 200, update_data)
            if not success:
                return False

        return True

    def test_salary_templates_crud(self):
        """Test salary templates CRUD operations"""
        print("\n📋 Testing Salary Templates CRUD...")
        
        # 1. Get initial templates
        success, templates = self.run_test("Get Templates", "GET", "salary-templates", 200)
        if not success:
            return False
        
        initial_count = len(templates)
        print(f"   Initial templates count: {initial_count}")

        # 2. Get components for template creation
        success, components = self.run_test("Get Components for Template", "GET", "salary-components", 200)
        if not success or not components:
            print("   ⚠️  No components available for template creation")
            return False

        # 3. Create a salary template
        template_components = []
        for comp in components[:5]:  # Use first 5 components
            template_components.append({
                "component_id": comp['id'],
                "code": comp['code'],
                "name": comp['name'],
                "component_type": comp['component_type'],
                "enabled": True,
                "calc_type": comp.get('calc_type', 'fixed_amount'),
                "amount": comp.get('default_value', 1000),
                "percentage": comp.get('default_percentage', 0),
                "is_fixed": comp.get('is_fixed', True),
                "is_variable": comp.get('is_variable', False),
                "allow_direct_entry": comp.get('allow_direct_entry', False),
                "attracts_pf": comp.get('attracts_pf', False),
                "attracts_esic": comp.get('attracts_esic', False),
                "attracts_pt": comp.get('attracts_pt', False),
                "attracts_lwf": comp.get('attracts_lwf', False),
                "attracts_ot": comp.get('attracts_ot', False),
                "attracts_tds": comp.get('attracts_tds', False),
                "classification": comp.get('classification', 'inclusion_wages')
            })

        template_data = {
            "template_name": "Test Standard Template",
            "components": template_components,
            "ctc_mode": False,
            "ctc_annual": 0,
            "pay_type": "monthly"
        }
        
        success, template = self.run_test("Create Template", "POST", "salary-templates", 200, template_data)
        if success and 'id' in template:
            self.created_templates.append(template['id'])
            print(f"   Created template: {template['id']}")
        else:
            return False

        # 4. Get specific template
        success, _ = self.run_test("Get Specific Template", "GET", f"salary-templates/{self.created_templates[0]}", 200)
        if not success:
            return False

        # 5. Update template
        update_data = {"template_name": "Updated Test Template"}
        success, _ = self.run_test("Update Template", "PUT", f"salary-templates/{self.created_templates[0]}", 200, update_data)
        if not success:
            return False

        return True

    def test_salary_compute(self):
        """Test salary computation"""
        print("\n🧮 Testing Salary Computation...")
        
        # Create test components for computation
        test_components = [
            {
                "component_id": "test1",
                "component_type": "earning",
                "amount": 25000,
                "calc_type": "fixed_amount"
            },
            {
                "component_id": "test2", 
                "component_type": "earning",
                "amount": 10000,
                "calc_type": "fixed_amount"
            },
            {
                "component_id": "test3",
                "component_type": "deduction",
                "amount": 3000,
                "calc_type": "fixed_amount"
            },
            {
                "component_id": "test4",
                "component_type": "provision",
                "amount": 2000,
                "calc_type": "fixed_amount"
            }
        ]

        compute_data = {
            "components": test_components,
            "pay_type": "monthly"
        }
        
        success, result = self.run_test("Compute Salary", "POST", "salary-compute", 200, compute_data)
        if success:
            print(f"   Gross Monthly: ₹{result.get('gross_monthly', 0)}")
            print(f"   Deductions Monthly: ₹{result.get('total_deductions_monthly', 0)}")
            print(f"   Net Monthly: ₹{result.get('net_monthly', 0)}")
            print(f"   CTC Monthly: ₹{result.get('ctc_monthly', 0)}")
            print(f"   CTC Annual: ₹{result.get('ctc_annual', 0)}")
            
            # Verify calculations
            expected_gross = 35000  # 25000 + 10000
            expected_deductions = 3000
            expected_net = 32000  # 35000 - 3000
            expected_ctc = 37000  # 35000 + 2000
            
            if (result.get('gross_monthly') == expected_gross and 
                result.get('total_deductions_monthly') == expected_deductions and
                result.get('net_monthly') == expected_net and
                result.get('ctc_monthly') == expected_ctc):
                print("   ✅ Salary calculations are correct")
            else:
                print("   ⚠️  Salary calculations may be incorrect")
        
        return success

    def test_salary_assignments(self):
        """Test salary assignments"""
        print("\n👥 Testing Salary Assignments...")
        
        # 1. Get all assignments
        success, assignments = self.run_test("Get All Assignments", "GET", "salary-assignments", 200)
        if not success:
            return False
        
        print(f"   Current assignments count: {len(assignments)}")

        # 2. Test bulk assignment (this will fail if no employees/departments exist)
        if self.created_templates:
            bulk_data = {
                "assign_by": "department",
                "target_id": "test-dept-id",  # This may not exist
                "salary_template_id": self.created_templates[0]
            }
            
            # This might fail due to missing department, but we test the endpoint
            success, _ = self.run_test("Bulk Assignment", "POST", "salary-assignments/bulk", 200, bulk_data)
            # Don't return False here as this might fail due to missing test data
            
        return True

    def cleanup(self):
        """Clean up created test data"""
        print("\n🧹 Cleaning up test data...")
        
        # Delete created templates
        for template_id in self.created_templates:
            success, _ = self.run_test(f"Delete Template {template_id}", "DELETE", f"salary-templates/{template_id}", 200)
            if success:
                print(f"   ✅ Deleted template: {template_id}")
        
        # Delete created components (except statutory ones)
        for comp_id in self.created_components:
            success, _ = self.run_test(f"Delete Component {comp_id}", "DELETE", f"salary-components/{comp_id}", 200)
            if success:
                print(f"   ✅ Deleted component: {comp_id}")

    def run_all_tests(self):
        """Run all salary structure tests"""
        print("🚀 Starting HRMS Salary Structure API Tests")
        print("=" * 50)
        
        # Login first
        if not self.test_admin_login():
            print("❌ Cannot proceed without admin login")
            return False
        
        # Run all tests
        tests = [
            self.test_salary_components_crud,
            self.test_salary_templates_crud,
            self.test_salary_compute,
            self.test_salary_assignments
        ]
        
        all_passed = True
        for test in tests:
            try:
                if not test():
                    all_passed = False
            except Exception as e:
                print(f"❌ Test failed with exception: {str(e)}")
                all_passed = False
        
        # Cleanup
        self.cleanup()
        
        # Print results
        print("\n" + "=" * 50)
        print(f"📊 Test Results: {self.tests_passed}/{self.tests_run} tests passed")
        
        if all_passed and self.tests_passed == self.tests_run:
            print("🎉 All salary structure API tests passed!")
            return True
        else:
            print("❌ Some tests failed")
            return False

def main():
    tester = SalaryStructureAPITester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())