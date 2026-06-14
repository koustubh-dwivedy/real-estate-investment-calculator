/**
 * §4.11 — Plot self-build construction module.
 *
 * Builds the construction cost stack, the monthly draw schedule, the two-leg
 * composite financing (land + tranche-disbursed construction with interim pre-EMI),
 * and the hand-off to the standard hold engine at completion (tC).
 *
 * Modelling decisions for the open questions (recorded here; see project Q1/Q2):
 *  - Q1: the hold/value/rent clock starts at completion tC; the 20-year hold runs
 *    over calendar months [constructionMonths+1, constructionMonths+240]. Land
 *    appreciation during the build window is NOT modelled (conservative — it
 *    understates the plot), per PRD §4.11 ("clock starts at completion").
 *  - Q2: only the OWN-POCKET construction outflow is mirrored to Engine B; the
 *    loan-funded draws are debt in Engine A, not investor cash. `ownPocketDraw`
 *    below is exactly that own-pocket figure.
 *
 * Matches reference/oracle.py::construction_cost_stack for T13.
 */

export interface ConstructionCostInputs {
  /** Authoritative driver of construction cost. If omitted, derived from plot×far. */
  builtUpAreaSqft?: number;
  plotAreaSqft: number;
  farBuildableRatio: number;
  constructionRatePerSqft: number;
  constructionSoftCostsPct: number;
  constructionContingencyPct: number;
  /** Initial fit-out for the built house (interiorsCapex0). */
  buildInteriors: number;
}

export interface ConstructionCostStack {
  builtUpAreaSqft: number;
  baseConstruction: number;
  softCosts: number;
  contingency: number;
  buildInteriors: number;
  totalConstructionCost: number;
}

/**
 * builtUpAreaSqft = override OR plotAreaSqft * farBuildableRatio.
 * base = BUA * rate ; soft = base*softPct ; contingency = base*contPct ;
 * total = base + soft + contingency + interiors.
 */
export function constructionCostStack(p: ConstructionCostInputs): ConstructionCostStack {
  const builtUpAreaSqft =
    p.builtUpAreaSqft && p.builtUpAreaSqft > 0
      ? p.builtUpAreaSqft
      : p.plotAreaSqft * p.farBuildableRatio;
  const baseConstruction = builtUpAreaSqft * p.constructionRatePerSqft;
  const softCosts = baseConstruction * p.constructionSoftCostsPct;
  const contingency = baseConstruction * p.constructionContingencyPct;
  const totalConstructionCost = baseConstruction + softCosts + contingency + p.buildInteriors;
  return {
    builtUpAreaSqft,
    baseConstruction,
    softCosts,
    contingency,
    buildInteriors: p.buildInteriors,
    totalConstructionCost,
  };
}

export interface ConstructionMonthRow {
  /** 1-based month within the build window. */
  month: number;
  /** Total construction spend that month (own-pocket + loan-funded). */
  constructionDraw: number;
  /** Portion funded by the construction loan this month. */
  loanDraw: number;
  /** Portion funded from own pocket this month (mirrored to Engine B — Q2). */
  ownPocketDraw: number;
  /** Cumulative construction-loan amount disbursed through this month. */
  cumConstructionDisbursed: number;
  /** Interest-only on the cumulative disbursed construction balance this month. */
  constructionPreEMI: number;
  /** Interest-only on the (fully-disbursed at t0) land loan this month, if pre-EMI. */
  landPreEMI: number;
  /** constructionPreEMI + landPreEMI — total interest serviced this month. */
  preEMI: number;
}

export interface ConstructionScheduleInputs {
  costStack: ConstructionCostStack;
  constructionMonths: number;
  /** 'CompositeLoan' | 'OwnFunds'. OwnFunds => no construction loan. */
  constructionFinancing: "CompositeLoan" | "OwnFunds";
  landLoanAmount: number;
  constructionLoanAmount: number;
  plotLoanRatePct: number;
  constructionLoanRatePct: number;
  /** If true, land loan is interest-only during the build (matches preEMI product). */
  preEMIduringConstruction: boolean;
}

export interface ConstructionSchedule {
  months: ConstructionMonthRow[];
  /** Total own-pocket construction outflow over the build (mirrored to Engine B). */
  totalOwnPocketDraws: number;
  /** Total pre-EMI interest serviced over the build (own pocket → Engine B). */
  totalPreEMI: number;
  /** Combined principal that begins amortizing at completion. */
  combinedPrincipalAtCompletion: number;
}

/**
 * Build the monthly construction draw + pre-EMI schedule.
 *
 * Draw schedule (PRD §4.11, even default): spread (total − interiors) evenly across
 * the build; interiors drawn in the final month near completion. The construction
 * loan disburses evenly across the build (T14), capped at constructionLoanAmount.
 */
export function constructionSchedule(p: ConstructionScheduleInputs): ConstructionSchedule {
  const { costStack, constructionMonths: M } = p;
  const ownFunds = p.constructionFinancing === "OwnFunds";
  const constructionLoan = ownFunds ? 0 : p.constructionLoanAmount;

  const spreadable = costStack.totalConstructionCost - costStack.buildInteriors;
  const baseMonthly = M > 0 ? spreadable / M : 0;
  const loanMonthly = M > 0 ? constructionLoan / M : 0;

  const landRm = p.plotLoanRatePct / 12;
  const constrRm = p.constructionLoanRatePct / 12;
  // Land loan is fully disbursed at t0; interest-only during build if pre-EMI.
  const landPreEMI = p.preEMIduringConstruction ? p.landLoanAmount * landRm : 0;

  const months: ConstructionMonthRow[] = [];
  let cumDisbursed = 0;
  let totalOwnPocketDraws = 0;
  let totalPreEMI = 0;

  for (let m = 1; m <= M; m++) {
    const interiors = m === M ? costStack.buildInteriors : 0;
    const constructionDraw = baseMonthly + interiors;
    // Disburse construction loan evenly, capped at the sanctioned amount.
    const loanDraw = Math.min(loanMonthly, constructionLoan - cumDisbursed);
    cumDisbursed += loanDraw;
    const ownPocketDraw = constructionDraw - loanDraw;
    const constructionPreEMI = cumDisbursed * constrRm;
    const preEMI = constructionPreEMI + landPreEMI;

    months.push({
      month: m,
      constructionDraw,
      loanDraw,
      ownPocketDraw,
      cumConstructionDisbursed: cumDisbursed,
      constructionPreEMI,
      landPreEMI,
      preEMI,
    });
    totalOwnPocketDraws += ownPocketDraw;
    totalPreEMI += preEMI;
  }

  return {
    months,
    totalOwnPocketDraws,
    totalPreEMI,
    combinedPrincipalAtCompletion: p.landLoanAmount + constructionLoan,
  };
}
