/**
 * T20 — comprehensive finiteness + invariants sweep. Across a wide scenario matrix,
 * assert every populated number is real (no NaN/Infinity) and every cross-cutting
 * invariant holds. This is the "all numbers correctly populated" guard.
 */
import { describe, it, expect } from "vitest";
import { compute } from "../compute";
import { getDefaults, type DefaultsKey } from "../../defaults";
import type { Inputs, Outputs, Geography, AssetType, AcquisitionType } from "../../types";

const GEOS: Geography[] = ["Bangalore", "Mumbai"];
const ASSETS: AssetType[] = ["LandPlot", "PlottedDevelopmentVilla", "StandaloneApartment", "MidRiseSociety", "HighRiseSociety"];
const ACQS: AcquisitionType[] = ["ReadyApartment", "UnderConstructionApartment", "PlotSelfBuild"];

/** Scalars that must always be a real number. */
const HARD_FINITE: (keyof Outputs)[] = [
  "reTerminal", "eqTerminal", "gap", "reMultiple", "realReTerminal",
  "exitGross", "sellCosts", "ltcgProperty", "loanPayoff", "netSaleProceeds",
];
/** Solver outputs: may legitimately be NaN (no solution) but never ±Infinity. */
const SOLVER: (keyof Outputs)[] = ["reXirr", "eqXirr", "breakevenLandCagr"];

function assertWellFormed(inp: Inputs, out: Outputs, label: string) {
  for (const k of HARD_FINITE) {
    expect(Number.isFinite(out[k] as number), `${label}: ${k} = ${out[k]}`).toBe(true);
  }
  for (const k of SOLVER) {
    const v = out[k] as number;
    expect(v !== Infinity && v !== -Infinity, `${label}: ${k} = ${v}`).toBe(true);
  }
  // every schedule cell is a real number (no NaN/Infinity anywhere)
  for (const r of out.rows) {
    for (const [k, v] of Object.entries(r)) {
      expect(Number.isFinite(v as number), `${label}: row ${r.year}.${k} = ${v}`).toBe(true);
    }
  }
  // invariants
  for (const r of out.rows) {
    expect(r.propValueGross, `${label}: value stack sum y${r.year}`).toBeCloseTo(
      r.landValue + r.structureValue + r.premiumValue + r.redevOptionValue, 1,
    );
    expect(Math.abs(r.cashConservationCheck), `${label}: col37 y${r.year}`).toBeLessThan(1);
  }
  const finalRow = out.rows[out.rows.length - 1]!;
  expect(out.reTerminal, `${label}: exit waterfall`).toBeCloseTo(out.netSaleProceeds + finalRow.reinvestPot, 1);
  expect(out.gap, `${label}: gap`).toBeCloseTo(out.reTerminal - out.eqTerminal, 1);
  expect(out.realReTerminal, `${label}: real`).toBeCloseTo(out.reTerminal / Math.pow(1 + inp.cpiPct, inp.holdYears), 1);
}

describe("T20 — finiteness & invariants across the scenario matrix", () => {
  it("every geography × assetType × acquisitionType default scenario is well-formed", () => {
    for (const geography of GEOS) {
      for (const assetType of ASSETS) {
        for (const acquisitionType of ACQS) {
          const key: DefaultsKey = { geography, assetType, acquisitionType };
          const inp = getDefaults(key);
          assertWellFormed(inp, compute(inp), `${geography}/${assetType}/${acquisitionType}`);
        }
      }
    }
  });

  it("switch combinations stay well-formed", () => {
    for (const acquisitionType of ["ReadyApartment", "PlotSelfBuild"] as AcquisitionType[]) {
      const base = getDefaults({ geography: "Bangalore", assetType: "MidRiseSociety", acquisitionType });
      for (const rentalCashUse of ["ReinvestEquity", "PrepayLoan", "Pocket"] as const)
        for (const taxRegime of ["India_New", "India_Old"] as const)
          for (const compareMode of ["SameCashSIP", "LumpsumOnly"] as const)
            for (const usageMode of ["LetOut", "SelfOccupied"] as const)
              for (const holdYears of [20, 30])
                for (const surchargeCess of ["none", "cess", "surcharge"] as const) {
                  const inp = { ...base, rentalCashUse, taxRegime, compareMode, usageMode, holdYears, surchargeCess };
                  assertWellFormed(inp, compute(inp), `${acquisitionType}/${rentalCashUse}/${taxRegime}/${compareMode}/${usageMode}/${holdYears}/${surchargeCess}`);
                }
    }
  });

  it("edge inputs stay well-formed (zero rent / zero loan / high rate / high vacancy)", () => {
    const base = getDefaults({ geography: "Bangalore", assetType: "MidRiseSociety", acquisitionType: "ReadyApartment" });
    const edges: Partial<Inputs>[] = [
      { rentPerMonth0: 0 },
      { loanAmount: 0 },
      { loanRatePct: 0.2 },
      { vacancyPct: 0.5 },
      { prepaymentAnnual: 2_000_000 },
      { rentPerMonth0: 0, usageMode: "SelfOccupied" },
    ];
    for (const e of edges) {
      const inp = { ...base, ...e };
      assertWellFormed(inp, compute(inp), `edge ${JSON.stringify(e)}`);
    }
  });
});
