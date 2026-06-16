/**
 * T3 (PRD §7) — rent path + cohort drag. Golden values from reference/oracle.py.
 * Per-term model: rent is flat within an agreement term and steps once per renewal.
 */
import { describe, it, expect } from "vitest";
import { rentMonthlyPath, annualizeRent, drag, gMarket } from "../rent";

const G = { y1_5: 0.07, y6_10: 0.06, y11_20: 0.05, cohortDrag: 0.02 };

describe("T3 — rent path + drag (per-term, term=12)", () => {
  const monthly = rentMonthlyPath(30_000, G, 240, 12); // 20y, 12-month term
  const annual = annualizeRent(monthly, 20);

  it("rent_annual(1) = 360,000 (flat through the first term)", () => {
    expect(annual[1]).toBeCloseTo(360_000, 2);
  });
  it("rent_annual(5) = 471,886.56", () => {
    expect(annual[5]).toBeCloseTo(471_886.5636, 2);
  });
  it("rent_annual(10) = 637,448.13", () => {
    expect(annual[10]).toBeCloseTo(637_448.1283, 2);
  });
  it("rent_annual(15) = 790,438.37", () => {
    expect(annual[15]).toBeCloseTo(790_438.3652, 2);
  });
  it("rent_annual(20) = 916,334.70", () => {
    expect(annual[20]).toBeCloseTo(916_334.7041, 2);
  });
  it("monthly rent is flat within the first 12-month term", () => {
    for (let m = 1; m <= 12; m++) expect(monthly[m]).toBe(30_000);
    expect(monthly[13]).toBeCloseTo(30_000 * 1.07, 6); // first step at month 13
  });
});

describe("drag schedule (§4.3)", () => {
  it("is 0 through year 10, then ramps to full by year 15", () => {
    expect(drag(10, 0.02)).toBe(0);
    expect(drag(11, 0.02)).toBeCloseTo(0.004, 10);
    expect(drag(15, 0.02)).toBeCloseTo(0.02, 10);
    expect(drag(20, 0.02)).toBeCloseTo(0.02, 10); // capped at min(.,1)
  });
});

describe("gMarket phase boundaries", () => {
  it("switches at years 5 and 10", () => {
    expect(gMarket(5, G)).toBe(0.07);
    expect(gMarket(6, G)).toBe(0.06);
    expect(gMarket(10, G)).toBe(0.06);
    expect(gMarket(11, G)).toBe(0.05);
  });
});
