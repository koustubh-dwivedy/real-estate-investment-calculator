/**
 * Self-contained CSV export. The file bundles everything needed to understand AND
 * exactly recreate a result:
 *   1. Metadata + method/formula references (PRD §)
 *   2. Scenario (presets + switches)
 *   3. Assumptions — every input with human value, unit, exact engine value, definition
 *   4. Headline results
 *   5. Full per-year schedule (all columns the engine produced)
 *   6. Machine-readable JSON of the exact inputs (paste back to reproduce to the paisa)
 */
import type { Inputs, Outputs, PeriodRow } from "../types";
import { SECTIONS, type FieldKind } from "./fields";
import { effTaxRate } from "../defaults";

const REPO = "https://github.com/koustubh-dwivedy/real-estate-investment-calculator";

interface Meta {
  section: string;
  label: string;
  unit: string;
  def: string;
  kind: FieldKind;
}

const FIELD_META: Map<string, Meta> = new Map();
for (const s of SECTIONS) {
  for (const f of s.fields) {
    FIELD_META.set(String(f.key), { section: s.title, label: f.label, unit: f.unit, def: f.def, kind: f.kind });
  }
}

// Inputs that are enums/booleans/structural rather than numeric form fields.
const NON_FIELD_LABELS: Record<string, { label: string; def: string }> = {
  geography: { label: "Geography", def: "City/market preset." },
  acquisitionType: { label: "Acquisition type", def: "Ready / under-construction flat, or plot self-build." },
  assetType: { label: "Asset type", def: "Drives UDS, depreciation, premium, maintenance treatment." },
  usageMode: { label: "Usage mode", def: "LetOut (earns rent) or SelfOccupied (carrying cost only)." },
  imputedRentBenefit: { label: "Imputed rent benefit", def: "Credit saved rent for self-occupied (default off)." },
  rentalCashUse: { label: "Rental cash use", def: "Where surplus rent goes: ReinvestEquity / PrepayLoan / Pocket." },
  taxRegime: { label: "Tax regime", def: "India_Old allows let-out loss set-off; India_New strands it." },
  compareMode: { label: "Compare mode", def: "SameCashSIP invests each EMI as an equity SIP; LumpsumOnly does not." },
  surchargeCess: { label: "Surcharge/cess", def: "Effective-rate toggle: none / 31.2% / 35.8%." },
  maintenanceMode: { label: "Maintenance mode", def: "TenantPaysCAM or OwnerBearsAll." },
  constructionFinancing: { label: "Construction financing", def: "CompositeLoan (land+construction) or OwnFunds." },
  preEMIduringConstruction: { label: "Pre-EMI during construction", def: "Interest-only on disbursed tranches during the build." },
  redevelopmentEnabled: { label: "Redevelopment enabled", def: "Mumbai apartments: model a redevelopment option value." },
  redevEligibleAgeYears: { label: "Redev eligible age", def: "Age at which redevelopment becomes likely (years)." },
  redevOptionValuePctOfLand: { label: "Redev option value", def: "Redevelopment option value as % of land." },
  structureLifeYears: { label: "Structure life", def: "Nominal structure life (years), informs salvage." },
  ownerMaintPctOfValue: { label: "Owner maint (self-occupied)", def: "Self-occupied analogue: maintenance as % of property value." },
  waterTaxGrowthPct: { label: "Water tax growth", def: "Annual growth in the water/borewell charge." },
  plotLoanRatePct: { label: "Plot loan rate", def: "Interest rate on the land loan." },
  infraBumps: { label: "Infra bumps", def: "One-off land-value uplifts {year, pct}." },
  holdYears: { label: "Hold years", def: "Investment horizon (years)." },
};

const PCT_KEYS = new Set<string>([
  "redevOptionValuePctOfLand",
  "ownerMaintPctOfValue",
  "waterTaxGrowthPct",
  "plotLoanRatePct",
]);

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function row(...cells: unknown[]): string {
  return cells.map(csvCell).join(",");
}

/** Human value (percents shown ×100) + the exact engine value for reproduction. */
function humanAndRaw(key: string, raw: unknown): { human: string; unit: string; rawStr: string } {
  const meta = FIELD_META.get(key);
  const isPct = meta?.kind === "pct" || PCT_KEYS.has(key);
  if (typeof raw === "number") {
    if (isPct) return { human: String(+(raw * 100).toFixed(6)), unit: meta?.unit ?? "%", rawStr: String(raw) };
    return { human: String(raw), unit: meta?.unit ?? "", rawStr: String(raw) };
  }
  if (Array.isArray(raw)) return { human: JSON.stringify(raw), unit: "", rawStr: JSON.stringify(raw) };
  return { human: String(raw), unit: meta?.unit ?? "", rawStr: String(raw) };
}

const SCENARIO_KEYS: (keyof Inputs)[] = [
  "geography", "acquisitionType", "assetType", "usageMode",
  "rentalCashUse", "taxRegime", "compareMode", "holdYears",
];

