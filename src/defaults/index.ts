/**
 * §5 — Validated 2026 defaults, keyed by geography × assetType × acquisitionType.
 *
 * India is primary (US is deferred — issue Q). Every value is user-overridable in
 * the UI; figures are 2026 starting estimates per the PRD §5 sources, not gospel.
 */
import type {
  Inputs,
  Geography,
  AssetType,
  AcquisitionType,
  MaintenanceMode,
} from "../types";

interface AssetMod {
  economicDepRatePct: number;
  premium0: number;
  premiumDecayYears: number;
  redevelopmentEnabled: boolean;
  maintenanceMode: MaintenanceMode;
  ownerMaintPctOfRent: number;
}

const ASSET_MODS: Record<AssetType, AssetMod> = {
  LandPlot: {
    economicDepRatePct: 0,
    premium0: 0,
    premiumDecayYears: 10,
    redevelopmentEnabled: false,
    maintenanceMode: "OwnerBearsAll",
    ownerMaintPctOfRent: 0.05,
  },
  PlottedDevelopmentVilla: {
    economicDepRatePct: 0.005,
    premium0: 200,
    premiumDecayYears: 10,
    redevelopmentEnabled: false,
    maintenanceMode: "OwnerBearsAll",
    ownerMaintPctOfRent: 0.12,
  },
  StandaloneApartment: {
    economicDepRatePct: 0.015,
    premium0: 800,
    premiumDecayYears: 12,
    redevelopmentEnabled: false,
    maintenanceMode: "TenantPaysCAM",
    ownerMaintPctOfRent: 0.07,
  },
  MidRiseSociety: {
    economicDepRatePct: 0.018,
    premium0: 1200,
    premiumDecayYears: 12,
    redevelopmentEnabled: false,
    maintenanceMode: "TenantPaysCAM",
    ownerMaintPctOfRent: 0.06,
  },
  HighRiseSociety: {
    economicDepRatePct: 0.022,
    premium0: 1800,
    premiumDecayYears: 15,
    redevelopmentEnabled: false,
    maintenanceMode: "TenantPaysCAM",
    ownerMaintPctOfRent: 0.06,
  },
};

interface GeoAnchor {
  stampDutyRegPct: number;
  landRate0Apartment: number;
  landRate0Plot: number;
  landCagrY1_10: number;
  landCagrY11_20: number;
  rentGrowthY1_5: number;
  rentGrowthY6_10: number;
  rentGrowthY11_20: number;
  replacementCost0Apartment: number;
  replacementCost0SelfBuild: number;
  redevelopmentEnabledByDefault: boolean;
}

const GEO_ANCHORS: Record<"Bangalore" | "Mumbai", GeoAnchor> = {
  Bangalore: {
    stampDutyRegPct: 0.07, // 5% duty + 2% reg (doubled 31 Aug 2025) + ~0.6% cess
    landRate0Apartment: 38_000,
    landRate0Plot: 10_000,
    landCagrY1_10: 0.08,
    landCagrY11_20: 0.06,
    rentGrowthY1_5: 0.06,
    rentGrowthY6_10: 0.05,
    rentGrowthY11_20: 0.05,
    replacementCost0Apartment: 2300,
    replacementCost0SelfBuild: 2500,
    redevelopmentEnabledByDefault: false,
  },
  Mumbai: {
    stampDutyRegPct: 0.07, // 5% duty + 1% metro cess + 1% reg (men)
    landRate0Apartment: 45_000,
    landRate0Plot: 30_000,
    landCagrY1_10: 0.045,
    landCagrY11_20: 0.04,
    rentGrowthY1_5: 0.05,
    rentGrowthY6_10: 0.05,
    rentGrowthY11_20: 0.04,
    replacementCost0Apartment: 3000,
    replacementCost0SelfBuild: 3000,
    redevelopmentEnabledByDefault: true,
  },
};

