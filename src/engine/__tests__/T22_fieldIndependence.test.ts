/**
 * T22 — field-independence audit. In a maximal-active scenario, perturbing EVERY
 * numeric input must change the output, UNLESS the field is in a documented
 * EXPECTED_INERT allow-list. Two-way contract: a non-inert field that does nothing
 * fails (new dead field), and an allow-listed field that DOES change fails (stale
 * allow-list). This is the durable guard for "fields are mutually independent".
 */
import { describe, it, expect } from "vitest";
import { compute } from "../compute";
import { getDefaults } from "../../defaults";
import type { Inputs } from "../../types";

/** Maximal-active scenarios so every field that CAN matter is in a regime where it does. */
function apartmentBase(): Inputs {
  return {
    ...getDefaults({ geography: "Bangalore", assetType: "MidRiseSociety", acquisitionType: "UnderConstructionApartment" }),
    usageMode: "LetOut",
    holdYears: 30,
    redevelopmentEnabled: true,
    prepaymentAnnual: 150_000,
    waterTaxAnnual0: 3_000,
    brokerageBuyPct: 0.01,
  };
}
function plotBase(): Inputs {
  return {
    ...getDefaults({ geography: "Bangalore", assetType: "PlottedDevelopmentVilla", acquisitionType: "PlotSelfBuild" }),
    usageMode: "LetOut",
    holdYears: 30,
    redevelopmentEnabled: true,
    prepaymentAnnual: 150_000,
    waterTaxAnnual0: 3_000,
    constructionLoanAmount: 3_000_000,
    builtUpAreaSqft: 0, // derive → floors & FAR are live
    economicDepRatePct: 0.02, // so the structure reaches the salvage floor within 30y
  };
}

// Apartment uses the single apartment loan + sbua/uds/age/premium/price; the plot
// construction fields are inert for it.
// The rent-vs-buy renting inputs feed rentVsBuy(), not compute() — inert here by design
// (their independence is proven in T23).
const RENT_VS_BUY = ["altRentPerMonth0", "altRentGrowthPct", "securityDepositMonths", "renewalCostMonths", "renewalCycleYears"];
// ownerMaintPctOfValue is the SelfOccupied analogue of ownerMaintPctOfRent — inert in
// any LetOut base (covered live/inert by the SelfOccupied targeted test below).
const APARTMENT_INERT = new Set<string>([
  "plotAreaSqft", "floors", "farBuildableRatio", "builtUpAreaSqft", "constructionRatePerSqft",
  "constructionSoftCostsPct", "constructionContingencyPct", "constructionMonths",
  "landLoanAmount", "constructionLoanAmount", "plotLoanRatePct", "constructionLoanRatePct",
  "compositeLoanTenureYears", "ownerMaintPctOfValue", ...RENT_VS_BUY,
]);
// Plot uses land+construction loans, plot area and built-up area; the apartment
// single-loan / sbua / uds / age / premium / independent price are inert (by design).
const PLOT_INERT = new Set<string>([
  "loanAmount", "loanRatePct", "loanTenureYears", "sbua", "udsSqft",
  "ageAtPurchaseYears", "premium0", "premiumDecayYears", "purchasePriceAllIn",
  "ownerMaintPctOfValue", // SelfOccupied-only (base is LetOut)
  ...RENT_VS_BUY,
]);

/** Strict per-field comparison (maximally sensitive — catches sub-rupee changes). */
function differs(a: ReturnType<typeof compute>, b: ReturnType<typeof compute>): boolean {
  for (const k of ["reTerminal", "eqTerminal", "gap", "netSaleProceeds", "reMultiple", "realReTerminal"] as const) {
    if (a[k] !== b[k]) return true;
  }
  if (a.rows.length !== b.rows.length) return true;
  for (let i = 0; i < a.rows.length; i++) {
    const ra = a.rows[i] as unknown as Record<string, number>;
    const rb = b.rows[i] as unknown as Record<string, number>;
    for (const k of Object.keys(ra)) if (ra[k] !== rb[k]) return true;
  }
  return false;
}

function auditNumericFields(base: Inputs, expectedInert: Set<string>, label: string) {
  const out0 = compute(base);
  const rec = base as unknown as Record<string, unknown>;
  const numericKeys = Object.keys(base).filter((k) => typeof rec[k] === "number");
  for (const key of numericKeys) {
    const v = rec[key] as number;
    const perturbed = { ...base, [key]: v !== 0 ? v * 1.1 : 0.05 };
    const changed = differs(out0, compute(perturbed as Inputs));
    if (expectedInert.has(key)) {
      expect(changed, `${label}: ${key} is allow-listed inert but CHANGED the output (stale allow-list?)`).toBe(false);
    } else {
      expect(changed, `${label}: ${key} did NOT change the output — possible dead/inert field`).toBe(true);
    }
  }
}

describe("T22 — every numeric input is independent (or explicitly allow-listed inert)", () => {
  it("apartment: all fields live except the plot-construction set", () => {
    auditNumericFields(apartmentBase(), APARTMENT_INERT, "apartment");
  });
  it("plot: all fields live except the apartment single-loan / area / price set", () => {
    auditNumericFields(plotBase(), PLOT_INERT, "plot");
  });
});

describe("T22 — targeted regressions for previously-broken fields", () => {
  it("marginalTaxPct now moves the result under any surcharge setting", () => {
    for (const surchargeCess of ["none", "cess", "surcharge"] as const) {
      const base = { ...apartmentBase(), surchargeCess };
      expect(differs(compute(base), compute({ ...base, marginalTaxPct: base.marginalTaxPct * 1.2 }))).toBe(true);
    }
  });
  it("surchargeCess changes the effective tax", () => {
    const base = apartmentBase();
    expect(differs(compute({ ...base, surchargeCess: "none" }), compute({ ...base, surchargeCess: "surcharge" }))).toBe(true);
  });
  it("floors and FAR drive built-up area when deriving (plot)", () => {
    const base = plotBase(); // builtUpAreaSqft = 0 → derive
    expect(differs(compute(base), compute({ ...base, floors: base.floors + 1 }))).toBe(true);
    expect(differs(compute(base), compute({ ...base, farBuildableRatio: base.farBuildableRatio * 1.2 }))).toBe(true);
  });
  it("the apartment loan rate stays inert for a plot (prior fix holds)", () => {
    const base = plotBase();
    expect(differs(compute(base), compute({ ...base, loanRatePct: base.loanRatePct * 2 }))).toBe(false);
  });

  it("owner-maintenance basis swaps correctly between LetOut and SelfOccupied", () => {
    const so = { ...apartmentBase(), usageMode: "SelfOccupied" as const };
    // self-occupied uses ownerMaintPctOfValue (live) and ignores ownerMaintPctOfRent
    expect(differs(compute(so), compute({ ...so, ownerMaintPctOfValue: so.ownerMaintPctOfValue * 1.5 }))).toBe(true);
    expect(differs(compute(so), compute({ ...so, ownerMaintPctOfRent: so.ownerMaintPctOfRent * 1.5 }))).toBe(false);
  });
});
