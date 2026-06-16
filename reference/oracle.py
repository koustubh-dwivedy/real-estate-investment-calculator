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
def g_market(t: int, g1_5: float, g6_10: float, g11_20: float,
             g21_30: float | None = None) -> float:
    if 1 <= t <= 5:
        return g1_5
    if 6 <= t <= 10:
        return g6_10
    if 11 <= t <= 20:
        return g11_20
    return g11_20 if g21_30 is None else g21_30  # years 21–30 (defaults to y11_20)


def drag(t: int, cohort_drag: float) -> float:
    """drag(t) = 0 for t<=10 ; cohort * min((t-10)/5, 1) for t>10  (PRD §4.3)."""
    if t <= 10:
        return 0.0
    return cohort_drag * min((t - 10) / 5.0, 1.0)


def rent_monthly_path(rent_per_month_0: float, g1_5: float, g6_10: float, g11_20: float,
                      cohort_drag: float, hold_months: int, g21_30: float | None = None,
                      term_months: int = 12) -> list[float]:
    """
    Monthly rent, FLAT within an agreement term, stepping by (1 + g_real) at each renewal.
    out[0] = rentPerMonth0 (signed rate); out[m] = rent in hold-month m (1..hold_months).

      renewal takes effect at hold-month m when (m-1) % term_months == 0 and m > 1
      step factor = 1 + (g_market(y) - drag(y)),  y = ceil((m-1)/12)  (the expiring year)

    term_months=12 → a step at month 13, 25, …; term_months=11 (India) renews sooner.
    """
    import math
    term = term_months if term_months > 0 else 12
    out = [rent_per_month_0]
    rent = rent_per_month_0
    for m in range(1, hold_months + 1):
        if m > 1 and (m - 1) % term == 0:
            y = math.ceil((m - 1) / 12)
            rent = rent * (1 + (g_market(y, g1_5, g6_10, g11_20, g21_30) - drag(y, cohort_drag)))
        out.append(rent)
    return out


def annualize_rent(monthly: list[float], years: int) -> list[float]:
    """Realized annual rent per hold-year = Σ of that year's 12 monthly rents. out[0]=0."""
    out = [0.0]
    for t in range(1, years + 1):
        out.append(sum(monthly[(t - 1) * 12 + k] for k in range(1, 13)))
    return out


def rent_path(rent_per_month_0: float, g1_5: float, g6_10: float, g11_20: float,
              cohort_drag: float, years: int = 20, g21_30: float | None = None,
              renewal_months: int = 12) -> list[float]:
    """Realized annual rent path (per-term stepping). out[t] = Σ monthly rents in year t."""
    monthly = rent_monthly_path(rent_per_month_0, g1_5, g6_10, g11_20, cohort_drag,
                                years * 12, g21_30, renewal_months)
    return annualize_rent(monthly, years)


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


def land_rate(land_rate_0: float, cagr_1_10: float, cagr_11_20: float, t: int,
              cagr_21_30: float | None = None) -> float:
    """
    landRate(t) = landRate0
      * (1+cagr1)^min(t,10)                  # years 1–10
      * (1+cagr2)^clamp(t-10, 0, 10)         # years 11–20
      * (1+cagr3)^max(t-20, 0)               # years 21–30 (cagr3 defaults to cagr2)
    (PRD §4.5a).
    """
    cagr3 = cagr_11_20 if cagr_21_30 is None else cagr_21_30
    return (land_rate_0
            * (1 + cagr_1_10) ** min(t, 10)
            * (1 + cagr_11_20) ** min(max(t - 10, 0), 10)
            * (1 + cagr3) ** max(t - 20, 0))


def land_value(uds_sqft: float, land_rate_0: float, cagr_1_10: float,
               cagr_11_20: float, t: int, cagr_21_30: float | None = None) -> float:
    return uds_sqft * land_rate(land_rate_0, cagr_1_10, cagr_11_20, t, cagr_21_30)


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
# FULL PIPELINE — an independent re-implementation of the engine's compute(), derived
# from PRD §4 (+ the documented audit amendments: Fix-A Engine B §4.9, F1 reinvest-sleeve
# equity LTCG §4.7, the locked per-lease rent model §4.3). This mirrors the SEMANTICS of
# src/engine/* WITHOUT being a line-by-line port: data layout, helper boundaries and the
# Layer-2 redundancy checks differ, so a copy-paste-style bug in the TS cannot silently
# ride along. Every block cites the PRD section it implements.
# ======================================================================================
import json
import math
from dataclasses import dataclass, field, asdict, replace
from typing import Any


# ---------------------------------------------------------------- §4.2 amortization
EPS = 1e-6


def amortize(principal: float, annual_rate: float, tenure_years: int,
             prepayment_annual: float = 0.0,
             extra_principal_by_year: dict[int, float] | None = None,
             horizon_years: int | None = None,
             start_month: int = 1) -> dict[str, Any]:
    """PRD §4.2: fixed-EMI monthly amortization; year-end prepayments shorten tenure."""
    extra_principal_by_year = extra_principal_by_year or {}
    horizon = tenure_years if horizon_years is None else horizon_years
    r = annual_rate / 12.0
    scheduled_emi = emi(principal, annual_rate, tenure_years) if (principal > 0 and tenure_years > 0) else 0.0

    interest_paid = [0.0] * (horizon + 1)
    principal_paid = [0.0] * (horizon + 1)
    emi_annual = [0.0] * (horizon + 1)
    prepay_annual = [0.0] * (horizon + 1)
    balance_end = [0.0] * (horizon + 1)
    balance_end[0] = principal
    monthly = [None]  # 1-indexed

    balance = principal
    payoff_month = 0
    total_months = horizon * 12
    for month in range(1, total_months + 1):
        year = math.ceil(month / 12)
        interest = principal_comp = emi_this = prepay = 0.0
        if balance > EPS and month >= start_month:
            interest = balance * r
            due = min(scheduled_emi, balance + interest)
            emi_this = due
            principal_comp = due - interest
            balance -= principal_comp
            if month % 12 == 0 and balance > EPS:
                extra = prepayment_annual + extra_principal_by_year.get(year, 0.0)
                if extra > 0:
                    prepay = min(extra, balance)
                    balance -= prepay
            if balance <= EPS:
                balance = 0.0
                if payoff_month == 0:
                    payoff_month = month
        monthly.append({"month": month, "year": year, "emi": emi_this,
                        "interest": interest, "principal": principal_comp,
                        "prepay": prepay, "balanceEnd": balance})
        if year <= horizon:
            interest_paid[year] += interest
            principal_paid[year] += principal_comp + prepay
            emi_annual[year] += emi_this
            prepay_annual[year] += prepay
            balance_end[year] = balance

    return {"emi": scheduled_emi, "monthly": monthly, "interestPaid": interest_paid,
            "principalPaid": principal_paid, "emiAnnual": emi_annual,
            "prepayAnnual": prepay_annual, "balanceEnd": balance_end,
            "payoffMonth": payoff_month}


