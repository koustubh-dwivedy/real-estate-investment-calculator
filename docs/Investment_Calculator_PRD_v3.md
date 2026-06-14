# PRD v3 — 20-Year Investment Value Calculator (Real Estate vs Equity)

> **Version note:** v3 supersedes v2. It adds the **plot-and-self-build (plotted villa) construction module** and several cost determinants surfaced by a plot-vs-flat video audit, with full formula review. Changes from v2 are flagged **[v3]**. v2 changes (validated 2026 defaults, monthly schedule table) are retained and marked **[v2]**.
>
> **[v4] Plot financing — separate land + construction loans (post-v3 fix).** A plot self-build is financed by a **land loan** (`landLoanAmount` @ `plotLoanRatePct`) plus a **construction loan** (`constructionLoanAmount` @ `constructionLoanRatePct`), not the apartment single loan. The apartment fields `loanAmount` / `loanRatePct` / `loanTenureYears` **do not apply** to plots (UI hides them). During the build, each loan accrues its own interest-only pre-EMI; at completion the combined principal amortises over `compositeLoanTenureYears` at the **principal-weighted blend** of the two rates. The t0 down-payment uses `purchasePriceAllIn − landLoanAmount`. **Note:** loan *rate* moves financing cost → cash flows, the RE-vs-equity gap, and XIRR; it barely moves `RE_terminal` once the loan fully amortises. Guarded by tests **T18**.
>
> **[v4] Rent renewal cadence (post-v3 enhancement).** A selectable **`rentAgreementMonths`** (11 or 12; default 12) models the India-typical 11-month lease. Escalation is applied per renewal, so it compounds `12/rentAgreementMonths` times per calendar year: `rent_annual(t) = rent_annual(t−1) · (1 + g_real(t))^(12/rentAgreementMonths)` (§4.3). At 12 → exponent 1 (plain annual escalation, all golden values unchanged); at 11 → rent grows ~+3%/+6%/+9% by years 5/10/20. Occupancy is unchanged (this is *not* a months-collected haircut). Golden values **T17** in `reference/oracle.py`.
>
> **[v4] 30-year horizon (post-v3 enhancement).** The hold horizon is selectable **20 or 30 years** (`holdYears` ∈ {20, 30}; default 20). For 30-year holds two new rate bands extend the growth schedule: **`rentGrowthY21_30`** (§4.3) and **`landCagrY21_30`** (§4.5a), each **defaulting to the Y11–20 value** so a 30-year run with untouched inputs simply extrapolates the Y11–20 trend; lower them to model later-decade deceleration. `gMarket(t)` returns `y21_30` for `21≤t≤30`; `landRate(t)` multiplies by `(1+landCagrY21_30)^max(t−20,0)`. All other stages already scale with `holdYears` (loan pays off at year 20 → years 21–30 carry full rental cash; Engine B simply stops receiving EMI after year 20; the structure floors at salvage ~year 26; `redevEligibleAgeYears=30` triggers the redevelopment option at year 30). Golden values **T16** (`reference/oracle.py`) cover the 30-year path; all §7 T1–T15 values are **unchanged** (the new bands don't affect t ≤ 20).
>
> **[v3] CRITICAL FRAMING NOTE for the implementer — read before coding.** The source video that motivated these additions uses a *cost-accounting* method: it sums every nominal rupee spent over 20 years, calls that "total cost," and compares it to the appreciated value. **Do NOT implement that framing.** Summing undiscounted future EMIs as "cost" ignores the time value of money and produces misleading headlines (e.g., "the flat cost 78% more than sticker"). This calculator's correct method is unchanged: **dated cash flows → XIRR, compared against a same-cash equity benchmark (Engine B).** We are importing the video's *line items* (real cost determinants we were under-counting for the plot case), **not** its conclusion or its methodology. Keep the §2 two-engine, opportunity-cost framing as the source of truth.

## 0. Purpose & non-negotiables

Build a **single-page interactive calculator** that projects the **net worth created over a 20-year hold** for a real-estate purchase — either a **ready/under-construction apartment** OR a **plot on which a house is self-built** — and compares it head-to-head against a **same-cash equity benchmark**. Outputs drive real capital-allocation decisions, so **formula correctness is the top priority**.

**Hard rules for the implementer (Claude Code):**
1. **Do NOT derive or invent any financial formula.** Every formula is specified in §4 with exact order-of-operations. Implement verbatim. If something seems missing, surface it as a question — do not improvise.
2. Implement the **test cases in §7 first** as unit tests; make them pass **before** any UI. Numbers there are hand-computed; if your code disagrees, your code is wrong.
3. All money in **nominal terms** unless a field is labelled "real." Show a **real (inflation-adjusted)** summary line using a separate CPI input.
4. No backend. Pure client-side (React + charting lib). All state in-memory. No localStorage. (CSV export of the schedule table is allowed.)
5. Every input has a **default** (§5) and a tooltip stating meaning, unit, and source year (2026).
6. Currency-aware: a `geography` selector swaps currency, defaults, and tax module (India vs US).
7. **[v3]** An `acquisitionType` selector (**ReadyApartment | UnderConstructionApartment | PlotSelfBuild**) drives which input sections and formula branches are active. The plot module (§3I, §4.11) activates only for `PlotSelfBuild`.

---

## 1. Tech & layout

- **Stack:** React single file, Tailwind, Recharts. No router, no external state lib.
- **Layout:** left = inputs in collapsible sections (§3); right = sticky results (§6). Below the fold: time-series schedule table (§6A) and value-stack chart.
- **Live recompute** on any input change. Debounce 150ms.
- **[v3]** `acquisitionType` and the three switches (§3.G) rendered prominently at top.
- Locale formatting (₹ lakh/crore via custom formatter; $ for US). Unit toggle (Lakh/Cr vs raw).

---

## 2. Two engines, one comparison

Always compute **two scenarios in parallel**:

- **Engine A — Real Estate:** terminal net worth after 20 years (equity built + reinvested cash flows − all taxes/costs). For `PlotSelfBuild`, "acquisition" spans a construction period before the asset can be occupied/let (§4.11).
- **Engine B — Equity Benchmark (counterfactual):** the same investor deploys the **same out-of-pocket cash** (down payment + entry costs + **[v3] all construction-period outflows** at their actual timing, plus every EMI as a monthly SIP, plus any ownership outflow) into equity instead. The apples-to-apples "index fund" line.

**Critical for fairness:** Engine B's contributions must exactly mirror Engine A's cash outflows in timing and amount (§4.9). **[v3] This now includes the staged construction outflows and pre-EMI during the build** — Engine B receives those rupees on the same dates Engine A spends them. Do not let Engine A spend money Engine B doesn't also get to invest.

---

## 3. Input sections

### A. Property, area & acquisition type
- `geography` (Bangalore | Mumbai | NewYork | SanFrancisco)
- **[v3]** `acquisitionType` (ReadyApartment | UnderConstructionApartment | PlotSelfBuild)
- `assetType` (Land/Plot | PlottedDevelopment/Villa | StandaloneApartment | MidRiseSociety | HighRiseSociety) — drives UDS, depreciation, premium decay, maintenance treatment
- `sbua` — Super Built-Up Area (sq ft) [apartment case]
- `carpetArea` (sq ft) — display/sanity only unless rent is per-carpet-sqft
- `udsSqft` — Undivided Share of land (sq ft). **Independent input.** (Show implied UDS ratio = udsSqft × landRate ÷ price as read-only diagnostic.) For `PlotSelfBuild`, udsSqft ≈ full plot area (UDS ratio ~100%).
- `ageAtPurchaseYears` — structure age at t=0 (0 for new build or new apartment)
- `purchasePriceAllIn` — apartment acquisition price (BSP + PLC + floor rise + parking + amenities), excluding stamp/reg/GST. **[v3] For `PlotSelfBuild`, this field is the PLOT (land) price only**; construction is built up separately in §3I.

### B. Rent & rent growth
- `rentPerMonth0` — starting market rent at t=0 (for the let case). **[v3] For `PlotSelfBuild`, rent begins only after construction completes (§4.11); rentPerMonth0 is the market rent at completion, grown from t=0 thereafter.**
- `rentGrowthY1_5`, `rentGrowthY6_10`, `rentGrowthY11_20` (% p.a.)
- `cohortDragPct` (% p.a.) — subtracted from market rent growth after year 10 (§4.3)
- `vacancyPct` (% of annual rent lost)
- `reLetBrokerageMonths` (months lost per re-let; annualized in §4.4)
- `usageMode` (SelfOccupied | LetOut) **[v3 explicit]** — SelfOccupied means no rental income but the investor saves rent elsewhere (model `imputedRentBenefit` optionally; default OFF — see §4.4 note). The video's flat case was self-consumption; support both.

### C. Entry costs (one-time, t=0)
- `stampDutyRegPct` (% of price) [v2: Karnataka now 2% registration]
- `gstPct` (% — under-construction only; 0 if ready/OC)
- `brokerageBuyPct`
- **[v3]** `otherAcquisitionCostsAbs` — bundle for assessor/valuation charge, legal due diligence, documentation, mutation/khata transfer (the video itemized ~₹20k assessor + ₹25k legal + ₹10k documentation for a plot). Absolute figure; default per §5.
- `interiorsCapex0` (absolute) — initial fit-out

### D. Appreciation engine (the value stack)
- `landRate0` — land rate per sq ft at t=0 (for the UDS / plot)
- `landCagrY1_10`, `landCagrY11_20` (% p.a.) — two-phase land growth
- `replacementCost0` — current cost to rebuild structure (per sq ft of built-up area)
- `constructionInflationPct` (% p.a.)
- `physicalDepRatePct` (% p.a., SLM on fraction-of-new)
- `economicDepRatePct` (% p.a., obsolescence on top of physical)
- `structureLifeYears` (informs salvage floor)
- `premium0` — newness/brand premium per sq ft at t=0 (apartment case; ~0 for self-build)
- `premiumDecayYears`
- `infraBumps` — optional list {year, pct} of one-off land-value uplifts (metro/PRR). Default empty.

### E. Maintenance, CAM & property tax [v2; extended v3]
- `maintenanceMode` (TenantPaysCAM | OwnerBearsAll) — auto by assetType, overridable
- `societyCamPerSqftMonth0` — monthly society CAM per sq ft at t=0 (apartment)
- `ownerMaintPctOfRent` — owner-borne recurring maintenance as % of annual rent (or of value if SelfOccupied — see §4.4)
- `camEscalationPct` (% p.a.) — CAM/maintenance escalation
- **[v3]** `maintenanceAgeAccelPct` (% p.a.) — **additional** escalation applied to owner maintenance that compounds with building age, capturing the video's point that upkeep gets more expensive as the structure ages (cracks, waterproofing, plumbing, lift overhauls). Applied on top of `camEscalationPct`. Default small; see §4.4.
- `propertyTaxAnnual0` (absolute at t=0)
- `propertyTaxGrowthPct` (% p.a.)
- **[v3]** `waterTaxAnnual0` + `waterTaxGrowthPct` — separate recurring water/borewell charge, material for plots/villas on borewell or tanker supply (ties to known Bangalore water-risk diligence). For apartments usually inside CAM → default 0.
- `majorRepairReservePctOfValue` (% of property value p.a.) — sinking-fund/major-repair accrual owner bears even in TenantPaysCAM
- **[v3]** `interiorRefreshCycleYears` + `interiorRefreshPctOfInitial` — periodic re-do of interiors (kitchen, paint, fittings) every N years at a % of `interiorsCapex0` inflated to that year. The video treated interiors as one-time; in reality they recur. Default cycle 10 yrs at 60% of (inflated) initial. See §4.4.

### F. Financing — apartment (single loan)
- `loanAmount` — principal borrowed
- (read-only) `downPayment` = purchasePriceAllIn − loanAmount + all §C entry costs (entry costs from own pocket)
- `loanRatePct` (annual, floating assumed flat)
- `loanTenureYears`
- `prepaymentAnnual` (extra principal/year; default 0; also receives rental cash if switch=PrepayLoan)

### G. Switches (prominent)
- `rentalCashUse` (ReinvestEquity | PrepayLoan | Pocket) — where net rental cash goes
- `taxRegime` (India_Old | India_New | US) — auto by geography, overridable for India
- `compareMode` (SameCashSIP | LumpsumOnly) — whether Engine B invests the EMI-equivalent as SIP (default SameCashSIP)

### H. Tax & market
- `marginalTaxPct`; `surchargeCessToggle` (none | 31.2% | 35.8%)
- `ltcgPropertyPct`; `ltcgEquityPct`; `equityLtcgExemptionAnnual` (₹1.25 lakh)
- `equityCagrPct`; `cpiPct`; `sellingCostPct`; `liquidityHaircutPct`

### I. PLOT SELF-BUILD module [v3 — active only when acquisitionType=PlotSelfBuild]
Construction cost is driven by **built-up area**, which can exceed plot footprint across floors:
- `plotAreaSqft` — plot size (also sets udsSqft and the land/UDS for the value stack)
- `floors` — number of floors built
- `farBuildableRatio` — effective buildable ratio (a.k.a. FAR/FSI utilization); built-up area = plotAreaSqft × farBuildableRatio × floors-effect. Provide a direct override `builtUpAreaSqft` (the video set 1,750 sq ft BUA on a 500 sq ft plot, ~450 sq ft footprint × 2 floors + balconies). **`builtUpAreaSqft` is the authoritative driver of construction cost**; if the user enters it directly, use it; else derive from plotArea × farBuildableRatio.
- `constructionRatePerSqft` — build cost per sq ft of built-up area (₹/sqft; distinct from `replacementCost0`, though they should be reconciled — see §4.11 note)
- `constructionSoftCostsPct` — % of base construction cost for site cleanup, architect/structural fees, soil testing, plan approval, municipal + betterment charges, utility connections (water/electricity/sewage/drainage). Bundled %.
- `constructionContingencyPct` — contingency reserve as % of base construction cost (video used 20%).
- `constructionMonths` — duration of the build (no occupancy/rent during this window).
- `constructionFinancing` (CompositeLoan | OwnFunds) — composite loan = land loan + construction loan, the latter disbursed in tranches over the build with pre-EMI (interest-only) during construction.
- `landLoanAmount`, `constructionLoanAmount`, `plotLoanRatePct`, `constructionLoanRatePct` (often equal under a composite product), `compositeLoanTenureYears`.
- `preEMIduringConstruction` (bool) — if true, only interest is serviced during the build on disbursed tranches; principal amortization starts at completion. Standard for construction loans.

---

## 4. FORMULAS — implement exactly (order matters)

> Notation: `t` = year index 1…20; `m` = month 1…240. For `PlotSelfBuild`, t=0 is plot purchase and the 20-year hold clock and the value-stack/rent clock start at **construction completion** (`tC = constructionMonths/12`), with the project carrying cost accruing over [0, tC]. See §4.11. `^` = power; rates as decimals.

### 4.1 Entry cash (t=0)
```
entryCosts      = purchasePriceAllIn * (stampDutyRegPct + gstPct + brokerageBuyPct)
                + otherAcquisitionCostsAbs + interiorsCapex0          // [v3] otherAcquisitionCosts added
totalCashAtT0   = (purchasePriceAllIn - loanAmount) + entryCosts       // apartment own-pocket at t=0
```
GST applies on price only if under-construction; if ready, gstPct=0 (UI enforces). For `PlotSelfBuild`, `purchasePriceAllIn`=plot price, `loanAmount`=`landLoanAmount`, and construction cash is handled in §4.11 (do not also put it here).

### 4.2 Loan amortization — apartment single loan (standard EMI)
```
r_m   = loanRatePct / 12 ; n = loanTenureYears * 12
EMI   = loanAmount * r_m*(1+r_m)^n / ((1+r_m)^n - 1)      // if r_m=0 -> loanAmount/n
```
Monthly schedule: `interest_m = balance*r_m`, `principal_m = EMI - interest_m`, `balance -= principal_m`. Apply `prepaymentAnnual` (and rental prepay §4.6) as extra year-end principal, then recompute remaining schedule with **EMI fixed, tenure shortened** (floating-rate behaviour). Track `interest_m, principal_m, balance_m, prepay_m`; per-year `interestPaid[t], principalPaid[t], balanceEnd[t]`. EMI stops at payoff; freed cash flows to Engine B SIP under SameCashSIP.

### 4.3 Rent path (this asset's realized rent)
```
g_market(t) = rentGrowthY1_5 if t in 1..5 ; rentGrowthY6_10 if 6..10 ; rentGrowthY11_20 if 11..20
drag(t)     = 0 if t<=10 ; cohortDragPct * min((t-10)/5,1) if t>10
g_real(t)   = g_market(t) - drag(t)
rent_annual(t) = rent_annual(t-1) * (1 + g_real(t))         // rent_annual(0) = rentPerMonth0 * 12
```
**[v3] For `PlotSelfBuild`:** rent_annual(t)=0 for t < tC (construction window); rent begins at tC. Index the rent path from completion. For `usageMode=SelfOccupied`: rent_annual is not collected; optionally credit `imputedRentBenefit` (default OFF) — if ON, treat saved rent as a non-taxable inflow equal to a market rent the investor would otherwise pay (clearly labelled, since it is a benefit not cash). **Default OFF to stay conservative and avoid overstating the property case.**

### 4.4 Net rental cash flow (pre-tax then post-tax) [v2 maintenance; v3 additions]
```
reLetFrac       = reLetBrokerageMonths / 36
gross_rent(t)   = rent_annual(t) * (1 - vacancyPct) - reLetFrac * rent_annual(t)

// --- maintenance & charges ---
camBase(t)      = societyCamPerSqftMonth0 * sbua * 12 * (1 + camEscalationPct)^t
ageMaintMult(t) = (1 + maintenanceAgeAccelPct)^age(t)                       // [v3] upkeep rises with age
propertyTax(t)  = propertyTaxAnnual0 * (1 + propertyTaxGrowthPct)^t
waterTax(t)     = waterTaxAnnual0 * (1 + waterTaxGrowthPct)^t               // [v3]
majorRepair(t)  = majorRepairReservePctOfValue * propValueClean(t)
interiorRefresh(t) = (t mod interiorRefreshCycleYears == 0 && t>0)
                     ? interiorRefreshPctOfInitial * interiorsCapex0 * (1+cpiPct)^t   // [v3] lumpy, every N yrs
                     : 0

ownerMaintRecurring(t) = ownerMaintPctOfRent * rent_annual(t) * ageMaintMult(t)        // [v3] age accel

if maintenanceMode == TenantPaysCAM:
     ownerOpexNonTax(t) = ownerMaintRecurring(t) + majorRepair(t) + interiorRefresh(t) + waterTax(t)
     // camBase(t) displayed but borne by tenant
else: // OwnerBearsAll (plot / villa / standalone)
     ownerOpexNonTax(t) = ownerMaintRecurring(t) + camBase(t)*ageMaintMult(t) + majorRepair(t)
                        + interiorRefresh(t) + waterTax(t)

opex(t)         = ownerOpexNonTax(t) + propertyTax(t)
NOI(t)          = gross_rent(t) - opex(t)
```
> **For SelfOccupied:** there is no `rent_annual` to take a % of; base `ownerMaintRecurring` on a per-sqft figure or % of property value instead (provide `ownerMaintPctOfValue` as the SelfOccupied analogue). NOI is then negative (pure carrying cost) — correct, because a self-occupied home produces no cash; its "return" is appreciation + imputed rent (if enabled). Make the basis switch explicit in the UI.

**Taxable income from house property (India) — let-out case:**
```
NAV(t)          = gross_rent(t)
stdDeduction(t) = 0.30 * NAV(t)                       // 30% standard deduction, BOTH regimes
interestDeduct(t)= interestPaid(t)                    // let-out: full interest, no cap, both regimes
taxableHP(t)    = NAV(t) - stdDeduction(t) - interestDeduct(t)
```
> **CRITICAL (unchanged, reiterated):** actual maintenance/CAM/water/major-repairs/interior-refresh are **NOT** separately deductible — the 30% standard deduction is deemed to cover them. So `opex(t)` and the §4.4 [v3] additions reduce **cash flow** but NOT `taxableHP(t)`. Never deduct maintenance twice. (Self-occupied: NAV=0; only interest is relevant, capped at ₹2 lakh and **only in the old regime**.)

Loss set-off by regime (let-out):
- **India_Old:** offset up to 200,000/yr against other income (`shield = min(max(-taxableHP,0),200000)*effTaxRate`); carry forward unused loss 8 yrs vs future HP income (ledger displayed in §6A).
- **India_New:** negative `taxableHP` cannot be set off or carried — stranded (shield=0 on the negative part).
- Positive `taxableHP(t)` taxed at `effTaxRate = marginalTaxPct` adjusted by `surchargeCessToggle`.
```
rentalTax(t)       = (taxableHP(t)>0) ? taxableHP(t)*effTaxRate : -shield(t)
EMI_annual(t)      = sum of 12 EMIs paid that year (0 after payoff; pre-EMI handled in §4.11 for build)
postTaxRentalCF(t) = NOI(t) - EMI_annual(t) - rentalTax(t)
```
> **US (taxRegime=US):** replace HP block: taxable rental = gross_rent − opex − mortgageInterest − depreciation (buildingBasis/27.5), taxed at marginalTaxPct; depreciation recapture (25%) at sale. Isolated module; India primary.

### 4.5 The value stack — property market value at year t
**(a) Land/UDS:**
```
landRate(t) = landRate0 * (1+landCagrY1_10)^min(t,10) * (1+landCagrY11_20)^max(t-10,0)
            * Π(1+infraBump) for bumps with year<=t
landValue(t)= udsSqft * landRate(t)               // udsSqft = plotAreaSqft for PlotSelfBuild
```
**(b) Structure (depreciated replacement cost):**
```
age(t)        = ageAtPurchaseYears + t            // PlotSelfBuild: age measured from completion; age=0 at tC
replCost(t)   = replacementCost0 * (1 + constructionInflationPct)^t
totalDepRate  = physicalDepRatePct + economicDepRatePct
depFactor(t)  = max(1 - totalDepRate * age(t), salvageFloor)
structValue(t)= structureAreaSqft * replCost(t) * depFactor(t)    // [v3] structureAreaSqft = sbua (apartment) OR builtUpAreaSqft (plot build)
```
**(c) Premium (decays):**
```
premium(t)    = sbua * premium0 * max(1 - t/premiumDecayYears, 0)     // ~0 for self-build (no developer premium)
```
**(d) Redevelopment option (if enabled — Mumbai apartments):**
```
if redevelopmentEnabled:
   prox(t) = clamp(age(t)/redevEligibleAgeYears, 0, 1)
   redevValue(t) = redevOptionValuePctOfLand * landValue(t) * prox(t)
   if age(t) >= redevEligibleAgeYears: structValue(t) = max(structValue(t),0)
else: redevValue(t)=0
```
**Property gross market value:**
```
propValueClean(t) = landValue(t) + structValue(t) + premium(t) + redevValue(t)
```
Apply `liquidityHaircutPct` only at exit (§4.7).

> **[v3] Reconciliation note (replacementCost0 vs constructionRatePerSqft):** for `PlotSelfBuild`, the cost you actually pay to build (`constructionRatePerSqft`) and the cost to *rebuild for valuation* (`replacementCost0`) should be set consistently — default `replacementCost0 = constructionRatePerSqft` at t=0 unless the user has reason to differ. The structure's market value still depreciates per §4.5b regardless of what was paid to build it. This is the key truth the video gestures at ("after 10–15 years the construction comes into doubt"): the **structure depreciates while the land appreciates**, so a high-land-share plot+build retains value far better than a low-UDS flat.

### 4.6 Reinvestment sleeve (rental cash)
```
reinvestPot = 0
for t in 1..20:
   if ReinvestEquity: reinvestPot = reinvestPot*(1+equityCagrPct) + max(postTaxRentalCF(t),0)
   if PrepayLoan:     apply max(postTaxRentalCF(t),0) as extra principal at year-end (affects 4.2); reinvestPot=0
   if Pocket:         reinvestPot = reinvestPot + max(postTaxRentalCF(t),0)     // cash, no growth
   negCarry(t) = max(-postTaxRentalCF(t), 0)        // shortfall from pocket; mirror to Engine B (4.9)
```

### 4.7 Exit at t=20 (property terminal net worth)
```
exitGross      = propValueClean(20) * (1 - liquidityHaircutPct)
sellCosts      = exitGross * sellingCostPct
costBasis      = purchasePriceAllIn + entryCosts + totalConstructionCost(if PlotSelfBuild)   // [v3] include build cost in basis
capGain        = exitGross - sellCosts - costBasis
ltcg           = max(capGain,0) * ltcgPropertyPct
netSaleProceeds= exitGross - sellCosts - ltcg - balanceEnd(20)
RE_terminal    = netSaleProceeds + reinvestPot
```
> **[v3]** For `PlotSelfBuild`, `costBasis` includes the full capitalized construction cost (base + soft + contingency + interiors) and the plot price — these raise basis and reduce LTCG. `balanceEnd(20)` reflects the composite loan. Indexation is NOT available (post-2024), so basis matters only for the gain computation, not for inflation indexing.

### 4.8 (reserved)

### 4.9 Equity benchmark — Engine B (fair, same-cash) [v3 extended]
Engine B receives **exactly** the cash Engine A consumes, when it consumes it — **now including staged construction outflows and pre-EMI during the build.**
```
B_pot = 0 ; totalContribB = 0 ; monthlyGrowth = (1+equityCagrPct)^(1/12)
// t=0 own-pocket:
B_pot += totalCashAtT0 ; totalContribB += totalCashAtT0
for each month m in 1..240:
   B_pot *= monthlyGrowth
   // [v3] construction-period outflows (PlotSelfBuild): for m within [1, constructionMonths],
   //      add that month's construction draw + pre-EMI interest that Engine A pays:
   B_pot += constructionOutflow_m + preEMI_m ; totalContribB += constructionOutflow_m + preEMI_m
   if compareMode == SameCashSIP:
        B_pot += EMI_paid_this_month ; totalContribB += EMI_paid_this_month
   B_pot += negCarry_this_month ; totalContribB += negCarry_this_month
at t=20:
   B_gain      = B_pot - totalContribB
   B_ltcg      = max(B_gain - equityLtcgExemptionAnnual, 0) * ltcgEquityPct
   EQ_terminal = B_pot - B_ltcg
```
> Two framings shown: (1) **Headline (fair):** EQ_terminal (SameCashSIP) vs RE_terminal; (2) **All-cash:** `purchasePriceAllIn*(1+equityCagrPct)^20` minus equity LTCG, muted. **[v3]** For PlotSelfBuild the all-cash framing uses (plot + total construction cost) as the lumpsum invested in equity at the dates incurred.

### 4.10 Summary metrics
```
gap              = RE_terminal - EQ_terminal
RE_multiple      = RE_terminal / (sum of A's own-cash outflows)
RE_XIRR          = IRR over A's dated cashflows (t0 outflow; [v3] construction-period outflows at their dates; interim postTaxRentalCF; t20 netSaleProceeds (+reinvestPot))
EQ_XIRR          = IRR over B's dated cashflows
breakevenLandCagr= solve landCagr (phase1=phase2) s.t. RE_terminal == EQ_terminal     // headline decision number
real_RE_terminal = RE_terminal / (1+cpiPct)^20
```
XIRR via bisection/Newton on NPV=0. Breakeven via bisection on landCagr in [-5%, +30%]. Document in code which cashflows enter XIRR per `rentalCashUse`.

### 4.11 PLOT SELF-BUILD construction module [v3 — new]
Activates only when `acquisitionType=PlotSelfBuild`. Builds the construction cash flows over [0, tC] and the two-leg financing, then hands off to the standard hold-period engine at completion.

**Construction cost stack (capitalized into basis):**
```
builtUpAreaSqft   = (user override) OR plotAreaSqft * farBuildableRatio        // BUA can exceed footprint across floors
baseConstruction  = builtUpAreaSqft * constructionRatePerSqft
softCosts         = baseConstruction * constructionSoftCostsPct                 // architect, soil, approvals, betterment, utilities
contingency       = baseConstruction * constructionContingencyPct              // video used 20%
buildInteriors    = interiorsCapex0                                            // initial fit-out for the built house
totalConstructionCost = baseConstruction + softCosts + contingency + buildInteriors
```
**Construction schedule & draws.** Spread `totalConstructionCost − buildInteriors` across `constructionMonths` (default: even draw; allow an S-curve weighting flag). `buildInteriors` drawn near completion. Each month within the build produces `constructionOutflow_m` (the portion funded from own pocket) and a loan draw (the portion funded by the construction loan).

**Two-leg financing (composite loan):**
```
// Land loan: disbursed at t=0 on the plot.
landEMI or land pre-EMI per product (commonly principal+interest from start, OR interest-only until construction done — set by preEMIduringConstruction)
// Construction loan: disbursed in tranches as construction progresses.
For each month in the build, interest accrues only on the CUMULATIVE DISBURSED construction-loan balance:
     preEMI_m = (cumulativeConstructionDisbursed_m) * (constructionLoanRatePct/12)        // interest-only during build
At completion (tC):
     combinedPrincipal = landLoanAmount + constructionLoanAmount (fully disbursed)
     amortize combinedPrincipal over (compositeLoanTenureYears) at the blended/stated rate → full EMI begins
```
> If `constructionFinancing=OwnFunds`, there is no construction loan; all `constructionOutflow_m` are own-pocket (and Engine B receives them all). Land may still be loan-financed.

**Hand-off to the hold engine:**
```
- The 20-year hold clock for rent/value-stack starts at tC (completion). age(t) measured from tC.
- balance at start of amortization = combinedPrincipal; feed into §4.2 monthly schedule from month (constructionMonths+1).
- During [0, tC]: NOI = 0 (no occupancy), the investor pays preEMI_m + any own-pocket construction draws; these are real outflows feeding XIRR and Engine B mirroring.
- totalConstructionCost is added to costBasis (§4.7).
```
> **[v3] Modelling intent:** this captures everything the video itemized for the plot — BUA-driven construction cost, soft costs, contingency, the composite land+construction loan needing approved plans, and the dead construction period with carrying cost but no income — without importing its flawed "sum of nominal outflows = cost" conclusion. The plot's *advantage* (land is ~100% UDS, so it compounds near land CAGR with minimal structure depreciation) and *disadvantages* (build risk, illiquidity via `liquidityHaircutPct`, construction-period drag) both fall out of the math.

---

## 5. DEFAULT VALUES — VALIDATED 2026 [v2; v3 additions]

> User-overridable. Sources: RBI (June 2026 repo 5.25%), Freddie Mac PMMS, Companies Act Sch. II, post-23-Jul-2024 LTCG rules, Propsoch (Karnataka fee change), 99acres locality data, JLL/InfraLens construction costs, Anarock/Colliers/Magicbricks/NoBroker rent data, NSE/Finnovate equity data, plus the audited video's itemized plot costs (corroborative). **Current as of June 2026; starting estimates, not gospel.**

### Common (India)
| Param | Default | Note |
|---|---|---|
| loanRatePct | 7.5% | repo 5.25%; prime home loans ~7.0–7.5% |
| loanTenureYears | 20 | — |
| equityCagrPct | 11% | Nifty/Sensex nominal; expose conservative 9–10% toggle (sub-10% 20-yr rolling CAGR in FY26) |
| cpiPct | 4.5% | RBI ~4.6% FY26-27 |
| ltcgPropertyPct | 12.5% | no indexation, post-23-Jul-2024 |
| ltcgEquityPct | 12.5% | above ₹1.25L exemption |
| equityLtcgExemptionAnnual | ₹1,25,000 | — |
| marginalTaxPct | 30% | surchargeCess toggle 31.2%/35.8% |
| sellingCostPct | 2% | brokerage ~1% + legal |
| vacancyPct | 5% | metros 4–8% |
| camEscalationPct | 6% | society CAM escalation |
| **maintenanceAgeAccelPct [v3]** | **1%** | extra upkeep growth compounding with structure age |
| propertyTaxGrowthPct | 5% | (video used 5%) |
| **waterTaxAnnual0 [v3]** | apartment 0 / **plot ₹3,000** | (video used ₹3,000/yr for plot) |
| **waterTaxGrowthPct [v3]** | 5% | |
| majorRepairReservePctOfValue | 0.3% | owner sinking-fund accrual |
| **interiorRefreshCycleYears [v3]** | 10 | re-do interiors every ~10 yrs |
| **interiorRefreshPctOfInitial [v3]** | 60% | of inflated initial fit-out |
| constructionInflationPct | 6% | long-run ~5.5–7% |
| physicalDepRatePct | 1.67% | RCC 60-yr SLM, 5% salvage |
| economicDepRatePct | 1.5% | → ~3.2%/yr blended (20-yr ≈ 50% of new); corroborated by video's "construction comes into doubt after 10–15 yrs" |
| structureLifeYears | 60 | — |
| salvageFloor | 0.10 | — |
| liquidityHaircutPct | 3% (apartment) / **5% (plot self-build)** [v3] | plots are less liquid to exit |
| **otherAcquisitionCostsAbs [v3]** | apartment ₹50,000 / **plot ₹95,000** | assessor + legal + documentation (video: ₹20k+₹25k+₹10k plot, plus mutation) |

### Stamp duty + registration (all-in) [v2 corrected]
| Geography | Default | Detail |
|---|---|---|
| Bangalore | 7.0% (7.6% for >₹45L BBMP urban) | 5% duty + **2% registration (doubled 31 Aug 2025)** + ~0.6% cess; no women's concession |
| Mumbai | 7.0% men / 6.0% women | 5% duty + 1% metro cess + 1% reg (capped ₹30k >₹30L); sole-female for concession |

> **[v3] Note on the video's stamp+reg:** it used 5% duty + 1% registration = 6% for the plot. That registration rate is **stale for Karnataka post-31-Aug-2025** (now 2%). Use 7.0–7.6%. This is exactly the kind of small, costly error the calculator must avoid.

### Geography land & rent anchors (t=0) [v2 revised growth]
| Geography (micro-market) | landRate0 (₹/sqft) | landCagr Y1-10 / Y11-20 | rent growth Y1-5/6-10/11-20 | gross yield |
|---|---|---|---|---|
| Bangalore CORE (Indiranagar/Koramangala/Jayanagar) | default 38,000 | 8% / 6% | 6% / 5% / 5% | ~2.5% |
| Bangalore IT-BELT (Whitefield/Sarjapur) | default 13,000 | 8% / 6% (decaying) | 6% / 5% / 4% | ~3.75% |
| Bangalore PLOT areas (peripheral, video's ₹8,000/sqft) [v3] | default 8,000–12,000 | 7% / 6% | n/a (build then let) | n/a |
| Mumbai SUBURBS (Powai/Andheri/Chembur) | default 45,000 | 4.5% / 4% | 5% / 5% / 4% | ~3.5% |
| New York | $/sqft price model | 4% / 4% | 3% / 3% / 3% | ~4.5% cap |
| San Francisco | $/sqft price model | 3% / 3% | 3% / 2.5% / 2.5% | ~4% cap |

> **[v3] Corroboration:** the video cites a report that **2015–23 residential plots appreciated ~7% CAGR vs flats ~2%.** This is consistent with our land-appreciates / structure-depreciates mechanism and our differentiated defaults (Mumbai flat ~4.5%, plots/land higher). It is independent support for modelling land and structure separately, not a new default — but it justifies the **plot land-CAGR defaults sitting at/above flat CAGRs**.

### Plot self-build defaults [v3]
| Param | Default | Note |
|---|---|---|
| constructionRatePerSqft | ₹2,500 (BLR) | video used ₹2,500; reconcile with replacementCost0 |
| farBuildableRatio | 0.9 footprint × floors | i.e. ~450/500 sq ft buildable per floor (video) |
| floors | 2 | |
| constructionSoftCostsPct | 12% | architect/soil/approvals/betterment/utilities bundle |
| constructionContingencyPct | 20% | video's explicit rule |
| constructionMonths | 18 | typical self-build window (12–24) |
| constructionFinancing | CompositeLoan | land + construction, plans required pre-sanction |
| plotLoanRatePct / constructionLoanRatePct | 8.5% | construction loans price above home loans (video used 8.5%) |
| preEMIduringConstruction | true | interest-only on disbursed tranches during build |
| compositeLoanTenureYears | 20 | |

### Construction cost (replacementCost0, ₹/sqft of BUA, 2026)
| Geography | Default |
|---|---|
| Bangalore | 2,300 (apartment) / 2,500 (self-build incl. site-specific) |
| Mumbai | 3,000 |
| NY / SF | price model |

### Asset-type modifiers (India) [v2; v3 plot row]
| assetType | UDS ratio (diag) | economicDepRatePct | premium0 (₹/sqft) | premiumDecayYears | redevEnabled | maintenanceMode | ownerMaintPctOfRent |
|---|---|---|---|---|---|---|---|
| Land / Plot | 100% | 0% | 0 | — | OFF | OwnerBearsAll | low (~5%) |
| PlottedDevelopment / Villa | 30% (self-build ~100% land share early) | 0.5% | small | 10 | OFF | **OwnerBearsAll** | **10–15%** |
| StandaloneApartment (low-rise) | 35% | 1.5% | 800 | 12 | OFF (BLR) | TenantPaysCAM (partial) | 6–8% |
| MidRiseSociety | 20% | 1.8% | 1,200 | 12 | OFF/ON(MUM) | TenantPaysCAM | 5–8% |
| HighRiseSociety | 12% | 2.2% | 1,800 | 15 | OFF/ON(MUM) | TenantPaysCAM | 5–8% |

### Redevelopment (Mumbai apartments)
| Param | Default |
|---|---|
| redevEligibleAgeYears | 30 |
| redevOptionValuePctOfLand | 40% (phased) |

### Tax regime
- India → default `India_New` (toggle exposed). New regime strands let-out losses (no set-off/carry-forward) — surface impact.
- US → `US`.

### US (NewYork / SanFrancisco): `usePriceModel=true`
Collapse stack into single price CAGR (hide UDS/construction/redev; structure & premium=0). Mortgage 6.5%; closing/buy 3%; exit 5–6%; property tax NYC 1.0% / SF 1.2% of value (annual owner outflow); S&P benchmark 10%. Rent caps bound rent growth (NYC stabilization 3.0%/4.5%; California AB 1482 5%+CPI, max 10%).

---

## 6. Results panel (right column)
- **RE_terminal** vs **EQ_terminal** (SameCashSIP) — big numbers + **gap**.
- Muted: **"All-cash property vs same sum in equity."**
- **RE_XIRR**, **EQ_XIRR**, **RE_multiple**.
- **Breakeven land CAGR** — "Land must grow ≥ X% p.a. for property to beat equity." (headline metric — directly answers the video's "you can't control appreciation" point by quantifying exactly how much appreciation you'd need.)
- **Real (today's money)** RE_terminal.
- **Value-stack area chart** (land/structure/premium/redev) + reinvestPot + loan balance.
- **Tornado/sensitivity** on the 5 highest-impact inputs (landCagr, equityCagr, loanRate, rentGrowth, economicDep). **[v3]** For PlotSelfBuild, also include constructionRatePerSqft and constructionMonths in the tornado (build cost/time are the controllable risks the video stresses).
- **Warnings:** (a) negative-carry years + funding; (b) New-regime stranded losses; (c) UDS ratio <30% in oversupplied corridor; (d) large exit LTCG; (e) OwnerBearsAll with high ownerMaint denting NOI; **[v3]** (f) construction-period carry (pre-EMI + draws) materially negative with no income; (g) EMI > ~40% of assumed income → affordability flag (the video's "house owns you" threshold).

---

## 6A. TIME-SERIES SCHEDULE TABLE [v2; v3 construction rows]

Scrollable, exportable table tracing every period, so any final number is auditable and the value-stack composition is visible over time.

### Granularity & UX
- **Default: ANNUAL** (Year-0 row + 20 rows). **[v3]** For PlotSelfBuild, prepend **construction-period rows** (one per construction month or a single aggregated "construction" block, user-toggle) showing draws, cumulative disbursed, pre-EMI, and zero NOI — so the dead-money build window is explicit.
- **Toggle: MONTHLY** (up to 240 + construction months) — expands loan-driven columns; annual quantities step at year boundaries.
- Sticky header; sticky Month/Year columns. Column groups visually separated. CSV/Excel export of current granularity. Row-hover shows the formula reference.

### Columns — 5 groups (v2) + construction fields (v3)

**Group 1 — Time & Loan**
month; year; emi; interestComponent; principalComponent; prepayment; loanBalanceEnd; cumInterestPaid; cumPrincipalPaid.
**[v3] construction sub-fields (PlotSelfBuild, build window only):** constructionDrawThisMonth; cumConstructionDisbursed; preEMI_interest.

**Group 2 — Value Stack**
landValue; structureValue; premiumValue; redevOptionValue; propValueGross; landSharePct (land÷gross — the "land beta", watch it climb); replacementCostPerSqft; depFactor.

**Group 3 — Income & Operating Costs**
marketRent; realizedRent; vacancyLoss; grossRentCollected; societyCAM; ownerMaintenance; **[v3]** waterTax; **[v3]** interiorRefresh (lumpy); majorRepairReserve; propertyTax; NOI; emiAnnual; postTaxRentalCF.

**Group 4 — Tax & Reinvestment**
taxableHP; rentalTaxOrShield; carryForwardLossBalance; reinvestPot.

**Group 5 — Equity Benchmark & Net Worth**
equityContribThisPeriod; equityPot; cumOwnCashOutA; cumContribB; cashConservationCheck (cumContribB − cumOwnCashOutA, ≈0 always, red if |diff|>₹1 — live guard for T9); reNetWorth ((propValueGross − loanBalanceEnd) + reinvestPot); equityNetWorth; netWorthGap.

> **Terminal row (Year 20)** surfaces the exit waterfall inline: exitGross → sellCosts → ltcg → loan payoff → netSaleProceeds → +reinvestPot = RE_terminal, beside EQ_terminal.

### Implementation notes
- Table renders the **same per-period arrays** the engine computes — **no separate calculation path** (T12 guards parity).
- `cashConservationCheck` and `landSharePct` get subtle conditional formatting.
- Show/hide column groups via checkboxes. In MONTHLY view, annual-native columns hold the year's value (greyed off-boundary) — be consistent and labelled.

---

## 7. TEST CASES — implement FIRST; must pass before UI

> **[CORRECTED] Golden values, computed to full precision** — see `reference/oracle.py` (the authoritative oracle) and `docs/Investment_Calculator_PRD_v3.original.md` (the as-written source). The original §7 carried hand-rounded targets (e.g. landRate(10)=82,054, rent_annual(10)=675,640); two independent reviews recomputed every value to the paisa and confirmed **the formulas are correct — only the stated targets were imprecise**, each within the original ±0.5–1% tags. Targets below are now exact. Assert deterministic quantities to **2 decimals (the paisa)**; use a tiny tolerance (≤1e-7) only for iterative results (XIRR/breakeven). The TypeScript engine MUST match `reference/oracle.py`. Pure `compute(inputs)` tested directly. **[v3] adds T13–T15 for the plot module.**

**T1 — EMI.** loan 10,000,000; 7.5%; 20y → EMI = **80,559.32**/mo (exact).
**T2 — Zero-rate EMI.** loan 1,200,000; 0%; 10y → 10,000/mo exactly.
**T3 — Rent path + drag.** rent0 30,000/mo (annual 360,000); g 7/6/5; cohort drag 2% → rent_annual(5)=**504,918.62** (=360,000×1.07⁵, 1.07⁵=1.40255173); (10)=**675,695.02** (×1.06⁵, 1.06⁵=1.33822558); (15)=**814,151.52** (×[1.046·1.042·1.038·1.034·1.030]=×1.20490976); (20)=**943,824.75** (×1.03⁵=×1.15927407). All exact. *(Originals 504,918 / 675,640 / ~815,150 / ~945,000 were hand-rounded; the year-10 rounding propagated through years 15 and 20.)*
**T4 — Structure direction.** sbua 1,000; replCost0 2,300; infl 6%; phys 1.67%+econ 1.5%=3.17%; age0 0; salvage 0.10 → struct(0)=**2,300,000.00**; struct(10)=1,000×2,300×1.06¹⁰×(1−0.317)=1,000×2,300×1.79084770×0.683=**2,813,242.65** (rises early — the point of this test); struct(40): depFactor floored at 0.10; 1.06⁴⁰=10.28571794 → 1,000×2,300×10.28571794×0.10=**2,365,715.13**. All exact. *(Originals ~2,813,400 / ~2,365,700 were hand-rounded.)*
**T5 — Land.** uds 600; landRate0 38,000; 8% (y1-10) / 6% (y11-20) → landRate(10)=38,000×1.08¹⁰ (1.08¹⁰=2.15892500)=**82,039.15** → landValue=**49,223,489.94**; landRate(20)=×1.06¹⁰ (1.06¹⁰=1.79084770)=**146,919.62** → landValue=**88,151,773.57**. All exact. *(Originals landRate(10)=82,054 / landValue 49,232,400 / 88,164,000 were hand-rounded — the slip was treating 1.08¹⁰ as ~2.1593 instead of 2.158925.)*
**T6 — Full BLR mid-rise (v2 defaults).** [as v2; verify value-stack at t=20 sums land+structure+premium+redev ±1%, then exit waterfall and RE_terminal=netSaleProceeds+reinvestPot.]
**T7 — Regime divergence.** Loss-making early profile → Old > New by discounted stranded shields; validates carry-forward ledger + col 31.
**T8 — Switch equivalence.** ReinvestEquity with equityCagr=loanRate ≈ PrepayLoan (±1%) absent tax asymmetry.
**T9 — Benchmark fairness (key invariant).** Break-even inputs → RE_terminal≈EQ_terminal AND cumContribB==cumOwnCashOutA every period (conservation of cash, col 37).
**T10 — XIRR.** −1,000,000 @ t0, +6,727,500 @ t20 → **10.0000%** (the +6,727,500 is 1.10²⁰ rounded to the rupee; the exact-10% future value is 1,000,000×1.10²⁰=6,727,499.95). Solver tolerance ≤1e-7.
**T11 — Maintenance mode divergence.** Flip TenantPaysCAM→OwnerBearsAll → lower NOI/postTaxRentalCF by exactly the CAM added each year, with taxableHP UNCHANGED (CAM non-deductible). Confirms no double-count.
**T12 — Table/headline parity.** §6A terminal-row RE_terminal/EQ_terminal == headline to the rupee; propValueGross(20)==landValue+structureValue+premiumValue+redevOptionValue.

**[v3] T13 — BUA-driven construction cost.** plotArea 500; farBuildableRatio 0.9; floors 2 → builtUpAreaSqft override 1,750 (per video). constructionRate 2,500 → baseConstruction = 1,750×2,500 = 4,375,000. softCosts 12% = 525,000; contingency 20% = 875,000; buildInteriors 850,000 → totalConstructionCost = 6,625,000. Assert exact. (Confirms the construction cost stack and that BUA, not plot area, drives it.)

**[v3] T14 — Construction-period carry & hand-off.** constructionMonths 18; constructionLoanAmount disbursed evenly; constructionLoanRate 8.5%; preEMI=true. Assert: (a) during months 1–18, principal is NOT amortized and preEMI_m = cumDisbursed_m × 0.085/12 (interest-only, on the *cumulative* disbursed balance, so preEMI rises as draws accumulate); (b) NOI=0 for t<tC; (c) at month 19, full EMI begins on (landLoan+constructionLoan) over the remaining tenure; (d) every construction-period own-pocket outflow and preEMI appears in Engine B's contributions (cashConservationCheck stays ≈0 through the build). This is the most error-prone v3 path — test thoroughly.

**[v3] T15 — Plot vs flat land-share sanity.** A PlotSelfBuild (UDS ~100%) and a HighRiseSociety (UDS 12%) with identical land CAGR → assert the plot's `landSharePct` at year 20 is dramatically higher and its structure depreciation is a far smaller fraction of total value, so the plot's terminal value is more land-driven. (Encodes the video's plot-appreciates-flat-deteriorates thesis as a checkable property, not a hard-coded conclusion.)

---

## 8. Build order (strict)
1. Pure `compute(inputs)` returning per-period arrays (single source of truth for headline + table). **[v3] Include the construction-period sub-engine (§4.11) feeding the same arrays.**
2. §7 unit tests green (T1–T15).
3. Validated defaults loader (§5) keyed by geography × assetType × **[v3] acquisitionType**.
4. UI inputs (§3) + live recompute; **[v3]** show/hide the plot module (§3I) by acquisitionType.
5. Results panel (§6) + value-stack chart.
6. §6A time-series table (annual default, monthly toggle, **[v3] construction rows**, group show/hide, CSV export) from the same arrays.
7. Sensitivity/tornado + warnings (incl. **[v3]** affordability + construction-carry flags).
8. Final pass: re-run §7, plus manual reconciliation of one Bangalore apartment, one Mumbai apartment, **[v3] and one Bangalore plot+build** against the value-stack hand-math and the table terminal row.

## 9. Out of scope
- No saving/loading, no auth, no server (CSV export allowed).
- US depreciation-recapture is a stretch goal; ship India fully correct first.
- No Monte Carlo; deterministic only (tornado suffices).
- **[v3]** Do NOT implement the source video's "sum of nominal outflows = total cost" headline metric. Cost determinants from it are incorporated; its methodology is not.

---

### Reminder to implementer
The user allocates real capital on these outputs. **Implement formulas exactly as written, make §7 pass before anything else, never silently "fix" a formula — ask.** Invariants that matter most:
1. The value stack must sum land + structure + premium (+ redev) correctly each period.
2. Cash must be conserved between Engine A and Engine B (col 37 ≈ 0 always) — **[v3] including all construction-period outflows and pre-EMI.**
3. The §6A table and headline numbers must come from the **same** computed arrays — no second path.
4. Maintenance/CAM/water/interior-refresh reduce cash flow but are **NOT** deductible against house-property tax — never double-count.
5. **[v3]** For PlotSelfBuild, construction cost is driven by **built-up area** (which can exceed plot footprint), the loan is **two-leg** (land + tranche-disbursed construction with interim pre-EMI), and the **hold clock starts at completion** — the build window carries cost with zero income.
6. **[v3]** We import the audited video's cost *line items*, not its *cost-accounting conclusion*. The opportunity-cost (XIRR vs equity) framing in §2 remains the source of truth.
