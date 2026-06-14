#!/usr/bin/env python3
"""
GOLDEN-VALUE ORACLE — 20-Year Investment Value Calculator (Real Estate vs Equity)
================================================================================

This file is the *authoritative numeric reference* for the calculator's formulas.
It implements the PRD §4 formulas independently of the production TypeScript engine
and computes every hard-numbered §7 test case to full floating-point precision.

WHY THIS EXISTS
---------------
The calculator's outputs drive real capital-allocation decisions, so "approximately
right" is not acceptable. The PRD's original §7 carried hand-rounded expected values
(e.g. landRate(10) was stated 82,054 but the formula yields 82,039.15; rent_annual(10)
was stated 675,640 but the formula yields 675,695.02). Two independent reviews — one
in-session, one in ground_truth_validation.md — recomputed every value at full
precision and agreed to the paisa, and both concluded the FORMULAS are correct and
only the PRD's *stated targets* were imprecise (each within the PRD's own ±0.5–1% tag).

POLICY
------
- The TypeScript engine's unit tests MUST match the values printed here to 2 decimals
  (the paisa) for deterministic quantities, and to <=1e-7 for iterative ones (XIRR).
- These printed values are the "golden values" frozen into the test suite.
- Run `python3 reference/oracle.py` to regenerate / re-verify them.

Pure standard library. No dependencies.
"""

from __future__ import annotations


# --------------------------------------------------------------------------------------
# §4.2  EMI / loan amortization
# --------------------------------------------------------------------------------------
def emi(principal: float, annual_rate: float, years: int) -> float:
    """Standard EMI. If the monthly rate is 0, EMI = principal / n (PRD §4.2)."""
    r = annual_rate / 12.0
    n = years * 12
    if r == 0.0:
        return principal / n
    return principal * r * (1 + r) ** n / ((1 + r) ** n - 1)


# --------------------------------------------------------------------------------------
# §4.3  Rent path (market growth phases + post-year-10 cohort drag)
# --------------------------------------------------------------------------------------
def g_market(t: int, g1_5: float, g6_10: float, g11_20: float) -> float:
    if 1 <= t <= 5:
        return g1_5
    if 6 <= t <= 10:
        return g6_10
    return g11_20


def drag(t: int, cohort_drag: float) -> float:
    """drag(t) = 0 for t<=10 ; cohort * min((t-10)/5, 1) for t>10  (PRD §4.3)."""
    if t <= 10:
        return 0.0
    return cohort_drag * min((t - 10) / 5.0, 1.0)


def rent_path(rent_per_month_0: float, g1_5: float, g6_10: float, g11_20: float,
              cohort_drag: float, years: int = 20) -> list[float]:
    """rent_annual(0) = rentPerMonth0*12 ; rent_annual(t)=rent_annual(t-1)*(1+g_real(t))."""
    rent = rent_per_month_0 * 12.0
    out = [rent]  # index 0 == rent_annual(0)
    for t in range(1, years + 1):
        g_real = g_market(t, g1_5, g6_10, g11_20) - drag(t, cohort_drag)
        rent = rent * (1 + g_real)
        out.append(rent)
    return out


# --------------------------------------------------------------------------------------
# §4.5  Value stack — structure (depreciated replacement cost) and land
# --------------------------------------------------------------------------------------
def structure_value(area_sqft: float, repl_cost_0: float, construction_infl: float,
                    total_dep_rate: float, age_at_purchase: int, t: int,
                    salvage_floor: float) -> float:
    """
    age(t)        = age_at_purchase + t
    replCost(t)   = replCost0 * (1 + constructionInfl)^t
    depFactor(t)  = max(1 - totalDepRate * age(t), salvageFloor)
    structValue(t)= area * replCost(t) * depFactor(t)
    """
    age = age_at_purchase + t
    repl = repl_cost_0 * (1 + construction_infl) ** t
    dep_factor = max(1 - total_dep_rate * age, salvage_floor)
    return area_sqft * repl * dep_factor


