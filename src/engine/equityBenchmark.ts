/**
 * §4.9 — Engine B: the fair, same-cash equity benchmark.
 *
 * Engine B invests EXACTLY the cash Engine A consumes, on the same dates — the t0
 * own-pocket, plus (during a plot build) own-pocket construction draws + pre-EMI,
 * plus every EMI as a monthly SIP, plus any negative-carry funded from pocket.
 *
 * To make cash conservation (§6A col 37) hold BY CONSTRUCTION, the caller builds one
 * canonical `ownCashOutByMonth` stream that is Engine A's own-cash outflow timeline,
 * and Engine B invests precisely that. Open question Q2: only OWN-POCKET construction
 * outflow is in this stream — loan-funded draws are debt, not investor cash.
 */

export interface EquityBenchmarkParams {
  /**
   * Own-cash outflow by month. Index 0 = t0 lump (invested at t0, grows the full
   * horizon); index m (1..M) = cash invested at the end of month m.
   */
  ownCashOutByMonth: number[];
  equityCagrPct: number;
  ltcgEquityPct: number;
  equityLtcgExemptionAnnual: number;
}

export interface EquityBenchmarkResult {
  eqTerminal: number;
  bPot: number;
  totalContribB: number;
  bGain: number;
  bLtcg: number;
  /** Pot value after each month (index 0..M). */
  potByMonth: number[];
  /** Cumulative contributions after each month (index 0..M) — the col-37 numerator. */
  cumContribByMonth: number[];
}

export function computeEquityBenchmark(p: EquityBenchmarkParams): EquityBenchmarkResult {
  const monthlyGrowth = Math.pow(1 + p.equityCagrPct, 1 / 12);
  const M = p.ownCashOutByMonth.length - 1;

  const potByMonth = new Array<number>(M + 1).fill(0);
  const cumContribByMonth = new Array<number>(M + 1).fill(0);

  let bPot = 0;
  let totalContrib = 0;
  for (let m = 0; m <= M; m++) {
    if (m > 0) bPot *= monthlyGrowth;
    const contrib = p.ownCashOutByMonth[m] ?? 0;
    bPot += contrib;
    totalContrib += contrib;
    potByMonth[m] = bPot;
    cumContribByMonth[m] = totalContrib;
  }

  const bGain = bPot - totalContrib;
  const bLtcg = Math.max(bGain - p.equityLtcgExemptionAnnual, 0) * p.ltcgEquityPct;
  const eqTerminal = bPot - bLtcg;

  return {
    eqTerminal,
    bPot,
    totalContribB: totalContrib,
    bGain,
    bLtcg,
    potByMonth,
    cumContribByMonth,
  };
}
