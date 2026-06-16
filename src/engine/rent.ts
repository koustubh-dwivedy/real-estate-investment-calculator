/**
 * §4.3 — Rent path (realized rent for this asset), MONTHLY and per-agreement-term.
 *
 * Phased market growth with a post-year-10 cohort drag. Matches
 * `reference/oracle.py::rent_monthly_path`. Rates as decimals.
 *
 * Rent is FLAT within an agreement term and steps by (1 + g_real) at each renewal —
 * NOT a smooth yearly escalation. The term is the lease length in months
 * (`rentAgreementMonths`, India: 11 is common; 12 = a calendar lease). So with a 10%
 * input and an 11-month term, the rent holds for 11 months and then jumps 10%. The
 * growth rate applied at a renewal is the phase rate (minus cohort drag) in effect at
 * the hold-year in which that term expires.
 *
 * For PlotSelfBuild the path is indexed from completion (tC); the caller zeroes the
 * construction window and places this path on the calendar (PRD §4.3, §4.11).
 */

export interface RentGrowth {
  y1_5: number;
  y6_10: number;
  y11_20: number;
  /** Years 21–30 growth (30-year horizon). Defaults to y11_20 when omitted. */
  y21_30?: number;
  /** Cohort drag (p.a.) subtracted from market growth after year 10. */
  cohortDrag: number;
}

/** g_market(t): phased market growth by hold-year t (1-based). */
export function gMarket(t: number, g: RentGrowth): number {
  if (t <= 5) return g.y1_5;
  if (t <= 10) return g.y6_10;
  if (t <= 20) return g.y11_20;
  return g.y21_30 ?? g.y11_20;
}

/** drag(t) = 0 for t<=10 ; cohortDrag * min((t-10)/5, 1) for t>10. */
export function drag(t: number, cohortDrag: number): number {
  if (t <= 10) return 0;
  return cohortDrag * Math.min((t - 10) / 5, 1);
}

/**
 * Monthly rent indexed by hold-month. Returns an array of length `holdMonths + 1`,
 * where index 0 = rentPerMonth0 (the signed rate) and index m = the monthly rent in
 * hold-month m (1..holdMonths). Rent is flat within a term and steps at each renewal:
 *
 *   renewal takes effect at hold-month m when (m-1) % termMonths === 0 and m > 1
 *   step factor = 1 + (gMarket(y) − drag(y)),  y = ceil((m-1)/12)  (the expiring year)
 *
 * termMonths defaults to 12 (a renewal every 12 months → a step at month 13, 25, …).
 */
export function rentMonthlyPath(
  rentPerMonth0: number,
  g: RentGrowth,
  holdMonths: number,
  termMonths = 12,
): number[] {
  const term = termMonths > 0 ? termMonths : 12;
  const out = new Array<number>(holdMonths + 1);
  out[0] = rentPerMonth0;
  let rent = rentPerMonth0;
  for (let m = 1; m <= holdMonths; m++) {
    if (m > 1 && (m - 1) % term === 0) {
      const y = Math.ceil((m - 1) / 12);
      rent *= 1 + (gMarket(y, g) - drag(y, g.cohortDrag));
    }
    out[m] = rent;
  }
  return out;
}

/**
 * Aggregate a monthly rent path into realized ANNUAL rent per hold-year — the sum of
 * the 12 monthly rents in each year. Index 0 = 0; index t (1..N) = Σ months (t-1)*12+1..t*12.
 * Used for the §6A market-rent column and the tax NAV (which is a financial-year figure).
 */
export function annualizeRent(monthly: number[], years: number): number[] {
  const out = new Array<number>(years + 1).fill(0);
  for (let t = 1; t <= years; t++) {
    let sum = 0;
    for (let k = 1; k <= 12; k++) sum += monthly[(t - 1) * 12 + k] ?? 0;
    out[t] = sum;
  }
  return out;
}
