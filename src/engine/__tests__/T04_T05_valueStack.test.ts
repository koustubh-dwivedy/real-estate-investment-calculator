/**
 * T4 (structure), T5 (land) — PRD §7. Golden values from reference/oracle.py.
 */
import { describe, it, expect } from "vitest";
import {
  structureValue,
  landRate,
  landValue,
  type StructureParams,
  type LandParams,
} from "../valueStack";

const struct: StructureParams = {
  structureAreaSqft: 1000,
  replacementCost0: 2300,
  constructionInflationPct: 0.06,
  physicalDepRatePct: 0.0167,
  economicDepRatePct: 0.015, // total 3.17%
  ageAtPurchaseYears: 0,
  salvageFloor: 0.1,
};

describe("T4 — structure (rises early, then depreciates to floor)", () => {
  it("struct(0) = 2,300,000.00", () => {
    expect(structureValue(struct, 0)).toBeCloseTo(2_300_000.0, 2);
  });
  it("struct(10) = 2,813,242.65 (still above t0 — the point of the test)", () => {
    expect(structureValue(struct, 10)).toBeCloseTo(2_813_242.65, 2);
    expect(structureValue(struct, 10)).toBeGreaterThan(structureValue(struct, 0));
  });
  it("struct(40) = 2,365,715.13 (depFactor floored at 0.10)", () => {
    expect(structureValue(struct, 40)).toBeCloseTo(2_365_715.13, 2);
  });
});

const land: LandParams = {
  udsSqft: 600,
  landRate0: 38_000,
  landCagrY1_10: 0.08,
  landCagrY11_20: 0.06,
};

describe("T5 — land (two-phase growth)", () => {
  it("landRate(10) = 82,039.15 ; landValue(10) = 49,223,489.94", () => {
    expect(landRate(land, 10)).toBeCloseTo(82_039.15, 2);
    expect(landValue(land, 10)).toBeCloseTo(49_223_489.94, 2);
  });
  it("landRate(20) = 146,919.62 ; landValue(20) = 88,151,773.57", () => {
    expect(landRate(land, 20)).toBeCloseTo(146_919.62, 2);
    expect(landValue(land, 20)).toBeCloseTo(88_151_773.57, 2);
  });
});
