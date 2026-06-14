/**
 * Field metadata (PRD §3) for the input panel: labels, units, tooltips, and
 * conditional visibility by acquisitionType. Drives generic rendering.
 */
import type { Inputs, AcquisitionType } from "../types";

export type FieldKind = "money" | "pct" | "number" | "text";

export interface FieldDef {
  key: keyof Inputs;
  label: string;
  kind: FieldKind;
  tooltip: string;
  /** If set, only show for these acquisition types. */
  only?: AcquisitionType[];
}

export interface Section {
  id: string;
  title: string;
  fields: FieldDef[];
}

const PLOT: AcquisitionType[] = ["PlotSelfBuild"];

export const SECTIONS: Section[] = [
  {
    id: "property",
    title: "A · Property & area",
    fields: [
      { key: "sbua", label: "Super built-up area", kind: "number", tooltip: "SBUA in sq ft (apartment)." },
      { key: "carpetArea", label: "Carpet area", kind: "number", tooltip: "Carpet area in sq ft (display/sanity)." },
      { key: "udsSqft", label: "UDS (land share)", kind: "number", tooltip: "Undivided share of land in sq ft. For plots ≈ full plot area." },
      { key: "ageAtPurchaseYears", label: "Age at purchase (yrs)", kind: "number", tooltip: "Structure age at t=0 (0 for new build)." },
      { key: "purchasePriceAllIn", label: "Purchase price (all-in)", kind: "money", tooltip: "Apartment price ex stamp/reg/GST. For PlotSelfBuild = plot price only." },
    ],
  },
  {
    id: "rent",
    title: "B · Rent & growth",
    fields: [
      { key: "rentPerMonth0", label: "Starting rent / month", kind: "money", tooltip: "Market rent at t=0 (let case). For plots, rent at completion." },
      { key: "rentGrowthY1_5", label: "Rent growth Y1–5", kind: "pct", tooltip: "Annual market rent growth, years 1–5." },
      { key: "rentGrowthY6_10", label: "Rent growth Y6–10", kind: "pct", tooltip: "Annual market rent growth, years 6–10." },
      { key: "rentGrowthY11_20", label: "Rent growth Y11–20", kind: "pct", tooltip: "Annual market rent growth, years 11–20." },
      { key: "cohortDragPct", label: "Cohort drag", kind: "pct", tooltip: "Subtracted from market rent growth after year 10." },
      { key: "vacancyPct", label: "Vacancy", kind: "pct", tooltip: "% of annual rent lost to vacancy." },
      { key: "reLetBrokerageMonths", label: "Re-let brokerage (months)", kind: "number", tooltip: "Months of rent lost per re-let; annualized over 36." },
    ],
  },
  {
    id: "entry",
    title: "C · Entry costs (t=0)",
    fields: [
      { key: "stampDutyRegPct", label: "Stamp duty + reg", kind: "pct", tooltip: "% of price. Bangalore ~7% (2% reg since 31 Aug 2025)." },
      { key: "gstPct", label: "GST", kind: "pct", tooltip: "% — under-construction only; 0 if ready/OC." },
      { key: "brokerageBuyPct", label: "Buy brokerage", kind: "pct", tooltip: "% of price." },
      { key: "otherAcquisitionCostsAbs", label: "Other acquisition costs", kind: "money", tooltip: "Assessor + legal + documentation + mutation (abs)." },
      { key: "interiorsCapex0", label: "Interiors capex", kind: "money", tooltip: "Initial fit-out. For plots, this is the build's interiors." },
    ],
  },
  {
    id: "appreciation",
    title: "D · Appreciation engine",
    fields: [
      { key: "landRate0", label: "Land rate / sq ft (t0)", kind: "money", tooltip: "Land rate per sq ft at t=0." },
      { key: "landCagrY1_10", label: "Land CAGR Y1–10", kind: "pct", tooltip: "Annual land appreciation, years 1–10." },
      { key: "landCagrY11_20", label: "Land CAGR Y11–20", kind: "pct", tooltip: "Annual land appreciation, years 11–20." },
      { key: "replacementCost0", label: "Replacement cost / sq ft", kind: "money", tooltip: "Cost to rebuild structure per sq ft (t0)." },
      { key: "constructionInflationPct", label: "Construction inflation", kind: "pct", tooltip: "Annual rebuild-cost inflation." },
      { key: "physicalDepRatePct", label: "Physical depreciation", kind: "pct", tooltip: "SLM physical depreciation rate p.a." },
      { key: "economicDepRatePct", label: "Economic depreciation", kind: "pct", tooltip: "Obsolescence on top of physical." },
      { key: "salvageFloor", label: "Salvage floor", kind: "number", tooltip: "Minimum depreciation factor (fraction of new)." },
      { key: "premium0", label: "Newness premium / sq ft", kind: "money", tooltip: "Brand/newness premium per sq ft at t=0 (~0 for self-build)." },
      { key: "premiumDecayYears", label: "Premium decay (yrs)", kind: "number", tooltip: "Years over which the premium decays to 0." },
    ],
  },
  {
    id: "maintenance",
    title: "E · Maintenance, CAM & tax",
    fields: [
      { key: "societyCamPerSqftMonth0", label: "Society CAM / sqft·mo", kind: "number", tooltip: "Monthly society CAM per sq ft at t=0." },
      { key: "ownerMaintPctOfRent", label: "Owner maint (% rent)", kind: "pct", tooltip: "Owner recurring maintenance as % of annual rent." },
      { key: "camEscalationPct", label: "CAM escalation", kind: "pct", tooltip: "Annual CAM/maintenance escalation." },
      { key: "maintenanceAgeAccelPct", label: "Maint age accel", kind: "pct", tooltip: "Extra upkeep growth compounding with structure age." },
      { key: "propertyTaxAnnual0", label: "Property tax (t0)", kind: "money", tooltip: "Annual property tax at t=0." },
      { key: "propertyTaxGrowthPct", label: "Property tax growth", kind: "pct", tooltip: "Annual property-tax growth." },
      { key: "waterTaxAnnual0", label: "Water tax (t0)", kind: "money", tooltip: "Separate water/borewell charge (plots/villas)." },
      { key: "majorRepairReservePctOfValue", label: "Major-repair reserve", kind: "pct", tooltip: "Sinking-fund accrual as % of property value p.a." },
      { key: "interiorRefreshCycleYears", label: "Interior refresh cycle", kind: "number", tooltip: "Re-do interiors every N years (0 = off)." },
      { key: "interiorRefreshPctOfInitial", label: "Interior refresh %", kind: "pct", tooltip: "% of inflated initial fit-out per refresh." },
    ],
  },
  {
    id: "financing",
    title: "F · Financing",
    fields: [
      { key: "loanAmount", label: "Loan amount", kind: "money", tooltip: "Principal borrowed (apartment). For plots, land loan." },
      { key: "loanRatePct", label: "Loan rate", kind: "pct", tooltip: "Annual loan rate (floating assumed flat)." },
      { key: "loanTenureYears", label: "Loan tenure (yrs)", kind: "number", tooltip: "Loan tenure in years." },
      { key: "prepaymentAnnual", label: "Prepayment / year", kind: "money", tooltip: "Extra principal per year (default 0)." },
    ],
  },
  {
    id: "tax",
    title: "H · Tax & market",
    fields: [
      { key: "marginalTaxPct", label: "Marginal tax", kind: "pct", tooltip: "Marginal income-tax rate." },
      { key: "ltcgPropertyPct", label: "LTCG property", kind: "pct", tooltip: "Property LTCG rate (no indexation, post-2024)." },
      { key: "ltcgEquityPct", label: "LTCG equity", kind: "pct", tooltip: "Equity LTCG rate above the exemption." },
      { key: "equityLtcgExemptionAnnual", label: "Equity LTCG exemption", kind: "money", tooltip: "Annual equity LTCG exemption (₹1.25L)." },
      { key: "equityCagrPct", label: "Equity CAGR", kind: "pct", tooltip: "Equity benchmark nominal CAGR." },
      { key: "cpiPct", label: "CPI", kind: "pct", tooltip: "Inflation for the real (today's money) line." },
      { key: "sellingCostPct", label: "Selling cost", kind: "pct", tooltip: "Exit brokerage + legal as % of sale." },
      { key: "liquidityHaircutPct", label: "Liquidity haircut", kind: "pct", tooltip: "Exit haircut (plots less liquid)." },
    ],
  },
  {
    id: "plot",
    title: "I · Plot self-build",
    fields: [
      { key: "plotAreaSqft", label: "Plot area", kind: "number", tooltip: "Plot size in sq ft (sets UDS/land).", only: PLOT },
      { key: "floors", label: "Floors", kind: "number", tooltip: "Number of floors built.", only: PLOT },
      { key: "farBuildableRatio", label: "FAR buildable ratio", kind: "number", tooltip: "Effective buildable ratio per floor.", only: PLOT },
      { key: "builtUpAreaSqft", label: "Built-up area (override)", kind: "number", tooltip: "Authoritative driver of construction cost (0 = derive).", only: PLOT },
      { key: "constructionRatePerSqft", label: "Construction rate / sqft", kind: "money", tooltip: "Build cost per sq ft of BUA.", only: PLOT },
      { key: "constructionSoftCostsPct", label: "Soft costs", kind: "pct", tooltip: "Architect/soil/approvals/utilities as % of base.", only: PLOT },
      { key: "constructionContingencyPct", label: "Contingency", kind: "pct", tooltip: "Contingency reserve as % of base.", only: PLOT },
      { key: "constructionMonths", label: "Construction months", kind: "number", tooltip: "Build duration (no income during this window).", only: PLOT },
      { key: "landLoanAmount", label: "Land loan", kind: "money", tooltip: "Land-loan principal.", only: PLOT },
      { key: "constructionLoanAmount", label: "Construction loan", kind: "money", tooltip: "Construction-loan principal (tranche-disbursed).", only: PLOT },
      { key: "constructionLoanRatePct", label: "Construction loan rate", kind: "pct", tooltip: "Construction loan rate (prices above home loans).", only: PLOT },
      { key: "compositeLoanTenureYears", label: "Composite tenure (yrs)", kind: "number", tooltip: "Combined loan tenure post-completion.", only: PLOT },
    ],
  },
];
