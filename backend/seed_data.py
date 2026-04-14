import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from datetime import datetime, timezone
import os
from dotenv import load_dotenv
from pathlib import Path
import uuid

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

DEFAULT_PERMISSIONS = {
    "dashboard": True, "attendance": True, "leave": True,
    "payroll": True, "recruitment": False, "performance": True,
    "reimbursements": True, "employee_directory": True,
}

async def seed_database():
    print("Seeding database...")
    for col in ["users","employees","departments","designations","leaves","attendance","reimbursements","salaries","payslips","job_postings","applications","performance_goals","performance_reviews"]:
        await db[col].delete_many({})

    admin_id = str(uuid.uuid4())
    emp1_id = str(uuid.uuid4())
    emp2_id = str(uuid.uuid4())

    users = [
        {"id": admin_id, "email": "admin@hrms.com", "password": pwd_context.hash("admin123"),
         "full_name": "Admin User", "role": "admin", "permissions": None,
         "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": emp1_id, "email": "employee@hrms.com", "password": pwd_context.hash("emp123"),
         "full_name": "Rahul Sharma", "role": "employee", "permissions": DEFAULT_PERMISSIONS,
         "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": emp2_id, "email": "priya@hrms.com", "password": pwd_context.hash("priya123"),
         "full_name": "Priya Patel", "role": "employee", "permissions": DEFAULT_PERMISSIONS,
         "created_at": datetime.now(timezone.utc).isoformat()},
    ]
    await db.users.insert_many(users)

    dept1 = str(uuid.uuid4())
    dept2 = str(uuid.uuid4())
    dept3 = str(uuid.uuid4())
    departments = [
        {"id": dept1, "name": "Engineering", "description": "Software development and technical teams", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": dept2, "name": "Human Resources", "description": "HR and people operations", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": dept3, "name": "Sales & Marketing", "description": "Sales and marketing teams", "created_at": datetime.now(timezone.utc).isoformat()},
    ]
    await db.departments.insert_many(departments)

    desig1 = str(uuid.uuid4())
    desig2 = str(uuid.uuid4())
    desig3 = str(uuid.uuid4())
    designations = [
        {"id": desig1, "title": "Software Engineer", "description": "Develops software", "level": 2, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": desig2, "title": "Team Lead", "description": "Leads team", "level": 3, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": desig3, "title": "Sales Executive", "description": "Handles sales", "level": 2, "created_at": datetime.now(timezone.utc).isoformat()},
    ]
    await db.designations.insert_many(designations)

    emp_rahul_id = str(uuid.uuid4())
    emp_priya_id = str(uuid.uuid4())
    employees = [
        {"id": emp_rahul_id, "user_id": emp1_id, "employee_code": "EMP001",
         "first_name": "Rahul", "last_name": "Sharma", "email": "employee@hrms.com",
         "phone": "+91-9876543210", "date_of_birth": "1995-08-10", "gender": "male",
         "address": "Mumbai, India", "department_id": dept1, "designation_id": desig1,
         "date_of_joining": "2022-03-15", "reports_to": None,
         "employment_type": "full-time", "status": "active",
         "permissions": DEFAULT_PERMISSIONS,
         "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": emp_priya_id, "user_id": emp2_id, "employee_code": "EMP002",
         "first_name": "Priya", "last_name": "Patel", "email": "priya@hrms.com",
         "phone": "+91-9876543211", "date_of_birth": "1993-05-20", "gender": "female",
         "address": "Bangalore, India", "department_id": dept1, "designation_id": desig2,
         "date_of_joining": "2021-01-10", "reports_to": None,
         "employment_type": "full-time", "status": "active",
         "permissions": DEFAULT_PERMISSIONS,
         "created_at": datetime.now(timezone.utc).isoformat()},
    ]
    await db.employees.insert_many(employees)

    # Set Rahul reports to Priya (hierarchy demo)
    await db.employees.update_one({"id": emp_rahul_id}, {"$set": {"reports_to": emp_priya_id}})

    print("Database seeded!")
    print("Admin: admin@hrms.com / admin123")
    print("Employee (Rahul): employee@hrms.com / emp123")
    print("Employee (Priya): priya@hrms.com / priya123")
    print(f"Rahul reports to Priya in hierarchy")
    client.close()

if __name__ == "__main__":
    asyncio.run(seed_database())