# ---------------------------------------------------------------- §4.5 value stack
def premium_value(sbua: float, premium0: float, decay_years: float, t: int) -> float:
    if decay_years <= 0:
        return 0.0
    return sbua * premium0 * max(1 - t / decay_years, 0.0)


def redev_value(enabled: bool, redev_pct_of_land: float, eligible_age: float,
                land: float, age: float) -> float:
    if not enabled:
        return 0.0
    prox = min(max(age / eligible_age, 0.0), 1.0)
    return redev_pct_of_land * land * prox


def value_stack_at(inp: "Inputs", t: int, land_cagr_override: float | None = None) -> dict[str, float]:
    """PRD §4.5: land + depreciated-replacement structure + premium + redev."""
    is_plot = inp.acquisitionType == "PlotSelfBuild"
    uds = inp.plotAreaSqft if is_plot else inp.udsSqft
    c1 = land_cagr_override if land_cagr_override is not None else inp.landCagrY1_10
    c2 = land_cagr_override if land_cagr_override is not None else inp.landCagrY11_20
    c3 = land_cagr_override if land_cagr_override is not None else inp.landCagrY21_30
    rate = land_rate(inp.landRate0, c1, c2, t, c3)
    for bump in inp.infraBumps:
        if bump["year"] <= t:
            rate *= 1 + bump["pct"]
    land = uds * rate

    struct_area = derive_built_up_area(inp) if is_plot else inp.sbua
    age_at_purchase = 0 if is_plot else inp.ageAtPurchaseYears
    age = age_at_purchase + t
    total_dep = inp.physicalDepRatePct + inp.economicDepRatePct
    dep_factor = max(1 - total_dep * age, inp.salvageFloor)
    repl = inp.replacementCost0 * (1 + inp.constructionInflationPct) ** t
    structure = struct_area * repl * dep_factor
    if inp.redevelopmentEnabled and age >= inp.redevEligibleAgeYears:
        structure = max(structure, 0.0)

    prem = 0.0 if is_plot else premium_value(inp.sbua, inp.premium0, inp.premiumDecayYears, t)
    redev = redev_value(inp.redevelopmentEnabled, inp.redevOptionValuePctOfLand,
                        inp.redevEligibleAgeYears, land, age)
    gross = land + structure + prem + redev
    return {"landValue": land, "structureValue": structure, "premiumValue": prem,
            "redevValue": redev, "propValueClean": gross,
            "landSharePct": (land / gross) if gross > 0 else 0.0,
            "replacementCostPerSqft": repl, "depFactor": dep_factor}


# ---------------------------------------------------------------- §4.11 construction
def derive_built_up_area(inp: "Inputs") -> float:
    if inp.builtUpAreaSqft and inp.builtUpAreaSqft > 0:
        return inp.builtUpAreaSqft
    return inp.plotAreaSqft * inp.farBuildableRatio * inp.floors


def construction_schedule(inp: "Inputs", total_cost: float, build_interiors: float,
                          months: int) -> dict[str, Any]:
    own_funds = inp.constructionFinancing == "OwnFunds"
    construction_loan = 0.0 if own_funds else inp.constructionLoanAmount
    spreadable = total_cost - build_interiors
    base_monthly = spreadable / months if months > 0 else 0.0
    loan_monthly = construction_loan / months if months > 0 else 0.0
    land_rm = inp.plotLoanRatePct / 12.0
    constr_rm = inp.constructionLoanRatePct / 12.0
    land_pre_emi = inp.landLoanAmount * land_rm if inp.preEMIduringConstruction else 0.0

    rows = []
    cum = 0.0
    for m in range(1, months + 1):
        interiors = build_interiors if m == months else 0.0
        draw = base_monthly + interiors
        loan_draw = min(loan_monthly, construction_loan - cum)
        cum += loan_draw
        own = draw - loan_draw
        pre_emi = cum * constr_rm + land_pre_emi
        rows.append({"month": m, "ownPocketDraw": own, "preEMI": pre_emi})
    return {"months": rows, "combinedPrincipalAtCompletion": inp.landLoanAmount + construction_loan}


# ---------------------------------------------------------------- §4.4 opex / NOI / HP tax
OLD_SETOFF_CAP = 200_000.0
SELF_OCC_INTEREST_CAP = 200_000.0
CARRY_FORWARD_YEARS = 8


def eff_tax_rate(inp: "Inputs") -> float:
    factor = 1.04 if inp.surchargeCess == "cess" else (1.1933 if inp.surchargeCess == "surcharge" else 1.0)
    return inp.marginalTaxPct * factor


