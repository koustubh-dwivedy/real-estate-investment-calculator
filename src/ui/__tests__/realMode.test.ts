/**
 * Real-mode display helpers: arithmetic + consistency with the engine's nominal
 * `realReTerminal` (the display layer must agree with the engine to the paisa).
 */
import { describe, it, expect } from "vitest";
import { deflate, realRate, asMode } from "../realMode";
import { compute } from "../../engine/compute";
import { getDefaults } from "../../defaults";

describe("deflate / realRate arithmetic", () => {
  it("year 0 is unchanged", () => {
    expect(deflate(100, 0, 0.045)).toBe(100);
  });
  it("deflates by (1+cpi)^year", () => {
    expect(deflate(100, 20, 0.045)).toBeCloseTo(100 / Math.pow(1.045, 20), 9);
  });
  it("realRate(0.11, 0.045) ≈ 6.2201%", () => {
    expect(realRate(0.11, 0.045)).toBeCloseTo((1.11 / 1.045) - 1, 9);
    expect(realRate(0.11, 0.045)).toBeCloseTo(0.0622009569, 9);
  });
  it("asMode only deflates in real mode", () => {
    expect(asMode(100, 10, 0.045, "nominal")).toBe(100);
    expect(asMode(100, 10, 0.045, "real")).toBeCloseTo(deflate(100, 10, 0.045), 9);
  });
});

describe("display layer agrees with the engine's realReTerminal", () => {
  it("deflate(reTerminal, holdYears, cpi) == out.realReTerminal", () => {
    for (const acq of ["ReadyApartment", "PlotSelfBuild"] as const) {
      const inp = getDefaults({ geography: "Bangalore", assetType: "MidRiseSociety", acquisitionType: acq });
      const out = compute(inp);
      expect(deflate(out.reTerminal, inp.holdYears, inp.cpiPct)).toBeCloseTo(out.realReTerminal, 2);
    }
  });
});