/** Common India defaults (PRD §5 Common table). */
function baseIndia(): Inputs {
  return {
    geography: "Bangalore",
    acquisitionType: "ReadyApartment",
    assetType: "MidRiseSociety",
    sbua: 1200,
    carpetArea: 840,
    udsSqft: 240,
    ageAtPurchaseYears: 0,
    purchasePriceAllIn: 15_000_000,

    rentPerMonth0: 35_000,
    rentGrowthY1_5: 0.06,
    rentGrowthY6_10: 0.05,
    rentGrowthY11_20: 0.05,
    cohortDragPct: 0.02,
    vacancyPct: 0.05,
    reLetBrokerageMonths: 1,
    usageMode: "LetOut",
    imputedRentBenefit: false,

    stampDutyRegPct: 0.07,
    gstPct: 0,
    brokerageBuyPct: 0,
    otherAcquisitionCostsAbs: 50_000,
    interiorsCapex0: 1_000_000,

    landRate0: 38_000,
    landCagrY1_10: 0.08,
    landCagrY11_20: 0.06,
    replacementCost0: 2300,
    constructionInflationPct: 0.06,
    physicalDepRatePct: 0.0167,
    economicDepRatePct: 0.018,
    structureLifeYears: 60,
    salvageFloor: 0.1,
    premium0: 1200,
    premiumDecayYears: 12,
    infraBumps: [],

    maintenanceMode: "TenantPaysCAM",
    societyCamPerSqftMonth0: 4,
    ownerMaintPctOfRent: 0.06,
    ownerMaintPctOfValue: 0.004,
    camEscalationPct: 0.06,
    maintenanceAgeAccelPct: 0.01,
    propertyTaxAnnual0: 20_000,
    propertyTaxGrowthPct: 0.05,
    waterTaxAnnual0: 0,
    waterTaxGrowthPct: 0.05,
    majorRepairReservePctOfValue: 0.003,
    interiorRefreshCycleYears: 10,
    interiorRefreshPctOfInitial: 0.6,

    loanAmount: 11_250_000, // 75% LTV
    loanRatePct: 0.075,
    loanTenureYears: 20,
    prepaymentAnnual: 0,

    rentalCashUse: "ReinvestEquity",
    taxRegime: "India_New",
    compareMode: "SameCashSIP",

    marginalTaxPct: 0.3,
    surchargeCess: "31.2",
    ltcgPropertyPct: 0.125,
    ltcgEquityPct: 0.125,
    equityLtcgExemptionAnnual: 125_000,
    equityCagrPct: 0.11,
    cpiPct: 0.045,
    sellingCostPct: 0.02,
    liquidityHaircutPct: 0.03,

    redevelopmentEnabled: false,
    redevEligibleAgeYears: 30,
    redevOptionValuePctOfLand: 0.4,

    plotAreaSqft: 500,
    floors: 2,
    farBuildableRatio: 0.9,
    builtUpAreaSqft: 1750,
    constructionRatePerSqft: 2500,
    constructionSoftCostsPct: 0.12,
    constructionContingencyPct: 0.2,
    constructionMonths: 18,
    constructionFinancing: "CompositeLoan",
    landLoanAmount: 0,
    constructionLoanAmount: 0,
    plotLoanRatePct: 0.085,
    constructionLoanRatePct: 0.085,
    compositeLoanTenureYears: 20,
    preEMIduringConstruction: true,

    holdYears: 20,
  };
}

/** Effective tax rate from marginal rate + surcharge/cess toggle. */
export function effTaxRate(inputs: Inputs): number {
  switch (inputs.surchargeCess) {
    case "31.2":
      return 0.312;
    case "35.8":
      return 0.358;
    default:
      return inputs.marginalTaxPct;
  }
}

export interface DefaultsKey {
  geography: Geography;
  assetType: AssetType;
  acquisitionType: AcquisitionType;
}

/** Build a fully-populated Inputs for the given key (India geographies only for now). */
export function getDefaults(key: DefaultsKey): Inputs {
  const d = baseIndia();
  d.geography = key.geography;
  d.assetType = key.assetType;
  d.acquisitionType = key.acquisitionType;

  const geoKey = key.geography === "Mumbai" ? "Mumbai" : "Bangalore";
  const geo = GEO_ANCHORS[geoKey];
  const asset = ASSET_MODS[key.assetType];
  const isPlot = key.acquisitionType === "PlotSelfBuild";

  // geography
  d.stampDutyRegPct = geo.stampDutyRegPct;
  d.landCagrY1_10 = geo.landCagrY1_10;
  d.landCagrY11_20 = geo.landCagrY11_20;
  d.rentGrowthY1_5 = geo.rentGrowthY1_5;
  d.rentGrowthY6_10 = geo.rentGrowthY6_10;
  d.rentGrowthY11_20 = geo.rentGrowthY11_20;
  d.landRate0 = isPlot ? geo.landRate0Plot : geo.landRate0Apartment;
  d.replacementCost0 = isPlot ? geo.replacementCost0SelfBuild : geo.replacementCost0Apartment;

  // asset modifiers
  d.economicDepRatePct = asset.economicDepRatePct;
  d.premium0 = isPlot ? 0 : asset.premium0;
  d.premiumDecayYears = asset.premiumDecayYears;
  d.maintenanceMode = asset.maintenanceMode;
  d.ownerMaintPctOfRent = asset.ownerMaintPctOfRent;
  d.redevelopmentEnabled = asset.redevelopmentEnabled || geo.redevelopmentEnabledByDefault;

  // acquisition-type specifics
  if (isPlot) {
    d.purchasePriceAllIn = d.plotAreaSqft * d.landRate0; // plot price only
    d.udsSqft = d.plotAreaSqft; // ~100% UDS
    d.otherAcquisitionCostsAbs = 95_000; // assessor + legal + documentation + mutation
    d.liquidityHaircutPct = 0.05; // plots less liquid
    d.waterTaxAnnual0 = 3_000; // borewell/tanker
    d.gstPct = 0;
    d.economicDepRatePct = 0; // land-share dominated
    // reconcile replacementCost0 with construction rate (§4.5 note)
    d.replacementCost0 = d.constructionRatePerSqft;
    // composite financing: land loan ~75% of plot, construction loan ~60% of build
    d.landLoanAmount = Math.round(d.purchasePriceAllIn * 0.75);
    d.constructionLoanAmount = 0; // set after build cost known (UI/compute); 0 = own funds default
    d.loanAmount = d.landLoanAmount;
  } else {
    d.gstPct = key.acquisitionType === "UnderConstructionApartment" ? 0.05 : 0;
  }

  return d;
}
