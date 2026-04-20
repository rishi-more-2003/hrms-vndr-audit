"""
Payroll Calculation Engines — Indian Labour Law compliant.
Used by Bonus, Gratuity, Incentive, Advance, and Loan endpoints.
"""

# ═══════════════════════════════════════════════════════════════════
# BONUS — Payment of Bonus Act, 1965
# ═══════════════════════════════════════════════════════════════════
# Statutory minimum: 8.33% of earned wages (one month's wage)
# Statutory maximum: 20% of earned wages
# Eligibility: employees drawing wage ≤ ₹21,000/month
# Calculation wage ceiling: ₹7,000/month OR state minimum wage, whichever is higher
# Working days for pro-rata: 30+ days in the accounting year

BONUS_ELIGIBILITY_CEILING = 21000       # Only employees earning ≤ this qualify
BONUS_CALC_CEILING = 7000               # Wages capped at this for calc
BONUS_MIN_RATE = 0.0833                 # 8.33%
BONUS_MAX_RATE = 0.20                   # 20%
BONUS_MIN_DAYS_WORKED = 30              # Must work ≥ 30 days in accounting year


def calculate_statutory_bonus(monthly_wage: float, days_worked: int, bonus_rate: float = None,
                              eligibility_ceiling: float = None, calc_ceiling: float = None) -> dict:
    """
    Calculate annual bonus as per Payment of Bonus Act 1965.
    - monthly_wage: employee's Basic + DA per month
    - days_worked: days worked in the accounting year (typically 365)
    - bonus_rate: fraction between 0.0833 and 0.20 (defaults to 8.33% minimum)
    """
    elig = eligibility_ceiling if eligibility_ceiling is not None else BONUS_ELIGIBILITY_CEILING
    calc = calc_ceiling if calc_ceiling is not None else BONUS_CALC_CEILING
    rate = bonus_rate if bonus_rate is not None else BONUS_MIN_RATE

    eligible = monthly_wage <= elig and days_worked >= BONUS_MIN_DAYS_WORKED
    if not eligible:
        return {"eligible": False, "reason": f"Wage > ₹{elig:,} or days < {BONUS_MIN_DAYS_WORKED}",
                "bonus_amount": 0, "bonus_rate_applied": 0}

    # Clamp rate to statutory band
    rate = max(BONUS_MIN_RATE, min(BONUS_MAX_RATE, rate))
    # Wage used for calc is capped
    calc_wage = min(monthly_wage, calc)
    annual_wage = calc_wage * 12
    # Pro-rate for days worked (365 day year assumption)
    pro_rata = days_worked / 365
    bonus = annual_wage * rate * pro_rata

    return {
        "eligible": True,
        "bonus_amount": round(bonus, 2),
        "bonus_rate_applied": round(rate, 4),
        "calc_wage_monthly": calc_wage,
        "calc_wage_annual": annual_wage,
        "pro_rata_factor": round(pro_rata, 4),
        "days_worked": days_worked,
    }


# ═══════════════════════════════════════════════════════════════════
# GRATUITY — Payment of Gratuity Act, 1972
# ═══════════════════════════════════════════════════════════════════
# Formula: (last_drawn_wage × 15 × years_of_service) / 26
# Where wage = Basic + DA
# Eligibility: ≥ 5 years continuous service (waived on death/disability)
# Statutory cap: ₹20,00,000 (central govt) — tax-exempt up to this
# Year counting: > 6 months in last year = full year, else ignored

GRATUITY_DAYS_PER_YEAR = 15
GRATUITY_MONTHLY_DIVISOR = 26
GRATUITY_MIN_SERVICE_YEARS = 5
GRATUITY_STATUTORY_CAP = 2000000


