/**
 * Core domain types for the calculator.
 *
 * These are intentionally minimal stubs for the scaffold. They are fleshed out in
 * issue "Domain types + validated defaults loader" (PRD §3, §5). Keeping them here
 * anchors the module layout so engine modules can import from one place.
 *
 * Conventions (PRD §0): all money in NOMINAL terms unless a field is labelled `real`.
 * Rates are decimals (7.5% => 0.075). `t` = year 1..20; `m` = month 1..240.
 */

export type Geography = "Bangalore" | "Mumbai" | "NewYork" | "SanFrancisco";

export type AcquisitionType =
  | "ReadyApartment"
  | "UnderConstructionApartment"
  | "PlotSelfBuild";

export type AssetType =
  | "LandPlot"
  | "PlottedDevelopmentVilla"
  | "StandaloneApartment"
  | "MidRiseSociety"
  | "HighRiseSociety";

/** Full input set — defined in detail in the domain-types issue. */
export interface Inputs {
  geography: Geography;
  acquisitionType: AcquisitionType;
  assetType: AssetType;
  // ...all §3 fields added in the domain-types issue.
  [key: string]: unknown;
}

/** One row of the per-period schedule (§6A). The engine emits an array of these. */
export interface PeriodRow {
  /** Month index 1..240 (0 = t0). */
  month: number;
  /** Year index 0..20. */
  year: number;
  // ...all §6A columns added per the schedule-table issue.
  [key: string]: unknown;
}

/** Headline outputs (§4.10, §6). */
export interface Outputs {
  reTerminal: number;
  eqTerminal: number;
  gap: number;
  reXirr: number;
  eqXirr: number;
  reMultiple: number;
  breakevenLandCagr: number;
  realReTerminal: number;
  rows: PeriodRow[];
}
