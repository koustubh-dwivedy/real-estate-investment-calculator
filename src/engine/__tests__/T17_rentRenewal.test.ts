/**
 * T17 — lease-term (agreement) rent renewal. Rent is flat within a term and steps once
 * per renewal; an 11-month term renews sooner than a 12-month term, so steps land earlier
 * on the calendar and rent accrues faster. Golden values from reference/oracle.py (T17).
 */
import { describe, it, expect } from "vitest";
import { rentMonthlyPath, annualizeRent, type RentGrowth } from "../rent";
import { compute } from "../compute";
import { getDefaults } from "../../defaults";

const G: RentGrowth = { y1_5: 0.07, y6_10: 0.06, y11_20: 0.05, cohortDrag: 0.02 };
const annualFor = (term: number) => annualizeRent(rentMonthlyPath(30_000, G, 240, term), 20);

describe("T17 — 11-month term golden values", () => {
  const r = annualFor(11);
  it("rent_annual(5) = 485,649.92", () => expect(r[5]).toBeCloseTo(485_649.9217, 2));
  it("rent_annual(10) = 669,320.53", () => expect(r[10]).toBeCloseTo(669_320.5347, 2));
  it("rent_annual(20) = 980,052.04", () => expect(r[20]).toBeCloseTo(980_052.0378, 2));
});

describe("T17 — 12-month term (== T3 per-term baseline)", () => {
  it("reproduces the T3 per-term annual path", () => {
    const r12 = annualFor(12);
    expect(r12[5]).toBeCloseTo(471_886.5636, 2);
    expect(r12[10]).toBeCloseTo(637_448.1283, 2);
    expect(r12[20]).toBeCloseTo(916_334.7041, 2);
  });
  it("an 11-month term is always >= a 12-month term, year by year", () => {
    const r11 = annualFor(11);
    const r12 = annualFor(12);
    for (let t = 1; t <= 20; t++) expect(r11[t]!).toBeGreaterThanOrEqual(r12[t]! - 1e-6);
  });
});

describe("T17 — compute() effect & invariants", () => {
  const base = getDefaults({ geography: "Bangalore", assetType: "MidRiseSociety", acquisitionType: "ReadyApartment" });
  const out12 = compute({ ...base, rentAgreementMonths: 12 });
  const out11 = compute({ ...base, rentAgreementMonths: 11 });

  it("11-month term raises market rent every year", () => {
    for (let t = 1; t <= 20; t++) {
      const r11 = out11.rows.find((r) => r.year === t)!;
      const r12 = out12.rows.find((r) => r.year === t)!;
      expect(r11.marketRent).toBeGreaterThanOrEqual(r12.marketRent - 1e-6);
    }
  });

  it("moves the RE-vs-equity gap in real estate's favour (lower Engine-B contributions)", () => {
    // In this negative-carry default, higher rent lowers Engine B's funded shortfall,
    // so EQ_terminal falls and the gap improves even though RE_terminal is rent-independent.
    expect(out11.gap).toBeGreaterThan(out12.gap);
  });

  it("in a positive-cashflow scenario, higher rent lifts RE terminal", () => {
    const s = { ...base, loanAmount: 3_000_000, rentPerMonth0: 70_000 };
    const re11 = compute({ ...s, rentAgreementMonths: 11 }).reTerminal;
    const re12 = compute({ ...s, rentAgreementMonths: 12 }).reTerminal;
    expect(re11).toBeGreaterThan(re12);
  });

  it("year-20 market rent matches the standalone rent path (single source of truth)", () => {
    const standalone = annualizeRent(
      rentMonthlyPath(base.rentPerMonth0, {
        y1_5: base.rentGrowthY1_5, y6_10: base.rentGrowthY6_10, y11_20: base.rentGrowthY11_20,
        cohortDrag: base.cohortDragPct,
      }, 240, 11),
      20,
    );
    expect(out11.rows.find((r) => r.year === 20)!.marketRent).toBeCloseTo(standalone[20]!, 2);
  });

  it("a 30-year 11-month run still holds the invariants", () => {
    const o = compute({ ...base, rentAgreementMonths: 11, holdYears: 30 });
    expect(o.rows.length).toBe(31);
    for (const r of o.rows) {
      expect(r.propValueGross).toBeCloseTo(r.landValue + r.structureValue + r.premiumValue + r.redevOptionValue, 2);
      expect(Math.abs(r.cashConservationCheck)).toBeLessThan(1);
    }
    const finalRow = o.rows[o.rows.length - 1]!;
    expect(o.reTerminal).toBeCloseTo(o.netSaleProceeds + finalRow.reinvestPot - o.reinvestSleeveLtcg, 2);
  });
});