def calculate_gratuity(last_drawn_wage: float, years_of_service: float,
                        exit_reason: str = "resignation",
                        days_per_year: int = None, divisor: int = None,
                        statutory_cap: float = None) -> dict:
    """
    Calculate gratuity as per Payment of Gratuity Act 1972.
    - last_drawn_wage: monthly Basic + DA
    - years_of_service: total years (fractional allowed for rounding)
    - exit_reason: resignation | retirement | death | disability (last two waive 5-yr rule)
    """
    d = days_per_year or GRATUITY_DAYS_PER_YEAR
    div = divisor or GRATUITY_MONTHLY_DIVISOR
    cap = statutory_cap if statutory_cap is not None else GRATUITY_STATUTORY_CAP

    # Year rounding: > 6 months = full year
    completed_years = int(years_of_service)
    fraction = years_of_service - completed_years
    if fraction >= 0.5:
        effective_years = completed_years + 1
    else:
        effective_years = completed_years

    # 5-year rule waived on death/disability
    waives_5yr = exit_reason.lower() in ("death", "disability", "disablement")
    if effective_years < GRATUITY_MIN_SERVICE_YEARS and not waives_5yr:
        return {"eligible": False, "reason": f"<{GRATUITY_MIN_SERVICE_YEARS} years of service",
                "gratuity_amount": 0, "tax_exempt_amount": 0}

    raw = (last_drawn_wage * d * effective_years) / div
    capped = min(raw, cap)
    # Tax exemption up to capped amount (Section 10(10))
    tax_exempt = capped

    return {
        "eligible": True,
        "exit_reason": exit_reason,
        "years_of_service_input": years_of_service,
        "effective_years": effective_years,
        "last_drawn_wage": last_drawn_wage,
        "days_per_year": d,
        "divisor": div,
        "raw_gratuity": round(raw, 2),
        "gratuity_amount": round(capped, 2),
        "statutory_cap": cap,
        "cap_applied": raw > cap,
        "tax_exempt_amount": round(tax_exempt, 2),
        "tax_payable_on": round(max(0, raw - tax_exempt), 2),
    }


# ═══════════════════════════════════════════════════════════════════
# INCENTIVE / COMMISSION
# ═══════════════════════════════════════════════════════════════════
def calculate_incentive(achievement_percent: float, target_amount: float,
                         incentive_type: str = "fixed", fixed_amount: float = 0,
                         percentage_rate: float = 0, min_achievement: float = 0,
                         prorata: bool = True, slabs: list = None) -> dict:
    """
    Calculate incentive/commission.
    - incentive_type: fixed | percentage | slab_based | target_based
    - achievement_percent: % of target achieved (0-100+)
    - target_amount: numerical target (revenue/sales/collections)
    - slabs: [{from_pct, to_pct, rate_pct}] for slab_based
    """
    if achievement_percent < min_achievement:
        return {"eligible": False, "reason": f"Achievement {achievement_percent}% < min {min_achievement}%",
                "incentive_amount": 0}

    amount = 0.0
    achievement_value = target_amount * (achievement_percent / 100)

    if incentive_type == "fixed":
        amount = fixed_amount if achievement_percent >= 100 or not prorata else fixed_amount * (achievement_percent / 100)
    elif incentive_type == "percentage":
        amount = achievement_value * (percentage_rate / 100)
    elif incentive_type == "target_based":
        amount = fixed_amount if achievement_percent >= 100 else (fixed_amount * (achievement_percent / 100) if prorata else 0)
    elif incentive_type == "slab_based" and slabs:
        # Apply slab rate matching achievement_percent
        for s in slabs:
            lo = float(s.get("from_pct", 0) or 0)
            hi = float(s.get("to_pct", 100) or 100)
            rate = float(s.get("rate_pct", 0) or 0)
            if lo <= achievement_percent <= hi:
                amount = achievement_value * (rate / 100)
                break

    return {
        "eligible": True,
        "incentive_type": incentive_type,
        "achievement_percent": achievement_percent,
        "target_amount": target_amount,
        "achievement_value": round(achievement_value, 2),
        "incentive_amount": round(amount, 2),
    }


