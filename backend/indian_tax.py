"""Indian Labour Law Tax Calculations (New Tax Regime 2024-25)"""

# PF (Provident Fund) Rates
PF_EMPLOYEE_RATE = 0.12  # 12% of basic salary
PF_EMPLOYER_RATE = 0.12  # 12% of basic salary
PF_ADMIN_CHARGES = 0.005  # 0.5% admin charges on basic

# ESIC Rates (for gross salary <= 21000)
ESIC_EMPLOYEE_RATE = 0.0075  # 0.75%
ESIC_EMPLOYER_RATE = 0.0325  # 3.25%
ESIC_THRESHOLD = 21000  # Monthly threshold

# Professional Tax (Maharashtra rates as default - configurable)
PROFESSIONAL_TAX_SLABS = [
    (0, 7500, 0),        # Up to 7500 = 0
    (7501, 10000, 175),   # 7501-10000 = 175/month
    (10001, float('inf'), 200),  # Above 10000 = 200/month (max)
]

# New Tax Regime Slabs 2024-25 (Annual) - (lower_bound_exclusive, upper_bound_inclusive, rate)
# i.e. tax applies on income > lower_bound up to upper_bound
INCOME_TAX_SLABS = [
    (0, 300000, 0),          # Up to 3L = 0%
    (300000, 700000, 0.05),  # >3L to 7L = 5%
    (700000, 1000000, 0.10), # >7L to 10L = 10%
    (1000000, 1200000, 0.15),# >10L to 12L = 15%
    (1200000, 1500000, 0.20),# >12L to 15L = 20%
    (1500000, float('inf'), 0.30), # >15L = 30%
]

CESS_RATE = 0.04  # 4% health & education cess
STANDARD_DEDUCTION = 75000  # Standard deduction under new regime


def calculate_pf(basic_salary_monthly):
    """Calculate monthly PF contributions"""
    employee_pf = round(basic_salary_monthly * PF_EMPLOYEE_RATE, 2)
    employer_pf = round(basic_salary_monthly * PF_EMPLOYER_RATE, 2)
    return {
        "employee_pf": employee_pf,
        "employer_pf": employer_pf,
        "total_pf": round(employee_pf + employer_pf, 2)
    }


def calculate_esic(gross_salary_monthly):
    """Calculate monthly ESIC contributions (only if gross <= threshold)"""
    if gross_salary_monthly > ESIC_THRESHOLD:
        return {"employee_esic": 0, "employer_esic": 0, "total_esic": 0, "applicable": False}
    employee_esic = round(gross_salary_monthly * ESIC_EMPLOYEE_RATE, 2)
    employer_esic = round(gross_salary_monthly * ESIC_EMPLOYER_RATE, 2)
    return {
        "employee_esic": employee_esic,
        "employer_esic": employer_esic,
        "total_esic": round(employee_esic + employer_esic, 2),
        "applicable": True
    }


def calculate_professional_tax(gross_salary_monthly):
    """Calculate monthly professional tax"""
    for low, high, tax in PROFESSIONAL_TAX_SLABS:
        if low <= gross_salary_monthly <= high:
            return tax
    return 200  # default max


def calculate_income_tax(annual_taxable_income):
    """Calculate annual income tax under New Tax Regime (2024-25) with Sec 87A rebate + marginal relief"""
    taxable = max(0, annual_taxable_income - STANDARD_DEDUCTION)
    gross_taxable = taxable
    tax = 0
    for low, high, rate in INCOME_TAX_SLABS:
        if taxable <= 0:
            break
        slab_width = high - low
        slab_amount = min(taxable, slab_width)
        tax += slab_amount * rate
        taxable -= slab_amount
    # Rebate u/s 87A: No tax if taxable income (post-std-deduction) <= 7L
    if gross_taxable <= 700000:
        tax = 0
    else:
        # Marginal relief: tax shall not exceed (taxable_income - 7,00,000)
        marginal_cap = gross_taxable - 700000
        if tax > marginal_cap:
            tax = marginal_cap
    cess = tax * CESS_RATE
    return {
        "basic_tax": round(tax, 2),
        "cess": round(cess, 2),
        "total_tax": round(tax + cess, 2),
        "monthly_tds": round((tax + cess) / 12, 2)
    }


def calculate_full_salary(basic_monthly, hra_monthly, da_monthly, other_allowances_monthly):
    """Calculate complete salary breakdown with all Indian compliance deductions"""
    gross_monthly = basic_monthly + hra_monthly + da_monthly + other_allowances_monthly
    gross_annual = gross_monthly * 12

    pf = calculate_pf(basic_monthly)
    esic = calculate_esic(gross_monthly)
    pt = calculate_professional_tax(gross_monthly)
    tax = calculate_income_tax(gross_annual)

    total_deductions_monthly = (
        pf["employee_pf"] +
        esic["employee_esic"] +
        pt +
        tax["monthly_tds"]
    )

    net_monthly = gross_monthly - total_deductions_monthly

    return {
        "earnings": {
            "basic_salary": basic_monthly,
            "hra": hra_monthly,
            "da": da_monthly,
            "other_allowances": other_allowances_monthly,
            "gross_salary": round(gross_monthly, 2),
            "gross_annual": round(gross_annual, 2)
        },
        "deductions": {
            "pf_employee": pf["employee_pf"],
            "pf_employer": pf["employer_pf"],
            "esic_employee": esic["employee_esic"],
            "esic_employer": esic["employer_esic"],
            "esic_applicable": esic["applicable"],
            "professional_tax": pt,
            "tds_monthly": tax["monthly_tds"],
            "tds_annual": tax["total_tax"],
            "total_deductions": round(total_deductions_monthly, 2)
        },
        "net_salary": round(net_monthly, 2),
        "ctc_monthly": round(gross_monthly + pf["employer_pf"] + esic["employer_esic"], 2),
        "ctc_annual": round((gross_monthly + pf["employer_pf"] + esic["employer_esic"]) * 12, 2)
    }
