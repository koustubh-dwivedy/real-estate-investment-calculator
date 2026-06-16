This is a pure-computation task, not a research task — verifying the test-case ground-truth values in the PRD is done with arithmetic, not web search, so I'll compute directly rather than launching a research process.

Let me recompute each numeric test case at full precision and check it against what the PRD asserts.I found the imprecise ones. Let me pin down the exact corrected values and double-check the two that needed careful re-derivation (the rent path's year-10 figure propagates an error, and the land values were rounded).I've recomputed every numeric test case at full precision. Here's the verdict.

## Summary of findings

| Test | What it checks | PRD value | Exact value | Status |
|---|---|---|---|---|
| **T1** | EMI, ₹1Cr @ 7.5%, 20y | 80,559 (±50) | **80,559.32** | ✅ Correct |
| **T2** | Zero-rate EMI | 10,000 exact | **10,000.00** | ✅ Correct |
| **T3** | rent_annual(5) | 504,918 | **504,918.62** | ✅ Correct |
| **T3** | rent_annual(10) | 675,640 | **675,695.02** | ❌ **Off by 55** |
| **T3** | rent_annual(15) | ~815,150 | **814,151.52** | ❌ **Off by ~1,000** |
| **T3** | rent_annual(20) | ~945,000 | **943,824.75** | ❌ **Off by ~1,175** |
| **T4** | struct(10) | 2,813,400 | **2,813,242.65** | ⚠️ Off by 157 (rounding) |
| **T4** | struct(40) | 2,365,700 | **2,365,715.13** | ✅ Fine |
| **T5** | landValue(10) | 49,232,400 | **49,223,489.94** | ❌ **Off by ~8,910** |
| **T5** | landValue(20) | 88,164,000 | **88,151,773.57** | ❌ **Off by ~12,226** |
| **T10** | XIRR (1M→6.7275M, 20y) | 10.00% | **10.0000%** | ✅ Exact |
| **T13** | Construction cost stack | 6,625,000 | **6,625,000.00** | ✅ Exact |

## Where the errors came from

**T3 (rent path)** — the root cause is a single rounding at year 10. The exact `rent_annual(10)` is **675,695.02**, not 675,640. Because the path compounds, that ~55-rupee error propagates and grows through years 15 and 20. Two secondary issues: the PRD's intermediate multiplier for years 11–15 is stated as "≈1.2065" but the exact product of the factors is **1.204910**, and the year-15/20 figures were only ever given as approximations ("~"). The corrected chain, all clean:

- `rent_annual(5)` = 360,000 × 1.07⁵ = **504,918.62**
- `rent_annual(10)` = × 1.06⁵ = **675,695.02**
- `rent_annual(15)` = × (1.046·1.042·1.038·1.034·1.030) = × 1.204910 = **814,151.52**
- `rent_annual(20)` = × 1.03⁵ = **943,824.75**

**T5 (land)** — both values were rounded to clean-looking figures. The culprit is `1.08¹⁰`, which the PRD implicitly treated as ~2.1589 → landRate(10) of 82,054, but the precise value is **2.15892500**, giving landRate(10) = **82,039.15** and landValue(10) = **49,223,489.94**. The year-20 figure inherits this. Corrected:

- `landRate(10)` = 38,000 × 1.08¹⁰ = **82,039.15** → `landValue(10)` = **49,223,489.94**
- `landRate(20)` = × 1.06¹⁰ = **146,919.62** → `landValue(20)` = **88,151,773.57**

**T4 (structure)** — `struct(10)` should be **2,813,242.65**, not 2,813,400 (off by 157, a rounding artifact). `struct(40)` at 2,365,715.13 is fine. Worth tightening since the whole point of T4 is to prove the structure *rises* nominally early.

## The important caveat

These corrections make the **test assertions** precise, but notice that every error was small and three of the tests (T3, T4, T5) carry a **±0.5–1% tolerance** in the PRD. At those tolerances, **the original values would actually still pass** — e.g., T3's year-20 figure of 945,000 vs the exact 943,824 is a 0.12% miss, well inside ±1%. So this was not going to cause a wrong build; it was a precision issue in the spec, exactly as you suspected.

That said, there's a real reason to fix them anyway: a test case is a contract, and if Claude Code computes 675,695 while the spec says 675,640, a developer can't tell whether their code is right or the spec is wrong. **Precise ground truth removes that ambiguity** — which matters more here than usual, because the construction-period and cash-conservation tests (T9, T14) have no tolerance and depend on the engine being trusted to the rupee.

Want me to update PRD v3 in place with these corrected values and the clean intermediate steps, and tighten the loose tolerances on T3/T4/T5 to something like ±0.1% now that the targets are exact? I can also add the precise `1.08¹⁰ = 2.158925` and `1.06¹⁰ = 1.790848` constants inline so the arithmetic is fully traceable.

---

## SUPERSEDED — T3 rent path (2026-06-16, third audit pass)

The T3 values recomputed above (504,918.62 / 675,695.02 / 814,151.52 / 943,824.75) belong to
the **original smooth yearly-compounding** rent model (`rent_annual(t)=rent_annual(t-1)·(1+g)`,
with a year-1 step). That model was **replaced** in the commit *"11/12-month rent renewal cadence
toggle"* (`3135980`) by a **per-lease step** model: rent is flat within a lease term and steps
once per renewal, so there is **no year-1 escalation**. Under the per-lease model (term=12) the
authoritative golden values are:

| year | smooth (old, this doc) | per-lease (current, oracle) |
|---|---|---|
| 1 | 385,200.00 | **360,000.00** |
| 5 | 504,918.62 | **471,886.56** |
| 10 | 675,695.02 | **637,448.13** |
| 15 | 814,151.52 | **790,438.37** |
| 20 | 943,824.75 | **916,334.70** |

The per-lease numbers are what `reference/oracle.py`, the engine, and the §7/T3 tests now assert.
The decision (with the product owner, 2026-06-16) was to **keep the per-lease model** — it is the
realistic behaviour of Indian 11/12-month leases — and correct the PRD §4.3 formula, the §7 T3
targets, and the [v4] note accordingly (they had silently drifted). T4/T5 corrections above are
unaffected (structure & land are unchanged by the rent model).