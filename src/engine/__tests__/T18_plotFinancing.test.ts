/**
 * T18 — plot (PlotSelfBuild) financing wiring. Guards the fix where the apartment
 * single-loan fields were inert/inconsistent for plots:
 *  - loanRatePct / loanTenureYears must NOT affect a plot (apartment-only);
 *  - constructionLoanRatePct, plotLoanRatePct, landLoanAmount MUST affect a plot;
 *  - the post-completion EMI uses the principal-weighted blend of the two rates.
 */
import { describe, it, expect } from "vitest";
import { compute } from "../compute";
import { amortize } from "../loan";
import { getDefaults } from "../../defaults";
import type { Inputs } from "../../types";

// A plot with DISTINCT land/construction loans and rates so the wiring is observable.
const plot = (): Inputs => ({
  ...getDefaults({ geography: "Bangalore", assetType: "PlottedDevelopmentVilla", acquisitionType: "PlotSelfBuild" }),
  landLoanAmount: 4_000_000,
  constructionLoanAmount: 3_000_000,
  plotLoanRatePct: 0.085,
  constructionLoanRatePct: 0.105, // deliberately different from the land rate
  compositeLoanTenureYears: 20,
});

const apartment = (): Inputs =>
  getDefaults({ geography: "Bangalore", assetType: "MidRiseSociety", acquisitionType: "ReadyApartment" });

describe("T18 — apartment-only loan fields are inert for a plot", () => {
  it("changing loanRatePct leaves a plot's output unchanged", () => {
    const a = compute({ ...plot(), loanRatePct: 0.07 });
    const b = compute({ ...plot(), loanRatePct: 0.14 });
    expect(a.reTerminal).toBe(b.reTerminal);
    expect(a.eqXirr).toBe(b.eqXirr);
    expect(a.gap).toBe(b.gap);
  });
  it("changing loanTenureYears leaves a plot's output unchanged", () => {
    const a = compute({ ...plot(), loanTenureYears: 10 });
    const b = compute({ ...plot(), loanTenureYears: 30 });
    expect(a.gap).toBe(b.gap);
  });
});

describe("T18 — the real plot loan knobs now bite", () => {
  it("construction-loan rate moves the EMI / gap / equity XIRR", () => {
    const a = compute({ ...plot(), constructionLoanRatePct: 0.09 });
    const b = compute({ ...plot(), constructionLoanRatePct: 0.13 });
    const emiA = a.rows.find((r) => r.year === 1)!.emiAnnual;
    const emiB = b.rows.find((r) => r.year === 1)!.emiAnnual;
    expect(emiB).toBeGreaterThan(emiA); // higher rate → higher EMI
    expect(a.gap).not.toBeCloseTo(b.gap, 0);
  });

  it("land-loan rate moves output (construction pre-EMI + blended hold EMI)", () => {
    const a = compute({ ...plot(), plotLoanRatePct: 0.07 });
    const b = compute({ ...plot(), plotLoanRatePct: 0.13 });
    expect(a.gap).not.toBeCloseTo(b.gap, 0);
    const emiA = a.rows.find((r) => r.year === 1)!.emiAnnual;
    const emiB = b.rows.find((r) => r.year === 1)!.emiAnnual;
    expect(emiB).toBeGreaterThan(emiA); // blended into the hold EMI
  });

  it("editing the land loan changes the t0 down-payment (own cash out)", () => {
    const a = compute({ ...plot(), landLoanAmount: 2_000_000 });
    const b = compute({ ...plot(), landLoanAmount: 5_000_000 });
    const t0A = a.rows.find((r) => r.year === 0)!.cumOwnCashOutA;
    const t0B = b.rows.find((r) => r.year === 0)!.cumOwnCashOutA;
    // bigger land loan → smaller down-payment → less own cash out at t0
    expect(t0B).toBeLessThan(t0A);
  });
});

describe("T18 — post-completion EMI uses the principal-weighted blend", () => {
  it("hold EMI equals amortize(combined, blendRate, tenure)", () => {
    const p = plot();
    const out = compute(p);
    const combined = p.landLoanAmount + p.constructionLoanAmount;
    const blend =
      (p.landLoanAmount * p.plotLoanRatePct + p.constructionLoanAmount * p.constructionLoanRatePct) / combined;
    const expectedEmi = amortize({ principal: combined, annualRate: blend, tenureYears: p.compositeLoanTenureYears }).emi;
    // hold EMI shows up once amortization begins (year 1 of the hold)
    const holdEmiMonthly = out.rows.find((r) => r.year === 1)!.emiAnnual / 12;
    expect(holdEmiMonthly).toBeCloseTo(expectedEmi, 2);
  });

  it("equal land & construction rates reproduce the single-rate result (no regression)", () => {
    const equal = { ...plot(), plotLoanRatePct: 0.085, constructionLoanRatePct: 0.085 };
    const out = compute(equal);
    const combined = equal.landLoanAmount + equal.constructionLoanAmount;
    const expectedEmi = amortize({ principal: combined, annualRate: 0.085, tenureYears: 20 }).emi;
    expect(out.rows.find((r) => r.year === 1)!.emiAnnual / 12).toBeCloseTo(expectedEmi, 2);
  });
});

describe("T18 — apartment loan rate still works; plot invariants hold", () => {
  it("apartment loanRatePct moves gap / equity XIRR", () => {
    const a = compute({ ...apartment(), loanRatePct: 0.07 });
    const b = compute({ ...apartment(), loanRatePct: 0.11 });
    expect(a.gap).not.toBeCloseTo(b.gap, 0);
  });

  it("plot still conserves cash and sums the value stack", () => {
    const out = compute(plot());
    for (const r of out.rows) {
      expect(Math.abs(r.cashConservationCheck)).toBeLessThan(1);
      expect(r.propValueGross).toBeCloseTo(
        r.landValue + r.structureValue + r.premiumValue + r.redevOptionValue,
        2,
      );
    }
  });
});
