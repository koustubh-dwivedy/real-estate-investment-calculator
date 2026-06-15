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
    expect: { reTerminal: 33_719_438, eqTerminal: 84_149_109, gap: -50_429_671, netSaleProceeds: 33_719_438, reXirr: 0.038651, eqXirr: 0.103053, breakevenLandCagr: 0.126114, y20propGross: 37_969_328 },
  },
  {
    name: "Mumbai apartment (high-rise, redevelopment)",
    inputs: getDefaults({ geography: "Mumbai", assetType: "HighRiseSociety", acquisitionType: "ReadyApartment" }),
    expect: { reTerminal: 30_464_891, eqTerminal: 85_950_492, gap: -55_485_601, netSaleProceeds: 30_464_891, reXirr: 0.028644, eqXirr: 0.103034, breakevenLandCagr: 0.105078, y20propGross: 34_056_555 },
  },
  {
    name: "Bangalore plot + self-build",
    inputs: { ...getDefaults({ geography: "Bangalore", assetType: "PlottedDevelopmentVilla", acquisitionType: "PlotSelfBuild" }), constructionLoanAmount: 3_000_000 },
    expect: { reTerminal: 24_887_947, eqTerminal: 78_648_011, gap: -53_760_063, netSaleProceeds: 24_887_947, reXirr: 0.025609, eqXirr: 0.103326, breakevenLandCagr: 0.153932, y20propGross: 28_676_320 },
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
