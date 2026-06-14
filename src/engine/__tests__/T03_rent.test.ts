/**
 * T3 (PRD §7) — rent path + cohort drag. Golden values from reference/oracle.py.
 */
import { describe, it, expect } from "vitest";
import { rentPath, drag, gMarket } from "../rent";

const G = { y1_5: 0.07, y6_10: 0.06, y11_20: 0.05, cohortDrag: 0.02 };

describe("T3 — rent path + drag", () => {
  const path = rentPath(30_000, G); // annual rent_annual(0) = 360,000

  it("rent_annual(5) = 504,918.62", () => {
    expect(path[5]).toBeCloseTo(504_918.62, 2);
  });
  it("rent_annual(10) = 675,695.02", () => {
    expect(path[10]).toBeCloseTo(675_695.02, 2);
  });
  it("rent_annual(15) = 814,151.52", () => {
    expect(path[15]).toBeCloseTo(814_151.52, 2);
  });
  it("rent_annual(20) = 943,824.75", () => {
    expect(path[20]).toBeCloseTo(943_824.75, 2);
  });
  it("rent_annual(0) = 360,000", () => {
    expect(path[0]).toBe(360_000);
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
