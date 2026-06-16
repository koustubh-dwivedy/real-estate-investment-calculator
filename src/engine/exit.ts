/**
 * §4.7 — Exit at the end of the hold (terminal property net worth).
 *
 *   exitGross       = propValueClean(N) * (1 - liquidityHaircutPct)
 *   sellCosts       = exitGross * sellingCostPct
 *   costBasis       = purchasePriceAllIn + entryCosts + totalConstructionCost (plot)
 *   capGain         = exitGross - sellCosts - costBasis
 *   ltcg            = max(capGain, 0) * ltcgPropertyPct
 *   netSaleProceeds = exitGross - sellCosts - ltcg - balanceEnd(N)
 *   RE_terminal     = netSaleProceeds + reinvestPot - reinvestSleeveLtcg
 *
 * The reinvest sleeve (ReinvestEquity / PrepayLoan leftover) is the SAME equity index as
 * Engine B, so at liquidation it pays equity LTCG on its gain with the ₹1.25L exemption,
 * exactly as Engine B does (§4.9). This keeps the two equity pools symmetric (audit F1).
 * Pocket mode has no growth (gain 0) ⇒ no sleeve LTCG. Mark-to-market per-year reinvestPot
 * columns stay gross; only this terminal liquidation nets the tax.
 *
 * No indexation (post-2024): basis affects the gain only, not inflation indexing.
 */

export interface ExitParams {
  propValueCleanFinal: number;
  liquidityHaircutPct: number;
  sellingCostPct: number;
  purchasePriceAllIn: number;
  entryCosts: number;
  /** Capitalized construction cost (PlotSelfBuild); 0 otherwise. */
  totalConstructionCost: number;
  ltcgPropertyPct: number;
  /** Outstanding loan balance at exit. */
  balanceEndFinal: number;
  /** Terminal (gross) value of the reinvest sleeve. */
  reinvestPot: number;
  /** Cost basis of the reinvest sleeve (Σ contributions) — for its equity LTCG. */
  reinvestContrib: number;
  /** Equity LTCG rate applied to the sleeve gain (same as Engine B). */
  ltcgEquityPct: number;
  /** Annual equity LTCG exemption (₹1.25L) applied once to the sleeve gain at exit. */
  equityLtcgExemptionAnnual: number;
}

export interface ExitResult {
  exitGross: number;
  sellCosts: number;
  costBasis: number;
  capGain: number;
  ltcg: number;
  netSaleProceeds: number;
  /** Equity LTCG paid on the reinvest sleeve's gain at exit (0 for Pocket / empty pot). */
  reinvestSleeveLtcg: number;
  reTerminal: number;
}

export function computeExit(p: ExitParams): ExitResult {
  const exitGross = p.propValueCleanFinal * (1 - p.liquidityHaircutPct);
  const sellCosts = exitGross * p.sellingCostPct;
  const costBasis = p.purchasePriceAllIn + p.entryCosts + p.totalConstructionCost;
  const capGain = exitGross - sellCosts - costBasis;
  const ltcg = Math.max(capGain, 0) * p.ltcgPropertyPct;
  const netSaleProceeds = exitGross - sellCosts - ltcg - p.balanceEndFinal;
  // Equity LTCG on the reinvest sleeve (its gain above the exemption), mirroring Engine B.
  const sleeveGain = p.reinvestPot - p.reinvestContrib;
  const reinvestSleeveLtcg = Math.max(sleeveGain - p.equityLtcgExemptionAnnual, 0) * p.ltcgEquityPct;
  const reTerminal = netSaleProceeds + p.reinvestPot - reinvestSleeveLtcg;
  return { exitGross, sellCosts, costBasis, capGain, ltcg, netSaleProceeds, reinvestSleeveLtcg, reTerminal };
}