def compute_opex_and_tax(inp: "Inputs", struct_area: float, value_rows: list,
                         loan: dict, is_plot: bool, rent_monthly: list) -> dict[str, Any]:
    N = inp.holdYears
    let_out = inp.usageMode == "LetOut"
    eff = eff_tax_rate(inp)
    rows = []
    cash_opex_monthly = [0.0]
    gross_rent_monthly = [0.0]
    carry_lots: list[dict] = []

    for t in range(1, N + 1):
        rent_months = [rent_monthly[(t - 1) * 12 + k] for k in range(1, 13)]
        rent_annual = sum(rent_months)
        age = (0 if is_plot else inp.ageAtPurchaseYears) + t
        prop_value = value_rows[t]["propValueClean"]
        interest_paid = loan["interestPaid"][t] if t < len(loan["interestPaid"]) else 0.0
        emi_annual = loan["emiAnnual"][t] if t < len(loan["emiAnnual"]) else 0.0

        re_let_frac = inp.reLetBrokerageMonths / 36.0
        gross_rent = rent_annual * (1 - inp.vacancyPct) - re_let_frac * rent_annual if let_out else 0.0
        brokerage_monthly = (re_let_frac * rent_annual) / 12.0 if let_out else 0.0

        age_mult = (1 + inp.maintenanceAgeAccelPct) ** age
        cam_base = inp.societyCamPerSqftMonth0 * struct_area * 12 * (1 + inp.camEscalationPct) ** t
        property_tax = inp.propertyTaxAnnual0 * (1 + inp.propertyTaxGrowthPct) ** t
        water_tax = inp.waterTaxAnnual0 * (1 + inp.waterTaxGrowthPct) ** t
        major_repair = inp.majorRepairReservePctOfValue * prop_value
        interior_refresh = (inp.interiorRefreshPctOfInitial * inp.interiorsCapex0 * (1 + inp.cpiPct) ** t
                            if inp.interiorRefreshCycleYears > 0 and t > 0 and t % inp.interiorRefreshCycleYears == 0
                            else 0.0)
        owner_maint = (inp.ownerMaintPctOfRent * rent_annual * age_mult if let_out
                       else inp.ownerMaintPctOfValue * prop_value * age_mult)

        if inp.maintenanceMode == "TenantPaysCAM":
            owner_opex_nontax = owner_maint + major_repair + interior_refresh + water_tax
        else:
            owner_opex_nontax = owner_maint + cam_base * age_mult + major_repair + interior_refresh + water_tax
        opex = owner_opex_nontax + property_tax
        noi = gross_rent - opex

        if let_out:
            nav = gross_rent
            taxable_hp = nav - 0.3 * nav - interest_paid
        else:
            interest_deduct = min(interest_paid, SELF_OCC_INTEREST_CAP) if inp.taxRegime == "India_Old" else 0.0
            taxable_hp = -interest_deduct

        rental_tax = 0.0
        carry_lots = [lot for lot in carry_lots if t - lot["year"] <= CARRY_FORWARD_YEARS]
        if taxable_hp > 0:
            taxable = taxable_hp
            if inp.taxRegime == "India_Old":
                for lot in carry_lots:
                    if taxable <= 0:
                        break
                    used = min(lot["amount"], taxable)
                    lot["amount"] -= used
                    taxable -= used
                carry_lots = [lot for lot in carry_lots if lot["amount"] > 1e-6]
            rental_tax = taxable * eff
        elif taxable_hp < 0:
            loss = -taxable_hp
            if inp.taxRegime == "India_Old":
                set_off = min(loss, OLD_SETOFF_CAP)
                rental_tax = -(set_off * eff)
                remaining = loss - set_off
                if remaining > 1e-6:
                    carry_lots.append({"year": t, "amount": remaining})
            else:
                rental_tax = 0.0

        carry_balance = sum(lot["amount"] for lot in carry_lots)
        post_tax_cf = noi - emi_annual - rental_tax

        smooth_opex = opex - interior_refresh
        for k in range(12):
            rent_cash_k = (rent_months[k] * (1 - inp.vacancyPct) - brokerage_monthly) if let_out else 0.0
            opex_k = smooth_opex / 12.0 + (interior_refresh if k == 11 else 0.0)
            gross_rent_monthly.append(rent_cash_k)
            cash_opex_monthly.append(opex_k)

        rows.append({"grossRent": gross_rent, "camBase": cam_base, "ownerMaintenance": owner_maint,
                     "waterTax": water_tax, "interiorRefresh": interior_refresh,
                     "majorRepairReserve": major_repair, "propertyTax": property_tax,
                     "opex": opex, "noi": noi, "taxableHP": taxable_hp,
                     "rentalTaxOrShield": rental_tax, "carryForwardLossBalance": carry_balance,
                     "postTaxRentalCF": post_tax_cf})

    return {"rows": rows, "cashOpexMonthly": cash_opex_monthly, "grossRentMonthly": gross_rent_monthly}


# ---------------------------------------------------------------- §4.6 reinvest sleeve
def compute_reinvest(mode: str, monthly_cf: list, equity_cagr: float) -> dict[str, Any]:
    M = len(monthly_cf) - 1
    growth = (1 + equity_cagr) ** (1 / 12)
    pot_by_month = [0.0] * (M + 1)
    neg_carry = [0.0] * (M + 1)
    prepay_by_year: dict[int, float] = {}
    pot = 0.0
    contrib = 0.0
    for m in range(1, M + 1):
        cf = monthly_cf[m]
        positive = max(cf, 0.0)
        neg_carry[m] = max(-cf, 0.0)
        if mode != "PrepayLoan":
            contrib += positive
        if mode == "ReinvestEquity":
            pot = pot * growth + positive
        elif mode == "Pocket":
            pot = pot + positive
        else:
            if positive > 0:
                y = math.ceil(m / 12)
                prepay_by_year[y] = prepay_by_year.get(y, 0.0) + positive
            pot = 0.0
        pot_by_month[m] = pot
    return {"reinvestPot": pot, "reinvestContrib": contrib, "reinvestPotByMonth": pot_by_month,
            "negCarryByMonth": neg_carry, "prepayByYear": prepay_by_year}


# ---------------------------------------------------------------- §4.9 Engine B
def compute_equity_benchmark(own_cash_out: list, equity_cagr: float,
                             ltcg_equity: float, exemption: float) -> dict[str, Any]:
    growth = (1 + equity_cagr) ** (1 / 12)
    M = len(own_cash_out) - 1
    pot_by_month = [0.0] * (M + 1)
    cum_contrib = [0.0] * (M + 1)
    pot = 0.0
    total = 0.0
    for m in range(0, M + 1):
        if m > 0:
            pot *= growth
        c = own_cash_out[m]
        pot += c
        total += c
        pot_by_month[m] = pot
        cum_contrib[m] = total
    gain = pot - total
    ltcg = max(gain - exemption, 0.0) * ltcg_equity
    return {"eqTerminal": pot - ltcg, "bPot": pot, "totalContribB": total, "bGain": gain,
            "bLtcg": ltcg, "potByMonth": pot_by_month, "cumContribByMonth": cum_contrib}


# ---------------------------------------------------------------- §4.7 exit
def compute_exit(prop_final: float, inp: "Inputs", entry_costs: float, total_construction: float,
                 acquisition_price: float, balance_final: float,
                 reinvest_pot: float, reinvest_contrib: float) -> dict[str, float]:
    exit_gross = prop_final * (1 - inp.liquidityHaircutPct)
    sell_costs = exit_gross * inp.sellingCostPct
    cost_basis = acquisition_price + entry_costs + total_construction
    cap_gain = exit_gross - sell_costs - cost_basis
    ltcg = max(cap_gain, 0.0) * inp.ltcgPropertyPct
    net_proceeds = exit_gross - sell_costs - ltcg - balance_final
    sleeve_gain = reinvest_pot - reinvest_contrib
    sleeve_ltcg = max(sleeve_gain - inp.equityLtcgExemptionAnnual, 0.0) * inp.ltcgEquityPct
    re_terminal = net_proceeds + reinvest_pot - sleeve_ltcg
    return {"exitGross": exit_gross, "sellCosts": sell_costs, "costBasis": cost_basis,
            "capGain": cap_gain, "ltcg": ltcg, "netSaleProceeds": net_proceeds,
            "reinvestSleeveLtcg": sleeve_ltcg, "reTerminal": re_terminal}


