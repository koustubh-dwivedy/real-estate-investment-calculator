/**
 * T25 — audit findings (see docs/AUDIT.md). Characterizes the CURRENT behaviour of
 * confirmed issues (passing, so CI stays green) and pins the proposed-correct value
 * in a skipped test that will flip green once the fix is approved.
 */
import { describe, it, expect } from "vitest";
import { compute } from "../compute";
import { getDefaults } from "../../defaults";
import type { Inputs } from "../../types";

/** Controlled scenario: no growth/tax/opex, 0% 1-year loan. Hand-derivable cash. */
function controlled(): Inputs {
  return {
    ...getDefaults({ geography: "Bangalore", assetType: "MidRiseSociety", acquisitionType: "ReadyApartment" }),
    holdYears: 1, purchasePriceAllIn: 100, loanAmount: 80, loanRatePct: 0, loanTenureYears: 1,
    stampDutyRegPct: 0, gstPct: 0, brokerageBuyPct: 0, otherAcquisitionCostsAbs: 0, interiorsCapex0: 0,
    rentPerMonth0: 2, rentGrowthY1_5: 0, rentGrowthY6_10: 0, rentGrowthY11_20: 0, cohortDragPct: 0, rentAgreementMonths: 12,
    vacancyPct: 0, reLetBrokerageMonths: 0,
    societyCamPerSqftMonth0: 0, ownerMaintPctOfRent: 0, camEscalationPct: 0, maintenanceAgeAccelPct: 0,
    propertyTaxAnnual0: 0, propertyTaxGrowthPct: 0, waterTaxAnnual0: 0, majorRepairReservePctOfValue: 0,
    interiorRefreshCycleYears: 0, interiorRefreshPctOfInitial: 0,
    marginalTaxPct: 0, surchargeCess: "none", equityCagrPct: 0, cpiPct: 0,
    sellingCostPct: 0, liquidityHaircutPct: 0, ltcgEquityPct: 0, equityLtcgExemptionAnnual: 0,
    rentalCashUse: "ReinvestEquity", taxRegime: "India_New", compareMode: "SameCashSIP", usageMode: "LetOut",
  };
}

describe("T25 — FINDING-1: Engine-B EMI double-count (buy-vs-equity)", () => {
  // Hand-derivation: down-payment 20; year-1 EMI 80, rent 24 → buyer out-of-pocket
  // = 20 + (80 − 24) = 76. At 0% equity growth, EQ_terminal should equal 76.
  it("CURRENT (buggy) behaviour: EQ_terminal = 156 (EMI double-counted as t0+EMI+negCarry)", () => {
    expect(compute(controlled()).eqTerminal).toBeCloseTo(156, 2);
  });

  it.skip("PROPOSED FIX: EQ_terminal should equal the buyer's true out-of-pocket = 76", () => {
    expect(compute(controlled()).eqTerminal).toBeCloseTo(76, 2);
  });
});
