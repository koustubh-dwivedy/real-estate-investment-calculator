/**
 * §4.2 — EMI & loan amortization (apartment single loan).
 *
 * Floating-rate behaviour: prepayments reduce the balance and SHORTEN the tenure
 * while the EMI stays fixed. Matches `reference/oracle.py::emi`.
 *
 * All money nominal; rates as decimals (7.5% => 0.075).
 */

/** Standard EMI. If the monthly rate is 0, EMI = principal / n (PRD §4.2). */
export function emi(principal: number, annualRate: number, years: number): number {
  const r = annualRate / 12;
  const n = years * 12;
  if (principal <= 0 || n <= 0) return 0;
  if (r === 0) return principal / n;
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

export interface MonthlyLoanRow {
  /** 1-based month index. */
  month: number;
  /** 1-based year index this month belongs to (ceil(month/12)). */
  year: number;
  emi: number;
  interest: number;
  principal: number;
  /** Extra principal applied at this month (year-end prepayments). */
  prepay: number;
  /** Balance after this month's principal + prepay. */
  balanceEnd: number;
}

export interface AmortizationResult {
  emi: number;
  monthly: MonthlyLoanRow[];
  /** Per-year (index 1..tenureYears) aggregates. Index 0 is unused (0s). */
  interestPaid: number[];
  principalPaid: number[];
  emiAnnual: number[];
  prepayAnnual: number[];
  /** Balance at the end of each year, index 0 = opening principal. */
  balanceEnd: number[];
  /** 1-based month in which the loan was fully paid off (0 if never within tenure). */
  payoffMonth: number;
}

export interface AmortizeParams {
  principal: number;
  annualRate: number;
  tenureYears: number;
  /** Flat extra principal applied every year-end (default 0). */
  prepaymentAnnual?: number;
  /** Additional year-end extra principal by 1-based year (e.g. rental prepay, §4.6). */
  extraPrincipalByYear?: Record<number, number>;
  /** Number of years to lay out aggregate arrays over (defaults to tenureYears). */
  horizonYears?: number;
  /**
   * First month the loan amortizes (1-based). Used by the plot composite loan,
   * which begins amortizing only after the construction window (PRD §4.11).
   * Months before this carry the existing balance untouched.
   */
  startMonth?: number;
}

const EPS = 1e-6;

/**
 * Amortize a loan month-by-month with fixed EMI and tenure-shortening prepayments.
 * The EMI is computed from the original principal/rate/tenure and held constant.
 */
export function amortize(params: AmortizeParams): AmortizationResult {
  const {
    principal,
    annualRate,
    tenureYears,
    prepaymentAnnual = 0,
    extraPrincipalByYear = {},
    horizonYears = tenureYears,
    startMonth = 1,
  } = params;

  const r = annualRate / 12;
  const scheduledEmi = emi(principal, annualRate, tenureYears);

  const monthly: MonthlyLoanRow[] = [];
  const interestPaid = new Array<number>(horizonYears + 1).fill(0);
  const principalPaid = new Array<number>(horizonYears + 1).fill(0);
  const emiAnnual = new Array<number>(horizonYears + 1).fill(0);
  const prepayAnnual = new Array<number>(horizonYears + 1).fill(0);
  const balanceEnd = new Array<number>(horizonYears + 1).fill(0);
  balanceEnd[0] = principal;

  let balance = principal;
  let payoffMonth = 0;
  const totalMonths = horizonYears * 12;

  for (let month = 1; month <= totalMonths; month++) {
    const year = Math.ceil(month / 12);
    let interest = 0;
    let principalComponent = 0;
    let emiThis = 0;
    let prepay = 0;

    if (balance > EPS && month >= startMonth) {
      interest = balance * r;
      // Final EMI may be smaller than the scheduled EMI if the balance is nearly cleared.
      const due = Math.min(scheduledEmi, balance + interest);
      emiThis = due;
      principalComponent = due - interest;
      balance -= principalComponent;

      // Year-end prepayments shorten the tenure (EMI stays fixed).
      if (month % 12 === 0 && balance > EPS) {
        const extra = prepaymentAnnual + (extraPrincipalByYear[year] ?? 0);
        if (extra > 0) {
          prepay = Math.min(extra, balance);
          balance -= prepay;
        }
      }

      if (balance <= EPS) {
        balance = 0;
        if (payoffMonth === 0) payoffMonth = month;
      }
    }

    monthly.push({
      month,
      year,
      emi: emiThis,
      interest,
      principal: principalComponent,
      prepay,
      balanceEnd: balance,
    });

    if (year <= horizonYears) {
      interestPaid[year] = (interestPaid[year] ?? 0) + interest;
      principalPaid[year] = (principalPaid[year] ?? 0) + principalComponent + prepay;
      emiAnnual[year] = (emiAnnual[year] ?? 0) + emiThis;
      prepayAnnual[year] = (prepayAnnual[year] ?? 0) + prepay;
      balanceEnd[year] = balance;
    }
  }

  return {
    emi: scheduledEmi,
    monthly,
    interestPaid,
    principalPaid,
    emiAnnual,
    prepayAnnual,
    balanceEnd,
    payoffMonth,
  };
}
