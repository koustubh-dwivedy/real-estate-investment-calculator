/**
 * §4.3 — Rent path (realized annual rent for this asset).
 *
 * Phased market growth with a post-year-10 cohort drag. Matches
 * `reference/oracle.py::rent_path`. Rates as decimals.
 *
 * For PlotSelfBuild the path is indexed from completion (tC); the caller zeroes
 * the construction window and places this path on the calendar (PRD §4.3, §4.11).
 */

export interface RentGrowth {
  y1_5: number;
  y6_10: number;
  y11_20: number;
  /** Cohort drag (p.a.) subtracted from market growth after year 10. */
  cohortDrag: number;
}

/** g_market(t): phased market growth by hold-year t (1-based). */
export function gMarket(t: number, g: RentGrowth): number {
  if (t <= 5) return g.y1_5;
  if (t <= 10) return g.y6_10;
  return g.y11_20;
}

/** drag(t) = 0 for t<=10 ; cohortDrag * min((t-10)/5, 1) for t>10. */
export function drag(t: number, cohortDrag: number): number {
  if (t <= 10) return 0;
  return cohortDrag * Math.min((t - 10) / 5, 1);
}

/**
 * Annual rent path indexed by hold-year. Returns an array of length `years + 1`,
 * where index 0 = rent_annual(0) = rentPerMonth0 * 12, and index t = rent_annual(t).
 *
 *   rent_annual(t) = rent_annual(t-1) * (1 + g_market(t) - drag(t))
 */
export function rentPath(
  rentPerMonth0: number,
  g: RentGrowth,
  years = 20,
): number[] {
  const out = new Array<number>(years + 1);
  out[0] = rentPerMonth0 * 12;
  for (let t = 1; t <= years; t++) {
    const gReal = gMarket(t, g) - drag(t, g.cohortDrag);
    out[t] = out[t - 1]! * (1 + gReal);
  }
  return out;
}
