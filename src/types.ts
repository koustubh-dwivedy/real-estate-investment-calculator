/**
 * Core domain types (PRD §3, §5).
 *
 * Conventions (PRD §0): all money NOMINAL unless a field is labelled `real`.
 * Rates are decimals (7.5% => 0.075). `t` = hold-year 1..20; `m` = month.
 */

import type { InfraBump } from "./engine/valueStack";
import type { MaintenanceMode, UsageMode, TaxRegime } from "./engine/opexTax";
import type { RentalCashUse } from "./engine/reinvest";

export type { MaintenanceMode, UsageMode, TaxRegime, RentalCashUse, InfraBump };

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

export type SurchargeCess = "none" | "cess" | "surcharge";
export type CompareMode = "SameCashSIP" | "LumpsumOnly";
export type ConstructionFinancing = "CompositeLoan" | "OwnFunds";

export interface Inputs {
  // ---- A. Property, area & acquisition type ----
  geography: Geography;
  acquisitionType: AcquisitionType;
  assetType: AssetType;
  sbua: number;
  udsSqft: number;
  ageAtPurchaseYears: number;
  /** Apartment acquisition price (ex stamp/reg/GST). For PlotSelfBuild = plot price only. */
  purchasePriceAllIn: number;

  // ---- B. Rent & rent growth ----
  // NOTE: the rentGrowth* bands are the step applied PER AGREEMENT TERM (not per year):
  // rent is flat within a lease and jumps by this fraction at each renewal. See rent.ts.
  rentPerMonth0: number;
  rentGrowthY1_5: number;
  rentGrowthY6_10: number;
  rentGrowthY11_20: number;
  /** Years 21–30 rent step per term (30-year horizon); defaults to rentGrowthY11_20. */
  rentGrowthY21_30: number;
  cohortDragPct: number;
  vacancyPct: number;
  reLetBrokerageMonths: number;
  /** Lease term in months (11 common in India, or 12); rent steps once per term. */
  rentAgreementMonths: number;
  usageMode: UsageMode;

  // ---- Rent-vs-Buy (renting alternative; used only by rentVsBuy, not compute) ----
  /** Rent you'd pay for an equivalent home if you rent instead of buy (₹/month). */
  altRentPerMonth0: number;
  /** Annual escalation of that rent. */
  altRentGrowthPct: number;
  /** Security deposit in months of rent (set aside at t0, returned at exit). */
  securityDepositMonths: number;
  /** Brokerage + moving cost per lease renewal, in months of rent. */
  renewalCostMonths: number;
  /** Years between lease renewals (renewal cost recurs on this cycle). */
  renewalCycleYears: number;

  // ---- C. Entry costs (t=0) ----
  stampDutyRegPct: number;
  gstPct: number;
  brokerageBuyPct: number;
  otherAcquisitionCostsAbs: number;
  interiorsCapex0: number;

  // ---- D. Appreciation engine ----
  landRate0: number;
  landCagrY1_10: number;
  landCagrY11_20: number;
  /** Years 21–30 land CAGR (30-year horizon); defaults to landCagrY11_20. */
  landCagrY21_30: number;
  replacementCost0: number;
  constructionInflationPct: number;
  physicalDepRatePct: number;
  economicDepRatePct: number;
  salvageFloor: number;
  premium0: number;
  premiumDecayYears: number;
  infraBumps: InfraBump[];

  // ---- E. Maintenance, CAM & property tax ----
  maintenanceMode: MaintenanceMode;
  societyCamPerSqftMonth0: number;
  ownerMaintPctOfRent: number;
  ownerMaintPctOfValue: number;
  camEscalationPct: number;
  maintenanceAgeAccelPct: number;
  propertyTaxAnnual0: number;
  propertyTaxGrowthPct: number;
  waterTaxAnnual0: number;
  waterTaxGrowthPct: number;
  majorRepairReservePctOfValue: number;
  interiorRefreshCycleYears: number;
  interiorRefreshPctOfInitial: number;

  // ---- F. Financing — apartment ----
  loanAmount: number;
  loanRatePct: number;
  loanTenureYears: number;
  prepaymentAnnual: number;

  // ---- G. Switches ----
  rentalCashUse: RentalCashUse;
  taxRegime: TaxRegime;
  compareMode: CompareMode;

  // ---- H. Tax & market ----
  marginalTaxPct: number;
  surchargeCess: SurchargeCess;
  ltcgPropertyPct: number;
  ltcgEquityPct: number;
  equityLtcgExemptionAnnual: number;
  equityCagrPct: number;
  cpiPct: number;
  sellingCostPct: number;
  liquidityHaircutPct: number;

  // ---- D'. Redevelopment ----
  redevelopmentEnabled: boolean;
  redevEligibleAgeYears: number;
  redevOptionValuePctOfLand: number;

  // ---- I. Plot self-build module ----
  plotAreaSqft: number;
  floors: number;
  farBuildableRatio: number;
  builtUpAreaSqft: number; // 0 => derive from plotArea*far
  constructionRatePerSqft: number;
  constructionSoftCostsPct: number;
  constructionContingencyPct: number;
  constructionMonths: number;
  constructionFinancing: ConstructionFinancing;
  landLoanAmount: number;
  constructionLoanAmount: number;
  plotLoanRatePct: number;
  constructionLoanRatePct: number;
  compositeLoanTenureYears: number;
  preEMIduringConstruction: boolean;

  // ---- horizon ----
  holdYears: number;
}

/** One row of the per-period schedule (§6A). Produced by compute(); read by the table. */
export interface PeriodRow {
  year: number;
  // value stack
  landValue: number;
  structureValue: number;
  premiumValue: number;
  redevOptionValue: number;
  propValueGross: number;
  landSharePct: number;
  replacementCostPerSqft: number;
  depFactor: number;
  // loan
  emiAnnual: number;
  interestPaid: number;
  principalPaid: number;
  loanBalanceEnd: number;
  prepayment: number;
  // income & opex
  marketRent: number;
  grossRentCollected: number;
  societyCAM: number;
  ownerMaintenance: number;
  waterTax: number;
  interiorRefresh: number;
  majorRepairReserve: number;
  propertyTax: number;
  noi: number;
  postTaxRentalCF: number;
  // tax & reinvest
  taxableHP: number;
  rentalTaxOrShield: number;
  carryForwardLossBalance: number;
  reinvestPot: number;
  // equity benchmark & net worth
  equityPot: number;
  cumOwnCashOutA: number;
  cumContribB: number;
  cashConservationCheck: number;
  reNetWorth: number;
  equityNetWorth: number;
  netWorthGap: number;
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
  // exit waterfall (terminal row)
  exitGross: number;
  sellCosts: number;
  ltcgProperty: number;
  /** Equity LTCG paid on the reinvest sleeve at exit (0 for Pocket / empty pot). §4.7 F1. */
  reinvestSleeveLtcg: number;
  loanPayoff: number;
  netSaleProceeds: number;
  rows: PeriodRow[];
}
