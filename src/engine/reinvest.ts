/**
 * §4.6 — Reinvestment sleeve: route net rental cash per the `rentalCashUse` switch.
 *
 * MONTHLY model: the net rental cash flow arrives per hold-month. Surplus months feed
 * the sleeve, deficit months feed Engine B (negative carry). The ReinvestEquity sleeve
 * compounds MONTHLY at (1+cagr)^(1/12) — the SAME index/cadence as Engine B (§4.9), so
 * the two equity pools are symmetric (audit B2). PrepayLoan still applies surplus as a
 * YEAR-END principal lump (matching the loan product), so its monthly surplus is
 * aggregated by year for the amortizer.
 */

export type RentalCashUse = "ReinvestEquity" | "PrepayLoan" | "Pocket";

export interface ReinvestResult {
  /** Terminal value of the reinvestment pot at the end of the horizon. */
  reinvestPot: number;
  /**
   * Cost basis of the pot = Σ of the positive monthly net rental cash actually added.
   * The sleeve's taxable gain at exit is reinvestPot − reinvestContrib (ReinvestEquity:
   * the pot grew at equityCagr; Pocket: no growth → contrib == pot → gain 0). §4.7.
   */
  reinvestContrib: number;
  /** Pot value at the end of each hold-month (index 1..M). */
  reinvestPotByMonth: number[];
  /** Shortfall funded from pocket each hold-month = max(−cf_m, 0). Mirror to Engine B. */
  negCarryByMonth: number[];
  /** For PrepayLoan: positive cash applied as extra year-end principal (by hold-year). */
  prepayByYear: Record<number, number>;
}

/**
 * Compute the reinvestment sleeve from the per-hold-month net rental cash flow.
 * `monthlyCF[m]` for m = 1..M (index 0 ignored). `monthlyCF` already nets EMI and the
 * (year-end) tax settlement — see compute.ts.
 */
export function computeReinvest(
  mode: RentalCashUse,
  monthlyCF: number[],
  equityCagrPct: number,
): ReinvestResult {
  const M = monthlyCF.length - 1;
  const monthlyGrowth = Math.pow(1 + equityCagrPct, 1 / 12);
  const reinvestPotByMonth = new Array<number>(M + 1).fill(0);
  const negCarryByMonth = new Array<number>(M + 1).fill(0);
  const prepayByYear: Record<number, number> = {};

  let pot = 0;
  let reinvestContrib = 0;
  for (let m = 1; m <= M; m++) {
    const cf = monthlyCF[m]!;
    const positive = Math.max(cf, 0);
    negCarryByMonth[m] = Math.max(-cf, 0);

    // Cost basis for the equity sleeves (ReinvestEquity grows the pot; Pocket just
    // accumulates). PrepayLoan routes positive cash to principal, so its leftover sleeve
    // basis is tracked by the caller (compute.ts), not here.
    if (mode !== "PrepayLoan") reinvestContrib += positive;

    if (mode === "ReinvestEquity") {
      pot = pot * monthlyGrowth + positive;
    } else if (mode === "Pocket") {
      pot = pot + positive; // cash, no growth
    } else {
      // PrepayLoan: accumulate positive cash to a year-end principal lump; pot stays 0.
      if (positive > 0) {
        const year = Math.ceil(m / 12);
        prepayByYear[year] = (prepayByYear[year] ?? 0) + positive;
      }
      pot = 0;
    }
    reinvestPotByMonth[m] = pot;
  }

  return { reinvestPot: pot, reinvestContrib, reinvestPotByMonth, negCarryByMonth, prepayByYear };
}
