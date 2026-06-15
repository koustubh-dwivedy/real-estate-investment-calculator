/**
 * Tornado / sensitivity analysis for the results panel.
 *
 * For each high-impact assumption, vary it ±stress on its own (everything else
 * fixed), recompute, and measure how far the decision number — the gap = RE terminal
 * − Equity terminal — moves. Drivers are acquisition-aware so each lever is the one
 * that actually bites (e.g. plots use the plot loan rates, not the inert loanRatePct).
 */
import type { Inputs } from "../types";
import { compute } from "../engine/compute";

export interface DriverDef {
  keys: (keyof Inputs)[];
  label: string;
  kind: "pct" | "money" | "number";
}

export interface SensBar {
  label: string;
  kind: DriverDef["kind"];
  /** Representative base value of the driver's first key (for the range hint). */
  baseValue: number;
  loValue: number;
  hiValue: number;
  /** Absolute gap (nominal) at the low/high stress ends. */
  gapLo: number;
  gapHi: number;
  /** Gap deltas vs base; low = min, high = max (so the bar spans [low, high]). */
  low: number;
  high: number;
  span: number;
  /** True if a higher input value raises the gap (favours real estate). */
  higherRaisesGap: boolean;
}

/** The driver set for the current scenario (apartment vs plot variants). */
export function getDrivers(inputs: Inputs): DriverDef[] {
  const isPlot = inputs.acquisitionType === "PlotSelfBuild";
  const drivers: DriverDef[] = [
    { keys: ["landCagrY1_10", "landCagrY11_20"], label: "Land CAGR", kind: "pct" },
    { keys: ["equityCagrPct"], label: "Equity CAGR", kind: "pct" },
    {
      keys: isPlot ? ["plotLoanRatePct", "constructionLoanRatePct"] : ["loanRatePct"],
      label: "Loan rate",
      kind: "pct",
    },
    {
      keys: ["rentGrowthY1_5", "rentGrowthY6_10", "rentGrowthY11_20"],
      label: "Rent growth",
      kind: "pct",
    },
    { keys: ["rentPerMonth0"], label: "Starting rent", kind: "money" },
    { keys: ["economicDepRatePct"], label: "Economic depreciation", kind: "pct" },
    {
      keys: isPlot ? ["landRate0"] : ["purchasePriceAllIn"],
      label: isPlot ? "Land price/sqft" : "Purchase price",
      kind: "money",
    },
    {
      keys: isPlot ? ["landLoanAmount", "constructionLoanAmount"] : ["loanAmount"],
      label: "Loan amount (leverage)",
      kind: "money",
    },
    { keys: ["prepaymentAnnual"], label: "Prepayment / year", kind: "money" },
    { keys: ["sellingCostPct", "liquidityHaircutPct"], label: "Exit costs", kind: "pct" },
  ];
  if (isPlot) {
    drivers.push(
      { keys: ["constructionRatePerSqft"], label: "Construction rate", kind: "money" },
      { keys: ["constructionMonths"], label: "Construction duration", kind: "number" },
    );
  }
  return drivers;
}

function perturb(inputs: Inputs, keys: (keyof Inputs)[], factor: number): Inputs {
  const next = { ...inputs };
  for (const k of keys) (next[k] as number) = (inputs[k] as number) * factor;
  return next;
}

/**
 * Compute the tornado bars: each driver stressed ±`stress` (e.g. 0.15). Drivers with
 * no effect at the current values (span < ₹1 — e.g. prepayment=0, plot economic-dep=0)
 * are filtered out. Sorted by span descending.
 */
export function computeSensitivity(inputs: Inputs, baseGap: number, stress: number): SensBar[] {
  const bars: SensBar[] = getDrivers(inputs).map((d) => {
    const gapLoRaw = compute(perturb(inputs, d.keys, 1 - stress), { skipBreakeven: true }).gap;
    const gapHiRaw = compute(perturb(inputs, d.keys, 1 + stress), { skipBreakeven: true }).gap;
    const dLo = gapLoRaw - baseGap;
    const dHi = gapHiRaw - baseGap;
    const firstKey = d.keys[0]!;
    const baseValue = inputs[firstKey] as number;
    return {
      label: d.label,
      kind: d.kind,
      baseValue,
      loValue: baseValue * (1 - stress),
      hiValue: baseValue * (1 + stress),
      gapLo: gapLoRaw,
      gapHi: gapHiRaw,
      low: Math.min(dLo, dHi),
      high: Math.max(dLo, dHi),
      span: Math.abs(dHi - dLo),
      higherRaisesGap: dHi >= dLo,
    };
  });
  return bars.filter((b) => b.span >= 1).sort((a, b) => b.span - a.span);
}
