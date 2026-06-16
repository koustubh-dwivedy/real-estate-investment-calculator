/**
 * Rent-vs-Buy (a home you live in): BUY & self-occupy vs RENT an equivalent home and
 * invest the difference, on the SAME housing budget.
 *
 *  - Buyer (self-occupied): terminal = net sale proceeds. Annual housing cash =
 *    −postTaxRentalCF(t) (EMI + owner opex − tax shield); t0 = down-payment + entry.
 *  - Renter: sets aside the deposit (returned at exit), invests the rest of the t0
 *    cash, then each year pays rent + renewal cost and invests the leftover of the
 *    buyer's budget into equity. Terminal = equity portfolio + deposit returned.
 *
 * Reuses compute() (buyer), rentMonthlyPath() (rent escalation), computeEquityBenchmark()
 * (renter portfolio) and bisect() (break-even). No new financial math.
 */
import type { Inputs } from "../types";
import { compute } from "./compute";
import { rentMonthlyPath, annualizeRent } from "./rent";
import { computeEquityBenchmark } from "./equityBenchmark";
import { bisect } from "./numerics";

export interface RentVsBuyYear {
  year: number;
  buyerHousingCash: number;
  rentPaid: number;
  renewalCost: number;
  renterInvested: number;
  renterPortfolio: number;
  buyerNetWorth: number;
  aheadBy: number; // renter − buyer (positive ⇒ renting ahead)
}

export interface RentVsBuyResult {
  buyerTerminal: number;
  renterTerminal: number;
  gap: number; // buyer − renter (positive ⇒ buying wins)
  breakevenRent: number; // altRent0 at which they tie (NaN if outside bracket)
  rows: RentVsBuyYear[];
  sweep: { rent: number; buyer: number; renter: number }[];
}

/** Buyer's annual housing cash outflow (self-occupied) and terminal sale proceeds. */
function buyerSide(inputs: Inputs, skipBreakeven = false) {
  const out = compute({ ...inputs, usageMode: "SelfOccupied" }, { skipBreakeven });
  const N = inputs.holdYears;
  const t0 = out.rows.find((r) => r.year === 0)!.cumOwnCashOutA; // down-payment + entry
  // year t housing cash = −postTaxRentalCF(t) (EMI + opex − tax shield), >0 for self-occupied
  const annual: number[] = [];
  for (let t = 1; t <= N; t++) annual[t] = -out.rows.find((r) => r.year === t)!.postTaxRentalCF;
  const buyerTerminal = out.netSaleProceeds;
  // buyer net worth path (home equity = value − loan) for the per-year table
  const buyerNetWorthByYear: number[] = [];
  for (const r of out.rows) buyerNetWorthByYear[r.year] = r.propValueGross - r.loanBalanceEnd;
  return { t0, annual, buyerTerminal, buyerNetWorthByYear, N };
}

/** Renter terminal (and optional per-year rows) for a given starting rent. */
function renterSide(
  inputs: Inputs,
  buyer: ReturnType<typeof buyerSide>,
  altRent0: number,
  withRows: boolean,
): { terminal: number; rows?: RentVsBuyYear[] } {
  const { t0, annual, N, buyerNetWorthByYear } = buyer;
  const deposit = altRent0 * inputs.securityDepositMonths;
  // alt-rent annual path (₹/year): your tenant rent steps at altRentGrowthPct per
  // agreement term (the same 11/12-month renewal cadence as the property), flat between
  // renewals. Realized annual = Σ of the 12 monthly rents.
  const altMonthly = rentMonthlyPath(
    altRent0,
    {
      y1_5: inputs.altRentGrowthPct, y6_10: inputs.altRentGrowthPct,
      y11_20: inputs.altRentGrowthPct, y21_30: inputs.altRentGrowthPct, cohortDrag: 0,
    },
    N * 12,
    inputs.rentAgreementMonths,
  );
  const rentYear = annualizeRent(altMonthly, N);

  // monthly contribution stream: t0 lump (minus deposit), then each year's leftover/12
  const ownCashOutByMonth = new Array<number>(N * 12 + 1).fill(0);
  ownCashOutByMonth[0] = t0 - deposit;
  const rows: RentVsBuyYear[] = [];
  if (withRows) {
    // t=0 opening row: buyer pays the down-payment + entry; renter invests the same
    // cash (minus the deposit held), so both start from the same outlay.
    rows.push({
      year: 0, buyerHousingCash: t0, rentPaid: 0, renewalCost: 0,
      renterInvested: t0 - deposit, renterPortfolio: 0, // filled below
      buyerNetWorth: buyerNetWorthByYear[0]!, aheadBy: 0,
    });
  }
  for (let t = 1; t <= N; t++) {
    const rentPaid = rentYear[t]!;
    const monthlyRent = rentPaid / 12;
    const renewalCost =
      inputs.renewalCycleYears > 0 && t % inputs.renewalCycleYears === 0
        ? inputs.renewalCostMonths * monthlyRent
        : 0;
    const leftover = annual[t]! - rentPaid - renewalCost; // invested (may be negative)
    for (let m = 1; m <= 12; m++) ownCashOutByMonth[(t - 1) * 12 + m] = leftover / 12;
    if (withRows) {
      rows.push({
        year: t, buyerHousingCash: annual[t]!, rentPaid, renewalCost,
        renterInvested: leftover, renterPortfolio: 0, // filled below
        buyerNetWorth: buyerNetWorthByYear[t]!, aheadBy: 0,
      });
    }
  }

  const eq = computeEquityBenchmark({
    ownCashOutByMonth,
    equityCagrPct: inputs.equityCagrPct,
    ltcgEquityPct: inputs.ltcgEquityPct,
    equityLtcgExemptionAnnual: inputs.equityLtcgExemptionAnnual,
  });
  const terminal = eq.eqTerminal + deposit; // deposit returned nominally at exit

  if (withRows) {
    for (const r of rows) {
      r.renterPortfolio = (eq.potByMonth[r.year * 12] ?? 0) + deposit;
      r.aheadBy = r.renterPortfolio - r.buyerNetWorth;
    }
  }
  return { terminal, rows };
}

