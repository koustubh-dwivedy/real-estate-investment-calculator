/**
 * Inline Rent-vs-Buy card (PRD-adjacent). Compares BUYING a home to live in vs
 * RENTING an equivalent one and investing the difference. The buy side = the
 * left-panel inputs; this card adds the renting alternative (rent + assumptions).
 */
import { useMemo, useState } from "react";
import {
  CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { Inputs } from "../types";
import { rentVsBuy } from "../engine/rentVsBuy";
import { formatMoney, formatPct } from "./format";
import { deflate, type DisplayMode } from "./realMode";

interface Props {
  inputs: Inputs;
  onChange: (patch: Partial<Inputs>) => void;
  mode: DisplayMode;
}

function NumField({ label, value, onChange, suffix }: { label: string; value: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <label className="flex flex-col gap-0.5 text-xs">
      <span className="text-slate-600">{label}{suffix ? ` (${suffix})` : ""}</span>
      <input
        type="number"
        className="rounded border border-slate-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
        value={Number.isFinite(value) ? value : 0}
        step="any"
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
    </label>
  );
}

export default function RentVsBuy({ inputs, onChange, mode }: Props) {
  const [open, setOpen] = useState(true);
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const geo = inputs.geography;
  const real = mode === "real";
  const N = inputs.holdYears;
  const cpi = inputs.cpiPct;
  const dT = (v: number) => (real ? deflate(v, N, cpi) : v);
  const dY = (v: number, year: number) => (real ? deflate(v, year, cpi) : v);
  const basis = real ? "today's money" : "nominal";

  const rvb = useMemo(() => rentVsBuy(inputs, inputs.altRentPerMonth0), [inputs]);
  const acquisitionPrice = inputs.acquisitionType === "PlotSelfBuild" ? inputs.plotAreaSqft * inputs.landRate0 : inputs.purchasePriceAllIn;
  const yield0 = (inputs.altRentPerMonth0 * 12) / Math.max(acquisitionPrice, 1);
  const buyWins = rvb.gap >= 0;
  const sliderMax = Math.max(inputs.altRentPerMonth0 * 2, Number.isFinite(rvb.breakevenRent) ? rvb.breakevenRent * 1.4 : 100_000);

  return (
    <div className="rounded border border-slate-200 bg-white">
      <button
        className="flex w-full items-center justify-between px-3 py-2 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-sm font-medium text-slate-800">Rent vs Buy — a home you live in</span>
        <span className="text-xs text-slate-400">{open ? "▾" : "▸"}</span>
      </button>
      {!open ? null : (
        <div className="flex flex-col gap-3 border-t border-slate-100 p-3">
          <div className="text-[11px] leading-snug text-slate-500">
            <b>Buy</b> this flat &amp; live in it (your left-panel inputs, treated as self-occupied) vs
            <b> rent</b> an equivalent home and invest the same housing budget minus the rent. Figures in {basis}.
          </div>

          {/* rent lever */}
          <div className="rounded border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-medium text-slate-700">Rent you'd pay</span>
              <span className="text-xs text-slate-500">{formatMoney(inputs.altRentPerMonth0, geo)}/mo · {formatPct(yield0)} yield</span>
            </div>
            <input
              type="range"
              min={0}
              max={Math.round(sliderMax)}
              step={500}
              value={Math.min(inputs.altRentPerMonth0, sliderMax)}
              onChange={(e) => onChange({ altRentPerMonth0: Number(e.target.value) })}
              className="mt-2 w-full"
            />
            <div className="mt-1 flex items-center gap-2">
              <NumField label="Rent / month" value={inputs.altRentPerMonth0} onChange={(v) => onChange({ altRentPerMonth0: v })} />
              <button
                className="self-end rounded border border-slate-300 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-100"
                onClick={() => setShowAssumptions((s) => !s)}
              >
                {showAssumptions ? "Hide" : "Renting assumptions"}
              </button>
            </div>
            {showAssumptions ? (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <NumField label="Rent growth" suffix="%/yr" value={+(inputs.altRentGrowthPct * 100).toFixed(4)} onChange={(v) => onChange({ altRentGrowthPct: v / 100 })} />
                <NumField label="Security deposit" suffix="months" value={inputs.securityDepositMonths} onChange={(v) => onChange({ securityDepositMonths: v })} />
                <NumField label="Renewal cost" suffix="months" value={inputs.renewalCostMonths} onChange={(v) => onChange({ renewalCostMonths: v })} />
                <NumField label="Renewal cycle" suffix="years" value={inputs.renewalCycleYears} onChange={(v) => onChange({ renewalCycleYears: v })} />
              </div>
            ) : null}
          </div>

          {/* headline */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <div className="text-xs text-blue-700">Buyer net worth ({N}y)</div>
              <div className="text-xl font-bold text-blue-900">{formatMoney(dT(rvb.buyerTerminal), geo)}</div>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <div className="text-xs text-emerald-700">Renter net worth ({N}y)</div>
              <div className="text-xl font-bold text-emerald-900">{formatMoney(dT(rvb.renterTerminal), geo)}</div>
            </div>
          </div>
          <div className={`rounded border p-2 text-xs ${buyWins ? "border-blue-300 bg-blue-100 text-blue-900" : "border-emerald-300 bg-emerald-100 text-emerald-900"}`}>
            <b>{buyWins ? "Buying wins" : "Renting + investing wins"}</b> by {formatMoney(Math.abs(dT(rvb.gap)), geo)} at your rent of {formatMoney(inputs.altRentPerMonth0, geo)}/mo.
            {Number.isFinite(rvb.breakevenRent) ? (
              <> Break-even rent ≈ <b>{formatMoney(rvb.breakevenRent, geo)}/mo</b> — rent below this and renting wins.</>
            ) : null}
          </div>

          {/* sweep chart */}
          <div className="rounded border border-slate-200 p-2">
            <div className="mb-1 text-xs font-medium text-slate-600">How the answer changes with rent · {basis}</div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={rvb.sweep.map((s) => ({ rent: Math.round(s.rent), Buyer: Math.round(dT(s.buyer)), Renter: Math.round(dT(s.renter)) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="rent" tick={{ fontSize: 10 }} tickFormatter={(v) => formatMoney(v, geo)} />
                <YAxis tick={{ fontSize: 10 }} width={68} tickFormatter={(v) => formatMoney(v, geo)} />
                <Tooltip formatter={(v: number) => formatMoney(v, geo, "raw")} labelFormatter={(v) => `Rent ${formatMoney(Number(v), geo)}/mo`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {Number.isFinite(rvb.breakevenRent) ? <ReferenceLine x={Math.round(rvb.breakevenRent)} stroke="#94a3b8" strokeDasharray="4 2" label={{ value: "break-even", fontSize: 9, fill: "#64748b" }} /> : null}
                <Line type="monotone" dataKey="Buyer" stroke="#2563eb" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="Renter" stroke="#16a34a" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* own year-by-year table */}
          <button className="self-start text-[11px] text-slate-500 underline" onClick={() => setShowTable((s) => !s)}>
            {showTable ? "Hide" : "Show"} year-by-year
          </button>
          {showTable ? (
            <div className="max-h-72 overflow-auto rounded border border-slate-200">
              <table className="min-w-full text-right text-[11px]">
                <thead className="sticky top-0 bg-slate-100 text-slate-600">
                  <tr>
                    {["Yr", "Buyer cash", "Rent", "Renewal", "Renter invests", "Renter pot", "Buyer equity", "Ahead by"].map((h) => (
                      <th key={h} className="whitespace-nowrap px-2 py-1 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rvb.rows.map((r) => (
                    <tr key={r.year} className="odd:bg-white even:bg-slate-50">
                      <td className="px-2 py-1 font-medium">{r.year}</td>
                      <td className="px-2 py-1">{Math.round(dY(r.buyerHousingCash, r.year)).toLocaleString("en-IN")}</td>
                      <td className="px-2 py-1">{Math.round(dY(r.rentPaid, r.year)).toLocaleString("en-IN")}</td>
                      <td className="px-2 py-1">{Math.round(dY(r.renewalCost, r.year)).toLocaleString("en-IN")}</td>
                      <td className="px-2 py-1">{Math.round(dY(r.renterInvested, r.year)).toLocaleString("en-IN")}</td>
                      <td className="px-2 py-1">{Math.round(dY(r.renterPortfolio, r.year)).toLocaleString("en-IN")}</td>
                      <td className="px-2 py-1">{Math.round(dY(r.buyerNetWorth, r.year)).toLocaleString("en-IN")}</td>
                      <td className={`px-2 py-1 ${r.aheadBy >= 0 ? "text-emerald-700" : "text-blue-700"}`}>{Math.round(dY(r.aheadBy, r.year)).toLocaleString("en-IN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
