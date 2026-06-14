/**
 * §6 — sensitivity tornado on the highest-impact inputs, and the warning flags.
 * Each tornado bar recomputes via compute() with one input perturbed ±15%.
 */
import { compute } from "../engine/compute";
import type { Inputs, Outputs } from "../types";
import { formatMoney } from "./format";

interface Props {
  inputs: Inputs;
  out: Outputs;
}

const DRIVERS: { keys: (keyof Inputs)[]; label: string }[] = [
  { keys: ["landCagrY1_10", "landCagrY11_20"], label: "Land CAGR" },
  { keys: ["equityCagrPct"], label: "Equity CAGR" },
  { keys: ["loanRatePct"], label: "Loan rate" },
  { keys: ["rentGrowthY1_5", "rentGrowthY6_10", "rentGrowthY11_20"], label: "Rent growth" },
  { keys: ["economicDepRatePct"], label: "Economic dep." },
];

const PLOT_DRIVERS: { keys: (keyof Inputs)[]; label: string }[] = [
  { keys: ["constructionRatePerSqft"], label: "Construction rate" },
  { keys: ["constructionMonths"], label: "Construction months" },
];

function perturb(inputs: Inputs, keys: (keyof Inputs)[], factor: number): Inputs {
  const next = { ...inputs };
  for (const k of keys) (next[k] as number) = (inputs[k] as number) * factor;
  return next;
}

function Tornado({ inputs, out }: Props) {
  const drivers = inputs.acquisitionType === "PlotSelfBuild" ? [...DRIVERS, ...PLOT_DRIVERS] : DRIVERS;
  const base = out.gap;
  const bars = drivers.map((d) => {
    const lo = compute(perturb(inputs, d.keys, 0.85), { skipBreakeven: true }).gap;
    const hi = compute(perturb(inputs, d.keys, 1.15), { skipBreakeven: true }).gap;
    return { label: d.label, lo: lo - base, hi: hi - base, span: Math.abs(hi - lo) };
  });
  bars.sort((a, b) => b.span - a.span);
  const max = Math.max(...bars.map((b) => Math.max(Math.abs(b.lo), Math.abs(b.hi))), 1);

  return (
    <div className="rounded border border-slate-200 bg-white p-3">
      <div className="mb-2 text-sm font-medium text-slate-800">Sensitivity (gap swing, ±15%)</div>
      <div className="flex flex-col gap-2">
        {bars.map((b) => (
          <div key={b.label} className="flex items-center gap-2 text-xs">
            <div className="w-28 shrink-0 text-slate-600">{b.label}</div>
            <div className="relative h-4 flex-1 bg-slate-100">
              <div className="absolute left-1/2 top-0 h-4 w-px bg-slate-400" />
              <div
                className="absolute top-0 h-4 bg-rose-300"
                style={{ left: `${50 + Math.min(b.lo, 0) / max / 2 * 100}%`, width: `${Math.abs(Math.min(b.lo, 0)) / max / 2 * 100}%` }}
              />
              <div
                className="absolute top-0 h-4 bg-emerald-300"
                style={{ left: "50%", width: `${Math.max(b.hi, 0) / max / 2 * 100}%` }}
              />
            </div>
            <div className="w-20 shrink-0 text-right text-slate-500">{formatMoney(b.span, inputs.geography)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Warnings({ inputs, out }: Props) {
  const warns: string[] = [];
  const negCarryYears = out.rows.filter((r) => r.postTaxRentalCF < 0).length;
  if (negCarryYears > 0) warns.push(`${negCarryYears} year(s) of negative carry — funded from pocket.`);

  if (inputs.taxRegime === "India_New") {
    const stranded = out.rows.some((r) => r.taxableHP < 0 && r.rentalTaxOrShield === 0);
    if (stranded) warns.push("New regime: let-out losses are stranded (no set-off / carry-forward).");
  }

  const udsShare = (inputs.udsSqft * inputs.landRate0) / Math.max(inputs.purchasePriceAllIn, 1);
  if (inputs.acquisitionType !== "PlotSelfBuild" && udsShare < 0.3) {
    warns.push(`Low UDS land share (~${(udsShare * 100).toFixed(0)}%) — weak land beta in an oversupplied corridor.`);
  }

  if (out.ltcgProperty > 0.05 * out.exitGross) warns.push("Large exit LTCG — meaningful drag on net proceeds.");

  if (inputs.maintenanceMode === "OwnerBearsAll" && out.rows.some((r) => r.noi < 0)) {
    warns.push("OwnerBearsAll with negative NOI in some years — high maintenance is denting income.");
  }

  if (inputs.acquisitionType === "PlotSelfBuild") {
    warns.push("Construction window carries pre-EMI + own-pocket draws with zero income (build drag).");
  }

  const yr1Emi = out.rows[0]?.emiAnnual ?? 0;
  const yr1Rent = out.rows[0]?.grossRentCollected ?? 0;
  if (yr1Emi > 1.5 * Math.max(yr1Rent, 1)) {
    warns.push("EMI far exceeds rent in year 1 — affordability/“house owns you” risk.");
  }

  return (
    <div className="rounded border border-amber-200 bg-amber-50 p-3">
      <div className="mb-2 text-sm font-medium text-amber-800">Warnings</div>
      {warns.length === 0 ? (
        <div className="text-xs text-amber-700">No flags.</div>
      ) : (
        <ul className="list-disc pl-4 text-xs text-amber-800">
          {warns.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Insights({ inputs, out }: Props) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <Tornado inputs={inputs} out={out} />
      <Warnings inputs={inputs} out={out} />
    </div>
  );
}