# ---------------------------------------------------------------- §8.1 compute()
def compute(inp: "Inputs", skip_breakeven: bool = False,
           land_cagr_override: float | None = None) -> dict[str, Any]:
    N = inp.holdYears
    is_plot = inp.acquisitionType == "PlotSelfBuild"
    construction_months = max(0, round(inp.constructionMonths)) if is_plot else 0
    offset = construction_months

    # §4.1 entry cash
    acquisition_price = inp.plotAreaSqft * inp.landRate0 if is_plot else inp.purchasePriceAllIn
    entry_rate = acquisition_price * (inp.stampDutyRegPct + inp.gstPct + inp.brokerageBuyPct)
    entry_costs = entry_rate + inp.otherAcquisitionCostsAbs + (0.0 if is_plot else inp.interiorsCapex0)
    t0_loan = inp.landLoanAmount if is_plot else inp.loanAmount
    total_cash_t0 = (acquisition_price - t0_loan) + entry_costs

    # §4.11 construction
    total_construction = 0.0
    construction_rows: list = []
    hold_principal = inp.loanAmount
    hold_rate = inp.loanRatePct
    hold_tenure = inp.loanTenureYears
    if is_plot:
        bua = derive_built_up_area(inp)
        base = bua * inp.constructionRatePerSqft
        soft = base * inp.constructionSoftCostsPct
        cont = base * inp.constructionContingencyPct
        build_interiors = inp.interiorsCapex0
        total_construction = base + soft + cont + build_interiors
        sched = construction_schedule(inp, total_construction, build_interiors, construction_months)
        construction_rows = sched["months"]
        hold_principal = sched["combinedPrincipalAtCompletion"]
        construction_loan = 0.0 if inp.constructionFinancing == "OwnFunds" else inp.constructionLoanAmount
        combined = inp.landLoanAmount + construction_loan
        hold_rate = ((inp.landLoanAmount * inp.plotLoanRatePct + construction_loan * inp.constructionLoanRatePct) / combined
                     if combined > 0 else inp.constructionLoanRatePct)
        hold_tenure = inp.compositeLoanTenureYears

    # §4.3 rent
    hold_months = N * 12
    rent_monthly = rent_monthly_path(inp.rentPerMonth0, inp.rentGrowthY1_5, inp.rentGrowthY6_10,
                                     inp.rentGrowthY11_20, inp.cohortDragPct, hold_months,
                                     inp.rentGrowthY21_30, inp.rentAgreementMonths)
    rent_annual = annualize_rent(rent_monthly, N)

    # §4.5 value stack
    struct_area = derive_built_up_area(inp) if is_plot else inp.sbua
    value_rows = [value_stack_at(inp, t, land_cagr_override) for t in range(0, N + 1)]

    # §4.2 loan (hold)
    first_loan = amortize(hold_principal, hold_rate, hold_tenure, inp.prepaymentAnnual,
                          horizon_years=N)

    def monthly_cf_from(loan: dict, opex: dict) -> list:
        cf = [0.0] * (hold_months + 1)
        for m in range(1, hold_months + 1):
            t = math.ceil(m / 12)
            emi_m = loan["monthly"][m]["emi"] if m < len(loan["monthly"]) else 0.0
            tax_m = opex["rows"][t - 1]["rentalTaxOrShield"] if m % 12 == 0 else 0.0
            cf[m] = opex["grossRentMonthly"][m] - opex["cashOpexMonthly"][m] - emi_m - tax_m
        return cf

    opex_result = compute_opex_and_tax(inp, struct_area, value_rows, first_loan, is_plot, rent_monthly)
    reinvest = compute_reinvest(inp.rentalCashUse, monthly_cf_from(first_loan, opex_result), inp.equityCagrPct)

    hold_loan = first_loan
    reinvest_pot_by_month = reinvest["reinvestPotByMonth"]
    reinvest_pot_terminal = reinvest["reinvestPot"]
    reinvest_contrib = reinvest["reinvestContrib"]
    if inp.rentalCashUse == "PrepayLoan":
        hold_loan = amortize(hold_principal, hold_rate, hold_tenure, inp.prepaymentAnnual,
                             extra_principal_by_year=reinvest["prepayByYear"], horizon_years=N)
        opex_result = compute_opex_and_tax(inp, struct_area, value_rows, hold_loan, is_plot, rent_monthly)
        cf = monthly_cf_from(hold_loan, opex_result)
        reinvest = compute_reinvest(inp.rentalCashUse, cf, inp.equityCagrPct)
        growth = (1 + inp.equityCagrPct) ** (1 / 12)
        pot_arr = [0.0] * (hold_months + 1)
        acc = 0.0
        leftover_contrib = 0.0
        for m in range(1, hold_months + 1):
            acc *= growth
            if m % 12 == 0:
                t = m // 12
                surplus = sum(max(cf[k], 0.0) for k in range((t - 1) * 12 + 1, t * 12 + 1))
                applied = hold_loan["prepayAnnual"][t] if t < len(hold_loan["prepayAnnual"]) else 0.0
                leftover = max(surplus - applied, 0.0)
                acc += leftover
                leftover_contrib += leftover
            pot_arr[m] = acc
        reinvest_pot_by_month = pot_arr
        reinvest_pot_terminal = acc
        reinvest_contrib = leftover_contrib

    # §4.7 exit
    exit_r = compute_exit(value_rows[N]["propValueClean"], inp, entry_costs, total_construction,
                          acquisition_price, hold_loan["balanceEnd"][N],
                          reinvest_pot_terminal, reinvest_contrib)

    # §4.9 Engine B
    total_months = offset + N * 12
    own_cash_out = [0.0] * (total_months + 1)
    own_cash_out[0] = total_cash_t0
    for r in construction_rows:
        own_cash_out[r["month"]] += r["ownPocketDraw"] + r["preEMI"]
    same_cash = inp.compareMode == "SameCashSIP"
    if same_cash:
        for m in range(1, hold_months + 1):
            own_cash_out[offset + m] += reinvest["negCarryByMonth"][m]

    equity = compute_equity_benchmark(own_cash_out, inp.equityCagrPct, inp.ltcgEquityPct,
                                      inp.equityLtcgExemptionAnnual)

    # §4.10 metrics
    re_terminal = exit_r["reTerminal"]
    eq_terminal = equity["eqTerminal"]
    cf_monthly = monthly_cf_from(hold_loan, opex_result)
    a_cf = [(0.0, -total_cash_t0)]
    for r in construction_rows:
        a_cf.append((r["month"] / 12, -(r["ownPocketDraw"] + r["preEMI"])))
    pocket = inp.rentalCashUse == "Pocket"
    for m in range(1, hold_months + 1):
        year = (offset + m) / 12
        amt = cf_monthly[m] if pocket else -reinvest["negCarryByMonth"][m]
        a_cf.append((year, amt))
    terminal_year = total_months / 12
    a_cf.append((terminal_year, exit_r["netSaleProceeds"] +
                 (0.0 if pocket else reinvest_pot_terminal - exit_r["reinvestSleeveLtcg"])))
    b_cf = [(m / 12, -amt) for m, amt in enumerate(own_cash_out)]
    b_cf.append((terminal_year, eq_terminal))

    re_xirr = xirr_annual_safe(a_cf)
    eq_xirr = xirr_annual_safe(b_cf)

    sum_own = sum(own_cash_out)
    re_multiple = re_terminal / sum_own if sum_own > 0 else float("nan")
    real_re_terminal = re_terminal / (1 + inp.cpiPct) ** N

    breakeven = float("nan")
    if not skip_breakeven:
        breakeven = bisect_safe(
            lambda x: (lambda o: o["reTerminal"] - o["eqTerminal"])(compute(inp, True, x)),
            -0.05, 0.3, 1e-10)

    # §6A rows
    cum_own_by_month = [0.0] * (total_months + 1)
    acc = 0.0
    for m in range(0, total_months + 1):
        acc += own_cash_out[m]
        cum_own_by_month[m] = acc

    rows = []
    v0 = value_rows[0]
    loan_balance0 = hold_loan["balanceEnd"][0]
    equity_pot0 = equity["potByMonth"][offset]
    cum_own0 = cum_own_by_month[offset]
    cum_contrib0 = equity["cumContribByMonth"][offset]
    re_nw0 = v0["propValueClean"] - loan_balance0
    rows.append({"year": 0, "landValue": v0["landValue"], "structureValue": v0["structureValue"],
                 "premiumValue": v0["premiumValue"], "redevOptionValue": v0["redevValue"],
                 "propValueGross": v0["propValueClean"], "landSharePct": v0["landSharePct"],
                 "replacementCostPerSqft": v0["replacementCostPerSqft"], "depFactor": v0["depFactor"],
                 "emiAnnual": 0.0, "interestPaid": 0.0, "principalPaid": 0.0,
                 "loanBalanceEnd": loan_balance0, "prepayment": 0.0, "marketRent": 0.0,
                 "grossRentCollected": 0.0, "societyCAM": 0.0, "ownerMaintenance": 0.0,
                 "waterTax": 0.0, "interiorRefresh": 0.0, "majorRepairReserve": 0.0,
                 "propertyTax": 0.0, "noi": 0.0, "postTaxRentalCF": 0.0, "taxableHP": 0.0,
                 "rentalTaxOrShield": 0.0, "carryForwardLossBalance": 0.0, "reinvestPot": 0.0,
                 "equityPot": equity_pot0, "cumOwnCashOutA": cum_own0, "cumContribB": cum_contrib0,
                 "cashConservationCheck": cum_contrib0 - cum_own0, "reNetWorth": re_nw0,
                 "equityNetWorth": equity_pot0, "netWorthGap": re_nw0 - equity_pot0})

    for t in range(1, N + 1):
        v = value_rows[t]
        o = opex_result["rows"][t - 1]
        cal = offset + t * 12
        loan_balance_end = hold_loan["balanceEnd"][t]
        reinvest_pot = reinvest_pot_by_month[t * 12]
        equity_pot = equity["potByMonth"][cal]
        cum_own = cum_own_by_month[cal]
        cum_contrib = equity["cumContribByMonth"][cal]
        re_nw = v["propValueClean"] - loan_balance_end + reinvest_pot
        rows.append({"year": t, "landValue": v["landValue"], "structureValue": v["structureValue"],
                     "premiumValue": v["premiumValue"], "redevOptionValue": v["redevValue"],
                     "propValueGross": v["propValueClean"], "landSharePct": v["landSharePct"],
                     "replacementCostPerSqft": v["replacementCostPerSqft"], "depFactor": v["depFactor"],
                     "emiAnnual": hold_loan["emiAnnual"][t], "interestPaid": hold_loan["interestPaid"][t],
                     "principalPaid": hold_loan["principalPaid"][t], "loanBalanceEnd": loan_balance_end,
                     "prepayment": hold_loan["prepayAnnual"][t], "marketRent": rent_annual[t],
                     "grossRentCollected": o["grossRent"], "societyCAM": o["camBase"],
                     "ownerMaintenance": o["ownerMaintenance"], "waterTax": o["waterTax"],
                     "interiorRefresh": o["interiorRefresh"], "majorRepairReserve": o["majorRepairReserve"],
                     "propertyTax": o["propertyTax"], "noi": o["noi"], "postTaxRentalCF": o["postTaxRentalCF"],
                     "taxableHP": o["taxableHP"], "rentalTaxOrShield": o["rentalTaxOrShield"],
                     "carryForwardLossBalance": o["carryForwardLossBalance"], "reinvestPot": reinvest_pot,
                     "equityPot": equity_pot, "cumOwnCashOutA": cum_own, "cumContribB": cum_contrib,
                     "cashConservationCheck": cum_contrib - cum_own, "reNetWorth": re_nw,
                     "equityNetWorth": equity_pot, "netWorthGap": re_nw - equity_pot})

    return {"reTerminal": re_terminal, "eqTerminal": eq_terminal, "gap": re_terminal - eq_terminal,
            "reXirr": re_xirr, "eqXirr": eq_xirr, "reMultiple": re_multiple,
            "breakevenLandCagr": breakeven, "realReTerminal": real_re_terminal,
            "exitGross": exit_r["exitGross"], "sellCosts": exit_r["sellCosts"],
            "ltcgProperty": exit_r["ltcg"], "reinvestSleeveLtcg": exit_r["reinvestSleeveLtcg"],
            "loanPayoff": hold_loan["balanceEnd"][N], "netSaleProceeds": exit_r["netSaleProceeds"],
            "rows": rows}


