/**
 * §4.7 — Exit at the end of the hold (terminal property net worth).
 *
 *   exitGross       = propValueClean(N) * (1 - liquidityHaircutPct)
 *   sellCosts       = exitGross * sellingCostPct
 *   costBasis       = purchasePriceAllIn + entryCosts + totalConstructionCost (plot)
 *   capGain         = exitGross - sellCosts - costBasis
 *   ltcg            = max(capGain, 0) * ltcgPropertyPct
 *   netSaleProceeds = exitGross - sellCosts - ltcg - balanceEnd(N)
 *   RE_terminal     = netSaleProceeds + reinvestPot
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
  reinvestPot: number;
}

export interface ExitResult {
  exitGross: number;
  sellCosts: number;
  costBasis: number;
  capGain: number;
  ltcg: number;
  netSaleProceeds: number;
  reTerminal: number;
}

export function computeExit(p: ExitParams): ExitResult {
  const exitGross = p.propValueCleanFinal * (1 - p.liquidityHaircutPct);
  const sellCosts = exitGross * p.sellingCostPct;
  const costBasis = p.purchasePriceAllIn + p.entryCosts + p.totalConstructionCost;
  const capGain = exitGross - sellCosts - costBasis;
  const ltcg = Math.max(capGain, 0) * p.ltcgPropertyPct;
  const netSaleProceeds = exitGross - sellCosts - ltcg - p.balanceEndFinal;
  const reTerminal = netSaleProceeds + p.reinvestPot;
  return { exitGross, sellCosts, costBasis, capGain, ltcg, netSaleProceeds, reTerminal };
}
