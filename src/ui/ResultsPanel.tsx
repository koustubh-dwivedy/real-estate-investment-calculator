/**
 * Right-column results (PRD §6): headline RE vs EQ + gap, key metrics, breakeven
 * land CAGR, real terminal, and the value-stack area chart.
 */
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Inputs, Outputs } from "../types";
import { formatMoney, formatPct, formatMultiple } from "./format";

interface Props {
  inputs: Inputs;
  out: Outputs;
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-semibold text-slate-900">{value}</div>
      {hint ? <div className="text-[11px] text-slate-400">{hint}</div> : null}
    </div>
  );
}

export default function ResultsPanel({ inputs, out }: Props) {
  const geo = inputs.geography;
  const winner = out.gap >= 0 ? "Real estate" : "Equity";
  const chartData = out.rows.map((r) => ({
    year: r.year,
    Land: Math.round(r.landValue),
    Structure: Math.round(r.structureValue),
    Premium: Math.round(r.premiumValue),
    Redev: Math.round(r.redevOptionValue),
    "Reinvest pot": Math.round(r.reinvestPot),
    "Loan balance": Math.round(r.loanBalanceEnd),
  }));

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
          <div className="text-xs text-blue-700">Real-estate terminal ({inputs.holdYears}y)</div>
          <div className="text-2xl font-bold text-blue-900">{formatMoney(out.reTerminal, geo)}</div>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <div className="text-xs text-emerald-700">Equity terminal (same cash)</div>
          <div className="text-2xl font-bold text-emerald-900">{formatMoney(out.eqTerminal, geo)}</div>
        </div>
      </div>

      <div className={`rounded-lg border p-3 ${out.gap >= 0 ? "border-blue-300 bg-blue-100" : "border-amber-300 bg-amber-100"}`}>
        <div className="text-xs text-slate-600">Gap (RE − Equity) · {winner} wins</div>
        <div className="text-xl font-bold text-slate-900">{formatMoney(out.gap, geo)}</div>
      </div>

      {(() => {
        const posYears = out.rows.filter((r) => r.postTaxRentalCF > 0).length;
        const finalPot = out.rows[out.rows.length - 1]?.reinvestPot ?? 0;
        return (
          <div className="rounded border border-slate-200 bg-white p-2 text-[11px] text-slate-500">
            <b className="text-slate-600">Rental cash · {inputs.rentalCashUse}:</b>{" "}
            {posYears === 0 ? (
              <>rent never exceeds EMI + costs (negative carry all {out.rows.length - 1} yrs), so there is no surplus to route — the rental-cash switch has no effect here. Lower the loan or raise rent to see it bite.</>
            ) : (
              <>{posYears} year(s) of surplus rent; sleeve value at exit {formatMoney(finalPot, geo)}.</>
            )}
          </div>
        );
      })()}

      <div className="grid grid-cols-3 gap-3">
        <Metric label="RE XIRR" value={formatPct(out.reXirr)} />
        <Metric label="Equity XIRR" value={formatPct(out.eqXirr)} />
        <Metric label="RE multiple" value={formatMultiple(out.reMultiple)} />
        <Metric
          label="Breakeven land CAGR"
          value={formatPct(out.breakevenLandCagr)}
          hint="Land must grow ≥ this for RE to beat equity"
        />
        <Metric label="Real RE terminal" value={formatMoney(out.realReTerminal, geo)} hint="today's money" />
        <Metric label="Net sale proceeds" value={formatMoney(out.netSaleProceeds, geo)} hint="after costs/LTCG/loan" />
      </div>

      <div className="rounded border border-slate-200 bg-white p-3">
        <div className="mb-2 text-sm font-medium text-slate-700">Value stack over time</div>
        <ResponsiveContainer width="100%" height={380}>
          <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="year" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatMoney(v, geo)} width={70} />
            <Tooltip formatter={(v: number) => formatMoney(v, geo, "raw")} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Area type="monotone" dataKey="Land" stackId="1" stroke="#2563eb" fill="#93c5fd" />
            <Area type="monotone" dataKey="Structure" stackId="1" stroke="#16a34a" fill="#86efac" />
            <Area type="monotone" dataKey="Premium" stackId="1" stroke="#d97706" fill="#fcd34d" />
            <Area type="monotone" dataKey="Redev" stackId="1" stroke="#7c3aed" fill="#c4b5fd" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded border border-slate-200 bg-white p-3">
        <div className="mb-2 text-sm font-medium text-slate-700">Net worth: RE vs Equity</div>
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={out.rows.map((r) => ({ year: r.year, RE: Math.round(r.reNetWorth), Equity: Math.round(r.equityNetWorth) }))}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="year" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatMoney(v, geo)} width={70} />
            <Tooltip formatter={(v: number) => formatMoney(v, geo, "raw")} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="RE" stroke="#2563eb" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="Equity" stroke="#16a34a" dot={false} strokeWidth={2} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
