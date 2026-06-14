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
  /** Years 21–30 growth (30-year horizon). Defaults to y11_20 when omitted. */
  y21_30?: number;
  /** Cohort drag (p.a.) subtracted from market growth after year 10. */
  cohortDrag: number;
  /**
   * Lease renewal cadence in months (India: 11-month agreements are common). The
   * per-renewal escalation compounds 12/renewalMonths times per calendar year, so
   * the effective annual growth is (1+g_real)^(12/renewalMonths). Defaults to 12
   * (→ exponent 1, identical to a plain annual escalation). Occupancy is unchanged.
   */
  renewalMonths?: number;
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
 * Annual rent path indexed by hold-year. Returns an array of length `years + 1`,
 * where index 0 = rent_annual(0) = rentPerMonth0 * 12, and index t = rent_annual(t).
 *
 *   rent_annual(t) = rent_annual(t-1) * (1 + g_real(t))^(12 / renewalMonths)
 *
 * where g_real(t) = gMarket(t) − drag(t). renewalMonths defaults to 12 (exponent 1).
 */
export function rentPath(
  rentPerMonth0: number,
  g: RentGrowth,
  years = 20,
): number[] {
  const renewalExp = 12 / (g.renewalMonths ?? 12);
  const out = new Array<number>(years + 1);
  out[0] = rentPerMonth0 * 12;
  for (let t = 1; t <= years; t++) {
    const gReal = gMarket(t, g) - drag(t, g.cohortDrag);
    out[t] = out[t - 1]! * Math.pow(1 + gReal, renewalExp);
  }
  return out;
}