def xirr_annual_safe(cashflows: list) -> float:
    """xirr that returns NaN (not raise) when the root is not bracketed (PRD §4.10)."""
    def npv(rate: float) -> float:
        return sum(cf / (1 + rate) ** yr for yr, cf in cashflows)
    lo, hi, tol = -0.999999, 10.0, 1e-9
    flo, fhi = npv(lo), npv(hi)
    if math.isnan(flo) or math.isnan(fhi) or flo * fhi > 0:
        return float("nan")
    for _ in range(200):
        mid = (lo + hi) / 2
        fmid = npv(mid)
        if abs(fmid) < tol or (hi - lo) / 2 < tol:
            return mid
        if flo * fmid < 0:
            hi = mid
        else:
            lo, flo = mid, fmid
    return (lo + hi) / 2


def bisect_safe(f, lo: float, hi: float, tol: float = 1e-7, max_iter: int = 200) -> float:
    flo, fhi = f(lo), f(hi)
    if math.isnan(flo) or math.isnan(fhi) or flo * fhi > 0:
        return float("nan")
    for _ in range(max_iter):
        mid = (lo + hi) / 2
        fmid = f(mid)
        if abs(fmid) < tol or (hi - lo) / 2 < tol:
            return mid
        if flo * fmid < 0:
            hi = mid
        else:
            lo, flo = mid, fmid
    return (lo + hi) / 2


