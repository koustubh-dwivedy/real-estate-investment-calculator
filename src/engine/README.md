# `src/engine/` — pure formula modules (single source of truth)

Every number the app shows comes from `compute(inputs)` here. **No second calculation
path** (PRD invariant 3). Modules are pure (no React, no DOM) and unit-tested against
`reference/oracle.py` to the paisa.

Planned modules (one Linear issue each; PRD §4):

| Module | PRD § | Tests |
|---|---|---|
| `loan.ts` | §4.2 EMI & amortization | T1, T2 |
| `rent.ts` | §4.3 rent path | T3 |
| `valueStack.ts` | §4.5 land/structure/premium/redev | T4, T5 |
| `opexTax.ts` | §4.4 opex, NOI, house-property tax & regimes | T7, T11 |
| `reinvest.ts` | §4.6 reinvestment sleeve | T8 |
| `construction.ts` | §4.11 plot self-build | T13, T14 |
| `exit.ts` | §4.7 exit waterfall | T6 (part) |
| `equityBenchmark.ts` | §4.9 Engine B (same-cash) | T9 |
| `metrics.ts` | §4.10 XIRR, breakeven, summary | T10 |
| `compute.ts` | §8.1 integration | T12, T15 |

Precision policy: assert deterministic values to 2 decimals (paisa); tolerance ≤1e-7
only for iterative solvers (XIRR/breakeven).