export function rentVsBuy(inputs: Inputs, altRentPerMonth0: number): RentVsBuyResult {
  const buyer = buyerSide(inputs);
  const renter = renterSide(inputs, buyer, altRentPerMonth0, true);

  // break-even rent: renter terminal decreases as rent rises → bisect renter−buyer = 0
  const f = (rent: number) => renterSide(inputs, buyer, rent, false).terminal - buyer.buyerTerminal;
  const breakevenRent = bisect(f, 0, Math.max(altRentPerMonth0 * 6, 200_000), 1);

  // sweep for the chart: bracket the break-even and the current rent
  const hi = Math.max(altRentPerMonth0 * 2, (Number.isFinite(breakevenRent) ? breakevenRent : altRentPerMonth0) * 1.4);
  const sweep: { rent: number; buyer: number; renter: number }[] = [];
  const steps = 16;
  for (let i = 0; i <= steps; i++) {
    const rent = (hi * i) / steps;
    sweep.push({ rent, buyer: buyer.buyerTerminal, renter: renterSide(inputs, buyer, rent, false).terminal });
  }

  return {
    buyerTerminal: buyer.buyerTerminal,
    renterTerminal: renter.terminal,
    gap: buyer.buyerTerminal - renter.terminal,
    breakevenRent,
    rows: renter.rows!,
    sweep,
  };
}

/** Fast buyer−renter gap (skips the internal break-even + sweep) for sensitivity. */
function rvbGap(inputs: Inputs, altRent: number): number {
  const buyer = buyerSide(inputs, true);
  return buyer.buyerTerminal - renterSide(inputs, buyer, altRent, false).terminal;
}

export interface RvbSensBar {
  label: string;
  low: number; // gap delta at −stress
  high: number; // gap delta at +stress
  span: number;
}

/**
 * Mini sensitivity of the rent-vs-buy verdict: each key driver stressed ±stress,
 * measuring the shift in the gap (buyer − renter; +ve favours buying). Sorted by span.
 */
export function rentVsBuySensitivity(inputs: Inputs, altRent: number, stress = 0.15): RvbSensBar[] {
  const isPlot = inputs.acquisitionType === "PlotSelfBuild";
  const drivers: { keys: (keyof Inputs)[]; label: string }[] = [
    { keys: ["equityCagrPct"], label: "Equity CAGR" },
    { keys: ["altRentGrowthPct"], label: "Rent growth" },
    { keys: ["landCagrY1_10", "landCagrY11_20"], label: "Property appreciation" },
    { keys: isPlot ? ["plotLoanRatePct", "constructionLoanRatePct"] : ["loanRatePct"], label: "Loan rate" },
    // Land quantum: udsSqft (apartment) / plotAreaSqft (plot) drives the buyer's land value.
    { keys: isPlot ? ["plotAreaSqft"] : ["udsSqft"], label: isPlot ? "Plot area" : "UDS (land share)" },
  ];
  const base = rvbGap(inputs, altRent);
  const bars = drivers.map((d) => {
    const lo = { ...inputs };
    const hi = { ...inputs };
    for (const k of d.keys) {
      (lo[k] as number) = (inputs[k] as number) * (1 - stress);
      (hi[k] as number) = (inputs[k] as number) * (1 + stress);
    }
    const dLo = rvbGap(lo, altRent) - base;
    const dHi = rvbGap(hi, altRent) - base;
    return { label: d.label, low: Math.min(dLo, dHi), high: Math.max(dLo, dHi), span: Math.abs(dHi - dLo) };
  });
  return bars.filter((b) => b.span >= 1).sort((a, b) => b.span - a.span);
}
