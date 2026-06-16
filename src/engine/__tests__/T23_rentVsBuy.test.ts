/**
 * T23 — rent-vs-buy. Buyer terminal ties to the self-occupied sale proceeds; renter
 * terminal is monotonic in rent; break-even is where they tie; each renting input
 * moves the renter terminal; finite across scenarios.
 */
import { describe, it, expect } from "vitest";
import { rentVsBuy, rentVsBuySensitivity } from "../rentVsBuy";
import { compute } from "../compute";
import { getDefaults } from "../../defaults";
import type { Inputs } from "../../types";

const apt = (): Inputs => getDefaults({ geography: "Bangalore", assetType: "MidRiseSociety", acquisitionType: "ReadyApartment" });

describe("T23 — rent-vs-buy model", () => {
  it("buyer terminal equals the self-occupied net sale proceeds", () => {
    const inp = apt();
    const rvb = rentVsBuy(inp, inp.altRentPerMonth0);
    expect(rvb.buyerTerminal).toBeCloseTo(compute({ ...inp, usageMode: "SelfOccupied" }).netSaleProceeds, 2);
    expect(rvb.rows.length).toBe(inp.holdYears + 1); // years 0…N
    expect(rvb.rows[0]!.year).toBe(0); // table starts at t=0
  });

  it("renter terminal strictly decreases as the rent you'd pay rises", () => {
    const inp = apt();
    let prev = Infinity;
    for (const rent of [10_000, 30_000, 50_000, 80_000, 120_000]) {
      const t = rentVsBuy(inp, rent).renterTerminal;
      expect(t).toBeLessThan(prev);
      prev = t;
      expect(Number.isFinite(t)).toBe(true);
    }
  });

  it("a crossover exists: very low rent → renting wins, very high → buying wins", () => {
    const inp = apt();
    expect(rentVsBuy(inp, 5_000).gap).toBeLessThan(0); // renter ahead (gap = buyer − renter)
    expect(rentVsBuy(inp, 150_000).gap).toBeGreaterThan(0); // buyer ahead
  });

  it("at the break-even rent, buyer and renter tie", () => {
    const inp = apt();
    const be = rentVsBuy(inp, inp.altRentPerMonth0).breakevenRent;
    expect(Number.isFinite(be)).toBe(true);
    const atBe = rentVsBuy(inp, be);
    expect(Math.abs(atBe.gap)).toBeLessThan(Math.max(1, atBe.buyerTerminal * 1e-4));
  });

  it("each renting input moves the renter terminal (independence within rent-vs-buy)", () => {
    const inp = apt();
    const baseRent = inp.altRentPerMonth0;
    const base = rentVsBuy(inp, baseRent).renterTerminal;
    expect(rentVsBuy({ ...inp, altRentGrowthPct: inp.altRentGrowthPct * 1.5 }, baseRent).renterTerminal).not.toBe(base);
    expect(rentVsBuy({ ...inp, securityDepositMonths: 10 }, baseRent).renterTerminal).not.toBe(base);
    expect(rentVsBuy({ ...inp, renewalCostMonths: 3 }, baseRent).renterTerminal).not.toBe(base);
    expect(rentVsBuy({ ...inp, renewalCycleYears: 5 }, baseRent).renterTerminal).not.toBe(base);
  });

  it("the rent you'd pay respects the 11/12-month renewal cadence", () => {
    const inp = apt();
    const r12 = rentVsBuy({ ...inp, rentAgreementMonths: 12 }, inp.altRentPerMonth0).renterTerminal;
    const r11 = rentVsBuy({ ...inp, rentAgreementMonths: 11 }, inp.altRentPerMonth0).renterTerminal;
    // 11-month cadence → rent compounds faster → renter pays more → lower renter terminal
    expect(r11).not.toBeCloseTo(r12, 0);
  });

  it("rentVsBuySensitivity returns finite, sorted bars driven by equity CAGR & appreciation", () => {
    const inp = apt();
    const bars = rentVsBuySensitivity(inp, inp.altRentPerMonth0, 0.15);
    expect(bars.length).toBeGreaterThan(0);
    for (const b of bars) expect(Number.isFinite(b.span)).toBe(true);
    for (let i = 1; i < bars.length; i++) expect(bars[i - 1]!.span).toBeGreaterThanOrEqual(bars[i]!.span);
    const labels = bars.map((b) => b.label);
    expect(labels).toContain("Equity CAGR");
    expect(labels).toContain("Property appreciation");
    expect(labels).toContain("UDS (land share)"); // apartment land-quantum lever
  });

  it("rentVsBuySensitivity UDS lever becomes 'Plot area' for a plot", () => {
    const inp = getDefaults({ geography: "Bangalore", assetType: "PlottedDevelopmentVilla", acquisitionType: "PlotSelfBuild" });
    const labels = rentVsBuySensitivity(inp, inp.altRentPerMonth0, 0.15).map((b) => b.label);
    expect(labels).toContain("Plot area");
    expect(labels).not.toContain("UDS (land share)");
  });

  it("finite across geographies and asset types", () => {
    for (const g of ["Bangalore", "Mumbai"] as const)
      for (const a of ["MidRiseSociety", "HighRiseSociety", "StandaloneApartment"] as const) {
        const inp = getDefaults({ geography: g, assetType: a, acquisitionType: "ReadyApartment" });
        const rvb = rentVsBuy(inp, inp.altRentPerMonth0);
        expect(Number.isFinite(rvb.buyerTerminal) && Number.isFinite(rvb.renterTerminal)).toBe(true);
        for (const r of rvb.rows) for (const v of Object.values(r)) expect(Number.isFinite(v)).toBe(true);
      }
  });
});
