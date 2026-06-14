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
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-slate-500">{label}</span>
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
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-6 py-3">
        <h1 className="text-lg font-semibold">20-Year Investment Value Calculator</h1>
        <p className="text-xs text-slate-500">
          Real estate vs same-cash equity benchmark · opportunity-cost (XIRR) framing
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 bg-white px-6 py-3">
        <Select label="Geography" value={inputs.geography} options={GEOS} onChange={(v) => reload({ geography: v })} />
        <Select label="Acquisition type" value={inputs.acquisitionType} options={ACQ} onChange={(v) => reload({ acquisitionType: v })} />
        <Select label="Asset type" value={inputs.assetType} options={ASSETS} onChange={(v) => reload({ assetType: v })} />
        <div className="mx-2 h-8 w-px bg-slate-200" />
        <Select label="Rental cash" value={inputs.rentalCashUse} options={["ReinvestEquity", "PrepayLoan", "Pocket"] as RentalCashUse[]} onChange={(v) => patch({ rentalCashUse: v })} />
        <Select label="Tax regime" value={inputs.taxRegime} options={["India_New", "India_Old"] as TaxRegime[]} onChange={(v) => patch({ taxRegime: v })} />
        <Select label="Compare mode" value={inputs.compareMode} options={["SameCashSIP", "LumpsumOnly"] as CompareMode[]} onChange={(v) => patch({ compareMode: v })} />
        <Select label="Usage" value={inputs.usageMode} options={["LetOut", "SelfOccupied"]} onChange={(v) => patch({ usageMode: v })} />
      </div>

      <main className="grid grid-cols-1 gap-4 p-6 lg:grid-cols-[minmax(320px,380px)_1fr]">
        <section className="lg:sticky lg:top-4 lg:self-start">
          <InputsPanel inputs={inputs} onChange={patch} />
        </section>
        <section className="flex min-w-0 flex-col gap-4">
          <ResultsPanel inputs={inputs} out={out} />
          <Insights inputs={inputs} out={out} />
          <ScheduleTable inputs={inputs} out={out} />
        </section>
      </main>

      <footer className="px-6 py-4 text-center text-[11px] text-slate-400">
        Formulas per PRD §4; numbers from a single compute(). Verify against reference/oracle.py.
      </footer>
    </div>
  );
}
