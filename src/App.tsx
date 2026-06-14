/**
 * Application shell (PRD §1). Top: geography / acquisitionType / assetType + the
 * three switches. Left: input sections. Right: results + charts. Below: schedule
 * table and sensitivity/warnings. All numbers flow from the single compute().
 */
import { useMemo, useState } from "react";
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

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 lg:h-screen lg:overflow-hidden">
      <header className="shrink-0 border-b border-slate-200 bg-white px-6 py-3">
        <h1 className="text-lg font-semibold">20-Year Investment Value Calculator</h1>
        <p className="text-xs text-slate-500">
          Real estate vs same-cash equity benchmark · opportunity-cost (XIRR) framing
        </p>
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
          </div>
        </div>
      </div>

      <main className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-6 lg:grid-cols-[minmax(320px,380px)_1fr] lg:overflow-hidden">
        {/* Left inputs — scrolls independently of the results on desktop. */}
        <section className="min-h-0 lg:overflow-y-auto lg:pr-1">
          <InputsPanel inputs={inputs} onChange={patch} />
        </section>
        {/* Right results — its own scroll. */}
        <section className="flex min-h-0 min-w-0 flex-col gap-4 lg:overflow-y-auto lg:pr-1">
          <ResultsPanel inputs={inputs} out={out} />
          <Insights inputs={inputs} out={out} />
          <ScheduleTable inputs={inputs} out={out} />
          <footer className="py-2 text-center text-[11px] text-slate-400">
            Formulas per PRD §4; numbers from a single compute(). Verify against reference/oracle.py.
          </footer>
        </section>
      </main>
    </div>
  );
}
