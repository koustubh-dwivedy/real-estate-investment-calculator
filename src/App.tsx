/**
 * Application shell (PRD §1). Top: geography / acquisitionType / assetType + the
 * three switches. Left: input sections. Right: results + charts. Below: schedule
 * table and sensitivity/warnings. All numbers flow from the single compute().
 */
import { useMemo, useRef, useState } from "react";
import type {
  Inputs,
  Geography,
  AcquisitionType,
  AssetType,
  RentalCashUse,
  TaxRegime,
  CompareMode,
} from "./types";
import { getDefaults } from "./defaults";
import { compute } from "./engine/compute";
import { parseInputsFromCsv } from "./ui/importCsv";
import type { DisplayMode } from "./ui/realMode";
import InputsPanel from "./ui/InputsPanel";
import ResultsPanel from "./ui/ResultsPanel";
import ScheduleTable from "./ui/ScheduleTable";
import Insights from "./ui/Insights";

const GEOS: Geography[] = ["Bangalore", "Mumbai"];
const ACQ: AcquisitionType[] = ["ReadyApartment", "UnderConstructionApartment", "PlotSelfBuild"];
const ASSETS: AssetType[] = [
  "LandPlot",
  "PlottedDevelopmentVilla",
  "StandaloneApartment",
  "MidRiseSociety",
  "HighRiseSociety",
];

function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  def,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
  def?: string;
}) {
  return (
    <label className="flex w-44 flex-col gap-0.5 text-xs">
      <span className="font-medium text-slate-600">{label}</span>
      <select
        className="rounded border border-slate-300 px-2 py-1 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {def ? <span className="text-[10px] leading-snug text-slate-400">{def}</span> : null}
    </label>
  );
}

