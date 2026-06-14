/**
 * The full CSV export must be self-contained: metadata, all assumptions, headline
 * results, the complete schedule (incl. t=0), and a machine-readable inputs JSON
 * that reproduces the result exactly.
 */
import { describe, it, expect } from "vitest";
import { buildFullCsv } from "../exportCsv";
import { compute } from "../../engine/compute";
import { getDefaults } from "../../defaults";

const inputs = getDefaults({
  geography: "Bangalore",
  assetType: "MidRiseSociety",
  acquisitionType: "ReadyApartment",
});

describe("full CSV export", () => {
  const csv = buildFullCsv(inputs, compute(inputs));

  it("contains all the documented sections", () => {
    for (const marker of [
      "# 20-Year Investment Value Calculator",
      "## SCENARIO",
      "## ASSUMPTIONS (all inputs)",
      "## HEADLINE RESULTS",
      "## SCHEDULE",
      "## INPUTS_JSON",
      "# Formula refs",
    ]) {
      expect(csv).toContain(marker);
    }
  });

  it("includes a t=0 row and runs through year 20 in the schedule", () => {
    const lines = csv.split("\n");
    const i = lines.findIndex((l) => l.startsWith("## SCHEDULE"));
    const dataRows = lines.slice(i + 2).filter((l) => /^\d+,/.test(l));
    expect(dataRows[0]!.startsWith("0,")).toBe(true); // t=0 first
    expect(dataRows.some((l) => l.startsWith("20,"))).toBe(true); // through year 20
    expect(dataRows.length).toBe(21); // years 0..20
  });

  it("documents the assumptions with values, units and definitions", () => {
    const lines = csv.split("\n");
    const start = lines.findIndex((l) => l.startsWith("## ASSUMPTIONS"));
    const end = lines.findIndex((l) => l.startsWith("## HEADLINE"));
    const body = lines.slice(start + 2, end).filter((l) => l.trim().length);
    expect(body.length).toBeGreaterThan(30); // most inputs documented
    // header declares the columns incl. exact engine value for reproduction
    expect(lines[start + 1]).toContain("Engine value (exact)");
    // a representative field row carries its unit + definition
    expect(body.some((l) => l.includes("Loan rate") && l.includes("% p.a."))).toBe(true);
  });

  it("embeds an inputs JSON that round-trips to the same result", () => {
    const lines = csv.split("\n");
    const idx = lines.findIndex((l) => l.startsWith("## INPUTS_JSON"));
    let jsonCell = lines[idx + 1]!;
    // unwrap CSV quoting
    if (jsonCell.startsWith('"')) jsonCell = jsonCell.slice(1, -1).replace(/""/g, '"');
    const parsed = JSON.parse(jsonCell);
    const a = compute(parsed);
    const b = compute(inputs);
    expect(a.reTerminal).toBeCloseTo(b.reTerminal, 2);
    expect(a.eqTerminal).toBeCloseTo(b.eqTerminal, 2);
  });
});
