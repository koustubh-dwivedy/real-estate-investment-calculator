/**
 * T11 (maintenance-mode divergence, no double-count) and T7 (regime divergence).
 * PRD §7 / §4.4.
 */
import { describe, it, expect } from "vitest";
import { computeOpexAndTax, type OpexTaxParams, type OpexTaxYearInputs } from "../opexTax";

const baseParams = (overrides: Partial<OpexTaxParams> = {}): OpexTaxParams => ({
  usageMode: "LetOut",
  maintenanceMode: "TenantPaysCAM",
  taxRegime: "India_New",
  vacancyPct: 0.05,
  reLetBrokerageMonths: 1,
  sbua: 1200,
  societyCamPerSqftMonth0: 4,
  camEscalationPct: 0.06,
  maintenanceAgeAccelPct: 0.01,
  ownerMaintPctOfRent: 0.06,
  ownerMaintPctOfValue: 0.004,
  propertyTaxAnnual0: 20_000,
  propertyTaxGrowthPct: 0.05,
  waterTaxAnnual0: 0,
  waterTaxGrowthPct: 0.05,
  majorRepairReservePctOfValue: 0.003,
  interiorsCapex0: 1_000_000,
  interiorRefreshCycleYears: 10,
  interiorRefreshPctOfInitial: 0.6,
  cpiPct: 0.045,
  effTaxRate: 0.312,
  ...overrides,
});

const years = (): OpexTaxYearInputs[] =>
  Array.from({ length: 10 }, (_, i) => {
    const t = i + 1;
    return {
      t,
      rentAnnual: 600_000 * Math.pow(1.06, t),
      age: t,
      propValueClean: 20_000_000 * Math.pow(1.06, t),
      interestPaid: 700_000, // high, fixed → drives early losses
      emiAnnual: 966_708, // ~EMI for illustration
    };
  });

describe("T11 — maintenance-mode divergence (no double-count)", () => {
  const tenant = computeOpexAndTax(baseParams({ maintenanceMode: "TenantPaysCAM" }), years());
  const owner = computeOpexAndTax(baseParams({ maintenanceMode: "OwnerBearsAll" }), years());

  it("OwnerBearsAll lowers NOI/postTaxRentalCF by exactly the CAM added (camBase×ageMaintMult)", () => {
    owner.forEach((o, i) => {
      const t = tenant[i]!;
      const camAdded = t.camBase * Math.pow(1.01, i + 1); // ageMaintMult, age=t
      expect(t.noi - o.noi).toBeCloseTo(camAdded, 2);
      expect(t.postTaxRentalCF - o.postTaxRentalCF).toBeCloseTo(camAdded, 2);
    });
  });

  it("taxableHP is UNCHANGED across the two modes (CAM is non-deductible)", () => {
    owner.forEach((o, i) => {
      expect(o.taxableHP).toBeCloseTo(tenant[i]!.taxableHP, 6);
    });
  });
});

describe("T7 — regime divergence (Old > New by stranded shields)", () => {
  const old = computeOpexAndTax(baseParams({ taxRegime: "India_Old" }), years());
  const neu = computeOpexAndTax(baseParams({ taxRegime: "India_New" }), years());

  it("loss-making early profile produces shields under Old, none under New", () => {
    // taxableHP is negative early (high interest vs rent after 30% std deduction)
    expect(old[0]!.taxableHP).toBeLessThan(0);
    // Old regime: negative rentalTaxOrShield (a shield); New regime: zero.
    expect(old[0]!.rentalTaxOrShield).toBeLessThan(0);
    expect(neu[0]!.rentalTaxOrShield).toBe(0);
  });

  it("total post-tax cash flow is higher under Old than New", () => {
    const sum = (rows: { postTaxRentalCF: number }[]) =>
      rows.reduce((s, r) => s + r.postTaxRentalCF, 0);
    expect(sum(old)).toBeGreaterThan(sum(neu));
  });

  it("carry-forward ledger accrues losses beyond the ₹2L set-off cap (Old)", () => {
    // loss each year > 200,000 → remainder carried forward, balance grows
    expect(old[0]!.carryForwardLossBalance).toBeGreaterThan(0);
    expect(neu[0]!.carryForwardLossBalance).toBe(0); // New: no carry-forward
  });
});
