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

---

# Second pass — blank-slate re-audit (2026-06-16)

**Method:** re-derived every PRD §4 formula from scratch (no reliance on the first pass),
re-checked each engine module line-by-line against the PRD **and** `reference/oracle.py`,
re-ran the oracle (every §7 golden value reproduces to the paisa), the full suite, and
`tsc`. **Result: the formulas are correct and nothing is broken.** The pass surfaced one
substantive (but conditional) fairness asymmetry, now **fixed**, plus minor spec-faithful
choices and doc drift documented below.

## 🔴→✅ F1 (substantive, conditional) — RESOLVED: the reinvest sleeve escaped equity LTCG

**Where:** `compute.ts` (§4.6/§4.7 hand-off), `reinvest.ts`, `exit.ts`.

**What:** in `ReinvestEquity` (the default) and the `PrepayLoan` leftover sleeve, Engine A's
surplus rental cash compounds at `equityCagr` — it **is** the same equity index as Engine B —
yet `RE_terminal = netSaleProceeds + reinvestPot` added it back **untaxed**, while Engine B's
identical equity pot pays equity LTCG (§4.9). Asymmetry **favoured real estate**.

**Critique reasonable?** Yes. It was *faithful to the PRD as written* (§4.6/§4.7 never tax
`reinvestPot`), so not a code-vs-spec defect — but a genuine inconsistency in the model's own
fairness principle (the two equity pools should be taxed identically). It is **dormant under
every default** (defaults are negative-carry every year → `reinvestPot = 0`), so it bit only
in **low-leverage / high-yield / post-payoff / 30-year** scenarios where the pot grows large.
The first pass (focused on the Engine-B EMI double-count) did not flag it.

**Fix:** the reinvest sleeve now pays equity LTCG on its gain (`reinvestPot − Σ contributions`)
with the ₹1.25L exemption at exit, mirroring Engine B. Per-year `reinvestPot` columns stay
**gross** (unrealized mark-to-market, like `propValueGross`); only the terminal liquidation
nets the tax. `Pocket` mode has no growth → gain 0 → no sleeve tax (unchanged). Exposed as
`reinvestSleeveLtcg` in `Outputs` and the CSV exit waterfall. Pinned by **`T26`**; the §7
golden anchors and the T21 snapshot are **unchanged** (default no-op, empirically confirmed).

## Minor findings — documented, spec-faithful (no change)
- **F2 — re-let brokerage shades taxable income.** §4.4 folds `reLetFrac` into `gross_rent`
  and sets `NAV = gross_rent`, so the re-let brokerage reduces taxable house-property income.
  Strictly it is a non-deductible expense (covered by the 30% standard deduction). Effect tiny
  (`reLetFrac ≈ 1/36`). **Matches the PRD verbatim** — flagging the spec choice, not a bug.
- **F3 — property tax not deducted from NAV.** Real Indian law deducts municipal taxes paid to
  arrive at NAV; the PRD sets `NAV = gross_rent` and treats property tax as cash-only opex.
  Slightly **overstates** let-out tax → conservative against real estate. Matches the PRD.
- **F4 — equity LTCG exemption applied once.** §4.9 (and now the F1 sleeve) apply the ₹1.25L
  exemption once to the terminal gain; an investor harvesting annually would use it each year.
  Slightly **understates** equity's after-tax → conservative for equity. Matches the PRD.
- **F5 — construction own-pocket edge case.** If `constructionLoanAmount` is set larger than the
  spreadable build cost, mid-build `ownPocketDraw` can go transiently negative (compensated in
  the interiors month). Total is preserved; only within-build Engine-B *timing* distorts.
  Unreachable with defaults (`constructionLoanAmount = 0`). Bounded; guard optional.
- **F6 — doc drift.** PRD §4.2's "freed EMI flows to Engine B SIP" describes the *pre-Fix-A*
  design; under Fix A, Engine B mirrors only net out-of-pocket (`negCarry`), so post-payoff it
  receives nothing — code is self-consistent, the PRD line is stale. Also `Note-1`'s
  annual-vs-monthly compounding warning is effectively **nil for integer-year holds** (year-end
  flows compound identically under both). Corrected in the PRD note.

