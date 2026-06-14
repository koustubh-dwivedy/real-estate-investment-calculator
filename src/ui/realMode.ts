/**
 * Display-only nominal ⇄ real (today's money) conversion.
 *
 * The engine is entirely nominal. The UI optionally expresses figures in today's
 * money by deflating each rupee amount by (1+cpi)^t for the hold-year t it occurs
 * (matching the engine's existing `realReTerminal = reTerminal/(1+cpi)^holdYears`).
 * Reference point = start of the hold (purchase for an apartment; completion for a
 * plot build). Nothing here changes the engine or any golden value.
 */

export type DisplayMode = "nominal" | "real";

/** Deflate a nominal rupee amount occurring at hold-year `year` to today's money. */
export function deflate(amount: number, year: number, cpi: number): number {
  return amount / Math.pow(1 + cpi, year);
}

/** Convert a nominal annual rate to a real (inflation-adjusted) rate. */
export function realRate(nominal: number, cpi: number): number {
  return (1 + nominal) / (1 + cpi) - 1;
}

/** Apply deflation only in real mode; identity in nominal mode. */
export function asMode(amount: number, year: number, cpi: number, mode: DisplayMode): number {
  return mode === "real" ? deflate(amount, year, cpi) : amount;
}
