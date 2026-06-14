/**
 * §4.6 — Reinvestment sleeve: route net rental cash per the `rentalCashUse` switch.
 *
 * Open question Q3 (recorded): the ReinvestEquity pot compounds ANNUALLY here, while
 * the Engine B SIP (§4.9) compounds MONTHLY. This asymmetry is intentional and
 * documented; it informs the T9 break-even tolerance. Do not "fix" without a decision.
 */

export type RentalCashUse = "ReinvestEquity" | "PrepayLoan" | "Pocket";

export interface ReinvestResult {
  /** Terminal value of the reinvestment pot at the end of the horizon. */
  reinvestPot: number;
  /** Pot value at the end of each year (index 1..N). */
  reinvestPotByYear: number[];
  /** Shortfall funded from pocket each year = max(−postTaxRentalCF, 0). Mirror to Engine B. */
  negCarryByYear: number[];
  /** For PrepayLoan: positive cash applied as extra year-end principal (by year). */
  prepayByYear: Record<number, number>;
}

/**
 * Compute the reinvestment sleeve from the per-year post-tax rental cash flow.
 * `postTaxRentalCF[t]` for t = 1..N (index 0 ignored).
 */
export function computeReinvest(
  mode: RentalCashUse,
  postTaxRentalCF: number[],
  equityCagrPct: number,
): ReinvestResult {
  const n = postTaxRentalCF.length - 1;
  const reinvestPotByYear = new Array<number>(n + 1).fill(0);
  const negCarryByYear = new Array<number>(n + 1).fill(0);
  const prepayByYear: Record<number, number> = {};

  let pot = 0;
  for (let t = 1; t <= n; t++) {
    const cf = postTaxRentalCF[t]!;
    const positive = Math.max(cf, 0);
    negCarryByYear[t] = Math.max(-cf, 0);

    if (mode === "ReinvestEquity") {
      pot = pot * (1 + equityCagrPct) + positive;
    } else if (mode === "Pocket") {
      pot = pot + positive; // cash, no growth
    } else {
      // PrepayLoan: apply positive cash as extra year-end principal; pot stays 0.
      if (positive > 0) prepayByYear[t] = positive;
      pot = 0;
    }
    reinvestPotByYear[t] = pot;
  }

  return { reinvestPot: pot, reinvestPotByYear, negCarryByYear, prepayByYear };
}