## Second-pass bottom line
No formula is wrong. The framework reproduces the oracle to the paisa and the full suite
(152 tests) is green. The only behavioural change is **F1** — taxing Engine A's equity sleeve
like Engine B's equity for symmetry — which leaves every default scenario unchanged.

---

# Third pass — blank-slate re-audit + exhaustive golden coverage (2026-06-16)

**Trigger:** product-owner request to re-verify *everything* from a blank slate (every input,
formula, calculation step, progression, and corner case) and to back it with a comprehensive
exact-match test suite. **Method:** (1) re-read every `src/engine/*` module and re-derived each
PRD §4 formula from scratch; (2) checked the *oracle itself* against the PRD (the first two passes
only checked engine-vs-oracle); (3) extended `reference/oracle.py` into a **full independent
re-implementation** of `compute()` and dumped a **884-scenario golden dataset** (full cartesian
of all toggles + 20 corner cases) that the engine is asserted against field-by-field to 2 decimals
(`golden.test.ts`); (4) added oracle self-validation so the validator can't certify a shared bug.

## 🔴→✅ FINDING-R (the one real divergence) — RESOLVED: rent model drifted from the PRD
**Where:** `rent.ts` / `oracle.py` §4.3 vs PRD §4.3 + §7 T3 + the [v4] note + `ground_truth_validation.md`.

