/**
 * §6 — sensitivity tornado on the highest-impact inputs, and the warning flags.
 * Each bar stresses one assumption ±X% and shows how far the RE − Equity gap moves.
 */
import { useState } from "react";
import type { Inputs, Outputs } from "../types";
import { formatMoney } from "./format";
import { computeSensitivity } from "./sensitivity";
import { deflate, type DisplayMode } from "./realMode";

interface Props {
  inputs: Inputs;
  out: Outputs;
}

interface TornadoProps extends Props {
  mode: DisplayMode;
}

const STRESSES = [0.1, 0.15, 0.2] as const;

function fmtVal(v: number, kind: "pct" | "money" | "number", geo: Inputs["geography"]): string {
  if (kind === "pct") return `${(v * 100).toFixed(1)}%`;
  if (kind === "number") return `${Math.round(v)}`;
  return formatMoney(v, geo);
}

function Tornado({ inputs, out, mode }: TornadoProps) {
  const [stress, setStress] = useState<number>(0.15);
  const geo = inputs.geography;
  const real = mode === "real";
  const cpi = inputs.cpiPct;
  const N = inputs.holdYears;
  const dGap = (v: number) => (real ? deflate(v, N, cpi) : v);

  const bars = computeSensitivity(inputs, out.gap, stress);
  const max = Math.max(...bars.map((b) => Math.max(Math.abs(b.low), Math.abs(b.high))), 1);

  return (
    <div className="rounded border border-slate-200 bg-white p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-slate-800">What moves the result most?</div>
        <div className="flex items-center gap-1 text-[10px] text-slate-500">
          <span>stress</span>
          {STRESSES.map((s) => (
            <button
              key={s}
              onClick={() => setStress(s)}
              className={`rounded px-1.5 py-0.5 ${stress === s ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              ±{Math.round(s * 100)}%
            </button>
          ))}
        </div>
      </div>
      <div className="mb-2 text-[11px] leading-snug text-slate-500">
        Each assumption is moved <b>±{Math.round(stress * 100)}%</b> on its own (everything else fixed); the bar
        shows how far the <b>RE − Equity gap</b> moves. Longer ⇒ the answer depends more on that guess. Centre = your
        current gap (<b>{formatMoney(dGap(out.gap), geo)}</b>, {real ? "today's money" : "nominal"}).
      </div>
      <div className="mb-2 flex items-center justify-between text-[10px] text-slate-400">
        <span>← lower value &amp; <span className="text-amber-600">favours equity</span></span>
        <span><span className="text-blue-600">favours real estate</span> &amp; higher value →</span>
      </div>

      <div className="flex flex-col gap-2">
        {bars.map((b) => {
          const leftGap = Math.min(b.gapLo, b.gapHi);
          const rightGap = Math.max(b.gapLo, b.gapHi);
          const leftInput = b.higherRaisesGap ? b.loValue : b.hiValue;
          const rightInput = b.higherRaisesGap ? b.hiValue : b.loValue;
          const negLeft = 50 + (b.low / max) * 50;
          const negWidth = ((Math.min(b.high, 0) - b.low) / max) * 50;
          const posLeft = 50 + (Math.max(b.low, 0) / max) * 50;
          const posWidth = ((b.high - Math.max(b.low, 0)) / max) * 50;
          return (
            <div key={b.label} className="flex flex-col gap-0.5">
              <div className="flex items-baseline justify-between text-[11px]">
                <span className="font-medium text-slate-700">{b.label}</span>
                <span className="text-[10px] text-slate-400">
                  {fmtVal(b.baseValue, b.kind, geo)} → {fmtVal(leftInput, b.kind, geo)}–{fmtVal(rightInput, b.kind, geo)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <span
                  className="w-20 shrink-0 text-right text-amber-700"
                  title={`If ${b.label} = ${fmtVal(leftInput, b.kind, geo)}, gap = ${formatMoney(dGap(leftGap), geo)}`}
                >
                  {formatMoney(dGap(leftGap), geo)}
                </span>
                <div className="relative h-4 flex-1 bg-slate-100">
                  <div className="absolute left-1/2 top-0 h-4 w-px bg-slate-400" />
                  {negWidth > 0 ? (
                    <div className="absolute top-0 h-4 bg-amber-300" style={{ left: `${negLeft}%`, width: `${negWidth}%` }} />
                  ) : null}
                  {posWidth > 0 ? (
                    <div className="absolute top-0 h-4 bg-blue-300" style={{ left: `${posLeft}%`, width: `${posWidth}%` }} />
                  ) : null}
                </div>
                <span
                  className="w-20 shrink-0 text-left text-blue-700"
                  title={`If ${b.label} = ${fmtVal(rightInput, b.kind, geo)}, gap = ${formatMoney(dGap(rightGap), geo)}`}
                >
                  {formatMoney(dGap(rightGap), geo)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 text-[10px] text-slate-400">
        Numbers either side = the RE − Equity gap at that stressed value ({real ? "today's money" : "nominal ₹"}).
        Drivers with no effect at current values are hidden; construction months are rounded by the engine.
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

export default function Insights({ inputs, out, mode }: TornadoProps) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <Tornado inputs={inputs} out={out} mode={mode} />
      <Warnings inputs={inputs} out={out} />
    </div>
  );
}
