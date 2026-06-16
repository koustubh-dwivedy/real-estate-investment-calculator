/**
 * §8.1 — compute(inputs): the SINGLE source of truth.
 *
 * Wires loan → rent → value-stack → opex/tax → reinvest → (construction) → exit →
 * Engine B → metrics into per-period arrays. The headline scalars AND the §6A table
 * both read these same arrays — there is no second calculation path (invariant 3).
 *
 * Calendar: for PlotSelfBuild the hold clock starts at completion; the project
 * calendar has `offsetMonths = constructionMonths` of build before hold-year 1
 * (Q1). Engine B mirrors Engine A's OWN-POCKET cash on the same calendar months,
 * so cashConservationCheck (col 37) is 0 by construction (Q2).
 */
import type { Inputs, Outputs, PeriodRow } from "../types";
import { effTaxRate } from "../defaults";
import { amortize, type AmortizationResult } from "./loan";
import { rentMonthlyPath, annualizeRent } from "./rent";
import { valueStackAt, type ValueStackParams } from "./valueStack";
import { computeOpexAndTax, type OpexTaxParams, type OpexTaxYearInputs } from "./opexTax";
import { computeReinvest } from "./reinvest";
import { computeExit } from "./exit";
import { computeEquityBenchmark } from "./equityBenchmark";
import { constructionCostStack, constructionSchedule, deriveBuiltUpArea } from "./construction";
import { xirr, bisect, type DatedCashflow } from "./numerics";

interface ComputeOptions {
  skipBreakeven?: boolean;
  /** Override both land-CAGR phases (used by the breakeven solver). */
  landCagrOverride?: number;
}

