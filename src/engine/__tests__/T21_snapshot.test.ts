/**
 * T21 — regression snapshot. Frozen headline numbers for three canonical scenarios.
 * The §7 anchors prove the formulas are correct; this catches any *unintended* change
 * to the integrated pipeline (a guard, not an independent re-derivation). If a change
 * is intentional, update these constants deliberately.
 */
import { describe, it, expect } from "vitest";
import { compute } from "../compute";
import { getDefaults } from "../../defaults";
import type { Inputs } from "../../types";

interface Snap {
  reTerminal: number;
  eqTerminal: number;
  gap: number;
  netSaleProceeds: number;
  reXirr: number;
  eqXirr: number;
  breakevenLandCagr: number;
  y20propGross: number;
}

const CASES: { name: string; inputs: Inputs; expect: Snap }[] = [
  {
    name: "Bangalore apartment (mid-rise)",
    inputs: getDefaults({ geography: "Bangalore", assetType: "MidRiseSociety", acquisitionType: "ReadyApartment" }),
    expect: { reTerminal: 33_719_438, eqTerminal: 86_406_862, gap: -52_687_424, netSaleProceeds: 33_719_438, reXirr: 0.037792, eqXirr: 0.103075, breakevenLandCagr: 0.127764, y20propGross: 37_969_328 },
  },
  {
    name: "Mumbai apartment (high-rise, redevelopment)",
    inputs: getDefaults({ geography: "Mumbai", assetType: "HighRiseSociety", acquisitionType: "ReadyApartment" }),
    expect: { reTerminal: 30_464_891, eqTerminal: 88_246_746, gap: -57_781_855, netSaleProceeds: 30_464_891, reXirr: 0.027937, eqXirr: 0.103056, breakevenLandCagr: 0.106695, y20propGross: 34_056_555 },
  },
  {
    name: "Bangalore plot + self-build",
    inputs: { ...getDefaults({ geography: "Bangalore", assetType: "PlottedDevelopmentVilla", acquisitionType: "PlotSelfBuild" }), constructionLoanAmount: 3_000_000 },
    expect: { reTerminal: 24_887_947, eqTerminal: 80_298_252, gap: -55_410_305, netSaleProceeds: 24_887_947, reXirr: 0.025099, eqXirr: 0.103331, breakevenLandCagr: 0.155362, y20propGross: 28_676_320 },
  },
];

describe("T21 — canonical regression snapshots", () => {
  for (const c of CASES) {
    it(c.name, () => {
      const o = compute(c.inputs);
      expect(Math.round(o.reTerminal)).toBe(c.expect.reTerminal);
      expect(Math.round(o.eqTerminal)).toBe(c.expect.eqTerminal);
      expect(Math.round(o.gap)).toBe(c.expect.gap);
      expect(Math.round(o.netSaleProceeds)).toBe(c.expect.netSaleProceeds);
      expect(o.reXirr).toBeCloseTo(c.expect.reXirr, 5);
      expect(o.eqXirr).toBeCloseTo(c.expect.eqXirr, 5);
      expect(o.breakevenLandCagr).toBeCloseTo(c.expect.breakevenLandCagr, 5);
      expect(Math.round(o.rows.find((r) => r.year === 20)!.propValueGross)).toBe(c.expect.y20propGross);
    });
  }
});