const RESULT_ROWS: { key: keyof Outputs; label: string; pct?: boolean }[] = [
  { key: "reTerminal", label: "RE terminal (nominal)" },
  { key: "eqTerminal", label: "Equity terminal (same cash)" },
  { key: "gap", label: "Gap (RE − Equity)" },
  { key: "reXirr", label: "RE XIRR", pct: true },
  { key: "eqXirr", label: "Equity XIRR", pct: true },
  { key: "reMultiple", label: "RE multiple (× own cash)" },
  { key: "breakevenLandCagr", label: "Breakeven land CAGR", pct: true },
  { key: "realReTerminal", label: "Real RE terminal (today's money)" },
  { key: "exitGross", label: "Exit gross (after haircut)" },
  { key: "sellCosts", label: "Selling costs" },
  { key: "ltcgProperty", label: "LTCG on property" },
  { key: "loanPayoff", label: "Loan balance at exit" },
  { key: "netSaleProceeds", label: "Net sale proceeds" },
];

export function buildFullCsv(inputs: Inputs, out: Outputs): string {
  const lines: string[] = [];
  const blank = () => lines.push("");

  // 1 — metadata + method
  lines.push("# Investment Value Calculator — full export");
  lines.push(`# Generated,${new Date().toISOString()}`);
  lines.push(`# Horizon (years),${inputs.holdYears}`);
  lines.push("# Method,Two-engine opportunity cost: real estate (Engine A) vs same-cash equity SIP (Engine B); compared via XIRR on dated cash flows.");
  lines.push(`# Repo,${REPO}`);
  lines.push("# Reproduce,Paste the INPUTS_JSON row below into compute(); cross-check reference/oracle.py. Percents stored as decimals; money nominal.");
  lines.push("# Formula refs,EMI §4.2 · Rent §4.3 · Opex/NOI/tax §4.4 · Value stack §4.5 · Reinvest §4.6 · Exit §4.7 · Engine B §4.9 · Metrics §4.10 · Plot build §4.11");
  lines.push(`# Effective tax rate (computed),${effTaxRate(inputs)}`);
  blank();

  // 2 — scenario
  lines.push("## SCENARIO");
  lines.push(row("Field", "Value", "Definition"));
  for (const k of SCENARIO_KEYS) {
    const nf = NON_FIELD_LABELS[k as string];
    lines.push(row(nf?.label ?? k, inputs[k], nf?.def ?? ""));
  }
  blank();

  // 3 — assumptions (every input)
  lines.push("## ASSUMPTIONS (all inputs)");
  lines.push(row("Category", "Field", "Value", "Unit", "Engine value (exact)", "Definition"));
  const emitted = new Set<string>();
  const emit = (key: string, category: string, label: string, def: string) => {
    if (emitted.has(key)) return;
    emitted.add(key);
    const { human, unit, rawStr } = humanAndRaw(key, (inputs as unknown as Record<string, unknown>)[key]);
    lines.push(row(category, label, human, unit, rawStr, def));
  };
  // ordered by section, then leftovers
  for (const s of SECTIONS) {
    for (const f of s.fields) {
      // skip plot-only fields when not a plot scenario
      if (f.only && !f.only.includes(inputs.acquisitionType)) continue;
      emit(String(f.key), s.title, f.label, f.def);
    }
  }
  for (const key of Object.keys(inputs)) {
    if (emitted.has(key) || SCENARIO_KEYS.includes(key as keyof Inputs)) continue;
    const nf = NON_FIELD_LABELS[key];
    emit(key, "Other", nf?.label ?? key, nf?.def ?? "");
  }
  blank();

  // 4 — headline results
  lines.push("## HEADLINE RESULTS");
  lines.push(row("Metric", "Value"));
  for (const r of RESULT_ROWS) {
    const v = out[r.key] as number;
    lines.push(row(r.label, r.pct ? `${(v * 100).toFixed(4)}%` : v));
  }
  blank();

  // 5 — full schedule (every column the engine produced)
  lines.push("## SCHEDULE (per year — all engine columns)");
  const cols = out.rows.length ? (Object.keys(out.rows[0] as PeriodRow) as (keyof PeriodRow)[]) : [];
  lines.push(cols.map(String).join(","));
  for (const r of out.rows) lines.push(cols.map((c) => csvCell(r[c])).join(","));
  blank();

  // 6 — machine-readable exact inputs
  lines.push("## INPUTS_JSON (paste into compute() to reproduce exactly)");
  lines.push(csvCell(JSON.stringify(inputs)));

  return lines.join("\n");
}

export function downloadFullCsv(inputs: Inputs, out: Outputs): void {
  const csv = buildFullCsv(inputs, out);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  a.href = url;
  a.download = `investment-calculator_${inputs.geography}_${inputs.acquisitionType}_${stamp}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
