/**
 * Final reconciliation pass (PRD §8.8) — three worked scenarios end-to-end:
 * Bangalore apartment, Mumbai apartment (redevelopment), Bangalore plot+build.
 * Asserts internal consistency: value-stack sums, exit waterfall, terminal-row
 * parity, and cash conservation across the whole horizon (incl. the build window).
 */
import { describe, it, expect } from "vitest";
import { compute } from "../compute";
import { getDefaults } from "../../defaults";
import type { Inputs } from "../../types";

const scenarios: Record<string, Inputs> = {
  "Bangalore apartment (mid-rise)": getDefaults({
    geography: "Bangalore",
    assetType: "MidRiseSociety",
    acquisitionType: "ReadyApartment",
  }),
  "Mumbai apartment (high-rise, redevelopment)": getDefaults({
    geography: "Mumbai",
    assetType: "HighRiseSociety",
    acquisitionType: "ReadyApartment",
  }),
  "Bangalore plot + self-build": {
    ...getDefaults({
      geography: "Bangalore",
      assetType: "PlottedDevelopmentVilla",
      acquisitionType: "PlotSelfBuild",
    }),
    constructionLoanAmount: 3_000_000,
  },
};

describe.each(Object.entries(scenarios))("Reconciliation — %s", (_name, inputs) => {
  const out = compute(inputs);

  it("value stack sums to gross every period (invariant 1)", () => {
    for (const r of out.rows) {
      expect(r.propValueGross).toBeCloseTo(
        r.landValue + r.structureValue + r.premiumValue + r.redevOptionValue,
        2,
      );
    }
  });

  it("cash is conserved every period — col 37 ≈ 0 (invariant 2)", () => {
    for (const r of out.rows) {
      expect(Math.abs(r.cashConservationCheck)).toBeLessThan(1);
    }
  });

  it("RE_terminal == net sale proceeds + final reinvest pot (exit waterfall)", () => {
    const finalRow = out.rows[out.rows.length - 1]!;
    expect(out.reTerminal).toBeCloseTo(out.netSaleProceeds + finalRow.reinvestPot - out.reinvestSleeveLtcg, 2);
  });

  it("headline gap == RE_terminal − EQ_terminal; real == nominal/(1+cpi)^N (T12)", () => {
    expect(out.gap).toBeCloseTo(out.reTerminal - out.eqTerminal, 2);
    expect(out.realReTerminal).toBeCloseTo(
      out.reTerminal / Math.pow(1 + inputs.cpiPct, inputs.holdYears),
      2,
    );
  });

  it("produces finite, positive terminal values and a finite breakeven", () => {
    expect(out.reTerminal).toBeGreaterThan(0);
    expect(out.eqTerminal).toBeGreaterThan(0);
    expect(Number.isFinite(out.breakevenLandCagr)).toBe(true);
  });
});
