/**
 * Integration tests on compute() (the single source of truth):
 *   T6  — full BLR mid-rise reconciliation (value stack sums; exit waterfall).
 *   T9  — benchmark fairness: cash conservation (col 37 ≈ 0) + breakeven RE≈EQ.
 *   T12 — table/headline parity.
 *   T15 — plot vs flat land-share property.
 * PRD §7.
 */
import { describe, it, expect } from "vitest";
import { compute } from "../compute";
import { getDefaults } from "../../defaults";

const blrMidRise = () =>
  getDefaults({
    geography: "Bangalore",
    assetType: "MidRiseSociety",
    acquisitionType: "ReadyApartment",
  });

describe("T6 — BLR mid-rise reconciliation", () => {
  const out = compute(blrMidRise());

  it("produces positive terminal net worth for both engines", () => {
    expect(out.reTerminal).toBeGreaterThan(0);
    expect(out.eqTerminal).toBeGreaterThan(0);
  });

  it("value stack sums to gross each year (land+structure+premium+redev)", () => {
    for (const r of out.rows) {
      expect(r.propValueGross).toBeCloseTo(
        r.landValue + r.structureValue + r.premiumValue + r.redevOptionValue,
        2,
      );
    }
  });

  it("RE_terminal reconciles to the exit waterfall + reinvest pot", () => {
    const finalRow = out.rows[out.rows.length - 1]!;
    expect(out.reTerminal).toBeCloseTo(out.netSaleProceeds + finalRow.reinvestPot, 2);
  });

  it("XIRRs are finite and reasonable", () => {
    expect(Number.isFinite(out.reXirr)).toBe(true);
    expect(Number.isFinite(out.eqXirr)).toBe(true);
  });
});

describe("T9 — benchmark fairness (cash conservation + breakeven)", () => {
  it("cashConservationCheck ≈ 0 every period (|diff| < ₹1) — col 37 invariant", () => {
    for (const mode of ["ReinvestEquity", "Pocket"] as const) {
      const out = compute({ ...blrMidRise(), rentalCashUse: mode });
      for (const r of out.rows) {
        expect(Math.abs(r.cashConservationCheck)).toBeLessThan(1);
      }
    }
  });

  it("at the breakeven land CAGR, RE_terminal ≈ EQ_terminal", () => {
    const base = compute(blrMidRise());
    const be = base.breakevenLandCagr;
    expect(Number.isFinite(be)).toBe(true);
    const atBe = compute({ ...blrMidRise(), landCagrY1_10: be, landCagrY11_20: be });
    // RE_terminal is extremely steep in land CAGR; assert a tight relative match.
    expect(Math.abs(atBe.reTerminal - atBe.eqTerminal)).toBeLessThan(atBe.reTerminal * 1e-6);
  });
});

describe("T12 — table/headline parity", () => {
  const out = compute(blrMidRise());

  it("gap == reTerminal − eqTerminal exactly", () => {
    expect(out.gap).toBeCloseTo(out.reTerminal - out.eqTerminal, 2);
  });

  it("propValueGross(N) == land+structure+premium+redev (terminal row)", () => {
    const r = out.rows[out.rows.length - 1]!;
    expect(r.propValueGross).toBeCloseTo(
      r.landValue + r.structureValue + r.premiumValue + r.redevOptionValue,
      2,
    );
  });

  it("real RE_terminal == nominal / (1+cpi)^N", () => {
    const inp = blrMidRise();
    expect(out.realReTerminal).toBeCloseTo(
      out.reTerminal / Math.pow(1 + inp.cpiPct, inp.holdYears),
      2,
    );
  });
});

describe("T15 — plot vs flat land-share (controlled: identical land economics, UDS differs)", () => {
  // Controlled comparison per PRD T15: SAME land rate & CAGR & structure area;
  // the ONLY material difference is UDS ratio (plot ~100% vs flat ~12%) and the
  // land's lower structural depreciation. This isolates the plot-appreciates /
  // flat-deteriorates thesis as a checkable property (not via differing defaults).
  const base = getDefaults({
    geography: "Bangalore",
    assetType: "HighRiseSociety",
    acquisitionType: "ReadyApartment",
  });
  const structureArea = 1200;
  const landRate0 = 12_000;

  const flat = compute({
    ...base,
    sbua: structureArea,
    udsSqft: 0.12 * structureArea, // 12% UDS
    landRate0,
    landCagrY1_10: 0.07,
    landCagrY11_20: 0.06,
    economicDepRatePct: 0.022,
    premium0: 0, // strip premium to isolate land vs structure
  });

  const plot = compute({
    ...base,
    acquisitionType: "PlotSelfBuild",
    plotAreaSqft: structureArea, // ~100% UDS
    builtUpAreaSqft: structureArea,
    udsSqft: structureArea,
    landRate0,
    landCagrY1_10: 0.07, // IDENTICAL land CAGR
    landCagrY11_20: 0.06,
    economicDepRatePct: 0,
    replacementCost0: 2500,
    constructionRatePerSqft: 2500,
    purchasePriceAllIn: structureArea * landRate0,
    landLoanAmount: 0,
    constructionLoanAmount: 0,
    premium0: 0,
  });

  it("plot land share at year 20 is higher and land-dominated", () => {
    const plotShare = plot.rows[plot.rows.length - 1]!.landSharePct;
    const flatShare = flat.rows[flat.rows.length - 1]!.landSharePct;
    expect(plotShare).toBeGreaterThan(flatShare);
    expect(plotShare).toBeGreaterThan(0.85); // ~100% UDS → strongly land dominated
  });

  it("plot structure is a dramatically smaller fraction of total value at exit", () => {
    const pr = plot.rows[plot.rows.length - 1]!;
    const fr = flat.rows[flat.rows.length - 1]!;
    const plotStructFrac = pr.structureValue / pr.propValueGross;
    const flatStructFrac = fr.structureValue / fr.propValueGross;
    expect(plotStructFrac).toBeLessThan(flatStructFrac);
    // plot's structure share is less than ~60% of the flat's — "dramatic" per T15
    expect(plotStructFrac).toBeLessThan(0.6 * flatStructFrac);
  });

  it("plot cash conservation holds through the construction window too", () => {
    for (const r of plot.rows) {
      expect(Math.abs(r.cashConservationCheck)).toBeLessThan(1);
    }
  });
});
