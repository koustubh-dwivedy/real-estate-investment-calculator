/**
 * §4.4 — Operating costs, NOI, and house-property tax (India), with regime-specific
 * loss set-off and an 8-year carry-forward ledger.
 *
 * CRITICAL invariant (PRD §4.4, invariant 4): actual maintenance / CAM / water /
 * major-repair / interior-refresh are NOT separately deductible — the 30% standard
 * deduction is deemed to cover them. They reduce CASH FLOW but NOT taxableHP. This
 * module computes them in the cash column and never in the tax column.
 */

export type MaintenanceMode = "TenantPaysCAM" | "OwnerBearsAll";
export type UsageMode = "SelfOccupied" | "LetOut";
export type TaxRegime = "India_Old" | "India_New" | "US";

export interface OpexTaxParams {
  usageMode: UsageMode;
  maintenanceMode: MaintenanceMode;
  taxRegime: TaxRegime;

  // rent & vacancy
  vacancyPct: number;
  reLetBrokerageMonths: number;

  // maintenance / CAM
  sbua: number;
  societyCamPerSqftMonth0: number;
  camEscalationPct: number;
  maintenanceAgeAccelPct: number;
  ownerMaintPctOfRent: number;
  /** Self-occupied analogue: owner maintenance as % of property value. */
  ownerMaintPctOfValue: number;

  // statutory & recurring charges
  propertyTaxAnnual0: number;
  propertyTaxGrowthPct: number;
  waterTaxAnnual0: number;
  waterTaxGrowthPct: number;
  majorRepairReservePctOfValue: number;

  // interiors refresh (lumpy)
  interiorsCapex0: number;
  interiorRefreshCycleYears: number;
  interiorRefreshPctOfInitial: number;
  cpiPct: number;

  /** Effective tax rate = marginalTaxPct adjusted by surcharge/cess toggle. */
  effTaxRate: number;
}

export interface OpexTaxYearInputs {
  /** Hold-year t (1..N). */
  t: number;
  /**
   * The 12 monthly market rents for this hold-year (index 0..11). The realized annual
   * rent is their sum; monthly cash rent is derived from each entry (0 during the
   * construction window).
   */
  rentMonths: number[];
  /** Structure age at t (for maintenance age-acceleration). */
  age: number;
  /** Clean property value at t (for major-repair reserve & self-occupied maint). */
  propValueClean: number;
  /** Interest paid in year t (let-out: fully deductible). */
  interestPaid: number;
  /** Sum of EMIs paid in year t. */
  emiAnnual: number;
}

export interface OpexTaxRow {
  grossRent: number;
  camBase: number;
  ownerMaintenance: number;
  waterTax: number;
  interiorRefresh: number;
  majorRepairReserve: number;
  propertyTax: number;
  opex: number;
  noi: number;
  taxableHP: number;
  /** Positive = tax paid; negative = shield (tax saved). Enters cash as −rentalTax. */
  rentalTaxOrShield: number;
  /** Carry-forward loss balance after this year (old regime only). */
  carryForwardLossBalance: number;
  postTaxRentalCF: number;
  /**
   * The year's 12 monthly cash legs (index 0..11), hold-month order. Each is the
   * owner's net rental cash for that month BEFORE the loan EMI and BEFORE the annual
   * tax settlement: grossRentMonth − cashOpexMonth. The tax settlement (rentalTaxOrShield)
   * is a single annual event the caller drops into the year's last month; the EMI is
   * added by the caller from the monthly loan schedule. Σ(monthlyCash) − emiAnnual −
   * rentalTaxOrShield = postTaxRentalCF (the annual identity is preserved).
   */
  monthlyCash: number[];
}

export interface OpexTaxResult {
  /** Per-hold-year rows (§6A table + annual tax). */
  rows: OpexTaxRow[];
  /** Monthly cash opex, hold-indexed 1..N*12 (index 0 unused). */
  cashOpexMonthly: number[];
  /** Monthly gross rent, hold-indexed 1..N*12 (index 0 unused). */
  grossRentMonthly: number[];
}

interface CarryLot {
  /** Year the loss arose. */
  year: number;
  amount: number;
}

const OLD_REGIME_SETOFF_CAP = 200_000; // ₹2L/yr against other income
const SELF_OCCUPIED_INTEREST_CAP = 200_000; // ₹2L, old regime only
const CARRY_FORWARD_YEARS = 8;

/**
 * Compute the full opex + NOI + tax schedule across years. Stateful in the
 * carry-forward ledger, so it processes years in order.
 */