export default function App() {
  const [inputs, setInputs] = useState<Inputs>(() =>
    getDefaults({ geography: "Bangalore", assetType: "MidRiseSociety", acquisitionType: "ReadyApartment" }),
  );

  const patch = (p: Partial<Inputs>) => setInputs((prev) => ({ ...prev, ...p }));

  // Changing a structural selector reloads the matching validated defaults.
  const reload = (p: Partial<Pick<Inputs, "geography" | "assetType" | "acquisitionType">>) =>
    setInputs((prev) =>
      getDefaults({
        geography: p.geography ?? prev.geography,
        assetType: p.assetType ?? prev.assetType,
        acquisitionType: p.acquisitionType ?? prev.acquisitionType,
      }),
    );

  const out = useMemo(() => compute(inputs), [inputs]);

  // --- nominal vs real (today's money) display toggle (display-only) ---
  const [displayMode, setDisplayMode] = useState<DisplayMode>("nominal");

  // --- import a previously exported full CSV (restores the exact scenario) ---
  const fileRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const handleImportFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    const res = parseInputsFromCsv(text);
    if ("inputs" in res) {
      setInputs(res.inputs);
      setImportMsg({ ok: true, text: `Loaded scenario from ${file.name}` });
    } else {
      setImportMsg({ ok: false, text: res.error });
    }
    window.setTimeout(() => setImportMsg(null), 6000);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-3">
        <div>
          <h1 className="text-lg font-semibold">{inputs.holdYears}-Year Investment Value Calculator</h1>
          <p className="text-xs text-slate-500">
            Real estate vs same-cash equity benchmark · opportunity-cost (XIRR) framing
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              void handleImportFile(e.target.files?.[0]);
              e.target.value = ""; // allow re-selecting the same file
            }}
          />
          <button
            className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            title="Load a scenario from a previously exported full CSV (restores its inputs)."
            onClick={() => fileRef.current?.click()}
          >
            ⤴ Import CSV
          </button>
          {importMsg ? (
            <span className={`text-[11px] ${importMsg.ok ? "text-emerald-600" : "text-rose-600"}`}>
              {importMsg.text}
            </span>
          ) : null}
        </div>
      </header>

      <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-3">
        <div className="mb-2 rounded bg-slate-50 px-3 py-2 text-[11px] leading-snug text-slate-500">
          <b className="text-slate-600">Presets</b> load the validated 2026 defaults for a scenario and <b>reset your edits</b> — pick these first.
          <b className="text-slate-600"> Global switches</b> are strategy/regime choices that persist.
          The <b className="text-slate-600">left panel</b> then lets you override any individual number; every change recomputes live. The two engines compare the same out-of-pocket cash: property vs an equity SIP.
        </div>
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex flex-wrap items-start gap-3 rounded border border-slate-200 p-2">
            <div className="w-full text-[10px] font-semibold uppercase tracking-wide text-slate-400">Presets · reload defaults</div>
            <Select label="Geography" value={inputs.geography} options={GEOS} onChange={(v) => reload({ geography: v })} def="City/market — sets land rate, stamp duty, growth." />
            <Select label="Acquisition type" value={inputs.acquisitionType} options={ACQ} onChange={(v) => reload({ acquisitionType: v })} def="Ready / under-construction flat, or a plot you build on." />
            <Select label="Asset type" value={inputs.assetType} options={ASSETS} onChange={(v) => reload({ assetType: v })} def="Drives UDS, depreciation, premium, maintenance treatment." />
          </div>
          <div className="flex flex-wrap items-start gap-3 rounded border border-slate-200 p-2">
            <div className="w-full text-[10px] font-semibold uppercase tracking-wide text-slate-400">Global switches · persist</div>
            <Select label="Rental cash" value={inputs.rentalCashUse} options={["ReinvestEquity", "PrepayLoan", "Pocket"] as RentalCashUse[]} onChange={(v) => patch({ rentalCashUse: v })} def="Where surplus rent goes. No effect if rent never exceeds EMI+costs." />
            <Select label="Tax regime" value={inputs.taxRegime} options={["India_New", "India_Old"] as TaxRegime[]} onChange={(v) => patch({ taxRegime: v })} def="Old allows let-out loss set-off; New strands it." />
            <Select label="Compare mode" value={inputs.compareMode} options={["SameCashSIP", "LumpsumOnly"] as CompareMode[]} onChange={(v) => patch({ compareMode: v })} def="Whether equity also invests each EMI as a monthly SIP." />
            <Select label="Usage" value={inputs.usageMode} options={["LetOut", "SelfOccupied"]} onChange={(v) => patch({ usageMode: v })} def="Let out (earns rent) vs self-occupied (carrying cost only)." />
            <Select label="Hold horizon" value={String(inputs.holdYears)} options={["20", "30"]} onChange={(v) => patch({ holdYears: Number(v) })} def="Projection length. 30 reveals Y21–30 growth inputs in sections B & D." />
            <Select label="Rent renewal" value={String(inputs.rentAgreementMonths)} options={["11", "12"]} onChange={(v) => patch({ rentAgreementMonths: Number(v) })} def="Lease renewal cadence (months). 11 (typical in India) compounds rent escalation ~9% faster over 20y; occupancy unchanged." />
            <Select label="Display" value={displayMode === "real" ? "Real (today's money)" : "Nominal"} options={["Nominal", "Real (today's money)"]} onChange={(v) => setDisplayMode(v.startsWith("Real") ? "real" : "nominal")} def="Display-only. Real deflates every ₹ figure by inflation to today's money; engine stays nominal." />
          </div>
        </div>
      </div>

      <main className="grid grid-cols-1 items-start gap-5 p-5 lg:grid-cols-[minmax(300px,340px)_1fr]">
        {/* Left inputs — sticky sidebar that scrolls within its own height. */}
        <section className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pr-1">
          <InputsPanel inputs={inputs} onChange={patch} />
        </section>
        {/* Right results — flows with the page for full room. */}
        <section className="flex min-w-0 flex-col gap-5">
          <div
            className={`rounded border px-3 py-2 text-[11px] leading-snug ${
              displayMode === "real"
                ? "border-violet-200 bg-violet-50 text-violet-700"
                : "border-slate-200 bg-slate-50 text-slate-500"
            }`}
          >
            {displayMode === "real" ? (
              <>
                <b>Showing TODAY'S MONEY (real).</b> All ₹ amounts, both charts, and the schedule's money
                columns are deflated at <b>{(inputs.cpiPct * 100).toFixed(1)}% p.a.</b> from the start of the
                hold{inputs.acquisitionType === "PlotSelfBuild" ? " (= completion for a plot build)" : ""}.
                XIRRs are shown <b>real</b>. RE multiple and breakeven land CAGR stay <b>nominal</b>. The CSV
                export is always nominal.
              </>
            ) : (
              <>
                <b>Showing NOMINAL ₹</b> (future rupees). Lines tagged "today's money" are inflation-adjusted.
                Switch <b>Display → Real</b> (top) to express everything in today's purchasing power.
              </>
            )}
          </div>
          <ResultsPanel inputs={inputs} out={out} mode={displayMode} />
          <Insights inputs={inputs} out={out} mode={displayMode} />
          <ScheduleTable inputs={inputs} out={out} mode={displayMode} />
          <footer className="py-2 text-center text-[11px] text-slate-400">
            Formulas per PRD §4; numbers from a single compute(). Verify against reference/oracle.py.
          </footer>
        </section>
      </main>
    </div>
  );
}