**What:** the original engine (commit `a66574e`) implemented PRD §4.3 verbatim — smooth yearly
compounding with a year-1 step (`rent_annual(5)=504,918.62`). The commit *"11/12-month rent renewal
cadence toggle"* (`3135980`) rewrote it as a **per-lease step** model (flat within a lease, steps at
renewal; `rent_annual(5)=471,886.56`), which **also changed the default 12-month numbers**. The PRD
§4.3 formula, the §7 T3 targets, the [v4] note (which wrongly promised "at term=12 all golden values
unchanged"), and `ground_truth_validation.md` were never updated.

**Critique reasonable?** Yes — it is a genuine spec-vs-implementation mismatch that the prior two
passes missed because they only checked *engine-against-oracle* (both had already been switched to
the per-lease model), never *oracle-against-PRD*. It is **not** a numerical bug: the per-lease model
is internally correct and is the realistic behaviour of Indian 11/12-month leases.

**Verdict / resolution:** 🟡 intended-model, doc drift. Decision (with product owner): **keep the
per-lease code, correct the docs.** PRD §4.3 now states the per-lease formula; §7 T3 carries the
per-lease values (360,000 / 471,886.56 / 637,448.13 / 790,438.37 / 916,334.70); the [v4] note is
corrected; `ground_truth_validation.md` records the supersession with both number sets. No engine
change.

## Exhaustive module-by-module re-derivation (critique → reasonable? → verdict)
Every input, formula step, and corner case below was re-derived from the PRD and cross-checked
against the independent oracle across all 884 scenarios.

| Module | Inputs / steps / corner cases re-verified | Verdict |
|---|---|---|
| `loan.ts` | EMI closed form; `r=0 ⇒ P/n`; `principal≤0 ⇒ 0`; final-EMI clamp `min(emi, bal+int)`; prepay capped at balance; tenure-shortening with fixed EMI; payoff month; `horizon>tenure` (30y hold / 20y loan → zero EMI yrs 21–30); zero-rate amortization. Annuity-PV identity holds (oracle Layer-2). | ✅ correct |
| `rent.ts` | gMarket phase edges (t=5/6/10/11/20/21→y21_30); drag ramp `min((t-10)/5,1)` & cap; per-lease step `(m-1)%term==0 ∧ m>1`; expiring-year `y=ceil((m-1)/12)`; term 11 vs 12 (T17); `y21_30` default to `y11_20`; annualize = Σ12. | ✅ correct (per-lease, see FINDING-R) |
| `valueStack.ts` | land 3-phase exponents `min(t,10)/clamp(t-10,0,10)/max(t-20,0)`; cumulative infraBumps `year≤t`; structure dep + `max(…,salvageFloor)` binding at long age; replCost inflation; premium decay floored at 0; redev prox clamp [0,1] + structure floored ≥0 at eligibility; `landSharePct` divide-by-zero guard. | ✅ correct |
| `opexTax.ts` | vacancy + reLetFrac in gross & NAV (F2, spec-faithful); ageMaintMult `(1+accel)^age`; CAM modes (Tenant vs Owner, ×ageMaintMult only when owner-borne); maintenance/CAM/water/repair/refresh **non-deductible** (no double-count, T11); 30% std deduction; let-out full interest; self-occupied ₹2L cap old-regime-only; old set-off ≤₹2L + FIFO carry + 8-yr expiry; new-regime stranding; monthly legs (lumpy refresh in month 12; Σ identity). | ✅ correct |
| `reinvest.ts` | monthly compounding `(1+cagr)^(1/12)` (symmetric with Engine B); Pocket no-growth; PrepayLoan year-end lump + leftover-sleeve basis (2nd pass); negCarry mirror `max(-cf,0)`. | ✅ correct |
| `exit.ts` | costBasis incl. construction; capGain net of sellCosts; `ltcg=max(gain,0)·rate`; sleeve equity LTCG + ₹1.25L exemption (F1); Pocket sleeve gain 0. | ✅ correct |
| `equityBenchmark.ts` | t0 lump compounds full horizon; monthly SIP cadence; LTCG + exemption; `cumContrib`. Closed-form growing-annuity FV agrees (oracle Layer-2). | ✅ correct |
| `construction.ts` | BUA derive vs override; cost stack (T13); even draws + interiors in last month; loan disburse capped at sanction; pre-EMI on **cumulative** disbursed; land pre-EMI; principal-weighted blended hold rate; `constructionMonths=0`; constructionLoan>spreadable (F5 transient negative ownPocketDraw — bounded, total preserved); OwnFunds. | ✅ correct |
| `compute.ts` | plot calendar `offsetMonths`; two-pass PrepayLoan; ownCashOut assembly; SameCashSIP vs LumpsumOnly; XIRR cashflow construction per `rentalCashUse` (Pocket counts ± interim, others −negCarry + terminal sleeve net of LTCG); breakeven recursion with land-CAGR override; t=0 row; row sampling at hold-year ends. | ✅ correct |
| `numerics.ts` | XIRR bracket/NaN on non-bracketing flows; bisection tol; breakeven bracket [-5%,30%]; NPV≈0 at solved rate (oracle Layer-2). | ✅ correct |
| `rentVsBuy.ts` | buyer = self-occupied sale proceeds; renter deposit held flat (Note-3) + leftover invested; per-lease alt-rent; breakeven + sweep. | ✅ correct |

## New coverage & oracle-independence guarantees
- **`reference/oracle.py` extended** to a full independent `compute()` (entry cash, loan, rent,
  opex/tax, value stack, reinvest, exit, Engine B, metrics, plot construction) derived from PRD §4
  (+ Fix-A and F1 amendments), with a **different code structure** from the TS (so a port-style bug
  can't ride along), citing PRD sections per block.
- **Layer 1 (external anchors):** the T1–T17 pencil-math values (`ground_truth_validation.md`) — the
  oracle reproduces them.
- **Layer 2 (redundancy, `--self-check`):** EMI vs annuity-PV identity; loan `Σprincipal==principal`
  & ends-at-0; Engine B loop vs closed-form FV; XIRR NPV≈0 at the solved rate + recovers 10%;
  per-scenario value-stack-sum / RE-terminal-reconciliation / col-37 identities. Dump aborts if any
  disagree.
- **Layer 3 (`golden.test.ts`):** 884-scenario exact match (every scalar + every row field, 2dp) +
  spec invariants (value-stack sum, col-37≈0, RE-terminal reconciliation, land-CAGR monotonicity,
  zero-growth ⇒ pot==contributions) asserted on the engine directly.

## Third-pass bottom line
The engine is **correct**. An independently-derived oracle reproduces every headline scalar and
every per-period row, for the **full cartesian of all toggles plus 20 corner cases**, to 2 decimals;
the oracle is itself self-validated by redundant derivations and external hand anchors. The only
issue found in this pass was **documentation drift on the rent model (FINDING-R)** — resolved by
correcting the docs to the (intended, realistic) per-lease behaviour, with no change to engine math.
