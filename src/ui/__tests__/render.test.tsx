/**
 * UI render smoke test — renders App to static markup to catch any render-time
 * throw and confirm headline numbers reach the DOM. Runs in node (no jsdom).
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import App from "../../App";
import ResultsPanel from "../ResultsPanel";
import ScheduleTable from "../ScheduleTable";
import { compute } from "../../engine/compute";
import { getDefaults } from "../../defaults";

describe("App renders", () => {
  it("produces markup containing the headline labels without throwing", () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain("Real-estate terminal");
    expect(html).toContain("Equity terminal");
    expect(html).toContain("Breakeven land CAGR");
    expect(html).toContain("Schedule");
  });

  it("renders the results panel and schedule in real mode without throwing", () => {
    const inputs = getDefaults({ geography: "Bangalore", assetType: "MidRiseSociety", acquisitionType: "ReadyApartment" });
    const out = compute(inputs);
    const panel = renderToStaticMarkup(<ResultsPanel inputs={inputs} out={out} mode="real" />);
    const table = renderToStaticMarkup(<ScheduleTable inputs={inputs} out={out} mode="real" />);
    // (renderToStaticMarkup HTML-escapes the apostrophe in "today's", so match parts.)
    expect(panel).toContain("Nominal RE terminal"); // complementary basis shown
    expect(panel).toContain("future ₹ (not deflated)");
    expect(panel).toContain("RE XIRR (real)"); // XIRR tag flips to real
    expect(panel).toContain("nominal — unaffected by display mode"); // multiple stays nominal
    expect(table).toContain("Export CSV is always nominal");

    // nominal mode keeps the original labels (and the complementary "Real RE terminal")
    const nominalPanel = renderToStaticMarkup(<ResultsPanel inputs={inputs} out={out} mode="nominal" />);
    expect(nominalPanel).toContain("Real RE terminal");
    expect(nominalPanel).toContain("RE XIRR (nominal)");
  });
});

describe("regression — non-integer construction months must not crash", () => {
  it("compute tolerates a fractional constructionMonths (sensitivity sweep)", () => {
    const base = getDefaults({
      geography: "Bangalore",
      assetType: "PlottedDevelopmentVilla",
      acquisitionType: "PlotSelfBuild",
    });
    // ±15% tornado on constructionMonths produces 15.3 / 20.7 → must round, not throw.
    for (const factor of [0.85, 1.15]) {
      expect(() =>
        compute({ ...base, constructionMonths: base.constructionMonths * factor }),
      ).not.toThrow();
    }
  });
});