def land_rate(land_rate_0: float, cagr_1_10: float, cagr_11_20: float, t: int) -> float:
    """landRate(t) = landRate0 * (1+cagr1)^min(t,10) * (1+cagr2)^max(t-10,0)  (PRD §4.5a)."""
    return land_rate_0 * (1 + cagr_1_10) ** min(t, 10) * (1 + cagr_11_20) ** max(t - 10, 0)


def land_value(uds_sqft: float, land_rate_0: float, cagr_1_10: float,
               cagr_11_20: float, t: int) -> float:
    return uds_sqft * land_rate(land_rate_0, cagr_1_10, cagr_11_20, t)


# --------------------------------------------------------------------------------------
# §4.10  XIRR (NPV root via bisection) — used for the equity/RE comparison
# --------------------------------------------------------------------------------------
def xirr_annual(cashflows: list[tuple[float, float]], lo: float = -0.99,
                hi: float = 10.0, tol: float = 1e-12, max_iter: int = 200) -> float:
    """
    Solve annual IRR for (year, amount) cashflows via bisection on NPV=0.
    `year` is in years (can be fractional). Returns the annual rate.
    """
    def npv(rate: float) -> float:
        return sum(cf / (1 + rate) ** yr for yr, cf in cashflows)

    flo, fhi = npv(lo), npv(hi)
    if flo * fhi > 0:
        raise ValueError("XIRR: NPV does not bracket a root in [lo, hi].")
    for _ in range(max_iter):
        mid = (lo + hi) / 2.0
        fmid = npv(mid)
        if abs(fmid) < tol or (hi - lo) / 2.0 < tol:
            return mid
        if flo * fmid < 0:
            hi, fhi = mid, fmid
        else:
            lo, flo = mid, fmid
    return (lo + hi) / 2.0


# --------------------------------------------------------------------------------------
# §4.11  Plot self-build construction cost stack
# --------------------------------------------------------------------------------------
def construction_cost_stack(built_up_area_sqft: float, rate_per_sqft: float,
                            soft_costs_pct: float, contingency_pct: float,
                            build_interiors: float) -> dict[str, float]:
    base = built_up_area_sqft * rate_per_sqft
    soft = base * soft_costs_pct
    contingency = base * contingency_pct
    total = base + soft + contingency + build_interiors
    return {
        "baseConstruction": base,
        "softCosts": soft,
        "contingency": contingency,
        "buildInteriors": build_interiors,
        "totalConstructionCost": total,
    }


