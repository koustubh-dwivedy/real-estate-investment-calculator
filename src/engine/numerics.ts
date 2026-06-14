/**
 * §4.10 — Numerics: XIRR (NPV root via bisection) and a generic bisection solver.
 *
 * XIRR is computed on dated cash flows where time is expressed in YEARS (fractional
 * allowed, e.g. month m → m/12). Matches reference/oracle.py::xirr_annual.
 */

export interface DatedCashflow {
  /** Time in years from t0 (fractional allowed). */
  year: number;
  amount: number;
}

/** NPV of dated cash flows at an annual rate. */
export function npv(rate: number, cashflows: DatedCashflow[]): number {
  let acc = 0;
  for (const cf of cashflows) {
    acc += cf.amount / Math.pow(1 + rate, cf.year);
  }
  return acc;
}

export interface XirrOptions {
  lo?: number;
  hi?: number;
  tol?: number;
  maxIter?: number;
}

/**
 * Annual XIRR by bisection on NPV = 0. Returns NaN if the sign does not bracket a
 * root in [lo, hi] (e.g. all-positive or all-negative flows).
 */
export function xirr(cashflows: DatedCashflow[], opts: XirrOptions = {}): number {
  const { tol = 1e-9, maxIter = 200 } = opts;
  let lo = opts.lo ?? -0.999999;
  let hi = opts.hi ?? 10;

  let flo = npv(lo, cashflows);
  let fhi = npv(hi, cashflows);
  if (Number.isNaN(flo) || Number.isNaN(fhi) || flo * fhi > 0) return NaN;

  for (let i = 0; i < maxIter; i++) {
    const mid = (lo + hi) / 2;
    const fmid = npv(mid, cashflows);
    if (Math.abs(fmid) < tol || (hi - lo) / 2 < tol) return mid;
    if (flo * fmid < 0) {
      hi = mid;
      fhi = fmid;
    } else {
      lo = mid;
      flo = fmid;
    }
  }
  return (lo + hi) / 2;
}

/**
 * Generic bisection: find x in [lo, hi] with f(x) ≈ 0. Assumes f(lo), f(hi) bracket
 * a root. Returns NaN if they do not. Used for the breakeven-land-CAGR solve (§4.10).
 */
export function bisect(
  f: (x: number) => number,
  lo: number,
  hi: number,
  tol = 1e-7,
  maxIter = 200,
): number {
  let flo = f(lo);
  let fhi = f(hi);
  if (Number.isNaN(flo) || Number.isNaN(fhi) || flo * fhi > 0) return NaN;
  for (let i = 0; i < maxIter; i++) {
    const mid = (lo + hi) / 2;
    const fmid = f(mid);
    if (Math.abs(fmid) < tol || (hi - lo) / 2 < tol) return mid;
    if (flo * fmid < 0) {
      hi = mid;
      fhi = fmid;
    } else {
      lo = mid;
      flo = fmid;
    }
  }
  return (lo + hi) / 2;
}