export function computeOpexAndTax(
  params: OpexTaxParams,
  years: OpexTaxYearInputs[],
): OpexTaxResult {
  const rows: OpexTaxRow[] = [];
  const cashOpexMonthly: number[] = [0];
  const grossRentMonthly: number[] = [0];
  let carryLots: CarryLot[] = [];
  const letOut = params.usageMode === "LetOut";

  for (const y of years) {
    const { t, rentMonths, age, propValueClean, interestPaid, emiAnnual } = y;
    const rentAnnual = rentMonths.reduce((s, r) => s + (r ?? 0), 0);

    // --- gross rent (let-out only) ---
    const reLetFrac = params.reLetBrokerageMonths / 36;
    const grossRent = letOut
      ? rentAnnual * (1 - params.vacancyPct) - reLetFrac * rentAnnual
      : 0;
    // Monthly gross rent: each month's market rent net of vacancy, less the brokerage
    // amortization spread evenly across the year. Σ over the year == grossRent above.
    const brokerageMonthly = letOut ? (reLetFrac * rentAnnual) / 12 : 0;

    // --- maintenance & charges (all CASH-only; NEVER deductible) ---
    const ageMaintMult = Math.pow(1 + params.maintenanceAgeAccelPct, age);
    const camBase =
      params.societyCamPerSqftMonth0 *
      params.sbua *
      12 *
      Math.pow(1 + params.camEscalationPct, t);
    const propertyTax = params.propertyTaxAnnual0 * Math.pow(1 + params.propertyTaxGrowthPct, t);
    const waterTax = params.waterTaxAnnual0 * Math.pow(1 + params.waterTaxGrowthPct, t);
    const majorRepairReserve = params.majorRepairReservePctOfValue * propValueClean;
    const interiorRefresh =
      params.interiorRefreshCycleYears > 0 &&
      t > 0 &&
      t % params.interiorRefreshCycleYears === 0
        ? params.interiorRefreshPctOfInitial *
          params.interiorsCapex0 *
          Math.pow(1 + params.cpiPct, t)
        : 0;

    // owner recurring maintenance: % of rent (let-out) or % of value (self-occupied)
    const ownerMaintenance = letOut
      ? params.ownerMaintPctOfRent * rentAnnual * ageMaintMult
      : params.ownerMaintPctOfValue * propValueClean * ageMaintMult;

    let ownerOpexNonTax: number;
    if (params.maintenanceMode === "TenantPaysCAM") {
      // CAM borne by tenant (displayed but not in owner opex)
      ownerOpexNonTax = ownerMaintenance + majorRepairReserve + interiorRefresh + waterTax;
    } else {
      ownerOpexNonTax =
        ownerMaintenance + camBase * ageMaintMult + majorRepairReserve + interiorRefresh + waterTax;
    }

    const opex = ownerOpexNonTax + propertyTax;
    const noi = grossRent - opex;

    // --- taxable income from house property ---
    let taxableHP: number;
    if (letOut) {
      const nav = grossRent;
      const stdDeduction = 0.3 * nav;
      const interestDeduct = interestPaid; // let-out: full interest, no cap, both regimes
      taxableHP = nav - stdDeduction - interestDeduct;
    } else {
      // self-occupied: NAV=0; only interest, capped at ₹2L and only in the old regime
      const interestDeduct =
        params.taxRegime === "India_Old"
          ? Math.min(interestPaid, SELF_OCCUPIED_INTEREST_CAP)
          : 0;
      taxableHP = -interestDeduct;
    }

    // --- tax / shield with regime-specific set-off and carry-forward ---
    let rentalTaxOrShield = 0;

    // expire carry-forward lots older than 8 years
    carryLots = carryLots.filter((lot) => t - lot.year <= CARRY_FORWARD_YEARS);

    if (taxableHP > 0) {
      let taxable = taxableHP;
      if (params.taxRegime === "India_Old") {
        // offset positive HP income against carried-forward losses (FIFO)
        for (const lot of carryLots) {
          if (taxable <= 0) break;
          const used = Math.min(lot.amount, taxable);
          lot.amount -= used;
          taxable -= used;
        }
        carryLots = carryLots.filter((lot) => lot.amount > 1e-6);
      }
      rentalTaxOrShield = taxable * params.effTaxRate; // positive = tax paid
    } else if (taxableHP < 0) {
      const loss = -taxableHP;
      if (params.taxRegime === "India_Old") {
        const setOff = Math.min(loss, OLD_REGIME_SETOFF_CAP);
        rentalTaxOrShield = -(setOff * params.effTaxRate); // negative = shield (tax saved)
        const remaining = loss - setOff;
        if (remaining > 1e-6) carryLots.push({ year: t, amount: remaining });
      } else {
        // India_New: negative HP cannot be set off or carried — stranded
        rentalTaxOrShield = 0;
      }
    }

    const carryForwardLossBalance = carryLots.reduce((s, lot) => s + lot.amount, 0);
    const postTaxRentalCF = noi - emiAnnual - rentalTaxOrShield;

    // --- monthly cash legs ---
    // Cash opex is spread evenly across the 12 months EXCEPT the lumpy interior refresh,
    // which lands in a single month (the year's last). Σ(monthly opex) == opex.
    const smoothOpex = opex - interiorRefresh;
    const monthlyCash: number[] = new Array<number>(12).fill(0);
    for (let k = 0; k < 12; k++) {
      const rentCashK = letOut ? (rentMonths[k] ?? 0) * (1 - params.vacancyPct) - brokerageMonthly : 0;
      const opexK = smoothOpex / 12 + (k === 11 ? interiorRefresh : 0);
      grossRentMonthly.push(rentCashK);
      cashOpexMonthly.push(opexK);
      monthlyCash[k] = rentCashK - opexK; // pre-EMI, pre-tax owner net for this month
    }

    rows.push({
      grossRent,
      camBase,
      ownerMaintenance,
      waterTax,
      interiorRefresh,
      majorRepairReserve,
      propertyTax,
      opex,
      noi,
      taxableHP,
      rentalTaxOrShield,
      carryForwardLossBalance,
      postTaxRentalCF,
      monthlyCash,
    });
  }

  return { rows, cashOpexMonthly, grossRentMonthly };
}
