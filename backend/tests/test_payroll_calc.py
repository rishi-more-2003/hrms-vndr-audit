"""Pytest for Bonus / Gratuity / Incentive / Advance / Loan calculators."""
import pytest
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from payroll_calc import (
    calculate_statutory_bonus, calculate_gratuity, calculate_incentive,
    calculate_advance_schedule, calculate_loan_emi,
    BONUS_MIN_RATE, BONUS_MAX_RATE, BONUS_CALC_CEILING, BONUS_ELIGIBILITY_CEILING,
    GRATUITY_STATUTORY_CAP,
)


# ══════════════════════  BONUS  ══════════════════════
class TestBonus:
    def test_min_rate_worker(self):
        r = calculate_statutory_bonus(18000, 365)
        assert r["eligible"] is True
        # 7000 (capped) * 12 * 8.33% = 6997.20
        assert r["bonus_amount"] == 6997.20
        assert r["bonus_rate_applied"] == BONUS_MIN_RATE
        assert r["calc_wage_monthly"] == BONUS_CALC_CEILING

    def test_max_rate_applied(self):
        r = calculate_statutory_bonus(15000, 365, bonus_rate=0.20)
        # 7000 * 12 * 20% = 16800
        assert r["bonus_amount"] == 16800.0

    def test_exceeds_max_clamp(self):
        r = calculate_statutory_bonus(15000, 365, bonus_rate=0.50)
        # clamped to 20%
        assert r["bonus_rate_applied"] == BONUS_MAX_RATE

    def test_below_min_clamp(self):
        r = calculate_statutory_bonus(15000, 365, bonus_rate=0.05)
        assert r["bonus_rate_applied"] == BONUS_MIN_RATE

    def test_ineligible_by_ceiling(self):
        r = calculate_statutory_bonus(25000, 365)
        assert r["eligible"] is False

    def test_ineligible_by_days(self):
        r = calculate_statutory_bonus(10000, 20)
        assert r["eligible"] is False

    def test_pro_rata(self):
        r = calculate_statutory_bonus(10000, 180)
        # 7000*12*8.33% * (180/365) ≈ 3451.6
        expected = round(7000 * 12 * 0.0833 * 180 / 365, 2)
        assert r["bonus_amount"] == expected

    def test_wage_below_calc_ceiling(self):
        # When wage < calc ceiling, wage itself used
        r = calculate_statutory_bonus(5000, 365)
        # 5000 * 12 * 8.33% = 4998.0
        assert r["bonus_amount"] == 4998.0
        assert r["calc_wage_monthly"] == 5000


# ══════════════════════  GRATUITY  ══════════════════════
class TestGratuity:
    def test_standard_resignation(self):
        r = calculate_gratuity(50000, 7.5, "resignation")
        assert r["eligible"] is True
        # 7.5 → rounded to 8 years. 50000 * 15 * 8 / 26 = 230769.23
        assert r["effective_years"] == 8
        assert r["gratuity_amount"] == 230769.23
        assert r["cap_applied"] is False

    def test_below_5yr_ineligible(self):
        r = calculate_gratuity(50000, 4.4, "resignation")  # rounds down to 4
        assert r["eligible"] is False

    def test_death_waives_5yr_rule(self):
        r = calculate_gratuity(50000, 2.5, "death")
        assert r["eligible"] is True
        # 2.5 → rounded to 3 years. 50000*15*3/26 = 86538.46
        assert r["gratuity_amount"] == 86538.46

    def test_year_rounding_below_half(self):
        r = calculate_gratuity(50000, 5.4, "resignation")
        assert r["effective_years"] == 5

    def test_year_rounding_at_half(self):
        r = calculate_gratuity(50000, 5.5, "resignation")
        assert r["effective_years"] == 6

    def test_statutory_cap(self):
        # Very high wage × long service
        r = calculate_gratuity(200000, 25, "retirement")
        assert r["cap_applied"] is True
        assert r["gratuity_amount"] == GRATUITY_STATUTORY_CAP
        assert r["tax_exempt_amount"] == GRATUITY_STATUTORY_CAP
        # Extra above cap is taxable (already rounded to 2 decimals by impl)
        assert r["tax_payable_on"] == round(r["raw_gratuity"] - GRATUITY_STATUTORY_CAP, 2)

    def test_disability_waives_5yr(self):
        r = calculate_gratuity(30000, 3, "disability")
        assert r["eligible"] is True


