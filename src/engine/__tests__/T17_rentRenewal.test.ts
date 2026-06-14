/**
 * T17 — 11-month rent renewal cadence. The per-renewal escalation compounds
 * 12/renewalMonths times per year. Golden values from reference/oracle.py (T17).
 * At renewalMonths = 12 (or omitted) the path reduces EXACTLY to T3.
 */
import { describe, it, expect } from "vitest";
import { rentPath } from "../rent";
import { compute } from "../compute";
import { getDefaults } from "../../defaults";

const G = (renewalMonths?: number) => ({
  y1_5: 0.07,
  y6_10: 0.06,
  y11_20: 0.05,
  cohortDrag: 0.02,
  ...(renewalMonths ? { renewalMonths } : {}),
});

describe("T17 — 11-month cadence golden values", () => {
  const r = rentPath(30_000, G(11));
  it("rent_annual(5) = 520,688.10", () => expect(r[5]).toBeCloseTo(520_688.0994, 2));
  it("rent_annual(10) = 715,500.01", () => expect(r[10]).toBeCloseTo(715_500.0099, 2));
  it("rent_annual(20) = 1,030,255.38", () => expect(r[20]).toBeCloseTo(1_030_255.3825, 2));
});

describe("T17 — backward compatibility (12 months == plain annual == T3)", () => {
  it("renewalMonths 12 and omitted both reproduce T3 exactly", () => {
    const r12 = rentPath(30_000, G(12));
    const rOmit = rentPath(30_000, G());
    for (const r of [r12, rOmit]) {
      expect(r[5]).toBeCloseTo(504_918.6231, 2);
      expect(r[10]).toBeCloseTo(675_695.016, 2);
      expect(r[20]).toBeCloseTo(943_824.7453, 2);
    }
  });
});

describe("T17 — compute() effect & invariants", () => {
  const base = getDefaults({ geography: "Bangalore", assetType: "MidRiseSociety", acquisitionType: "ReadyApartment" });
  const out12 = compute({ ...base, rentAgreementMonths: 12 });
  const out11 = compute({ ...base, rentAgreementMonths: 11 });

  it("11-month cadence raises market rent and post-tax cash every year", () => {
    for (let t = 1; t <= 20; t++) {
      const r11 = out11.rows.find((r) => r.year === t)!;
      const r12 = out12.rows.find((r) => r.year === t)!;
      expect(r11.marketRent).toBeGreaterThan(r12.marketRent);
      expect(r11.postTaxRentalCF).toBeGreaterThan(r12.postTaxRentalCF);
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
    const standalone = rentPath(base.rentPerMonth0, {
      y1_5: base.rentGrowthY1_5, y6_10: base.rentGrowthY6_10, y11_20: base.rentGrowthY11_20,
      cohortDrag: base.cohortDragPct, renewalMonths: 11,
    });
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
    expect(o.reTerminal).toBeCloseTo(o.netSaleProceeds + finalRow.reinvestPot, 2);
  });
});