# ======================================================================================
# GOLDEN VALUES — printed for the §7 test cases. Compare TS engine against these.
# ======================================================================================
def main() -> None:
    line = "=" * 78
    print(line)
    print("GOLDEN VALUES — 20-Year Investment Value Calculator (RE vs Equity)")
    print(line)

    # ---- T1: EMI ₹1,00,00,000 @ 7.5% for 20y ----
    t1 = emi(10_000_000, 0.075, 20)
    print(f"T1  EMI (1cr, 7.5%, 20y)            = {t1:,.4f}  [PRD stated 80,559 ±50]")

    # ---- T2: zero-rate EMI ----
    t2 = emi(1_200_000, 0.0, 10)
    print(f"T2  EMI (12L, 0%, 10y)              = {t2:,.4f}  [PRD stated 10,000 exact]")

    # ---- T3: rent path, rent0=30,000/mo, g 7/6/5, cohort drag 2% ----
    rp = rent_path(30_000, 0.07, 0.06, 0.05, 0.02)
    print(f"T3  rent_annual(5)                  = {rp[5]:,.4f}  [PRD stated 504,918]")
    print(f"T3  rent_annual(10)                 = {rp[10]:,.4f}  [PRD stated 675,640]")
    print(f"T3  rent_annual(15)                 = {rp[15]:,.4f}  [PRD stated ~815,150]")
    print(f"T3  rent_annual(20)                 = {rp[20]:,.4f}  [PRD stated ~945,000]")
    #   traceable intermediates:
    print(f"     1.07^5 = {1.07**5:.8f} ; 1.06^5 = {1.06**5:.8f}")
    yr11_15 = 1.046 * 1.042 * 1.038 * 1.034 * 1.030
    print(f"     y11-15 factor product = {yr11_15:.8f} ; 1.03^5 = {1.03**5:.8f}")

    # ---- T4: structure value ----
    area, repl0, infl, total_dep, salvage = 1000, 2300, 0.06, 0.0317, 0.10
    t4_0 = structure_value(area, repl0, infl, total_dep, 0, 0, salvage)
    t4_10 = structure_value(area, repl0, infl, total_dep, 0, 10, salvage)
    t4_40 = structure_value(area, repl0, infl, total_dep, 0, 40, salvage)
    print(f"T4  struct(0)                       = {t4_0:,.4f}  [PRD stated 2,300,000]")
    print(f"T4  struct(10)                      = {t4_10:,.4f}  [PRD stated ~2,813,400]")
    print(f"T4  struct(40)                      = {t4_40:,.4f}  [PRD stated ~2,365,700]")
    print(f"     1.06^10 = {1.06**10:.8f} ; depFactor(10) = {1 - total_dep*10:.4f}")
    print(f"     1.06^40 = {1.06**40:.8f} ; depFactor(40) floored at {salvage}")

    # ---- T5: land ----
    uds, lr0, c1, c2 = 600, 38_000, 0.08, 0.06
    lr10, lr20 = land_rate(lr0, c1, c2, 10), land_rate(lr0, c1, c2, 20)
    lv10, lv20 = land_value(uds, lr0, c1, c2, 10), land_value(uds, lr0, c1, c2, 20)
    print(f"T5  landRate(10)                    = {lr10:,.4f}  [PRD stated 82,054]")
    print(f"T5  landValue(10)                   = {lv10:,.4f}  [PRD stated 49,232,400]")
    print(f"T5  landRate(20)                    = {lr20:,.4f}  [PRD stated 146,940]")
    print(f"T5  landValue(20)                   = {lv20:,.4f}  [PRD stated 88,164,000]")
    print(f"     1.08^10 = {1.08**10:.8f} ; 1.06^10 = {1.06**10:.8f}")

    # ---- T10: XIRR ----
    #   PRD: -1,000,000 @ t0, +6,727,500 @ t20 -> 10.00%. The +6,727,500 is 1.10^20
    #   rounded to the rupee; the exact-10% cashflow is 1,000,000 * 1.10^20.
    exact_fv = 1_000_000 * 1.10 ** 20
    t10_prd = xirr_annual([(0, -1_000_000), (20, 6_727_500)])
    t10_exact = xirr_annual([(0, -1_000_000), (20, exact_fv)])
    print(f"T10 XIRR (PRD cashflow 6,727,500)   = {t10_prd*100:.7f}%  [PRD stated 10.00%]")
    print(f"T10 XIRR (exact FV {exact_fv:,.4f}) = {t10_exact*100:.7f}%  [exactly 10%]")

    # ---- T13: construction cost stack ----
    cs = construction_cost_stack(1750, 2500, 0.12, 0.20, 850_000)
    print(f"T13 baseConstruction                = {cs['baseConstruction']:,.2f}")
    print(f"T13 softCosts (12%)                 = {cs['softCosts']:,.2f}")
    print(f"T13 contingency (20%)               = {cs['contingency']:,.2f}")
    print(f"T13 buildInteriors                  = {cs['buildInteriors']:,.2f}")
    print(f"T13 totalConstructionCost           = {cs['totalConstructionCost']:,.2f}  [PRD 6,625,000]")
    print(line)


if __name__ == "__main__":
    main()
