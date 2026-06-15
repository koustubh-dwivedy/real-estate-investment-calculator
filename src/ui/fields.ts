/**
 * Field metadata (PRD §3) for the input panel: labels, units, definitions, and
 * conditional visibility by acquisitionType. Drives generic rendering.
 */
import type { Inputs, AcquisitionType } from "../types";

export type FieldKind = "money" | "pct" | "number" | "text";

export interface FieldDef {
  key: keyof Inputs;
  label: string;
  kind: FieldKind;
  /** Human-readable unit shown next to the label. */
  unit: string;
  /** Plain-language definition shown as helper text. */
  def: string;
  /** If set, only show for these acquisition types. */
  only?: AcquisitionType[];
  /** If set, only show when holdYears >= this (e.g. Y21–30 bands need a 30y horizon). */
  minHorizon?: number;
}

export interface Section {
  id: string;
  title: string;
  fields: FieldDef[];
}

const PLOT: AcquisitionType[] = ["PlotSelfBuild"];
/** Apartment acquisition types — for fields that don't apply to a plot self-build. */
const APT: AcquisitionType[] = ["ReadyApartment", "UnderConstructionApartment"];

export const SECTIONS: Section[] = [
  {
    id: "property",
    title: "A · Property & area",
    fields: [
      { key: "sbua", label: "Super built-up area", kind: "number", unit: "sq ft", def: "Saleable area incl. common-area share — the basis builders quote and that structure value scales with. (For a plot, use Built-up area in section I.)", only: APT },
      { key: "carpetArea", label: "Carpet area", kind: "number", unit: "sq ft", def: "Usable floor area within walls. Display/sanity only unless rent is per-carpet-sqft.", only: APT },
      { key: "udsSqft", label: "UDS (land share)", kind: "number", unit: "sq ft", def: "Undivided share of land your flat owns. Drives land value — higher UDS = more land beta. (For a plot, plot area is used instead.)", only: APT },
      { key: "ageAtPurchaseYears", label: "Age at purchase", kind: "number", unit: "years", def: "Structure age at t=0. 0 for a new build/new apartment; older = more depreciation. (A plot's house is new, measured from completion.)", only: APT },
      { key: "purchasePriceAllIn", label: "Purchase price (all-in)", kind: "money", unit: "₹", def: "Apartment price (BSP + PLC + floor rise + parking + amenities), excl. stamp/reg/GST. (For a plot, the price is derived = plot area × land rate — see the diagnostic.)", only: APT },
    ],
  },
  {
    id: "rent",
    title: "B · Rent & growth",
    fields: [
      { key: "rentPerMonth0", label: "Starting rent", kind: "money", unit: "₹ / month", def: "Market rent at t=0 if let out. For a plot, the rent at completion (grown from t=0 thereafter)." },
      { key: "rentGrowthY1_5", label: "Rent growth Y1–5", kind: "pct", unit: "% p.a.", def: "Annual market rent growth in years 1–5." },
      { key: "rentGrowthY6_10", label: "Rent growth Y6–10", kind: "pct", unit: "% p.a.", def: "Annual market rent growth in years 6–10." },
      { key: "rentGrowthY11_20", label: "Rent growth Y11–20", kind: "pct", unit: "% p.a.", def: "Annual market rent growth in years 11–20." },
      { key: "rentGrowthY21_30", label: "Rent growth Y21–30", kind: "pct", unit: "% p.a.", def: "Annual market rent growth in years 21–30. Defaults to the Y11–20 rate; lower it to taper later-decade growth.", minHorizon: 21 },
      { key: "cohortDragPct", label: "Cohort drag", kind: "pct", unit: "% p.a.", def: "Rent growth lost as the building ages relative to newer stock, phased in after year 10." },
      { key: "vacancyPct", label: "Vacancy", kind: "pct", unit: "% of rent", def: "Share of annual rent lost to vacant months." },
      { key: "reLetBrokerageMonths", label: "Re-let brokerage", kind: "number", unit: "months", def: "Months of rent paid as brokerage on each re-let; annualized over a ~3-year tenancy." },
    ],
  },
  {
    id: "entry",
    title: "C · Entry costs (one-time, t=0)",
    fields: [
      { key: "stampDutyRegPct", label: "Stamp duty + registration", kind: "pct", unit: "% of price", def: "Government transfer tax. Bangalore ~7% (2% registration since 31 Aug 2025); Mumbai ~6–7%." },
      { key: "gstPct", label: "GST", kind: "pct", unit: "% of price", def: "Applies to under-construction property only; 0 for ready/OC-received." },
      { key: "brokerageBuyPct", label: "Buy-side brokerage", kind: "pct", unit: "% of price", def: "Agent commission on purchase." },
      { key: "otherAcquisitionCostsAbs", label: "Other acquisition costs", kind: "money", unit: "₹", def: "Assessor/valuation + legal due diligence + documentation + khata/mutation transfer." },
      { key: "interiorsCapex0", label: "Interiors capex", kind: "money", unit: "₹", def: "Initial fit-out (modular kitchen, wardrobes, fittings). For a plot, the built house's interiors." },
    ],
  },
  {
    id: "appreciation",
    title: "D · Appreciation engine (the value stack)",
    fields: [
      { key: "landRate0", label: "Land rate (t0)", kind: "money", unit: "₹ / sq ft", def: "Current market land rate per sq ft, applied to UDS. The appreciating part of the asset." },
      { key: "landCagrY1_10", label: "Land CAGR Y1–10", kind: "pct", unit: "% p.a.", def: "Annual land-value growth, years 1–10." },
      { key: "landCagrY11_20", label: "Land CAGR Y11–20", kind: "pct", unit: "% p.a.", def: "Annual land-value growth, years 11–20 (usually lower as the micro-market matures)." },
      { key: "landCagrY21_30", label: "Land CAGR Y21–30", kind: "pct", unit: "% p.a.", def: "Annual land-value growth, years 21–30. Defaults to the Y11–20 rate; lower it to taper later-decade appreciation.", minHorizon: 21 },
      { key: "replacementCost0", label: "Replacement cost (t0)", kind: "money", unit: "₹ / sq ft", def: "Cost to rebuild the structure today, per sq ft. Inflates over time but the structure itself depreciates." },
      { key: "constructionInflationPct", label: "Construction inflation", kind: "pct", unit: "% p.a.", def: "Annual growth in rebuild cost (materials + labour)." },
      { key: "physicalDepRatePct", label: "Physical depreciation", kind: "pct", unit: "% p.a.", def: "Straight-line wear of the structure (≈1.67%/yr for a 60-yr RCC life)." },
      { key: "economicDepRatePct", label: "Economic depreciation", kind: "pct", unit: "% p.a.", def: "Obsolescence on top of physical wear (dated layouts, amenities) — higher for tall societies." },
      { key: "salvageFloor", label: "Salvage floor", kind: "number", unit: "ratio 0–1", def: "Minimum fraction of new value the structure retains, however old (e.g. 0.10)." },
      { key: "premium0", label: "Newness premium (t0)", kind: "money", unit: "₹ / sq ft", def: "Brand/newness premium buyers pay for a fresh building, per sq ft. (Not applied to a self-build.)", only: APT },
      { key: "premiumDecayYears", label: "Premium decay", kind: "number", unit: "years", def: "Years over which the newness premium fades to zero.", only: APT },
    ],
  },
  {
    id: "maintenance",
    title: "E · Maintenance, CAM & property tax",
    fields: [
      { key: "societyCamPerSqftMonth0", label: "Society CAM (t0)", kind: "number", unit: "₹ / sq ft·mo", def: "Monthly common-area maintenance per sq ft charged by the society." },
      { key: "ownerMaintPctOfRent", label: "Owner maintenance", kind: "pct", unit: "% of rent", def: "Owner-borne recurring upkeep (repairs the tenant doesn't cover), as a share of annual rent." },
      { key: "camEscalationPct", label: "CAM escalation", kind: "pct", unit: "% p.a.", def: "Annual increase in CAM/maintenance charges." },
      { key: "maintenanceAgeAccelPct", label: "Maintenance age accel.", kind: "pct", unit: "% p.a.", def: "Extra upkeep growth that compounds with building age (cracks, waterproofing, lift overhauls)." },
      { key: "propertyTaxAnnual0", label: "Property tax (t0)", kind: "money", unit: "₹ / year", def: "Annual municipal property tax at t=0." },
      { key: "propertyTaxGrowthPct", label: "Property tax growth", kind: "pct", unit: "% p.a.", def: "Annual growth in the property-tax bill." },
      { key: "waterTaxAnnual0", label: "Water tax (t0)", kind: "money", unit: "₹ / year", def: "Separate water/borewell/tanker charge — material for plots/villas; usually inside CAM for flats (0)." },
      { key: "majorRepairReservePctOfValue", label: "Major-repair reserve", kind: "pct", unit: "% of value p.a.", def: "Sinking-fund accrual for big repairs (roof, structure) the owner bears even when the tenant pays CAM." },
      { key: "interiorRefreshCycleYears", label: "Interior refresh cycle", kind: "number", unit: "years", def: "How often interiors are redone (kitchen, paint, fittings). 0 turns it off." },
      { key: "interiorRefreshPctOfInitial", label: "Interior refresh size", kind: "pct", unit: "% of initial", def: "Cost of each refresh as a share of the (inflated) initial fit-out." },
    ],
  },
  {
    id: "financing",
    title: "F · Financing",
    fields: [
      { key: "loanAmount", label: "Loan amount", kind: "money", unit: "₹", def: "Principal borrowed. Down payment = price − loan + entry costs. (Plots use the Land loan + Construction loan in section I.)", only: APT },
      { key: "loanRatePct", label: "Loan rate", kind: "pct", unit: "% p.a.", def: "Annual home-loan interest rate (floating assumed flat over the hold). (Plots: set Land/Construction loan rates in section I.)", only: APT },
      { key: "loanTenureYears", label: "Loan tenure", kind: "number", unit: "years", def: "Loan term used to compute the EMI. (Plots use Composite tenure in section I.)", only: APT },
      { key: "prepaymentAnnual", label: "Prepayment / year", kind: "money", unit: "₹ / year", def: "Extra principal paid each year-end (shortens tenure, EMI fixed). Default 0." },
    ],
  },
  {
    id: "tax",
    title: "H · Tax & market",
    fields: [
      { key: "marginalTaxPct", label: "Marginal tax rate", kind: "pct", unit: "%", def: "Your top income-tax slab — applied to taxable rental income (and to the loss set-off shield)." },
      { key: "ltcgPropertyPct", label: "LTCG — property", kind: "pct", unit: "%", def: "Long-term capital-gains rate on property sale (12.5%, no indexation, post-23-Jul-2024)." },
      { key: "ltcgEquityPct", label: "LTCG — equity", kind: "pct", unit: "%", def: "Long-term capital-gains rate on the equity benchmark, above the annual exemption." },
      { key: "equityLtcgExemptionAnnual", label: "Equity LTCG exemption", kind: "money", unit: "₹", def: "Annual equity LTCG exemption (₹1.25 lakh)." },
      { key: "equityCagrPct", label: "Equity CAGR", kind: "pct", unit: "% p.a.", def: "Assumed nominal return of the equity benchmark (Nifty/Sensex ~11%). The opportunity cost of buying property." },
      { key: "cpiPct", label: "Inflation (CPI)", kind: "pct", unit: "% p.a.", def: "Consumer inflation, used only to express the terminal value in today's money." },
      { key: "sellingCostPct", label: "Selling cost", kind: "pct", unit: "% of sale", def: "Exit brokerage + legal as a share of the sale price." },
      { key: "liquidityHaircutPct", label: "Liquidity haircut", kind: "pct", unit: "% at exit", def: "Discount to clear the sale (plots are less liquid than flats), applied only at exit." },
    ],
  },
  {
    id: "plot",
    title: "I · Plot self-build",
    fields: [
      { key: "plotAreaSqft", label: "Plot area", kind: "number", unit: "sq ft", def: "Land parcel size; sets UDS and the land/value stack.", only: PLOT },
      { key: "floors", label: "Floors", kind: "number", unit: "floors", def: "Number of floors built (built-up area can exceed the footprint).", only: PLOT },
      { key: "farBuildableRatio", label: "FAR buildable ratio", kind: "number", unit: "ratio", def: "Effective buildable area per floor as a fraction of plot (FAR/FSI utilization).", only: PLOT },
      { key: "builtUpAreaSqft", label: "Built-up area (override)", kind: "number", unit: "sq ft", def: "THE driver of construction cost. If set, used directly; else derived from plot × FAR × floors. 0 = derive.", only: PLOT },
      { key: "constructionRatePerSqft", label: "Construction rate", kind: "money", unit: "₹ / sq ft", def: "Build cost per sq ft of built-up area.", only: PLOT },
      { key: "constructionSoftCostsPct", label: "Soft costs", kind: "pct", unit: "% of base", def: "Architect/structural fees, soil testing, plan approval, betterment charges, utility connections.", only: PLOT },
      { key: "constructionContingencyPct", label: "Contingency", kind: "pct", unit: "% of base", def: "Reserve for cost overruns during the build (the video used 20%).", only: PLOT },
      { key: "constructionMonths", label: "Construction duration", kind: "number", unit: "months", def: "Build window — no occupancy or rent, but carrying cost (pre-EMI + draws) accrues.", only: PLOT },
      { key: "landLoanAmount", label: "Land loan", kind: "money", unit: "₹", def: "Loan against the plot, disbursed at t=0. Down payment = plot price − land loan.", only: PLOT },
      { key: "plotLoanRatePct", label: "Land loan rate", kind: "pct", unit: "% p.a.", def: "Rate on the land loan: drives its interest-only pre-EMI during the build, and is principal-weight-blended with the construction-loan rate for the post-completion EMI.", only: PLOT },
      { key: "constructionLoanAmount", label: "Construction loan", kind: "money", unit: "₹", def: "Loan for the build, disbursed in tranches as work progresses (interest-only during the build).", only: PLOT },
      { key: "constructionLoanRatePct", label: "Construction loan rate", kind: "pct", unit: "% p.a.", def: "Rate on the construction loan (prices above a plain home loan). Blended with the land-loan rate for the post-completion EMI.", only: PLOT },
      { key: "compositeLoanTenureYears", label: "Composite tenure", kind: "number", unit: "years", def: "Term of the combined land+construction loan once full EMI begins at completion.", only: PLOT },
    ],
  },
];
