/**
 * Inline Rent-vs-Buy card. Compares BUYING a home to live in vs RENTING an equivalent
 * one and investing the difference. The buy side = the left-panel inputs (treated as
 * self-occupied); this card adds the renting alternative and a verdict sensitivity.
 */
import { useMemo } from "react";
import {
  CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { Inputs } from "../types";
import { rentVsBuy, rentVsBuySensitivity } from "../engine/rentVsBuy";
import { formatMoney, formatPct } from "./format";
import { deflate, type DisplayMode } from "./realMode";

interface Props {
  inputs: Inputs;
  onChange: (patch: Partial<Inputs>) => void;
  mode: DisplayMode;
}

/** Field with unit + one-line definition + the default/recommended value. */
function RentField({ label, unit, def, def0, value, onChange }: {
  label: string; unit: string; def: string; def0: string; value: number; onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-0.5 text-xs">
      <span className="flex items-baseline justify-between gap-1">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="shrink-0 text-[10px] text-slate-400">{unit}</span>
      </span>
      <input
        type="number"
        className="rounded border border-slate-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
        value={Number.isFinite(value) ? value : 0}
        step="any"
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
      <span className="text-[10px] leading-snug text-slate-400">{def} · default {def0}</span>
    </label>
  );
}

export default function RentVsBuy({ inputs, onChange, mode }: Props) {
  const geo = inputs.geography;
  const real = mode === "real";
  const N = inputs.holdYears;
  const cpi = inputs.cpiPct;
  const dT = (v: number) => (real ? deflate(v, N, cpi) : v);
  const dY = (v: number, year: number) => (real ? deflate(v, year, cpi) : v);
  const basis = real ? "today's money" : "nominal";

  const rvb = useMemo(() => rentVsBuy(inputs, inputs.altRentPerMonth0), [inputs]);
  const sens = useMemo(() => rentVsBuySensitivity(inputs, inputs.altRentPerMonth0), [inputs]);
  const acquisitionPrice = inputs.acquisitionType === "PlotSelfBuild" ? inputs.plotAreaSqft * inputs.landRate0 : inputs.purchasePriceAllIn;
  const yield0 = (inputs.altRentPerMonth0 * 12) / Math.max(acquisitionPrice, 1);
  const buyWins = rvb.gap >= 0;
  // Stable slider max (independent of the current rent, so the thumb tracks the value).
  const sliderMax = Math.max(inputs.rentPerMonth0 * 4, (acquisitionPrice * 0.1) / 12, 150_000);
  const sensMax = Math.max(...sens.map((b) => Math.max(Math.abs(b.low), Math.abs(b.high))), 1);

  return (
    <div className="flex flex-col gap-3 rounded border border-slate-200 bg-white p-3">
      <div className="text-sm font-medium text-slate-800">Rent vs Buy — a home you live in</div>

      {/* how this works */}
      <div className="rounded bg-slate-50 px-3 py-2 text-[11px] leading-snug text-slate-500">
        <b className="text-slate-600">How this works.</b> Both options start with the same cash and the same
        monthly housing budget. <b>Buy &amp; live in it</b> (self-occupied): pay the down-payment + costs now,
        then EMI + maintenance + property tax each year, and sell at year {N} → net sale proceeds.
        <b> Rent &amp; invest the difference</b>: invest the buyer's t0 cash (minus the deposit) now, pay your
        rent + any renewal cost each year, and invest whatever's left of the same budget at your
        <b> Equity CAGR ({formatPct(inputs.equityCagrPct)})</b>; the deposit is returned at the end. Whoever
        ends with more net worth wins; the <b>break-even rent</b> is where they tie. Figures in {basis}.
      </div>

      {/* rent lever (the rent YOU'D PAY as a tenant) */}
      <div className="rounded border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-medium text-slate-700">Rent you'd pay (as a tenant)</span>
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
        <div className="mt-1 flex flex-col gap-0.5 text-xs">
          <span className="flex items-baseline justify-between gap-1">
            <span className="font-medium text-slate-700">Rent / month</span>
            <span className="text-[10px] text-slate-400">₹/mo</span>
          </span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
              value={Number.isFinite(inputs.altRentPerMonth0) ? inputs.altRentPerMonth0 : 0}
              step="any"
              onChange={(e) => onChange({ altRentPerMonth0: parseFloat(e.target.value) || 0 })}
            />
            <button
              className="shrink-0 whitespace-nowrap rounded border border-slate-300 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-100"
              title={`Set it to the flat's let-out rent (${formatMoney(inputs.rentPerMonth0, geo)}/mo, from section B)`}
              onClick={() => onChange({ altRentPerMonth0: inputs.rentPerMonth0 })}
            >
              Match flat's rent
            </button>
          </div>
          <span className="text-[10px] leading-snug text-slate-400">
            What you'd pay a landlord for an equal home — drives ONLY Rent-vs-Buy (independent of the flat's let-out rent) · default {formatMoney(inputs.rentPerMonth0, geo)}
          </span>
        </div>
        <div className="mt-1 text-[10px] text-slate-400">
          Steps by the rent-step % below at each {inputs.rentAgreementMonths}-month renewal (flat in between).
          The flat's <b>let-out</b> rent (₹{Math.round(inputs.rentPerMonth0).toLocaleString("en-IN")}/mo, section B) is the income if you rent it OUT — not used here.
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <RentField label="Rent growth" unit="% p.a." def="Annual escalation of the rent you'd pay" def0="6.0%"
            value={+(inputs.altRentGrowthPct * 100).toFixed(4)} onChange={(v) => onChange({ altRentGrowthPct: v / 100 })} />
          <RentField label="Security deposit" unit="months" def="Refundable deposit set aside at t0, returned at exit" def0="3"
            value={inputs.securityDepositMonths} onChange={(v) => onChange({ securityDepositMonths: v })} />
          <RentField label="Renewal cost" unit="months" def="Brokerage + moving paid each lease renewal" def0="1"
            value={inputs.renewalCostMonths} onChange={(v) => onChange({ renewalCostMonths: v })} />
          <RentField label="Renewal cycle" unit="years" def="Years between lease renewals" def0="2"
            value={inputs.renewalCycleYears} onChange={(v) => onChange({ renewalCycleYears: v })} />
        </div>
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

      {/* net worth over time */}
      <div className="rounded border border-slate-200 p-2">
        <div className="mb-1 text-xs font-medium text-slate-600">Net worth over time · {basis}</div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={rvb.rows.map((r) => ({ year: r.year, Buyer: Math.round(dY(r.buyerNetWorth, r.year)), Renter: Math.round(dY(r.renterPortfolio, r.year)) }))}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="year" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} width={68} tickFormatter={(v) => formatMoney(v, geo)} />
            <Tooltip formatter={(v: number) => formatMoney(v, geo, "raw")} labelFormatter={(v) => `Year ${v}`} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="Buyer" stroke="#2563eb" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="Renter" stroke="#16a34a" dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
        <div className="mt-1 text-[10px] text-slate-400">Buyer = home equity (value − loan); Renter = equity portfolio (incl. deposit).</div>
      </div>

      {/* mini-tornado: what flips the verdict */}
      <div className="rounded border border-slate-200 p-2">
        <div className="mb-1 text-xs font-medium text-slate-600">What flips the verdict (each ±15%)</div>
        <div className="mb-1 flex items-center justify-between text-[10px] text-slate-400">
          <span>← <span className="text-amber-600">favours renting</span></span>
          <span><span className="text-blue-600">favours buying</span> →</span>
        </div>
        <div className="flex flex-col gap-1.5">
          {sens.map((b) => {
            const negLeft = 50 + (b.low / sensMax) * 50;
            const negWidth = ((Math.min(b.high, 0) - b.low) / sensMax) * 50;
            const posLeft = 50 + (Math.max(b.low, 0) / sensMax) * 50;
            const posWidth = ((b.high - Math.max(b.low, 0)) / sensMax) * 50;
            return (
              <div key={b.label} className="flex items-center gap-1.5 text-[11px]">
                <div className="w-28 shrink-0 text-slate-600">{b.label}</div>
                <div className="w-16 shrink-0 text-right text-amber-700" title={`−15% shifts the gap by ${formatMoney(dT(b.low), geo)}`}>
                  {b.low < 0 ? formatMoney(dT(b.low), geo) : "—"}
                </div>
                <div className="relative h-3.5 flex-1 bg-slate-100">
                  <div className="absolute left-1/2 top-0 h-3.5 w-px bg-slate-400" />
                  {negWidth > 0 ? <div className="absolute top-0 h-3.5 bg-amber-300" style={{ left: `${negLeft}%`, width: `${negWidth}%` }} /> : null}
                  {posWidth > 0 ? <div className="absolute top-0 h-3.5 bg-blue-300" style={{ left: `${posLeft}%`, width: `${posWidth}%` }} /> : null}
                </div>
                <div className="w-16 shrink-0 text-left text-blue-700" title={`+15% shifts the gap by ${formatMoney(dT(b.high), geo)}`}>
                  {b.high > 0 ? `+${formatMoney(dT(b.high), geo)}` : "—"}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-1 text-[10px] text-slate-400">Numbers either side = how far the buyer−renter gap moves at −15% (left, favours renting) and +15% (right, favours buying). Change values in the left panel (or rent above).</div>
      </div>

      {/* year-by-year table (always shown) */}
      <div className="text-[10px] text-slate-400">Year-by-year (t=0…{N}). "Renter − Buyer" = renter portfolio minus buyer home-equity: positive ⇒ renter ahead, negative ⇒ buyer ahead.</div>
      <div className="max-h-72 overflow-auto rounded border border-slate-200">
        <table className="min-w-full text-right text-[11px]">
          <thead className="sticky top-0 bg-slate-100 text-slate-600">
            <tr>
              {["Yr", "Buyer cash", "Rent", "Renewal", "Renter invests", "Renter pot", "Buyer equity", "Renter − Buyer"].map((h) => (
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
    </div>
  );
}
