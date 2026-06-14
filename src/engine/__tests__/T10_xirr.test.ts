/**
 * T10 (PRD §7) — XIRR. Golden from reference/oracle.py (tolerance ≤1e-7, iterative).
 */
import { describe, it, expect } from "vitest";
import { xirr, npv, bisect } from "../numerics";

describe("T10 — XIRR", () => {
  it("−1,000,000 @ t0, +6,727,500 @ t20 → 10.0000%", () => {
    const r = xirr([
      { year: 0, amount: -1_000_000 },
      { year: 20, amount: 6_727_500 },
    ]);
    expect(r).toBeCloseTo(0.1, 6); // 10.0000%
  });

  it("exact-10% future value 1,000,000×1.10^20 → exactly 0.10", () => {
    const fv = 1_000_000 * Math.pow(1.1, 20);
    const r = xirr([
      { year: 0, amount: -1_000_000 },
      { year: 20, amount: fv },
    ]);
    expect(r).toBeCloseTo(0.1, 9);
  });

  it("NPV at the solved rate is ~0", () => {
    const cfs = [
      { year: 0, amount: -1_000_000 },
      { year: 20, amount: 6_727_500 },
    ];
    expect(Math.abs(npv(xirr(cfs), cfs))).toBeLessThan(1); // residual < ₹1 on a ₹6.7M flow
  });

  it("returns NaN when flows do not bracket a root", () => {
    expect(Number.isNaN(xirr([{ year: 0, amount: 100 }, { year: 1, amount: 50 }]))).toBe(true);
  });
});

describe("bisection solver", () => {
  it("finds the root of a monotonic function", () => {
    // f(x) = x^3 - 2  → root at 2^(1/3) ≈ 1.259921
    const root = bisect((x) => x * x * x - 2, 0, 5);
    expect(root).toBeCloseTo(Math.cbrt(2), 6);
  });
});
