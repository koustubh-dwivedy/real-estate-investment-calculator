/**
 * T26 — audit F1: the reinvest sleeve (Engine A's surplus rental cash, reinvested at
 * equityCagr) is the SAME equity index as Engine B, so at exit it pays equity LTCG on
 * its gain with the ₹1.25L exemption — exactly as Engine B does (§4.9). This restores
 * symmetry between Engine A's equity sleeve and Engine B's equity benchmark.
 *
 * Dormant under defaults (negative carry every year → reinvestPot 0 → no sleeve gain →
 * no change), so the fix is a no-op on every default scenario. It bites only for
 * low-leverage / high-yield / post-payoff cases where the pot grows large.
 */
import { describe, it, expect } from "vitest";
import { compute } from "../compute";
import { getDefaults } from "../../defaults";
import type { Inputs } from "../../types";

// Reconstruct the sleeve basis from the §6A rows. This equals the engine's MONTHLY
// reinvestContrib only when no month within a year flips negative (else the monthly
// basis excludes that month while the annual net still nets it). The lowLev() scenario
// suppresses the lumpy interior refresh so every hold-month is positive and the
// annual reconstruction is exact.
const sleeveGainFromRows = (out: ReturnType<typeof compute>): { pot: number; contrib: number } => {
  const pot = out.rows[out.rows.length - 1]!.reinvestPot; // gross terminal pot
  const contrib = out.rows.reduce((s, r) => s + Math.max(r.postTaxRentalCF, 0), 0);
  return { pot, contrib };
};

describe("T26 — reinvest-sleeve equity LTCG (audit F1)", () => {
  // --- dormant under defaults: negative carry ⇒ empty pot ⇒ no sleeve LTCG ---
  it("default scenario has an empty reinvest pot and zero sleeve LTCG (no-op)", () => {
    const out = compute(
      getDefaults({ geography: "Bangalore", assetType: "MidRiseSociety", acquisitionType: "ReadyApartment" }),
    );
    expect(out.rows[out.rows.length - 1]!.reinvestPot).toBe(0);
    expect(out.reinvestSleeveLtcg).toBe(0);
  });

  // --- low-leverage / high-yield: positive carry ⇒ the sleeve grows and is taxed ---
  const lowLev = (): Inputs => ({
    ...getDefaults({ geography: "Bangalore", assetType: "MidRiseSociety", acquisitionType: "ReadyApartment" }),
    purchasePriceAllIn: 15_000_000,
    loanAmount: 1_000_000, // tiny loan → rent comfortably covers costs → positive carry
    rentPerMonth0: 120_000, // ~9.6% gross yield → large surplus reinvested
    marginalTaxPct: 0,
    surchargeCess: "none" as const,
    rentalCashUse: "ReinvestEquity" as const,
    interiorRefreshCycleYears: 0, // no lumpy month → every hold-month positive (see above)
  });

  it("sleeve LTCG = max(gain − ₹1.25L exemption, 0) × ltcgEquityPct (mirrors Engine B)", () => {
    const inp = lowLev();
    const out = compute(inp);
    const { pot, contrib } = sleeveGainFromRows(out);
    expect(pot).toBeGreaterThan(0);
    const gain = pot - contrib;
    expect(gain).toBeGreaterThan(inp.equityLtcgExemptionAnnual); // exemption actually bites
    const expected = Math.max(gain - inp.equityLtcgExemptionAnnual, 0) * inp.ltcgEquityPct;
    expect(out.reinvestSleeveLtcg).toBeCloseTo(expected, 2);
  });

  it("reTerminal = netSaleProceeds + gross reinvestPot − sleeve LTCG", () => {
    const out = compute(lowLev());
    const grossPot = out.rows[out.rows.length - 1]!.reinvestPot;
    expect(out.reTerminal).toBeCloseTo(out.netSaleProceeds + grossPot - out.reinvestSleeveLtcg, 2);
  });

  it("taxing the sleeve lowers reTerminal vs an untaxed sleeve (ltcgEquityPct = 0)", () => {
    const taxed = compute(lowLev());
    const untaxed = compute({ ...lowLev(), ltcgEquityPct: 0 });
    expect(untaxed.reinvestSleeveLtcg).toBe(0);
    expect(taxed.reTerminal).toBeLessThan(untaxed.reTerminal);
    // the whole difference IS the sleeve LTCG (nothing else changed)
    expect(untaxed.reTerminal - taxed.reTerminal).toBeCloseTo(taxed.reinvestSleeveLtcg, 2);
  });

  it("Pocket mode has no sleeve gain (no growth) ⇒ zero sleeve LTCG", () => {
    const out = compute({ ...lowLev(), rentalCashUse: "Pocket" });
    expect(out.reinvestSleeveLtcg).toBe(0);
  });
});
