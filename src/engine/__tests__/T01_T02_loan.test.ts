/**
 * T1, T2 (PRD §7) — EMI & amortization. Golden values from reference/oracle.py.
 */
import { describe, it, expect } from "vitest";
import { emi, amortize } from "../loan";

describe("T1 — EMI", () => {
  it("loan 10,000,000 @ 7.5% for 20y → 80,559.32/mo (paisa)", () => {
    // oracle: emi(10_000_000, 0.075, 20) = 80559.3194
    expect(emi(10_000_000, 0.075, 20)).toBeCloseTo(80_559.32, 2);
  });
});

describe("T2 — zero-rate EMI", () => {
  it("loan 1,200,000 @ 0% for 10y → 10,000.00/mo exactly", () => {
    expect(emi(1_200_000, 0, 10)).toBe(10_000);
  });
});

describe("amortization invariants", () => {
  it("sum of principal (incl. prepay) repays exactly the principal; ends at 0", () => {
    const res = amortize({ principal: 10_000_000, annualRate: 0.075, tenureYears: 20 });
    const totalPrincipal = res.monthly.reduce((s, m) => s + m.principal + m.prepay, 0);
    expect(totalPrincipal).toBeCloseTo(10_000_000, 2);
    expect(res.monthly[res.monthly.length - 1]!.balanceEnd).toBeCloseTo(0, 2);
    expect(res.payoffMonth).toBe(240);
  });

  it("a year-end prepayment shortens tenure and lowers total interest; EMI unchanged", () => {
    const base = amortize({ principal: 10_000_000, annualRate: 0.075, tenureYears: 20 });
    const withPrepay = amortize({
      principal: 10_000_000,
      annualRate: 0.075,
      tenureYears: 20,
      prepaymentAnnual: 200_000,
    });
    expect(withPrepay.emi).toBeCloseTo(base.emi, 2); // EMI fixed
    expect(withPrepay.payoffMonth).toBeLessThan(base.payoffMonth); // tenure shortened
    const baseInterest = base.interestPaid.reduce((s, x) => s + x, 0);
    const prepayInterest = withPrepay.interestPaid.reduce((s, x) => s + x, 0);
    expect(prepayInterest).toBeLessThan(baseInterest);
  });

  it("zero-rate loan: interest is 0 and principal repays linearly", () => {
    const res = amortize({ principal: 1_200_000, annualRate: 0, tenureYears: 10 });
    expect(res.emi).toBe(10_000);
    expect(res.interestPaid.reduce((s, x) => s + x, 0)).toBe(0);
    expect(res.payoffMonth).toBe(120);
  });
});
