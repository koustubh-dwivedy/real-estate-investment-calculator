/**
 * T13 (construction cost stack, exact) and T14 (construction-period carry & hand-off).
 * PRD §7 / §4.11. T13 golden from reference/oracle.py.
 */
import { describe, it, expect } from "vitest";
import { constructionCostStack, constructionSchedule } from "../construction";
import { amortize } from "../loan";

describe("T13 — BUA-driven construction cost (exact)", () => {
  const stack = constructionCostStack({
    plotAreaSqft: 500,
    farBuildableRatio: 0.9,
    floors: 2,
    builtUpAreaSqft: 1750, // override per the video; BUA (not plot area) drives cost
    constructionRatePerSqft: 2500,
    constructionSoftCostsPct: 0.12,
    constructionContingencyPct: 0.2,
    buildInteriors: 850_000,
  });

  it("base = 1750×2500 = 4,375,000", () => {
    expect(stack.baseConstruction).toBe(4_375_000);
  });
  it("soft 12% = 525,000 ; contingency 20% = 875,000", () => {
    expect(stack.softCosts).toBe(525_000);
    expect(stack.contingency).toBe(875_000);
  });
  it("total = 6,625,000 exactly", () => {
    expect(stack.totalConstructionCost).toBe(6_625_000);
  });
});

describe("T14 — construction-period carry & hand-off", () => {
  const M = 18;
  const constructionLoanAmount = 3_600_000; // disbursed evenly → 200,000/month
  const landLoanAmount = 2_000_000;
  const rate = 0.085;

  const stack = constructionCostStack({
    plotAreaSqft: 500,
    farBuildableRatio: 0.9,
    floors: 2,
    builtUpAreaSqft: 1750,
    constructionRatePerSqft: 2500,
    constructionSoftCostsPct: 0.12,
    constructionContingencyPct: 0.2,
    buildInteriors: 850_000,
  });

  const sched = constructionSchedule({
    costStack: stack,
    constructionMonths: M,
    constructionFinancing: "CompositeLoan",
    landLoanAmount,
    constructionLoanAmount,
    plotLoanRatePct: rate,
    constructionLoanRatePct: rate,
    preEMIduringConstruction: true,
  });

  it("(a) construction loan disburses evenly and preEMI = cumDisbursed × rate/12 (rising)", () => {
    const perMonth = constructionLoanAmount / M; // 200,000
    sched.months.forEach((row, i) => {
      const expectedCum = perMonth * (i + 1);
      expect(row.cumConstructionDisbursed).toBeCloseTo(expectedCum, 2);
      expect(row.constructionPreEMI).toBeCloseTo((expectedCum * rate) / 12, 2);
    });
    // pre-EMI rises monotonically as draws accumulate
    expect(sched.months[17]!.constructionPreEMI).toBeGreaterThan(
      sched.months[0]!.constructionPreEMI,
    );
  });

  it("principal is NOT amortized during the build (interest-only)", () => {
    // No principal repayment appears in the construction schedule itself.
    const anyPrincipal = sched.months.some((m) => "principal" in m);
    expect(anyPrincipal).toBe(false);
    // cumulative disbursed reaches exactly the sanctioned construction loan.
    expect(sched.months[M - 1]!.cumConstructionDisbursed).toBeCloseTo(
      constructionLoanAmount,
      2,
    );
  });

  it("(c) at completion, full EMI begins on combined principal over the tenure", () => {
    expect(sched.combinedPrincipalAtCompletion).toBe(landLoanAmount + constructionLoanAmount);
    const holdLoan = amortize({
      principal: sched.combinedPrincipalAtCompletion,
      annualRate: rate,
      tenureYears: 20,
      // amortization begins the month after the build (month 19 on the project clock)
      startMonth: 1,
    });
    expect(holdLoan.emi).toBeGreaterThan(0);
    expect(holdLoan.monthly[0]!.principal).toBeGreaterThan(0); // principal now amortizing
  });

  it("(d) own-pocket draws + pre-EMI are real outflows available to mirror to Engine B", () => {
    // total own-pocket = total construction cost − loan-funded portion
    expect(sched.totalOwnPocketDraws).toBeCloseTo(
      stack.totalConstructionCost - constructionLoanAmount,
      2,
    );
    expect(sched.totalPreEMI).toBeGreaterThan(0);
  });
});
