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
 * Reuses compute() (buyer), rentPath() (rent escalation), computeEquityBenchmark()
 * (renter portfolio) and bisect() (break-even). No new financial math.
 */
import type { Inputs } from "../types";
import { compute } from "./compute";
import { rentPath } from "./rent";
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
function buyerSide(inputs: Inputs) {
  const out = compute({ ...inputs, usageMode: "SelfOccupied" });
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
  // alt-rent annual path (₹/year), escalating at altRentGrowthPct
  const rentYear = rentPath(altRent0, {
    y1_5: inputs.altRentGrowthPct, y6_10: inputs.altRentGrowthPct,
    y11_20: inputs.altRentGrowthPct, y21_30: inputs.altRentGrowthPct, cohortDrag: 0,
  }, N);

  // monthly contribution stream: t0 lump (minus deposit), then each year's leftover/12
  const ownCashOutByMonth = new Array<number>(N * 12 + 1).fill(0);
  ownCashOutByMonth[0] = t0 - deposit;
  const rows: RentVsBuyYear[] = [];
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
