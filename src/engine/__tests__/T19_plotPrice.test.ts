/**
 * T19 — plot price coherence. The plot's purchase price is derived = plotArea ×
 * landRate0, so land rate / plot area drive what you pay, and the independent
 * purchasePriceAllIn field is ignored for plots. Maintenance scales with built-up area.
 */
import { describe, it, expect } from "vitest";
import { compute } from "../compute";
import { getDefaults } from "../../defaults";
import type { Inputs } from "../../types";

const plot = (): Inputs => getDefaults({ geography: "Bangalore", assetType: "PlottedDevelopmentVilla", acquisitionType: "PlotSelfBuild" });
const apt = (): Inputs => getDefaults({ geography: "Bangalore", assetType: "MidRiseSociety", acquisitionType: "ReadyApartment" });
const y0 = (o: ReturnType<typeof compute>) => o.rows.find((r) => r.year === 0)!;

describe("T19 — plot price is derived = area × land rate", () => {
  it("t=0 land value equals the price paid (no phantom gain)", () => {
    const p = plot();
    const o = compute(p);
    expect(y0(o).landValue).toBeCloseTo(p.plotAreaSqft * p.landRate0, 2);
  });

  it("changing land rate moves down-payment and net proceeds (basis)", () => {
    const a = compute({ ...plot(), landRate0: 10_000 });
    const b = compute({ ...plot(), landRate0: 20_000 });
    expect(y0(b).cumOwnCashOutA).toBeGreaterThan(y0(a).cumOwnCashOutA); // higher price → bigger down-payment
    expect(a.netSaleProceeds).not.toBeCloseTo(b.netSaleProceeds, 0); // basis & land value differ
  });

  it("changing the independent purchasePriceAllIn does NOTHING for a plot", () => {
    const a = compute({ ...plot(), purchasePriceAllIn: 1 });
    const b = compute({ ...plot(), purchasePriceAllIn: 99_999_999 });
    expect(a.reTerminal).toBe(b.reTerminal);
    expect(a.gap).toBe(b.gap);
    expect(y0(a).cumOwnCashOutA).toBe(y0(b).cumOwnCashOutA);
  });

  it("plot maintenance (society CAM) scales with built-up area, not sbua", () => {
    const a = compute({ ...plot(), builtUpAreaSqft: 1500 });
    const b = compute({ ...plot(), builtUpAreaSqft: 3000 });
    const camA = a.rows.find((r) => r.year === 5)!.societyCAM;
    const camB = b.rows.find((r) => r.year === 5)!.societyCAM;
    expect(camB).toBeGreaterThan(camA);
    // sbua is now irrelevant for a plot:
    const c = compute({ ...plot(), sbua: 100 });
    const d = compute({ ...plot(), sbua: 5000 });
    expect(c.rows.find((r) => r.year === 5)!.societyCAM).toBe(d.rows.find((r) => r.year === 5)!.societyCAM);
  });

  it("plot invariants still hold (cash conservation + value-stack sums)", () => {
    const o = compute(plot());
    for (const r of o.rows) {
      expect(Math.abs(r.cashConservationCheck)).toBeLessThan(1);
      expect(r.propValueGross).toBeCloseTo(r.landValue + r.structureValue + r.premiumValue + r.redevOptionValue, 2);
    }
  });
});

describe("T19 — apartment is unaffected", () => {
  it("apartment purchasePriceAllIn still drives the result", () => {
    const a = compute({ ...apt(), purchasePriceAllIn: 12_000_000 });
    const b = compute({ ...apt(), purchasePriceAllIn: 18_000_000 });
    expect(a.reTerminal).not.toBe(b.reTerminal);
  });
});