export function compute(input: Inputs, opts: ComputeOptions = {}): Outputs {
  const N = input.holdYears;
  const isPlot = input.acquisitionType === "PlotSelfBuild";
  // Month counts must be whole numbers — they size monthly arrays. Round defensively
  // so non-integer inputs (e.g. a sensitivity sweep on constructionMonths) can't
  // produce an invalid array length.
  const constructionMonths = isPlot ? Math.max(0, Math.round(input.constructionMonths)) : 0;
  const offsetMonths = constructionMonths;
  const landCagr1 = opts.landCagrOverride ?? input.landCagrY1_10;
  const landCagr2 = opts.landCagrOverride ?? input.landCagrY11_20;

  // ---------------------------------------------------------------- §4.1 entry cash
  // For a plot, the price paid IS the land: plot area × land rate. This keeps price,
  // land rate and plot area coherent (and t=0 land value == price paid). For an
  // apartment, the all-in purchase price is the independent input.
  const acquisitionPrice = isPlot ? input.plotAreaSqft * input.landRate0 : input.purchasePriceAllIn;
  const entryRatePortion =
    acquisitionPrice * (input.stampDutyRegPct + input.gstPct + input.brokerageBuyPct);
  const entryCosts =
    entryRatePortion + input.otherAcquisitionCostsAbs + (isPlot ? 0 : input.interiorsCapex0);
  // Down-payment at t0: a plot is financed by the land loan (not the apartment loan).
  const t0Loan = isPlot ? input.landLoanAmount : input.loanAmount;
  const ownPocketT0 = acquisitionPrice - t0Loan;
  const totalCashAtT0 = ownPocketT0 + entryCosts;

  // ---------------------------------------------------------------- §4.11 construction
  let totalConstructionCost = 0;
  let constructionRows: ReturnType<typeof constructionSchedule>["months"] = [];
  let holdLoanPrincipal = input.loanAmount;
  let holdLoanRate = input.loanRatePct;
  let holdLoanTenure = input.loanTenureYears;

  if (isPlot) {
    const stack = constructionCostStack({
      plotAreaSqft: input.plotAreaSqft,
      farBuildableRatio: input.farBuildableRatio,
      floors: input.floors,
      builtUpAreaSqft: input.builtUpAreaSqft,
      constructionRatePerSqft: input.constructionRatePerSqft,
      constructionSoftCostsPct: input.constructionSoftCostsPct,
      constructionContingencyPct: input.constructionContingencyPct,
      buildInteriors: input.interiorsCapex0,
    });
    totalConstructionCost = stack.totalConstructionCost;
    const sched = constructionSchedule({
      costStack: stack,
      constructionMonths,
      constructionFinancing: input.constructionFinancing,
      landLoanAmount: input.landLoanAmount,
      constructionLoanAmount: input.constructionLoanAmount,
      plotLoanRatePct: input.plotLoanRatePct,
      constructionLoanRatePct: input.constructionLoanRatePct,
      preEMIduringConstruction: input.preEMIduringConstruction,
    });
    constructionRows = sched.months;
    holdLoanPrincipal = sched.combinedPrincipalAtCompletion;
    // Post-completion EMI on the combined loan uses a principal-weighted blend of the
    // land-loan and construction-loan rates, so both rate fields matter for the hold
    // (PRD §4.11 "blended/stated rate"). Defaults are equal → identical to before.
    const constructionLoan =
      input.constructionFinancing === "OwnFunds" ? 0 : input.constructionLoanAmount;
    const combinedForRate = input.landLoanAmount + constructionLoan;
    holdLoanRate =
      combinedForRate > 0
        ? (input.landLoanAmount * input.plotLoanRatePct +
            constructionLoan * input.constructionLoanRatePct) /
          combinedForRate
        : input.constructionLoanRatePct;
    holdLoanTenure = input.compositeLoanTenureYears;
  }

  // ---------------------------------------------------------------- §4.3 rent path
  // Monthly rent, flat within each agreement term, stepping at renewal (per-term, not
  // a smooth yearly escalation). `rentAnnual[t]` is the realized annual sum for §6A/tax.
  const holdMonths = N * 12;
  const rentMonthly = rentMonthlyPath(
    input.rentPerMonth0,
    {
      y1_5: input.rentGrowthY1_5,
      y6_10: input.rentGrowthY6_10,
      y11_20: input.rentGrowthY11_20,
      y21_30: input.rentGrowthY21_30,
      cohortDrag: input.cohortDragPct,
    },
    holdMonths,
    input.rentAgreementMonths,
  );
  const rentAnnual = annualizeRent(rentMonthly, N);

  // ---------------------------------------------------------------- §4.5 value stack
  const structureAreaSqft = isPlot
    ? deriveBuiltUpArea({
        builtUpAreaSqft: input.builtUpAreaSqft,
        plotAreaSqft: input.plotAreaSqft,
        farBuildableRatio: input.farBuildableRatio,
        floors: input.floors,
      })
    : input.sbua;
  const vsParams: ValueStackParams = {
    land: {
      udsSqft: isPlot ? input.plotAreaSqft : input.udsSqft,
      landRate0: input.landRate0,
      landCagrY1_10: landCagr1,
      landCagrY11_20: landCagr2,
      landCagrY21_30: opts.landCagrOverride ?? input.landCagrY21_30,
      infraBumps: input.infraBumps,
    },
    structure: {
      structureAreaSqft,
      replacementCost0: input.replacementCost0,
      constructionInflationPct: input.constructionInflationPct,
      physicalDepRatePct: input.physicalDepRatePct,
      economicDepRatePct: input.economicDepRatePct,
      ageAtPurchaseYears: isPlot ? 0 : input.ageAtPurchaseYears,
      salvageFloor: input.salvageFloor,
    },
    premium: {
      sbua: isPlot ? 0 : input.sbua,
      premium0: isPlot ? 0 : input.premium0,
      premiumDecayYears: input.premiumDecayYears,
    },
    redev: {
      enabled: input.redevelopmentEnabled,
      redevEligibleAgeYears: input.redevEligibleAgeYears,
      redevOptionValuePctOfLand: input.redevOptionValuePctOfLand,
    },
  };
  const valueRows = Array.from({ length: N + 1 }, (_, t) => valueStackAt(vsParams, t));

  // ---------------------------------------------------------------- §4.2 loan (hold)
  // First pass without rental prepay to get interest/EMI; PrepayLoan adds a 2nd pass.
  const firstLoan = amortize({
    principal: holdLoanPrincipal,
    annualRate: holdLoanRate,
    tenureYears: holdLoanTenure,
    prepaymentAnnual: input.prepaymentAnnual,
    horizonYears: N,
  });

  const eff = effTaxRate(input);
  const opexParams: OpexTaxParams = {
    usageMode: input.usageMode,
    maintenanceMode: input.maintenanceMode,
    taxRegime: input.taxRegime,
    vacancyPct: input.vacancyPct,
    reLetBrokerageMonths: input.reLetBrokerageMonths,
    // Maintenance scales with the built structure: sbua for an apartment, built-up
    // area for a plot (so plot upkeep tracks the house, not the inert sbua field).
    sbua: structureAreaSqft,
    societyCamPerSqftMonth0: input.societyCamPerSqftMonth0,
    camEscalationPct: input.camEscalationPct,
    maintenanceAgeAccelPct: input.maintenanceAgeAccelPct,
    ownerMaintPctOfRent: input.ownerMaintPctOfRent,
    ownerMaintPctOfValue: input.ownerMaintPctOfValue,
    propertyTaxAnnual0: input.propertyTaxAnnual0,
    propertyTaxGrowthPct: input.propertyTaxGrowthPct,
    waterTaxAnnual0: input.waterTaxAnnual0,
    waterTaxGrowthPct: input.waterTaxGrowthPct,
    majorRepairReservePctOfValue: input.majorRepairReservePctOfValue,
    interiorsCapex0: input.interiorsCapex0,
    interiorRefreshCycleYears: input.interiorRefreshCycleYears,
    interiorRefreshPctOfInitial: input.interiorRefreshPctOfInitial,
    cpiPct: input.cpiPct,
    effTaxRate: eff,
  };

  const buildOpexYears = (loan: AmortizationResult): OpexTaxYearInputs[] =>
    Array.from({ length: N }, (_, i) => {
      const t = i + 1;
      return {
        t,
        // the 12 monthly market rents for hold-year t (index 0..11)
        rentMonths: rentMonthly.slice((t - 1) * 12 + 1, t * 12 + 1),
        age: (isPlot ? 0 : input.ageAtPurchaseYears) + t,
        propValueClean: valueRows[t]!.propValueClean,
        interestPaid: loan.interestPaid[t] ?? 0,
        emiAnnual: loan.emiAnnual[t] ?? 0,
      };
    });

  // Monthly net rental cash (hold-indexed 1..N*12): owner rent cash − cash opex − EMI,
  // with the annual tax settlement dropped into each year's LAST month. Σ over a year ==
  // postTaxRentalCF (the annual identity is preserved). This is the stream the reinvest
  // sleeve and Engine B both consume — the same-cash invariant now holds monthly.
  const monthlyCFfrom = (loan: AmortizationResult, opex: ReturnType<typeof computeOpexAndTax>): number[] => {
    const cf = new Array<number>(holdMonths + 1).fill(0);
    for (let m = 1; m <= holdMonths; m++) {
      const t = Math.ceil(m / 12);
      const emiM = loan.monthly[m - 1]?.emi ?? 0;
      const taxM = m % 12 === 0 ? opex.rows[t - 1]!.rentalTaxOrShield : 0;
      cf[m] = (opex.grossRentMonthly[m] ?? 0) - (opex.cashOpexMonthly[m] ?? 0) - emiM - taxM;
    }
    return cf;
  };

  let opexResult = computeOpexAndTax(opexParams, buildOpexYears(firstLoan));
  let opexRows = opexResult.rows;
  let reinvest = computeReinvest(
    input.rentalCashUse,
    monthlyCFfrom(firstLoan, opexResult),
    input.equityCagrPct,
  );

  // Second pass for PrepayLoan: feed rental prepay into the loan, then recompute.
  let holdLoan = firstLoan;
  let reinvestPotByMonth = reinvest.reinvestPotByMonth;
  let reinvestPotTerminal = reinvest.reinvestPot;
  // Cost basis of the reinvest sleeve (Σ contributions), used for its equity LTCG at exit.
  // ReinvestEquity/Pocket: reinvest.ts tracks it. PrepayLoan: the leftover sleeve basis is
  // accumulated alongside its pot in the second pass below.
  let reinvestContrib = reinvest.reinvestContrib;
  if (input.rentalCashUse === "PrepayLoan") {
    holdLoan = amortize({
      principal: holdLoanPrincipal,
      annualRate: holdLoanRate,
      tenureYears: holdLoanTenure,
      prepaymentAnnual: input.prepaymentAnnual,
      extraPrincipalByYear: reinvest.prepayByYear,
      horizonYears: N,
    });
    opexResult = computeOpexAndTax(opexParams, buildOpexYears(holdLoan));
    opexRows = opexResult.rows;
    const cf = monthlyCFfrom(holdLoan, opexResult);
    reinvest = computeReinvest(input.rentalCashUse, cf, input.equityCagrPct);
    // Positive rental cash that the loan could not absorb (prepay is capped at the
    // remaining balance, e.g. after payoff) is NOT dropped — it accrues in the equity
    // sleeve at equityCagr (monthly), so PrepayLoan and ReinvestEquity stay comparable
    // (T8). Leftover for a year = year's surplus − principal actually prepaid; it is
    // injected at the year-end month and compounds monthly thereafter.
    const monthlyGrowth = Math.pow(1 + input.equityCagrPct, 1 / 12);
    const pot = new Array<number>(holdMonths + 1).fill(0);
    let acc = 0;
    let leftoverContrib = 0;
    for (let m = 1; m <= holdMonths; m++) {
      acc *= monthlyGrowth;
      if (m % 12 === 0) {
        const t = m / 12;
        let surplus = 0;
        for (let k = (t - 1) * 12 + 1; k <= t * 12; k++) surplus += Math.max(cf[k]!, 0);
        const applied = holdLoan.prepayAnnual[t] ?? 0;
        const leftover = Math.max(surplus - applied, 0);
        acc += leftover;
        leftoverContrib += leftover;
      }
      pot[m] = acc;
    }
    reinvestPotByMonth = pot;
    reinvestPotTerminal = acc;
    reinvestContrib = leftoverContrib;
  }

  // ---------------------------------------------------------------- §4.7 exit
  const exit = computeExit({
    propValueCleanFinal: valueRows[N]!.propValueClean,
    liquidityHaircutPct: input.liquidityHaircutPct,
    sellingCostPct: input.sellingCostPct,
    purchasePriceAllIn: acquisitionPrice,
    entryCosts,
    totalConstructionCost,
    ltcgPropertyPct: input.ltcgPropertyPct,
    balanceEndFinal: holdLoan.balanceEnd[N] ?? 0,
    reinvestPot: reinvestPotTerminal,
    reinvestContrib,
    ltcgEquityPct: input.ltcgEquityPct,
    equityLtcgExemptionAnnual: input.equityLtcgExemptionAnnual,
  });

  // ---------------------------------------------------------------- §4.9 Engine B stream
  const totalMonths = offsetMonths + N * 12;
  const ownCashOut = new Array<number>(totalMonths + 1).fill(0);
  ownCashOut[0] = totalCashAtT0;
  // construction window (own-pocket draws + pre-EMI)
  for (const r of constructionRows) {
    ownCashOut[r.month] = (ownCashOut[r.month] ?? 0) + r.ownPocketDraw + r.preEMI;
  }
  // hold window: Engine B deploys the buyer's actual out-of-pocket cash, MONTHLY. The
  // net pocket in a hold-month is the negative carry = max(EMI + opex + tax − rent, 0);
  // the EMI is ALREADY inside negCarry (monthlyCF = rent − opex − EMI − tax), so it must
  // NOT be added again. Surplus months go to the reinvest sleeve, not Engine B. SameCashSIP
  // mirrors this full out-of-pocket; LumpsumOnly invests only the upfront lump(s).
  const sameCash = input.compareMode === "SameCashSIP";
  if (sameCash) {
    for (let m = 1; m <= holdMonths; m++) {
      const cal = offsetMonths + m;
      ownCashOut[cal] = (ownCashOut[cal] ?? 0) + (reinvest.negCarryByMonth[m] ?? 0);
    }
  }

  const equity = computeEquityBenchmark({
    ownCashOutByMonth: ownCashOut,
    equityCagrPct: input.equityCagrPct,
    ltcgEquityPct: input.ltcgEquityPct,
    equityLtcgExemptionAnnual: input.equityLtcgExemptionAnnual,
  });

  // ---------------------------------------------------------------- §4.10 metrics
  const reTerminal = exit.reTerminal;
  const eqTerminal = equity.eqTerminal;

  // Engine A dated cash flows for XIRR (per rentalCashUse — see reinvest.ts). Hold flows
  // are now MONTHLY, dated on their true calendar month (no year-end lumping — audit B1).
  const cfMonthly = monthlyCFfrom(holdLoan, opexResult);
  const aCashflows: DatedCashflow[] = [{ year: 0, amount: -totalCashAtT0 }];
  for (const r of constructionRows) {
    aCashflows.push({ year: r.month / 12, amount: -(r.ownPocketDraw + r.preEMI) });
  }
  const pocket = input.rentalCashUse === "Pocket";
  for (let m = 1; m <= holdMonths; m++) {
    const year = (offsetMonths + m) / 12;
    // Pocket counts every net month (±) as it lands; otherwise only deficits are out of
    // pocket (surplus is reinvested and returned at the terminal node).
    const cf = pocket ? cfMonthly[m]! : -(reinvest.negCarryByMonth[m] ?? 0);
    aCashflows.push({ year, amount: cf });
  }
  const terminalYear = totalMonths / 12;
  // Non-pocket terminal receives the sleeve NET of its equity LTCG (audit F1). Pocket
  // counts surpluses as interim inflows, so it adds 0 here (and its sleeve LTCG is 0).
  aCashflows.push({
    year: terminalYear,
    amount: exit.netSaleProceeds + (pocket ? 0 : reinvestPotTerminal - exit.reinvestSleeveLtcg),
  });

  const bCashflows: DatedCashflow[] = ownCashOut.map((amt, m) => ({ year: m / 12, amount: -amt }));
  bCashflows.push({ year: terminalYear, amount: eqTerminal });

  const reXirr = xirr(aCashflows);
  const eqXirr = xirr(bCashflows);

  const sumOwnCashOutA = ownCashOut.reduce((s, x) => s + x, 0);
  const reMultiple = sumOwnCashOutA > 0 ? reTerminal / sumOwnCashOutA : NaN;
  const realReTerminal = reTerminal / Math.pow(1 + input.cpiPct, N);

  // Breakeven land CAGR: solve x s.t. gap(x) = RE_terminal(x) − EQ_terminal(x) = 0.
  // EQ_terminal has a mild dependence on land CAGR (via the major-repair reserve that
  // feeds negative-carry → Engine B contributions), so we zero the full recomputed gap.
  let breakevenLandCagr = NaN;
  if (!opts.skipBreakeven) {
    breakevenLandCagr = bisect(
      (x) => {
        const o = compute(input, { skipBreakeven: true, landCagrOverride: x });
        return o.reTerminal - o.eqTerminal;
      },
      -0.05,
      0.3,
      1e-10, // tight: reTerminal is very steep in land CAGR
    );
  }

  // ---------------------------------------------------------------- §6A rows
  const rows: PeriodRow[] = [];
  // cumulative own-cash-out and contribB by calendar month → sample at hold-year ends
  const cumOwnByMonth = new Array<number>(totalMonths + 1).fill(0);
  let acc = 0;
  for (let m = 0; m <= totalMonths; m++) {
    acc += ownCashOut[m] ?? 0;
    cumOwnByMonth[m] = acc;
  }

  // t=0 opening row — the acquisition snapshot at the start of the hold clock
  // (purchase for an apartment; completion for a plot build). All flows are 0; the
  // value stack is at t=0, the loan is at its opening balance, and the equity sleeve
  // holds the cash deployed so far.
  {
    const v0 = valueRows[0]!;
    const loanBalance0 = holdLoan.balanceEnd[0] ?? holdLoanPrincipal;
    const equityPot0 = equity.potByMonth[offsetMonths] ?? 0;
    const cumOwn0 = cumOwnByMonth[offsetMonths] ?? 0;
    const cumContrib0 = equity.cumContribByMonth[offsetMonths] ?? 0;
    const reNetWorth0 = v0.propValueClean - loanBalance0;
    rows.push({
      year: 0,
      landValue: v0.landValue,
      structureValue: v0.structureValue,
      premiumValue: v0.premiumValue,
      redevOptionValue: v0.redevValue,
      propValueGross: v0.propValueClean,
      landSharePct: v0.landSharePct,
      replacementCostPerSqft: v0.replacementCostPerSqft,
      depFactor: v0.depFactor,
      emiAnnual: 0,
      interestPaid: 0,
      principalPaid: 0,
      loanBalanceEnd: loanBalance0,
      prepayment: 0,
      marketRent: 0,
      grossRentCollected: 0,
      societyCAM: 0,
      ownerMaintenance: 0,
      waterTax: 0,
      interiorRefresh: 0,
      majorRepairReserve: 0,
      propertyTax: 0,
      noi: 0,
      postTaxRentalCF: 0,
      taxableHP: 0,
      rentalTaxOrShield: 0,
      carryForwardLossBalance: 0,
      reinvestPot: 0,
      equityPot: equityPot0,
      cumOwnCashOutA: cumOwn0,
      cumContribB: cumContrib0,
      cashConservationCheck: cumContrib0 - cumOwn0,
      reNetWorth: reNetWorth0,
      equityNetWorth: equityPot0,
      netWorthGap: reNetWorth0 - equityPot0,
    });
  }

  for (let t = 1; t <= N; t++) {
    const v = valueRows[t]!;
    const o = opexRows[t - 1]!;
    const cal = offsetMonths + t * 12;
    const loanBalanceEnd = holdLoan.balanceEnd[t] ?? 0;
    const reinvestPot = reinvestPotByMonth[t * 12] ?? 0;
    const equityPot = equity.potByMonth[cal] ?? 0;
    const cumOwnCashOutA = cumOwnByMonth[cal] ?? 0;
    const cumContribB = equity.cumContribByMonth[cal] ?? 0;
    const reNetWorth = v.propValueClean - loanBalanceEnd + reinvestPot;
    rows.push({
      year: t,
      landValue: v.landValue,
      structureValue: v.structureValue,
      premiumValue: v.premiumValue,
      redevOptionValue: v.redevValue,
      propValueGross: v.propValueClean,
      landSharePct: v.landSharePct,
      replacementCostPerSqft: v.replacementCostPerSqft,
      depFactor: v.depFactor,
      emiAnnual: holdLoan.emiAnnual[t] ?? 0,
      interestPaid: holdLoan.interestPaid[t] ?? 0,
      principalPaid: holdLoan.principalPaid[t] ?? 0,
      loanBalanceEnd,
      prepayment: holdLoan.prepayAnnual[t] ?? 0,
      marketRent: rentAnnual[t]!,
      grossRentCollected: o.grossRent,
      societyCAM: o.camBase,
      ownerMaintenance: o.ownerMaintenance,
      waterTax: o.waterTax,
      interiorRefresh: o.interiorRefresh,
      majorRepairReserve: o.majorRepairReserve,
      propertyTax: o.propertyTax,
      noi: o.noi,
      postTaxRentalCF: o.postTaxRentalCF,
      taxableHP: o.taxableHP,
      rentalTaxOrShield: o.rentalTaxOrShield,
      carryForwardLossBalance: o.carryForwardLossBalance,
      reinvestPot,
      equityPot,
      cumOwnCashOutA,
      cumContribB,
      cashConservationCheck: cumContribB - cumOwnCashOutA,
      reNetWorth,
      equityNetWorth: equityPot,
      netWorthGap: reNetWorth - equityPot,
    });
  }

  return {
    reTerminal,
    eqTerminal,
    gap: reTerminal - eqTerminal,
    reXirr,
    eqXirr,
    reMultiple,
    breakevenLandCagr,
    realReTerminal,
    exitGross: exit.exitGross,
    sellCosts: exit.sellCosts,
    ltcgProperty: exit.ltcg,
    reinvestSleeveLtcg: exit.reinvestSleeveLtcg,
    loanPayoff: holdLoan.balanceEnd[N] ?? 0,
    netSaleProceeds: exit.netSaleProceeds,
    rows,
  };
}
