/**
 * T16 — 30-year horizon with explicit Y21–30 bands. Golden values from
 * reference/oracle.py (T16 block). Also verifies backward-compatibility: with
 * Y21–30 == Y11–20 the first 20 years are byte-for-byte unchanged.
 */
import { describe, it, expect } from "vitest";
import { rentPath } from "../rent";
import { landRate, landValue, type LandParams } from "../valueStack";
import { compute } from "../compute";
import { getDefaults } from "../../defaults";

describe("T16 — rent & land over 30 years with explicit Y21–30", () => {
  const rp = rentPath(
    30_000,
    { y1_5: 0.07, y6_10: 0.06, y11_20: 0.05, y21_30: 0.04, cohortDrag: 0.02 },
    30,
  );
  it("rent_annual(20) is unchanged from T3 (Y21–30 doesn't affect t≤20)", () => {
    expect(rp[20]).toBeCloseTo(943_824.7453, 2);
  });
  it("rent_annual(25) = 1,042,058.78 ; rent_annual(30) = 1,150,517.10", () => {
    expect(rp[25]).toBeCloseTo(1_042_058.7828, 2);
    expect(rp[30]).toBeCloseTo(1_150_517.0979, 2);
  });

  const land: LandParams = {
    udsSqft: 600,
    landRate0: 38_000,
    landCagrY1_10: 0.08,
    landCagrY11_20: 0.06,
    landCagrY21_30: 0.05,
  };
  it("landRate(30) = 239,316.58 ; landValue(30) = 143,589,950.31", () => {
    expect(landRate(land, 30)).toBeCloseTo(239_316.5839, 2);
    expect(landValue(land, 30)).toBeCloseTo(143_589_950.3106, 2);
  });
});

describe("T16 — backward compatibility (Y21–30 == Y11–20)", () => {
  it("rentPath over 30y equals rentPath over 20y for the first 20 years", () => {
    const g = { y1_5: 0.07, y6_10: 0.06, y11_20: 0.05, cohortDrag: 0.02 }; // no y21_30
    const r20 = rentPath(30_000, g, 20);
    const r30 = rentPath(30_000, g, 30);
    for (let t = 0; t <= 20; t++) expect(r30[t]).toBeCloseTo(r20[t]!, 6);
  });

  it("landRate for t≤20 is identical whether or not cagr3 is supplied", () => {
    const base: LandParams = { udsSqft: 600, landRate0: 38_000, landCagrY1_10: 0.08, landCagrY11_20: 0.06 };
    const withCagr3: LandParams = { ...base, landCagrY21_30: 0.02 }; // very different phase 3
    for (let t = 0; t <= 20; t++) {
      expect(landRate(withCagr3, t)).toBeCloseTo(landRate(base, t), 6);
    }
  });

  it("compute() first 20 years are identical for holdYears 20 vs 30 (default rates)", () => {
    const d20 = getDefaults({ geography: "Bangalore", assetType: "MidRiseSociety", acquisitionType: "ReadyApartment" });
    const out20 = compute(d20);
    const out30 = compute({ ...d20, holdYears: 30 });
    for (let t = 0; t <= 20; t++) {
      const a = out20.rows[t]!;
      const b = out30.rows.find((r) => r.year === t)!;
      expect(b.propValueGross).toBeCloseTo(a.propValueGross, 2);
      expect(b.marketRent).toBeCloseTo(a.marketRent, 2);
      expect(b.loanBalanceEnd).toBeCloseTo(a.loanBalanceEnd, 2);
      expect(b.equityPot).toBeCloseTo(a.equityPot, 2);
      expect(b.reNetWorth).toBeCloseTo(a.reNetWorth, 2);
    }
  });
});

describe("T16 — 30-year compute() holds all invariants", () => {
  const out = compute({
    ...getDefaults({ geography: "Bangalore", assetType: "MidRiseSociety", acquisitionType: "ReadyApartment" }),
    holdYears: 30,
  });

  it("schedule runs t=0…30 (31 rows)", () => {
    expect(out.rows.length).toBe(31);
    expect(out.rows[0]!.year).toBe(0);
    expect(out.rows[out.rows.length - 1]!.year).toBe(30);
  });

  it("value stack sums to gross every year through 30", () => {
    for (const r of out.rows) {
      expect(r.propValueGross).toBeCloseTo(
        r.landValue + r.structureValue + r.premiumValue + r.redevOptionValue,
        2,
      );
    }
  });

  it("cash is conserved every year incl. 21–30 (col 37 ≈ 0)", () => {
    for (const r of out.rows) expect(Math.abs(r.cashConservationCheck)).toBeLessThan(1);
  });

  it("RE_terminal reconciles to the exit waterfall + reinvest pot; breakeven finite", () => {
    const finalRow = out.rows[out.rows.length - 1]!;
    expect(out.reTerminal).toBeCloseTo(out.netSaleProceeds + finalRow.reinvestPot, 2);
    expect(Number.isFinite(out.breakevenLandCagr)).toBe(true);
  });
});