# ══════════════════════  INCENTIVE  ══════════════════════
class TestIncentive:
    def test_fixed_full_achievement(self):
        r = calculate_incentive(100, 1000000, "fixed", fixed_amount=50000)
        assert r["incentive_amount"] == 50000

    def test_fixed_prorated(self):
        r = calculate_incentive(80, 1000000, "fixed", fixed_amount=50000, prorata=True)
        # Since achievement < 100 and prorata=True → 50000 * 0.8 = 40000
        assert r["incentive_amount"] == 40000

    def test_percentage_based(self):
        r = calculate_incentive(120, 1000000, "percentage", percentage_rate=5)
        # achievement_value = 1200000; 5% = 60000
        assert r["incentive_amount"] == 60000

    def test_slab_based(self):
        slabs = [
            {"from_pct": 0, "to_pct": 75, "rate_pct": 0},
            {"from_pct": 75, "to_pct": 100, "rate_pct": 3},
            {"from_pct": 100, "to_pct": 150, "rate_pct": 5},
            {"from_pct": 150, "to_pct": 999, "rate_pct": 7},
        ]
        r = calculate_incentive(120, 1000000, "slab_based", slabs=slabs)
        # 120% → slab 100-150 @ 5%, achievement_value=1200000 → 60000
        assert r["incentive_amount"] == 60000

    def test_min_achievement_not_met(self):
        r = calculate_incentive(40, 1000000, "fixed", fixed_amount=50000, min_achievement=50)
        assert r["eligible"] is False


# ══════════════════════  ADVANCE  ══════════════════════
class TestAdvance:
    def test_zero_interest(self):
        r = calculate_advance_schedule(20000, 60000, 4, interest_rate_pa=0, max_advance_pct=50)
        assert r["approved"] is True
        assert r["monthly_emi"] == 5000.0
        assert r["total_interest"] == 0.0
        assert len(r["schedule"]) == 4

    def test_with_interest(self):
        r = calculate_advance_schedule(12000, 50000, 6, interest_rate_pa=12)
        # Standard EMI formula
        assert r["approved"] is True
        assert r["monthly_emi"] > 2000  # rough check
        # Total = principal + interest
        assert r["total_repayment"] == round(r["monthly_emi"] * 6, 2)

    def test_exceeds_max_pct(self):
        r = calculate_advance_schedule(40000, 60000, 6, max_advance_pct=50)
        # 40000 > 50% of 60000 = 30000
        assert r["approved"] is False
        assert r["max_allowed"] == 30000.0

    def test_schedule_balance_goes_to_zero(self):
        r = calculate_advance_schedule(10000, 50000, 5, interest_rate_pa=0)
        assert r["schedule"][-1]["balance"] == 0


# ══════════════════════  LOAN  ══════════════════════
class TestLoan:
    def test_reducing_balance(self):
        r = calculate_loan_emi(100000, 10, 24, "reducing_balance")
        assert r["approved"] is True
        # Known value: ₹4614.49 EMI for 1L @ 10% pa 24m
        assert r["monthly_emi"] == 4614.49
        # Total interest ≈ 10747
        assert 10700 <= r["total_interest"] <= 10800

    def test_simple_interest(self):
        r = calculate_loan_emi(100000, 10, 24, "simple")
        # simple: I = P*R*T = 100000 * 0.10 * 2 = 20000
        assert r["total_interest"] == 20000.0
        # EMI = (100000+20000)/24 = 5000
        assert r["monthly_emi"] == 5000.0

    def test_zero_interest(self):
        r = calculate_loan_emi(24000, 0, 12, "reducing_balance")
        assert r["monthly_emi"] == 2000.0
        assert r["total_interest"] == 0.0

    def test_max_emi_check_rejects(self):
        r = calculate_loan_emi(500000, 12, 24, "reducing_balance",
                               max_emi_pct=25, monthly_salary=50000)
        # EMI ≈ 23536, > 25% of 50000 (12500)
        assert r["approved"] is False

    def test_max_emi_check_allows(self):
        r = calculate_loan_emi(100000, 10, 36, "reducing_balance",
                               max_emi_pct=50, monthly_salary=50000)
        assert r["approved"] is True


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
