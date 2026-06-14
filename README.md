# 20-Year Investment Value Calculator — Real Estate vs Equity

A single-page, client-side calculator that projects the **net worth created over a
20-year hold** for a real-estate purchase — a ready/under-construction apartment **or**
a plot on which a house is self-built — and compares it head-to-head against a
**same-cash equity benchmark** using dated cash flows and **XIRR**.

> The outputs drive real capital-allocation decisions, so **formula correctness is the
> top priority.** Formulas are implemented exactly as specified in the PRD; nothing is
> derived or "fixed" silently.

## Method (the one true framing)

Two engines computed in parallel (PRD §2):

- **Engine A — Real Estate:** terminal net worth after 20 years (equity built +
  reinvested cash flows − all taxes/costs).
- **Engine B — Equity benchmark:** the same investor deploys the **same out-of-pocket
  cash, on the same dates** (down payment, entry costs, every EMI as a SIP, construction
  outflows) into equity instead.

We compare via **XIRR on dated cash flows** — an opportunity-cost framing. We explicitly
do **not** use the "sum of nominal outflows = cost" fallacy.

## Precision policy (non-negotiable)

- `reference/oracle.py` is the **authoritative golden-value oracle**. The TypeScript
  engine must match it **to the paisa**.
- Tests assert deterministic quantities to 2 decimals; a tiny tolerance (≤1e-7) is used
  only for iterative results (XIRR/breakeven).
- The PRD's §7 test targets were corrected from hand-rounded originals to exact values
  (the original is preserved at `docs/Investment_Calculator_PRD_v3.original.md`). No
  formula was changed — only imprecise expected numbers. See the note at the top of §7.

## Project docs

- **PRD:** [`docs/Investment_Calculator_PRD_v3.md`](docs/Investment_Calculator_PRD_v3.md)
  (working copy; the engine is built against this).
- **Original PRD:** `docs/Investment_Calculator_PRD_v3.original.md` (as-written).
- **Specs / tracking:** [Linear project — 20-Year Investment Value Calculator (RE vs Equity)](https://linear.app/hughes-ai/project/20-year-investment-value-calculator-re-vs-equity-ab0c8216d148).

## Stack

Vite + React + TypeScript, Tailwind, Recharts. Pure formula modules in `src/engine/`
unit-tested with Vitest. No backend, no persistence (CSV export of the schedule is
allowed).

**Nominal / Real display:** a top-bar **Display** toggle re-expresses every ₹ figure,
both charts, and the schedule's money columns in either nominal future rupees or
**today's money** (deflated by `(1+cpi)^t`). XIRRs show real in real mode; RE multiple
and breakeven land CAGR stay nominal. This is display-only — the engine and the CSV
export are always nominal.

**Save & restore scenarios:** "Export full CSV" embeds a machine-readable
`## INPUTS_JSON` block; the **Import CSV** button (top-right) restores the exact
scenario from a previously exported file so you can keep tweaking it. Older exports
load too — any newer fields are filled from current defaults.

```
src/engine/      pure formula modules — single source of truth (PRD §4)
src/defaults/    validated 2026 defaults (PRD §5)
src/ui/          presentation only (PRD §3, §6, §6A)
src/types.ts     Inputs / PeriodRow / Outputs
reference/       golden-value oracle (Python)
docs/            PRD (working + original)
```

## Develop

```bash
npm install
npm test          # formula test suite (must be green before UI work)
npm run typecheck # tsc --noEmit
npm run dev       # local dev server
npm run oracle    # print golden reference values
```

## Build order (PRD §8, strict)

1. Pure `compute(inputs)` → per-period arrays (single source of truth).
2. §7 unit tests green (T1–T15) **before any UI**.
3. Defaults loader → 4. Inputs UI → 5. Results panel → 6. Schedule table →
   7. Sensitivity/warnings → 8. Final reconciliation pass.
