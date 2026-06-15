# Formula Audit — Real-Estate Investment Calculator

**Date:** 2026-06-16 · **Scope:** every engine module (`src/engine/*`) + the rent-vs-buy
model. **Method:** module-by-module critique → "reasonable?" → verdict (✅ correct /
🟡 intended choice / 🔴 bug), with independent hand-derivations and a 400-scenario fuzz
suite (`T24`). **Policy:** report-first — no core behaviour changed; the one confirmed
bug is pinned in `T25` (current behaviour passing; proposed-correct value skipped).

---

## ✅ FINDING-1 (material) — RESOLVED via Fix A on 2026-06-16: Engine-B double-counted the EMI (buy-vs-equity only)

> **Resolution:** Fix A applied (`compute.ts` §4.9). The separate EMI term was dropped;
> Engine B now deploys `t0 + construction draws + Σ negCarry` in `SameCashSIP`, and only
> the upfront lump(s) in `LumpsumOnly`. `T25` now asserts the hand-derived correct values
> (76 same-cash, 20 lumpsum). `T21` snapshot re-baselined (eqTerminal roughly halved, gap
> less negative, breakeven land-CAGR lower — real estate correctly looks better). §7 golden
> anchors and the 400-scenario fuzz suite remained green throughout. Original finding below
> for the record.

---


**Where:** `compute.ts` §4.9 Engine-B stream (lines ~259–281) + `reinvest.ts` `negCarry`.

**What:** Engine B's contribution stream = `t0 + Σ EMI (SameCashSIP) + Σ negCarry`, where
`negCarry = max(−postTaxRentalCF, 0)` and `postTaxRentalCF = NOI − EMI − tax` **already
nets the EMI**. So the EMI is added once explicitly and again inside `negCarry`.

**Critique reasonable?** Yes — and confirmed numerically. Controlled scenario (no
growth/tax/opex, 0% 1-yr loan; price 100, loan 80, rent 24/yr):
- Buyer's true out-of-pocket = down-payment 20 + (EMI 80 − rent 24) = **76**.
- Code feeds Engine B `20 + 80 + 56` = **156** (EMI 80 double-counted; `negCarry = 80−24 = 56`).
- With equity CAGR 0, `EQ_terminal` should be 76; the engine returns **156** (`T25`).

**Verdict:** 🔴 **Bug** relative to the model's own stated principle (PRD §2: Engine B
deploys "the same **out-of-pocket cash**"). It violates that principle and the §6A
"cash-conservation" guard does **not** catch it (col-37 only checks `cumContribB ==
cumOwnCashOutA`, i.e. that B invests whatever we *declare* A spent — both use the same
inflated `ownCashOut`).

**Impact:** `EQ_terminal` is **overstated** (roughly by the compounded EMI stream), so
the **gap (RE − EQ) is too negative**, **breakeven land-CAGR is too high**, and real
estate looks worse than it is. Default scenarios are negative-carry every year, so it
bites by default and the distortion is large (and compounds with the horizon). **Not
affected:** `RE_terminal`, `RE_XIRR` (built from the net `negCarry`/`postTaxRentalCF`
cash flows — correct), `eqXirr` (≈ equity CAGR regardless), and the entire **Rent-vs-Buy**
card (`rentVsBuy.ts` builds its own renter stream and never adds EMI separately).

**Internal inconsistency confirming it:** Engine-A's XIRR (`compute.ts` `aCashflows`)
uses `−negCarry` interim flows (net pocket) and does **not** add EMI separately — i.e.
the XIRR path treats the cash correctly while Engine B does not. Only one can be right;
the XIRR path matches the "out-of-pocket" principle.

**Proposed fixes (pick one — your call):**
- **Fix A (recommended — "same out-of-pocket"):** `ownCashOut = t0 + Σ negCarry`
  (+ construction own-pocket + preEMI). Drop the separate EMI term. The EMI is already
  inside `negCarry` (the shortfall after rent); A's rental surplus stays on A's side via
  `reinvestPot`. This restores §2's principle and makes Engine B consistent with RE_XIRR.
- **Fix B ("SIP the mortgage"):** keep mirroring the EMI, but compute `negCarry`/`reinvest`
  from **operating** cash that does *not* subtract EMI (`postTaxRentalCF_op = NOI − tax`).
  Different economic question; changes both engines' interim flows.

