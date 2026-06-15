/**
 * T24 — fuzz / property tests. Hundreds of random-but-valid scenarios; assert the
 * cross-cutting invariants and monotonicities hold everywhere (broadens coverage
 * beyond the T20 matrix). These test CONSISTENCY (which holds) — they are not a
 * correctness oracle for the absolute level of any single figure.
 */
import { describe, it, expect } from "vitest";
import { compute } from "../compute";
import { getDefaults } from "../../defaults";
import type { Inputs, Geography, AssetType, AcquisitionType } from "../../types";

// Tiny deterministic PRNG (mulberry32) for reproducible fuzzing.
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GEOS: Geography[] = ["Bangalore", "Mumbai"];
const ASSETS: AssetType[] = ["LandPlot", "PlottedDevelopmentVilla", "StandaloneApartment", "MidRiseSociety", "HighRiseSociety"];
const ACQS: AcquisitionType[] = ["ReadyApartment", "UnderConstructionApartment", "PlotSelfBuild"];

function randomInputs(r: () => number): Inputs {
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)]!;
  const base = getDefaults({ geography: pick(GEOS), assetType: pick(ASSETS), acquisitionType: pick(ACQS) });
  const jitter = (v: number, lo = 0.5, hi = 1.7) => v * (lo + r() * (hi - lo));
  return {
    ...base,
    holdYears: r() < 0.5 ? 20 : 30,
    rentPerMonth0: jitter(base.rentPerMonth0),
    loanRatePct: 0.04 + r() * 0.08,
    landCagrY1_10: r() * 0.12,
    landCagrY11_20: r() * 0.1,
    equityCagrPct: 0.04 + r() * 0.1,
    vacancyPct: r() * 0.15,
    cpiPct: 0.02 + r() * 0.05,
    marginalTaxPct: 0.1 + r() * 0.2,
    surchargeCess: pick(["none", "cess", "surcharge"]),
    taxRegime: pick(["India_New", "India_Old"]),
    rentalCashUse: pick(["ReinvestEquity", "PrepayLoan", "Pocket"]),
    usageMode: pick(["LetOut", "SelfOccupied"]),
    prepaymentAnnual: r() < 0.3 ? jitter(100_000) : 0,
  };
}

describe("T24 — fuzz invariants over many random scenarios", () => {
  it("every random scenario is finite and invariant-consistent", () => {
    const r = rng(20260616);
    for (let i = 0; i < 400; i++) {
      const inp = randomInputs(r);
      const o = compute(inp);
      const tag = `seed#${i} ${inp.geography}/${inp.assetType}/${inp.acquisitionType}`;
      for (const k of ["reTerminal", "eqTerminal", "gap", "netSaleProceeds", "realReTerminal"] as const) {
        expect(Number.isFinite(o[k] as number), `${tag}: ${k}`).toBe(true);
      }
      for (const row of o.rows) {
        for (const [k, v] of Object.entries(row)) {
          expect(Number.isFinite(v as number), `${tag}: row ${row.year}.${k}`).toBe(true);
        }
        expect(row.propValueGross, `${tag}: stack y${row.year}`).toBeCloseTo(
          row.landValue + row.structureValue + row.premiumValue + row.redevOptionValue, 1,
        );
        expect(Math.abs(row.cashConservationCheck), `${tag}: col37 y${row.year}`).toBeLessThan(1);
      }
      const last = o.rows[o.rows.length - 1]!;
      expect(o.reTerminal, `${tag}: exit`).toBeCloseTo(o.netSaleProceeds + last.reinvestPot, 1);
      expect(o.gap, `${tag}: gap`).toBeCloseTo(o.reTerminal - o.eqTerminal, 1);
      expect(o.realReTerminal, `${tag}: real`).toBeCloseTo(o.reTerminal / Math.pow(1 + inp.cpiPct, inp.holdYears), 1);
    }
  });

  it("monotonicities hold (random bases)", () => {
    const r = rng(7);
    for (let i = 0; i < 60; i++) {
      const inp = randomInputs(r);
      // higher equity CAGR ⇒ higher equity terminal
      expect(compute({ ...inp, equityCagrPct: inp.equityCagrPct + 0.02 }).eqTerminal)
        .toBeGreaterThan(compute(inp).eqTerminal);
      // higher land CAGR ⇒ higher RE terminal
      expect(compute({ ...inp, landCagrY1_10: inp.landCagrY1_10 + 0.02, landCagrY11_20: inp.landCagrY11_20 + 0.02 }).reTerminal)
        .toBeGreaterThan(compute(inp).reTerminal - 1);
    }
  });
});
