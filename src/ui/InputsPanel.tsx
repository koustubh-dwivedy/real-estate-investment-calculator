/**
 * Left-column collapsible input sections (PRD §3). Plot section is shown only for
 * PlotSelfBuild. Percent fields are edited in human % and stored as decimals.
 */
import type { Inputs } from "../types";
import { SECTIONS, type FieldDef } from "./fields";
import { formatMoney } from "./format";

interface Props {
  inputs: Inputs;
  onChange: (patch: Partial<Inputs>) => void;
}

/** Read-only derived values for a plot (price is computed = plot area × land rate). */
function PlotDiagnostics({ inputs }: { inputs: Inputs }) {
  const price = inputs.plotAreaSqft * inputs.landRate0;
  const downPayment = price - inputs.landLoanAmount;
  return (
    <div className="rounded border border-sky-200 bg-sky-50 p-3 text-xs">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-sky-700">
        Derived (read-only)
      </div>
      <div className="flex justify-between gap-2 text-slate-700">
        <span>Plot price = area × land rate</span>
        <span className="font-semibold">{formatMoney(price, inputs.geography)}</span>
      </div>
      <div className="flex justify-between gap-2 text-slate-700">
        <span>Down-payment = price − land loan</span>
        <span className="font-semibold">{formatMoney(downPayment, inputs.geography)}</span>
      </div>
      <div className="mt-1 text-[10px] text-slate-400">
        Set the plot price via <b>Plot area</b> and <b>Land rate</b> (section I / D).
      </div>
    </div>
  );
}

function FieldInput({ field, inputs, onChange }: { field: FieldDef } & Props) {
  const raw = inputs[field.key] as number;
  const isPct = field.kind === "pct";
  const display = isPct ? +(raw * 100).toFixed(6) : raw;
  return (
    <label className="flex flex-col gap-0.5 text-xs">
      <span className="flex items-baseline justify-between gap-1">
        <span className="font-medium text-slate-700">{field.label}</span>
        <span className="shrink-0 text-[10px] text-slate-400">{field.unit}</span>
      </span>
      <input
        type="number"
        className="rounded border border-slate-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
        value={Number.isFinite(display) ? display : 0}
        step="any"
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          const next = Number.isFinite(v) ? (isPct ? v / 100 : v) : 0;
          onChange({ [field.key]: next } as Partial<Inputs>);
        }}
      />
      <span className="text-[10px] leading-snug text-slate-400">{field.def}</span>
    </label>
  );
}

export default function InputsPanel({ inputs, onChange }: Props) {
  return (
    <div className="flex flex-col gap-2">
      {inputs.acquisitionType === "PlotSelfBuild" ? <PlotDiagnostics inputs={inputs} /> : null}
      {SECTIONS.map((section) => {
        const fields = section.fields.filter(
          (f) =>
            (!f.only || f.only.includes(inputs.acquisitionType)) &&
            (!f.minHorizon || inputs.holdYears >= f.minHorizon),
        );
        if (fields.length === 0) return null;
        return (
          <details key={section.id} open={section.id === "property"} className="rounded border border-slate-200 bg-white">
            <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-slate-800">
              {section.title}
            </summary>
            <div className="grid grid-cols-2 gap-3 border-t border-slate-100 p-3">
              {fields.map((f) => (
                <FieldInput key={String(f.key)} field={f} inputs={inputs} onChange={onChange} />
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}
