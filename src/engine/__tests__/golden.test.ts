/**
 * GOLDEN — exhaustive exact-match suite.
 *
 * Loads `reference/golden/golden.json` (produced by the independent Python oracle,
 * `python3 reference/oracle.py --dump`) and asserts the TypeScript engine reproduces
 * EVERY headline scalar AND EVERY per-period row field for EVERY scenario — the full
 * cartesian product of all toggles plus targeted corner cases — to 2 decimals (the
 * project's enforced precision policy).
 *
 * Why this is a real check and not an echo of the engine: the oracle is an INDEPENDENT
 * re-implementation derived from the PRD (different language, layout, helper boundaries)
 * and is itself guarded by Layer-2 redundancy checks (`--self-check`). A bug present in
 * only one of the two implementations makes a value diverge here; a bug shared by both
 * is additionally guarded by the Layer-3 spec invariants at the bottom of this file.
 *
 * Regenerate the dataset after any intentional engine change: `npm run oracle:dump`.
 */
import { describe, it, expect } from "vitest";
// Loaded as a raw string (Vite `?raw`) and parsed at runtime — avoids tsc inferring a
// literal type for the entire 26MB array (which `resolveJsonModule` would attempt).
import goldenRaw from "../../../reference/golden/golden.json?raw";
import { compute } from "../compute";
import type { Inputs, Outputs, PeriodRow } from "../../types";

interface GoldenScenario {
  name: string;
  inputs: Inputs;
  outputs: Record<string, unknown>;
}

const golden: GoldenScenario[] = JSON.parse(goldenRaw);

/** The oracle encodes non-finite floats as sentinel strings (JSON has no NaN/Inf). */
function expectEqualTo2dp(actual: number, expected: unknown, label: string): void {
  if (expected === "NaN") {
    expect(Number.isNaN(actual), `${label}: expected NaN`).toBe(true);
    return;
  }
  if (expected === "Infinity" || expected === "-Infinity") {
    expect(actual, label).toBe(expected === "Infinity" ? Infinity : -Infinity);
    return;
  }
  expect(typeof expected, `${label}: golden value is a number`).toBe("number");
  expect(actual, label).toBeCloseTo(expected as number, 2);
}

const SCALAR_KEYS: (keyof Outputs)[] = [
  "reTerminal", "eqTerminal", "gap", "reXirr", "eqXirr", "reMultiple",
  "breakevenLandCagr", "realReTerminal", "exitGross", "sellCosts", "ltcgProperty",
  "reinvestSleeveLtcg", "loanPayoff", "netSaleProceeds",
];

const ROW_KEYS: (keyof PeriodRow)[] = [
  "year", "landValue", "structureValue", "premiumValue", "redevOptionValue",
  "propValueGross", "landSharePct", "replacementCostPerSqft", "depFactor", "emiAnnual",
  "interestPaid", "principalPaid", "loanBalanceEnd", "prepayment", "marketRent",
  "grossRentCollected", "societyCAM", "ownerMaintenance", "waterTax", "interiorRefresh",
  "majorRepairReserve", "propertyTax", "noi", "postTaxRentalCF", "taxableHP",
  "rentalTaxOrShield", "carryForwardLossBalance", "reinvestPot", "equityPot",
  "cumOwnCashOutA", "cumContribB", "cashConservationCheck", "reNetWorth",
  "equityNetWorth", "netWorthGap",
];

describe("GOLDEN dataset integrity", () => {
  it("loaded the full cartesian + corner-case dataset", () => {
    expect(golden.length).toBeGreaterThanOrEqual(884);
    expect(golden.some((s) => s.name.startsWith("cart|"))).toBe(true);
    expect(golden.some((s) => s.name.startsWith("corner|"))).toBe(true);
  });
});

describe("GOLDEN — TS engine matches the independent oracle to 2dp (every scenario)", () => {
  for (const scn of golden) {
    it(scn.name, () => {
      const out = compute(scn.inputs);

      // headline scalars
      for (const k of SCALAR_KEYS) {
        expectEqualTo2dp(out[k] as number, scn.outputs[k], `${scn.name} :: ${k}`);
      }

      // every per-period row, every field
      const goldenRows = scn.outputs.rows as Record<string, unknown>[];
      expect(out.rows.length, `${scn.name} :: row count`).toBe(goldenRows.length);
      out.rows.forEach((row, i) => {
        const g = goldenRows[i]!;
        for (const k of ROW_KEYS) {
          expectEqualTo2dp(row[k] as number, g[k], `${scn.name} :: row[${i}].${k}`);
        }
      });
    });
  }
});

/**
 * LAYER-3 — implementation-independent spec invariants asserted directly on the engine.
 * These hold by the model's own logic, so they catch a bug even if it were (improbably)
 * shared by both implementations. Sampled across the full dataset.
 */
describe("GOLDEN — Layer-3 spec invariants (engine self-consistency)", () => {
  // breakeven is irrelevant to these identities, so skip it for speed.
  it("value stack sums to gross every period; col-37 cash conservation ≈ 0", () => {
    for (const scn of golden) {
      const out = compute(scn.inputs, { skipBreakeven: true });
      for (const r of out.rows) {
        expect(r.propValueGross).toBeCloseTo(
          r.landValue + r.structureValue + r.premiumValue + r.redevOptionValue, 2);
        expect(Math.abs(r.cashConservationCheck)).toBeLessThan(1);
      }
    }
  });

  it("RE_terminal reconciles to the exit waterfall + reinvest pot, every scenario", () => {
    for (const scn of golden) {
      const out = compute(scn.inputs, { skipBreakeven: true });
      const final = out.rows[out.rows.length - 1]!;
      expect(out.reTerminal).toBeCloseTo(
        out.netSaleProceeds + final.reinvestPot - out.reinvestSleeveLtcg, 2);
      expect(out.gap).toBeCloseTo(out.reTerminal - out.eqTerminal, 2);
      expect(out.realReTerminal).toBeCloseTo(
        out.reTerminal / Math.pow(1 + scn.inputs.cpiPct, scn.inputs.holdYears), 2);
    }
  });

  it("higher land CAGR ⇒ higher RE_terminal (monotonicity), sampled", () => {
    for (const scn of golden.filter((_, i) => i % 37 === 0)) {
      const lo = compute({ ...scn.inputs, landCagrY1_10: scn.inputs.landCagrY1_10 - 0.01,
        landCagrY11_20: scn.inputs.landCagrY11_20 - 0.01 }, { skipBreakeven: true });
      const hi = compute({ ...scn.inputs, landCagrY1_10: scn.inputs.landCagrY1_10 + 0.01,
        landCagrY11_20: scn.inputs.landCagrY11_20 + 0.01 }, { skipBreakeven: true });
      expect(hi.reTerminal).toBeGreaterThan(lo.reTerminal);
    }
  });

  it("zero equity growth ⇒ Engine B pot equals contributions (no LTCG)", () => {
    const base = golden[0]!.inputs;
    const out = compute({ ...base, equityCagrPct: 0 }, { skipBreakeven: true });
    const final = out.rows[out.rows.length - 1]!;
    // with no growth the equity pot is exactly the cash put in
    expect(final.equityPot).toBeCloseTo(final.cumContribB, 2);
  });
});