# ======================================================================================
# INPUTS + DEFAULTS — mirrors src/types.ts Inputs and src/defaults/index.ts. (Config
# data, not formulas; the exact inputs are SERIALIZED into golden.json so the TS test
# consumes them verbatim — eliminating any defaults drift as a source of mismatch.)
# ======================================================================================
@dataclass
class Inputs:
    geography: str = "Bangalore"
    acquisitionType: str = "ReadyApartment"
    assetType: str = "MidRiseSociety"
    sbua: float = 1200
    udsSqft: float = 240
    ageAtPurchaseYears: int = 0
    purchasePriceAllIn: float = 15_000_000
    rentPerMonth0: float = 35_000
    rentGrowthY1_5: float = 0.06
    rentGrowthY6_10: float = 0.05
    rentGrowthY11_20: float = 0.05
    rentGrowthY21_30: float = 0.05
    cohortDragPct: float = 0.02
    vacancyPct: float = 0.05
    reLetBrokerageMonths: float = 1
    rentAgreementMonths: int = 11
    usageMode: str = "LetOut"
    altRentPerMonth0: float = 35_000
    altRentGrowthPct: float = 0.06
    securityDepositMonths: float = 3
    renewalCostMonths: float = 1
    renewalCycleYears: int = 2
    stampDutyRegPct: float = 0.07
    gstPct: float = 0
    brokerageBuyPct: float = 0
    otherAcquisitionCostsAbs: float = 50_000
    interiorsCapex0: float = 1_000_000
    landRate0: float = 38_000
    landCagrY1_10: float = 0.08
    landCagrY11_20: float = 0.06
    landCagrY21_30: float = 0.06
    replacementCost0: float = 2300
    constructionInflationPct: float = 0.06
    physicalDepRatePct: float = 0.0167
    economicDepRatePct: float = 0.018
    salvageFloor: float = 0.1
    premium0: float = 1200
    premiumDecayYears: float = 12
    infraBumps: list = field(default_factory=list)
    maintenanceMode: str = "TenantPaysCAM"
    societyCamPerSqftMonth0: float = 4
    ownerMaintPctOfRent: float = 0.06
    ownerMaintPctOfValue: float = 0.004
    camEscalationPct: float = 0.06
    maintenanceAgeAccelPct: float = 0.01
    propertyTaxAnnual0: float = 20_000
    propertyTaxGrowthPct: float = 0.05
    waterTaxAnnual0: float = 0
    waterTaxGrowthPct: float = 0.05
    majorRepairReservePctOfValue: float = 0.003
    interiorRefreshCycleYears: int = 10
    interiorRefreshPctOfInitial: float = 0.6
    loanAmount: float = 11_250_000
    loanRatePct: float = 0.075
    loanTenureYears: int = 20
    prepaymentAnnual: float = 0
    rentalCashUse: str = "ReinvestEquity"
    taxRegime: str = "India_New"
    compareMode: str = "SameCashSIP"
    marginalTaxPct: float = 0.3
    surchargeCess: str = "cess"
    ltcgPropertyPct: float = 0.125
    ltcgEquityPct: float = 0.125
    equityLtcgExemptionAnnual: float = 125_000
    equityCagrPct: float = 0.11
    cpiPct: float = 0.045
    sellingCostPct: float = 0.02
    liquidityHaircutPct: float = 0.03
    redevelopmentEnabled: bool = False
    redevEligibleAgeYears: float = 30
    redevOptionValuePctOfLand: float = 0.4
    plotAreaSqft: float = 500
    floors: int = 2
    farBuildableRatio: float = 1.75
    builtUpAreaSqft: float = 0
    constructionRatePerSqft: float = 2500
    constructionSoftCostsPct: float = 0.12
    constructionContingencyPct: float = 0.2
    constructionMonths: int = 18
    constructionFinancing: str = "CompositeLoan"
    landLoanAmount: float = 0
    constructionLoanAmount: float = 0
    plotLoanRatePct: float = 0.085
    constructionLoanRatePct: float = 0.085
    compositeLoanTenureYears: int = 20
    preEMIduringConstruction: bool = True
    holdYears: int = 20


_GEO = {
    "Bangalore": dict(stampDutyRegPct=0.07, landRate0Apartment=38_000, landRate0Plot=10_000,
                      landCagrY1_10=0.08, landCagrY11_20=0.06, rentGrowthY1_5=0.06,
                      rentGrowthY6_10=0.05, rentGrowthY11_20=0.05, replacementCost0Apartment=2300,
                      replacementCost0SelfBuild=2500, redevelopmentEnabledByDefault=False),
    "Mumbai": dict(stampDutyRegPct=0.07, landRate0Apartment=45_000, landRate0Plot=30_000,
                   landCagrY1_10=0.045, landCagrY11_20=0.04, rentGrowthY1_5=0.05,
                   rentGrowthY6_10=0.05, rentGrowthY11_20=0.04, replacementCost0Apartment=3000,
                   replacementCost0SelfBuild=3000, redevelopmentEnabledByDefault=True),
}
_ASSET = {
    "LandPlot": dict(economicDepRatePct=0, premium0=0, premiumDecayYears=10,
                     redevelopmentEnabled=False, maintenanceMode="OwnerBearsAll", ownerMaintPctOfRent=0.05),
    "PlottedDevelopmentVilla": dict(economicDepRatePct=0.005, premium0=200, premiumDecayYears=10,
                                    redevelopmentEnabled=False, maintenanceMode="OwnerBearsAll", ownerMaintPctOfRent=0.12),
    "StandaloneApartment": dict(economicDepRatePct=0.015, premium0=800, premiumDecayYears=12,
                                redevelopmentEnabled=False, maintenanceMode="TenantPaysCAM", ownerMaintPctOfRent=0.07),
    "MidRiseSociety": dict(economicDepRatePct=0.018, premium0=1200, premiumDecayYears=12,
                           redevelopmentEnabled=False, maintenanceMode="TenantPaysCAM", ownerMaintPctOfRent=0.06),
    "HighRiseSociety": dict(economicDepRatePct=0.022, premium0=1800, premiumDecayYears=15,
                            redevelopmentEnabled=False, maintenanceMode="TenantPaysCAM", ownerMaintPctOfRent=0.06),
}


