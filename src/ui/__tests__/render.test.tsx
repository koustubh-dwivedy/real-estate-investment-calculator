/**
 * UI render smoke test — renders App to static markup to catch any render-time
 * throw and confirm headline numbers reach the DOM. Runs in node (no jsdom).
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import App from "../../App";

describe("App renders", () => {
  it("produces markup containing the headline labels without throwing", () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain("Real-estate terminal");
    expect(html).toContain("Equity terminal");
    expect(html).toContain("Breakeven land CAGR");
    expect(html).toContain("Schedule");
  });
});