# ═══════════════════════════════════════════════════════════════════
# SALARY ADVANCE
# ═══════════════════════════════════════════════════════════════════
def calculate_advance_schedule(advance_amount: float, monthly_salary: float,
                                repayment_months: int, interest_rate_pa: float = 0,
                                max_advance_pct: float = 50) -> dict:
    """
    Calculate salary advance EMI schedule.
    - advance_amount: INR requested
    - monthly_salary: employee's gross monthly salary
    - repayment_months: number of months to recover
    - interest_rate_pa: annual interest rate %
    """
    max_allowed = monthly_salary * (max_advance_pct / 100)
    if advance_amount > max_allowed:
        return {"approved": False, "reason": f"Advance > {max_advance_pct}% of salary (max ₹{max_allowed:,.0f})",
                "max_allowed": round(max_allowed, 2)}

    principal = advance_amount
    r_monthly = interest_rate_pa / 100 / 12
    if r_monthly > 0:
        emi = principal * r_monthly * ((1 + r_monthly) ** repayment_months) / (((1 + r_monthly) ** repayment_months) - 1)
    else:
        emi = principal / repayment_months

    schedule = []
    balance = principal
    for m in range(1, repayment_months + 1):
        interest = round(balance * r_monthly, 2)
        principal_paid = round(emi - interest, 2)
        balance = round(balance - principal_paid, 2)
        schedule.append({
            "month": m,
            "emi": round(emi, 2),
            "principal": principal_paid,
            "interest": interest,
            "balance": max(0, balance),
        })

    total_paid = round(emi * repayment_months, 2)
    return {
        "approved": True,
        "advance_amount": principal,
        "repayment_months": repayment_months,
        "monthly_emi": round(emi, 2),
        "total_repayment": total_paid,
        "total_interest": round(total_paid - principal, 2),
        "schedule": schedule,
    }


# ═══════════════════════════════════════════════════════════════════
# EMPLOYEE LOAN — Reducing Balance / Simple Interest
# ═══════════════════════════════════════════════════════════════════
def calculate_loan_emi(principal: float, rate_pa: float, tenure_months: int,
                        interest_type: str = "reducing_balance", max_emi_pct: float = None,
                        monthly_salary: float = None) -> dict:
    """
    Calculate loan EMI for employee loan.
    - interest_type: reducing_balance | simple
    - rate_pa: annual interest rate %
    - max_emi_pct: maximum EMI as % of monthly salary (eligibility check)
    """
    r = rate_pa / 100 / 12

    if interest_type == "simple":
        total_interest = principal * (rate_pa / 100) * (tenure_months / 12)
        total_amount = principal + total_interest
        emi = total_amount / tenure_months
        schedule = []
        balance = principal
        monthly_interest = total_interest / tenure_months
        monthly_principal = principal / tenure_months
        for m in range(1, tenure_months + 1):
            balance = round(balance - monthly_principal, 2)
            schedule.append({"month": m, "emi": round(emi, 2),
                             "principal": round(monthly_principal, 2),
                             "interest": round(monthly_interest, 2),
                             "balance": max(0, balance)})
    else:
        # Reducing balance (standard EMI formula)
        if r > 0:
            emi = principal * r * ((1 + r) ** tenure_months) / (((1 + r) ** tenure_months) - 1)
        else:
            emi = principal / tenure_months
        schedule = []
        balance = principal
        for m in range(1, tenure_months + 1):
            interest = round(balance * r, 2)
            principal_paid = round(emi - interest, 2)
            balance = round(balance - principal_paid, 2)
            schedule.append({"month": m, "emi": round(emi, 2),
                             "principal": principal_paid, "interest": interest,
                             "balance": max(0, balance)})
        total_interest = sum(s["interest"] for s in schedule)

    emi_r = round(emi, 2)
    total_repayment = round(emi_r * tenure_months, 2)

    approved = True
    reason = ""
    if max_emi_pct is not None and monthly_salary and monthly_salary > 0:
        max_emi_allowed = monthly_salary * (max_emi_pct / 100)
        if emi_r > max_emi_allowed:
            approved = False
            reason = f"EMI ₹{emi_r:,.0f} exceeds {max_emi_pct}% of salary (max ₹{max_emi_allowed:,.0f})"

    return {
        "approved": approved,
        "reason": reason,
        "principal": principal,
        "rate_pa": rate_pa,
        "tenure_months": tenure_months,
        "interest_type": interest_type,
        "monthly_emi": emi_r,
        "total_interest": round(total_interest, 2),
        "total_repayment": total_repayment,
        "schedule": schedule,
    }