def get_defaults(geography: str, asset_type: str, acquisition_type: str) -> Inputs:
    d = Inputs()
    d.geography = geography
    d.assetType = asset_type
    d.acquisitionType = acquisition_type
    geo = _GEO["Mumbai" if geography == "Mumbai" else "Bangalore"]
    asset = _ASSET[asset_type]
    is_plot = acquisition_type == "PlotSelfBuild"

    d.stampDutyRegPct = geo["stampDutyRegPct"]
    d.landCagrY1_10 = geo["landCagrY1_10"]
    d.landCagrY11_20 = geo["landCagrY11_20"]
    d.landCagrY21_30 = geo["landCagrY11_20"]
    d.rentGrowthY1_5 = geo["rentGrowthY1_5"]
    d.rentGrowthY6_10 = geo["rentGrowthY6_10"]
    d.rentGrowthY11_20 = geo["rentGrowthY11_20"]
    d.rentGrowthY21_30 = geo["rentGrowthY11_20"]
    d.altRentGrowthPct = geo["rentGrowthY1_5"]
    d.altRentPerMonth0 = d.rentPerMonth0
    d.landRate0 = geo["landRate0Plot"] if is_plot else geo["landRate0Apartment"]
    d.replacementCost0 = geo["replacementCost0SelfBuild"] if is_plot else geo["replacementCost0Apartment"]

    d.economicDepRatePct = asset["economicDepRatePct"]
    d.premium0 = 0 if is_plot else asset["premium0"]
    d.premiumDecayYears = asset["premiumDecayYears"]
    d.maintenanceMode = asset["maintenanceMode"]
    d.ownerMaintPctOfRent = asset["ownerMaintPctOfRent"]
    d.redevelopmentEnabled = asset["redevelopmentEnabled"] or geo["redevelopmentEnabledByDefault"]

    if is_plot:
        d.purchasePriceAllIn = d.plotAreaSqft * d.landRate0
        d.udsSqft = d.plotAreaSqft
        d.otherAcquisitionCostsAbs = 95_000
        d.liquidityHaircutPct = 0.05
        d.waterTaxAnnual0 = 3_000
        d.gstPct = 0
        d.economicDepRatePct = 0
        d.replacementCost0 = d.constructionRatePerSqft
        d.landLoanAmount = round(d.purchasePriceAllIn * 0.75)
        d.constructionLoanAmount = 0
        d.loanAmount = d.landLoanAmount
    else:
        d.gstPct = 0.05 if acquisition_type == "UnderConstructionApartment" else 0
    return d


# ======================================================================================
# SCENARIO MATRIX + GOLDEN DUMP
# ======================================================================================
def build_scenarios() -> list[tuple[str, Inputs]]:
    """Full cartesian product of toggles + targeted corner cases (PRD §3.G + §7)."""
    scenarios: list[tuple[str, Inputs]] = []
    acq_types = ["ReadyApartment", "UnderConstructionApartment", "PlotSelfBuild"]
    cash_uses = ["ReinvestEquity", "PrepayLoan", "Pocket"]
    regimes = ["India_Old", "India_New"]  # US deferred (PRD §9)
    usages = ["LetOut", "SelfOccupied"]
    maint = ["TenantPaysCAM", "OwnerBearsAll"]
    compare = ["SameCashSIP", "LumpsumOnly"]
    holds = [20, 30]
    surcharge = ["none", "cess", "surcharge"]

    for acq in acq_types:
        base = get_defaults("Bangalore", "MidRiseSociety", acq)
        for cu in cash_uses:
            for reg in regimes:
                for use in usages:
                    for mm in maint:
                        for cm in compare:
                            for hy in holds:
                                for sc in surcharge:
                                    inp = replace(base, rentalCashUse=cu, taxRegime=reg, usageMode=use,
                                                  maintenanceMode=mm, compareMode=cm, holdYears=hy,
                                                  surchargeCess=sc)
                                    name = f"cart|{acq}|{cu}|{reg}|{use}|{mm}|{cm}|{hy}y|{sc}"
                                    scenarios.append((name, inp))

    # --- targeted corner cases (each isolates an input/branch) ---
    apt = get_defaults("Bangalore", "MidRiseSociety", "ReadyApartment")
    plot = get_defaults("Bangalore", "PlottedDevelopmentVilla", "PlotSelfBuild")
    corners = [
        ("corner|zero-loan-rate", replace(apt, loanRatePct=0.0)),
        ("corner|full-cash-no-loan", replace(apt, loanAmount=0)),
        ("corner|prepayment-annual", replace(apt, prepaymentAnnual=300_000)),
        ("corner|loan-tenure-10-payoff-before-horizon", replace(apt, loanTenureYears=10)),
        ("corner|vacancy-zero", replace(apt, vacancyPct=0.0)),
        ("corner|vacancy-full", replace(apt, vacancyPct=1.0)),
        ("corner|infra-bumps", replace(apt, infraBumps=[{"year": 5, "pct": 0.1}, {"year": 12, "pct": 0.05}])),
        ("corner|redev-enabled-old-structure", replace(apt, redevelopmentEnabled=True, ageAtPurchaseYears=25, holdYears=30)),
        ("corner|salvage-floor-binding", replace(apt, ageAtPurchaseYears=40, holdYears=30)),
        ("corner|equity-cagr-zero", replace(apt, equityCagrPct=0.0)),
        ("corner|self-occupied-old", replace(apt, usageMode="SelfOccupied", taxRegime="India_Old")),
        ("corner|mumbai-redev-default", get_defaults("Mumbai", "HighRiseSociety", "ReadyApartment")),
        ("corner|landplot-bangalore", get_defaults("Bangalore", "LandPlot", "ReadyApartment")),
        ("corner|plot-ownfunds", replace(plot, constructionFinancing="OwnFunds")),
        ("corner|plot-composite-loan", replace(plot, constructionFinancing="CompositeLoan",
                                               constructionLoanAmount=2_000_000)),
        ("corner|plot-constr-months-zero", replace(plot, constructionMonths=0)),
        ("corner|plot-constr-loan-over-spreadable", replace(plot, constructionFinancing="CompositeLoan",
                                                            constructionLoanAmount=50_000_000)),
        ("corner|plot-no-preemi", replace(plot, preEMIduringConstruction=False,
                                          constructionFinancing="CompositeLoan", constructionLoanAmount=2_000_000)),
        ("corner|standalone-apartment-uc", get_defaults("Bangalore", "StandaloneApartment", "UnderConstructionApartment")),
        ("corner|builtuparea-override", replace(plot, builtUpAreaSqft=1750)),
    ]
    scenarios.extend(corners)
    return scenarios


class _Encoder(json.JSONEncoder):
    def default(self, o):  # pragma: no cover
        return super().default(o)


def _sanitize(x):
    """JSON has no NaN/Inf; encode them as sentinel strings the TS loader understands."""
    if isinstance(x, float):
        if math.isnan(x):
            return "NaN"
        if math.isinf(x):
            return "Infinity" if x > 0 else "-Infinity"
        return x
    if isinstance(x, dict):
        return {k: _sanitize(v) for k, v in x.items()}
    if isinstance(x, list):
        return [_sanitize(v) for v in x]
    return x


def dump_golden(path: str) -> int:
    scenarios = build_scenarios()
    out = []
    for name, inp in scenarios:
        res = compute(inp)
        out.append({"name": name, "inputs": asdict(inp), "outputs": _sanitize(res)})
    import os
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(out, f, indent=0)
    return len(out)