Re-baselining: the `T21` snapshot + the `T6/T9/T12/T20/T24` consistency checks will shift
(consistency still holds); the §7 golden anchors (T1–T17) are **unaffected** (they don't
touch Engine B). Self-occupied is affected more strongly (no rent ⇒ `negCarry = EMI+opex+tax`,
plus a second EMI).

---

## Module-by-module verdicts

| Module | Reviewed | Verdict |
|---|---|---|
| `loan.ts` (§4.2 EMI, amortization, prepay, tenure-shorten) | T1/T2 golden + amortization invariants | ✅ correct |
| `rent.ts` (§4.3 phased growth, cohort drag, 11/12 cadence, Y21–30) | T3/T16/T17 golden | ✅ correct |
| `valueStack.ts` (§4.5 land 3-phase, structure dep + salvage floor, premium decay, redev) | T4/T5/T16 golden | ✅ correct |
| `opexTax.ts` (§4.4 opex, NOI, HP tax, 30% std deduction, regime set-off, 8-yr carry-forward) | T7/T11 (direction + no double-count); carry-forward FIFO + 8-yr expiry reviewed | ✅ correct (see Note-2) |
| `reinvest.ts` (§4.6 Reinvest/Prepay/Pocket, negCarry) | T8; post-payoff surplus routed to equity | 🟡 see Note-1 (annual vs monthly compounding) |
| `construction.ts` (§4.11 BUA stack, even draws, pre-EMI on cum-disbursed, composite hand-off) | T13/T14 golden | ✅ correct |
| `exit.ts` (§4.7 capgain, LTCG, net proceeds) | hand-reviewed (sellCosts in gain + cash is not a double-count) | ✅ correct |
| `numerics.ts` (XIRR/bisection) | T10 golden; brackets/tolerance reviewed | ✅ correct |
| `equityBenchmark.ts` (monthly compounding of a stream) | mechanics correct; **fed a wrong stream** | ✅ mechanics / 🔴 input (FINDING-1) |
| `compute.ts` (integration, ownCashOut, XIRR cashflows) | RE_XIRR + exit consistent; Engine-B stream | 🔴 FINDING-1; rest ✅ |
| `rentVsBuy.ts` (self-occupied buy vs rent+invest) | buyer = self-occupied sale proceeds; renter stream built independently | ✅ correct, unaffected by FINDING-1 |

## Minor observations (verdict: acceptable / documented)
- **Note-1 — compounding asymmetry:** Engine A's `reinvestPot` compounds **annually**
  while Engine B compounds **monthly**. Small; documented; informs the T9 tolerance. 🟡 acceptable.
- **Note-2 — HP tax:** maintenance/CAM/water/major-repair/interior-refresh correctly
  reduce **cash flow only**, never `taxableHP` (the 30% standard deduction is deemed to
  cover them) — verified no double-deduction (T11). India_New strands negative HP; Old
  sets off ≤₹2L/yr and carries the remainder 8 years (FIFO, expiry) — reviewed, ✅.
- **Note-3 — rent-vs-buy deposit** is held flat at the initial level (not re-topped as
  rent grows). Tiny effect; acceptable for v1.
- **Note-4 — interior-refresh inflation** uses CPI (not construction inflation). Minor
  modelling choice; acceptable.
- **Prior audit fixes (already landed):** `marginalTaxPct`/`surchargeCess` coupling,
  dead `floors`, plot-price coherence, inert-field removals — all verified live (T22).

## Coverage added by this audit
- `T24_fuzz.test.ts` — 400 random scenarios + 60 monotonicity checks; all invariants
  (finiteness, value-stack sums, col-37, exit reconciliation, real/nominal, monotonicity)
  hold. Confirms the engine is internally **consistent** everywhere (a level error like
  FINDING-1 is not catchable by consistency checks — hence the dedicated hand-derivation).
- `T25_audit_findings.test.ts` — pins FINDING-1 (current 156 passing; proposed 76 skipped).

## Bottom line
The **underlying formulas are sound** (every §7 anchor matches the independent oracle to
the paisa; 400-scenario fuzz is clean). The **one material integration bug** — the Engine-B
EMI double-count in **buy-vs-equity**, which overstated the equity benchmark and the
breakeven land-CAGR — has been **fixed (Fix A, 2026-06-16)**. RE terminal/XIRR and the
Rent-vs-Buy comparison were already correct and are unchanged.
