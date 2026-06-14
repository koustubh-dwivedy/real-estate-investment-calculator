/**
 * CSV re-import: parseInputsFromCsv restores a scenario from a full export's
 * INPUTS_JSON block, with migration for older CSVs and friendly errors.
 */
import { describe, it, expect } from "vitest";
import { buildFullCsv } from "../exportCsv";
import { parseInputsFromCsv } from "../importCsv";
import { compute } from "../../engine/compute";
import { getDefaults } from "../../defaults";

const scenario = () => ({
  ...getDefaults({ geography: "Bangalore", assetType: "PlottedDevelopmentVilla", acquisitionType: "PlotSelfBuild" }),
  holdYears: 30,
  rentAgreementMonths: 11,
  rentPerMonth0: 55_000,
  loanRatePct: 0.082,
  constructionLoanAmount: 3_000_000,
});

describe("export → import round-trip", () => {
  it("restores the exact inputs and reproduces compute() to the paisa", () => {
    const inp = scenario();
    const csv = buildFullCsv(inp, compute(inp));
    const res = parseInputsFromCsv(csv);
    expect("inputs" in res).toBe(true);
    if (!("inputs" in res)) return;
    expect(res.inputs).toEqual(inp);
    const a = compute(res.inputs);
    const b = compute(inp);
    expect(a.reTerminal).toBeCloseTo(b.reTerminal, 2);
    expect(a.eqTerminal).toBeCloseTo(b.eqTerminal, 2);
  });
});

describe("migration for older CSVs", () => {
  it("fills fields missing from an older export with current defaults", () => {
    const inp = getDefaults({ geography: "Bangalore", assetType: "MidRiseSociety", acquisitionType: "ReadyApartment" });
    const csv = buildFullCsv(inp, compute(inp));
    // Simulate an older export: drop the newer keys from the INPUTS_JSON cell.
    const lines = csv.split("\n");
    const idx = lines.findIndex((l) => l.startsWith("## INPUTS_JSON"));
    const cell = lines[idx + 1]!;
    const json = cell.slice(1, -1).replace(/""/g, '"');
    const obj = JSON.parse(json);
    delete obj.rentAgreementMonths;
    delete obj.rentGrowthY21_30;
    delete obj.landCagrY21_30;
    lines[idx + 1] = `"${JSON.stringify(obj).replace(/"/g, '""')}"`;
    const res = parseInputsFromCsv(lines.join("\n"));
    expect("inputs" in res).toBe(true);
    if (!("inputs" in res)) return;
    expect(res.inputs.rentAgreementMonths).toBe(12); // default restored
    expect(res.inputs.rentGrowthY21_30).toBe(res.inputs.rentGrowthY11_20);
    expect(Number.isFinite(compute(res.inputs).reTerminal)).toBe(true);
  });
});

describe("friendly errors (never throws)", () => {
  it("rejects a file with no INPUTS_JSON block", () => {
    const res = parseInputsFromCsv("year,rent\n1,1000\n2,1100");
    expect("error" in res).toBe(true);
  });
  it("rejects a corrupt JSON cell", () => {
    const res = parseInputsFromCsv('## INPUTS_JSON\n"{not valid json"');
    expect("error" in res).toBe(true);
  });
  it("rejects an empty file", () => {
    expect("error" in parseInputsFromCsv("")).toBe(true);
  });
  it("rejects JSON missing a valid geography/acquisition/asset", () => {
    const res = parseInputsFromCsv('## INPUTS_JSON\n"{""geography"":""Atlantis""}"');
    expect("error" in res).toBe(true);
  });
});