# ======================================================================================
# LAYER-2 SELF-CHECK — compute the highest-risk quantities a SECOND, independent way and
# require agreement. If a single derivation were wrong, the two methods would disagree,
# so the oracle cannot silently certify a bug shared with the TS engine.
# ======================================================================================
def self_check() -> None:
    fails = []

    def check(name, a, b, tol=1e-6):
        if abs(a - b) > tol:
            fails.append(f"{name}: {a} != {b} (Δ={a-b:.3e})")

    # EMI: closed-form vs annuity present-value identity (PV = EMI·(1-(1+r)^-n)/r).
    P, rate, yrs = 10_000_000, 0.075, 20
    e = emi(P, rate, yrs)
    rm, n = rate / 12, yrs * 12
    pv = e * (1 - (1 + rm) ** -n) / rm
    check("EMI annuity-PV identity", pv, P, tol=1e-3)

    # Loan: Σ(principal+prepay) over life must repay exactly the principal; ends at 0.
    loan = amortize(P, rate, yrs)
    total_principal = sum(m["principal"] + m["prepay"] for m in loan["monthly"][1:])
    check("loan Σprincipal == principal", total_principal, P, tol=1e-2)
    check("loan ends at 0", loan["balanceEnd"][yrs], 0.0, tol=1e-2)

    # Engine B: month loop vs closed-form FV of a constant SIP + a t0 lump.
    cagr, months = 0.11, 240
    stream = [0.0] * (months + 1)
    stream[0] = 1_000_000
    for m in range(1, months + 1):
        stream[m] = 50_000
    eb = compute_equity_benchmark(stream, cagr, 0.0, 0.0)
    g = (1 + cagr) ** (1 / 12)
    lump_fv = 1_000_000 * g ** months
    sip_fv = 50_000 * (g ** months - 1) / (g - 1) * g  # each contribution compounds (months-m+1)... see note
    # closed form: contribution at end of month m grows for (months-m) months → Σ g^(months-m), m=1..months
    sip_fv = 50_000 * sum(g ** (months - m) for m in range(1, months + 1))
    check("Engine B closed-form FV", eb["bPot"], lump_fv + sip_fv, tol=1e-2)

    # XIRR: at the solved rate, NPV must be ~0 (independent of how it was found).
    cf = [(0.0, -1_000_000), (20.0, 1_000_000 * 1.10 ** 20)]
    r = xirr_annual_safe(cf)
    npv_at_r = sum(amt / (1 + r) ** yr for yr, amt in cf)
    # NPV residual on million-scale cashflows: 1 rupee absolute is ~1.5e-7 relative — strict
    # enough to catch a real root-finding error, loose enough for float scale.
    check("XIRR NPV≈0 at solved rate", npv_at_r, 0.0, tol=1.0)
    check("XIRR recovers 10%", r, 0.10, tol=1e-7)

    # compute() internal identities on a default scenario.
    out = compute(get_defaults("Bangalore", "MidRiseSociety", "ReadyApartment"))
    final = out["rows"][-1]
    check("RE_terminal == netSaleProceeds + reinvestPot - sleeveLtcg",
          out["reTerminal"], out["netSaleProceeds"] + final["reinvestPot"] - out["reinvestSleeveLtcg"], tol=1e-2)
    for row in out["rows"]:
        check(f"valueStack sum y{row['year']}", row["propValueGross"],
              row["landValue"] + row["structureValue"] + row["premiumValue"] + row["redevOptionValue"], tol=1e-3)
        check(f"col37 cash-conservation y{row['year']}", row["cashConservationCheck"], 0.0, tol=1.0)

    if fails:
        print("SELF-CHECK FAILED:")
        for f in fails:
            print("  ✗", f)
        raise SystemExit(1)
    print("SELF-CHECK PASSED — all Layer-2 redundancy and identity checks agree.")


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

    # ---- T3: rent path (per-term, term=12), rent0=30,000/mo, g 7/6/5, cohort drag 2% ----
    #   Per-term semantics: rent is FLAT within a term and steps once per renewal, so
    #   rent_annual(1) == 360,000 (no in-year escalation) and each later year is the
    #   realized Σ of its 12 monthly rents. Values differ from the old yearly-compounding
    #   model (which front-loaded a year-1 step).
    rp = rent_path(30_000, 0.07, 0.06, 0.05, 0.02)
    print(f"T3  rent_annual(1)                  = {rp[1]:,.4f}  [flat first term]")
    print(f"T3  rent_annual(5)                  = {rp[5]:,.4f}")
    print(f"T3  rent_annual(10)                 = {rp[10]:,.4f}")
    print(f"T3  rent_annual(15)                 = {rp[15]:,.4f}")
    print(f"T3  rent_annual(20)                 = {rp[20]:,.4f}")

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

    # ---- T16: 30-year horizon with explicit Y21–30 bands ----
    #   Rent: same as T3 (rent0 30,000/mo; 7/6/5; drag 2%) but with y21_30 = 4%
    #   (a taper). Years 21–30 g_real = 4% − 2% drag = 2%. Years 1–20 are IDENTICAL
    #   to T3 (g21_30 does not affect t<=20).
    rp30 = rent_path(30_000, 0.07, 0.06, 0.05, 0.02, years=30, g21_30=0.04)
    print(f"T16 rent_annual(20) (== T3)         = {rp30[20]:,.4f}")
    print(f"T16 rent_annual(25)                 = {rp30[25]:,.4f}")
    print(f"T16 rent_annual(30)                 = {rp30[30]:,.4f}")
    #   Land: same as T5 (uds 600; landRate0 38,000; 8%/6%) but cagr3 = 5% (taper).
    lr30 = land_rate(38_000, 0.08, 0.06, 30, cagr_21_30=0.05)
    lv30 = land_value(600, 38_000, 0.08, 0.06, 30, cagr_21_30=0.05)
    print(f"T16 landRate(30)                    = {lr30:,.4f}")
    print(f"T16 landValue(30)                   = {lv30:,.4f}")
    print(f"     1.02^5 = {1.02**5:.8f} ; 1.02^10 = {1.02**10:.8f} ; 1.05^10 = {1.05**10:.8f}")

    # ---- T17: 11-month lease term (rent steps once per 11-month renewal) ----
    #   Same T3 scenario (rent0 30,000/mo; 7/6/5; drag 2%) but term_months=11. An
    #   11-month term renews sooner than 12, so steps land earlier on the calendar.
    rp11 = rent_path(30_000, 0.07, 0.06, 0.05, 0.02, years=20, renewal_months=11)
    print(f"T17 rent_annual(5)  @11mo            = {rp11[5]:,.4f}  [T3 @12mo: {rp[5]:,.4f}]")
    print(f"T17 rent_annual(10) @11mo            = {rp11[10]:,.4f}  [T3 @12mo: {rp[10]:,.4f}]")
    print(f"T17 rent_annual(20) @11mo            = {rp11[20]:,.4f}  [T3 @12mo: {rp[20]:,.4f}]")
    print(line)


if __name__ == "__main__":
    import sys
    args = set(sys.argv[1:])
    if "--self-check" in args:
        self_check()
    if "--dump" in args:
        self_check()
        n = dump_golden("reference/golden/golden.json")
        print(f"Wrote reference/golden/golden.json — {n} scenarios.")
    if not args:
        main()
