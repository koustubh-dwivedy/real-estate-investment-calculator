/**
 * §6A — time-series schedule table. Renders the SAME per-period arrays the engine
 * computed (no second calculation path). CSV export of the current rows. The
 * cashConservationCheck column is the live col-37 guard (red if |diff| > ₹1).
 */
import type { Inputs, Outputs, PeriodRow } from "../types";
import { deflate, type DisplayMode } from "./realMode";

interface Props {
  inputs: Inputs;
  out: Outputs;
  mode: DisplayMode;
}

interface Col {
  key: keyof PeriodRow;
  label: string;
  group: string;
  /** "money" deflates in real mode; "ratio"/"year" never deflate. Defaults to money. */
  kind?: "money" | "ratio" | "year";
}

const COLS: Col[] = [
  { key: "year", label: "Year", group: "Time", kind: "year" },
  { key: "loanBalanceEnd", label: "Loan bal", group: "Loan" },
  { key: "interestPaid", label: "Interest", group: "Loan" },
  { key: "principalPaid", label: "Principal", group: "Loan" },
  { key: "landValue", label: "Land", group: "Value stack" },
  { key: "structureValue", label: "Structure", group: "Value stack" },
  { key: "premiumValue", label: "Premium", group: "Value stack" },
  { key: "propValueGross", label: "Gross value", group: "Value stack" },
  { key: "landSharePct", label: "Land %", group: "Value stack", kind: "ratio" },
  { key: "marketRent", label: "Market rent", group: "Income" },
  { key: "grossRentCollected", label: "Gross rent", group: "Income" },
  { key: "noi", label: "NOI", group: "Income" },
  { key: "postTaxRentalCF", label: "Post-tax CF", group: "Income" },
  { key: "taxableHP", label: "Taxable HP", group: "Tax" },
  { key: "rentalTaxOrShield", label: "Tax/shield", group: "Tax" },
  { key: "carryForwardLossBalance", label: "Carry-fwd loss", group: "Tax" },
  { key: "reinvestPot", label: "Reinvest pot", group: "Net worth" },
  { key: "equityPot", label: "Equity pot", group: "Net worth" },
  { key: "reNetWorth", label: "RE net worth", group: "Net worth" },
  { key: "equityNetWorth", label: "Eq net worth", group: "Net worth" },
  { key: "cashConservationCheck", label: "Cash check", group: "Net worth" },
];

function fmt(key: keyof PeriodRow, v: number): string {
  if (key === "year") return String(v);
  if (key === "landSharePct") return `${(v * 100).toFixed(1)}%`;
  return Math.round(v).toLocaleString("en-IN");
}

export default function ScheduleTable({ inputs, out, mode }: Props) {
  const real = mode === "real";
  return (
    <div className="rounded border border-slate-200 bg-white">
      <div className="px-3 py-2">
        <div className="text-sm font-medium text-slate-800">
          Schedule (annual, t=0…{inputs.holdYears}) · {real ? "today's money" : "nominal ₹"}
        </div>
        <div className="text-[10px] text-slate-400">
          {real
            ? `Money columns deflated by (1+${(inputs.cpiPct * 100).toFixed(1)}%)^year; ratios (Land %) unchanged. Export (top-right) is always nominal.`
            : "All figures nominal. Export CSV (top-right) is always nominal."}
        </div>
      </div>
      <div className="max-h-[420px] overflow-auto">
        <table className="min-w-full border-collapse text-right text-xs">
          <thead className="sticky top-0 bg-slate-100">
            <tr>
              {COLS.map((c) => (
                <th key={String(c.key)} className="whitespace-nowrap border-b border-slate-200 px-2 py-1 font-medium text-slate-600" title={c.group}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {out.rows.map((r) => (
              <tr key={r.year} className="odd:bg-white even:bg-slate-50">
                {COLS.map((c) => {
                  const rawV = r[c.key] as number;
                  // Deflate money columns to today's money in real mode (by row year).
                  const v =
                    real && (c.kind ?? "money") === "money"
                      ? deflate(rawV, r.year, inputs.cpiPct)
                      : rawV;
                  const bad = c.key === "cashConservationCheck" && Math.abs(v) > 1;
                  return (
                    <td
                      key={String(c.key)}
                      className={`whitespace-nowrap px-2 py-1 ${bad ? "bg-red-100 font-semibold text-red-700" : "text-slate-700"} ${c.key === "year" ? "sticky left-0 bg-inherit font-medium" : ""}`}
                    >
                      {fmt(c.key, v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
