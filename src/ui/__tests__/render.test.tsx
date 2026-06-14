/**
 * UI render smoke test — renders App to static markup to catch any render-time
 * throw and confirm headline numbers reach the DOM. Runs in node (no jsdom).
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import App from "../../App";
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
