/**
 * §4.5 — The value stack: property gross market value at hold-year t.
 *
 *   propValueClean(t) = landValue(t) + structValue(t) + premium(t) + redevValue(t)
 *
 * Land appreciates (two-phase); structure is depreciated replacement cost; premium
 * decays; redevelopment is an optional Mumbai-apartment option value. Matches
 * `reference/oracle.py` (structure_value, land_rate, land_value).
 *
 * Liquidity haircut applies only at exit (§4.7), NOT here.
 */

export interface InfraBump {
  year: number;
  pct: number;
}

export interface LandParams {
  udsSqft: number;
  landRate0: number;
  landCagrY1_10: number;
  landCagrY11_20: number;
  /** Years 21–30 land CAGR (30-year horizon). Defaults to landCagrY11_20 when omitted. */
  landCagrY21_30?: number;
  infraBumps?: InfraBump[];
}

/**
 * landRate(t) = landRate0
 *   * (1+cagr1)^min(t,10)                       // years 1–10
 *   * (1+cagr2)^clamp(t-10, 0, 10)              // years 11–20
 *   * (1+cagr3)^max(t-20, 0)                    // years 21–30 (cagr3 defaults to cagr2)
 *   * Π(1+bump | year<=t).
 */
export function landRate(p: LandParams, t: number): number {
  const cagr3 = p.landCagrY21_30 ?? p.landCagrY11_20;
  let rate =
    p.landRate0 *
    Math.pow(1 + p.landCagrY1_10, Math.min(t, 10)) *
    Math.pow(1 + p.landCagrY11_20, Math.min(Math.max(t - 10, 0), 10)) *
    Math.pow(1 + cagr3, Math.max(t - 20, 0));
  for (const bump of p.infraBumps ?? []) {
    if (bump.year <= t) rate *= 1 + bump.pct;
  }
  return rate;
}

/** landValue(t) = udsSqft * landRate(t). (udsSqft = plotAreaSqft for PlotSelfBuild.) */
export function landValue(p: LandParams, t: number): number {
  return p.udsSqft * landRate(p, t);
}

export interface StructureParams {
  /** sbua (apartment) OR builtUpAreaSqft (plot build). */
  structureAreaSqft: number;
  replacementCost0: number;
  constructionInflationPct: number;
  physicalDepRatePct: number;
  economicDepRatePct: number;
  /** Structure age at t=0 (0 for new build / new apartment). */
  ageAtPurchaseYears: number;
  salvageFloor: number;
}

/** age(t) = ageAtPurchaseYears + t (for PlotSelfBuild, age is measured from completion). */
export function structureAge(p: StructureParams, t: number): number {
  return p.ageAtPurchaseYears + t;
}

/** depFactor(t) = max(1 - (physical+economic)*age(t), salvageFloor). */
export function depFactor(p: StructureParams, t: number): number {
  const totalDepRate = p.physicalDepRatePct + p.economicDepRatePct;
  return Math.max(1 - totalDepRate * structureAge(p, t), p.salvageFloor);
}

/** replCost(t) = replacementCost0 * (1 + constructionInflationPct)^t. */
export function replacementCost(p: StructureParams, t: number): number {
  return p.replacementCost0 * Math.pow(1 + p.constructionInflationPct, t);
}

/** structValue(t) = structureAreaSqft * replCost(t) * depFactor(t). */
export function structureValue(p: StructureParams, t: number): number {
  return p.structureAreaSqft * replacementCost(p, t) * depFactor(p, t);
}

export interface PremiumParams {
  sbua: number;
  premium0: number;
  premiumDecayYears: number;
}

/** premium(t) = sbua * premium0 * max(1 - t/premiumDecayYears, 0). (~0 for self-build.) */
export function premiumValue(p: PremiumParams, t: number): number {
  if (p.premiumDecayYears <= 0) return 0;
  return p.sbua * p.premium0 * Math.max(1 - t / p.premiumDecayYears, 0);
}

export interface RedevParams {
  enabled: boolean;
  redevEligibleAgeYears: number;
  redevOptionValuePctOfLand: number;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);

/**
 * Redevelopment option value (Mumbai apartments). When age >= eligibility the
 * structure value is floored at >=0 by the caller (see propValueClean).
 */
export function redevValue(
  rp: RedevParams,
  land: number,
  age: number,
): number {
  if (!rp.enabled) return 0;
  const prox = clamp(age / rp.redevEligibleAgeYears, 0, 1);
  return rp.redevOptionValuePctOfLand * land * prox;
}

export interface ValueStackParams {
  land: LandParams;
  structure: StructureParams;
  premium: PremiumParams;
  redev: RedevParams;
}

export interface ValueStackRow {
  landValue: number;
  structureValue: number;
  premiumValue: number;
  redevValue: number;
  propValueClean: number;
  /** land ÷ gross — the "land beta" (§6A). */
  landSharePct: number;
  replacementCostPerSqft: number;
  depFactor: number;
}

/** Full value stack at hold-year t, summing the four components (PRD §4.5). */
export function valueStackAt(p: ValueStackParams, t: number): ValueStackRow {
  const land = landValue(p.land, t);
  const age = structureAge(p.structure, t);
  let structure = structureValue(p.structure, t);
  // Redevelopment: once eligible, the structure is treated as redevelopable (>=0).
  if (p.redev.enabled && age >= p.redev.redevEligibleAgeYears) {
    structure = Math.max(structure, 0);
  }
  const premium = premiumValue(p.premium, t);
  const redev = redevValue(p.redev, land, age);
  const gross = land + structure + premium + redev;
  return {
    landValue: land,
    structureValue: structure,
    premiumValue: premium,
    redevValue: redev,
    propValueClean: gross,
    landSharePct: gross > 0 ? land / gross : 0,
    replacementCostPerSqft: replacementCost(p.structure, t),
    depFactor: depFactor(p.structure, t),
  };
}
