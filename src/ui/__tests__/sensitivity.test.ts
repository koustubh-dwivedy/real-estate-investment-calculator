/**
 * Sensitivity/tornado data — guards the blank-bar bug (drivers where higher input
 * lowers the gap must still produce a non-zero span) and the new drivers.
 */
import { describe, it, expect } from "vitest";
import { computeSensitivity, getDrivers } from "../sensitivity";
import { compute } from "../../engine/compute";
import { getDefaults } from "../../defaults";

const apt = () => getDefaults({ geography: "Bangalore", assetType: "MidRiseSociety", acquisitionType: "ReadyApartment" });
const plot = () => getDefaults({ geography: "Bangalore", assetType: "PlottedDevelopmentVilla", acquisitionType: "PlotSelfBuild" });

describe("sensitivity — blank-bar regression", () => {
  it("Equity CAGR and Loan rate produce non-zero spans (would now render)", () => {
    const inp = apt();
    const bars = computeSensitivity(inp, compute(inp).gap, 0.15);
    const byLabel = Object.fromEntries(bars.map((b) => [b.label, b]));
    expect(byLabel["Equity CAGR"]!.span).toBeGreaterThan(1);
    expect(byLabel["Loan rate"]!.span).toBeGreaterThan(1);
  });

  it("higherRaisesGap: Land CAGR true, Equity CAGR false", () => {
    const inp = apt();
    const bars = computeSensitivity(inp, compute(inp).gap, 0.15);
    const byLabel = Object.fromEntries(bars.map((b) => [b.label, b]));
    expect(byLabel["Land CAGR"]!.higherRaisesGap).toBe(true);
    expect(byLabel["Equity CAGR"]!.higherRaisesGap).toBe(false);
  });
});

describe("sensitivity — drivers & filtering", () => {
  it("new drivers are present and non-zero (apartment)", () => {
    const inp = apt();
    const labels = computeSensitivity(inp, compute(inp).gap, 0.15).map((b) => b.label);
    expect(labels).toContain("Purchase price");
    expect(labels).toContain("Loan amount (leverage)");
    expect(labels).toContain("Starting rent");
  });

  it("UDS bar is present and higher UDS raises the gap (apartment)", () => {
    const inp = apt();
    const bars = computeSensitivity(inp, compute(inp).gap, 0.15);
    const uds = bars.find((b) => b.label === "UDS (land share)");
    expect(uds).toBeDefined();
    expect(uds!.span).toBeGreaterThan(1);
    expect(uds!.kind).toBe("number");
    expect(uds!.higherRaisesGap).toBe(true); // more land share ⇒ favours real estate
  });

  it("UDS lever becomes 'Plot area' (plotAreaSqft) for a plot", () => {
    const inp = plot();
    const drivers = getDrivers(inp);
    const uds = drivers.find((d) => d.label === "Plot area");
    expect(uds).toBeDefined();
    expect(uds!.keys).toContain("plotAreaSqft");
    const bars = computeSensitivity(inp, compute(inp).gap, 0.15);
    expect(bars.some((b) => b.label === "Plot area")).toBe(true);
    // and the apartment-only UDS label does not appear for a plot
    expect(bars.some((b) => b.label === "UDS (land share)")).toBe(false);
  });

  it("Prepayment is hidden at 0 but appears when set", () => {
    const inp = apt();
    expect(computeSensitivity(inp, compute(inp).gap, 0.15).map((b) => b.label)).not.toContain("Prepayment / year");
    const withPre = { ...inp, prepaymentAnnual: 200_000 };
    expect(computeSensitivity(withPre, compute(withPre).gap, 0.15).map((b) => b.label)).toContain("Prepayment / year");
  });

  it("bars are sorted by span descending", () => {
    const inp = apt();
    const bars = computeSensitivity(inp, compute(inp).gap, 0.15);
    for (let i = 1; i < bars.length; i++) expect(bars[i - 1]!.span).toBeGreaterThanOrEqual(bars[i]!.span);
  });

  it("plot uses the plot loan rates (not the inert loanRatePct) and they bite", () => {
    const inp = { ...plot(), constructionLoanAmount: 3_000_000 };
    const drivers = getDrivers(inp);
    const loan = drivers.find((d) => d.label === "Loan rate")!;
    expect(loan.keys).toContain("plotLoanRatePct");
    const bars = computeSensitivity(inp, compute(inp).gap, 0.15);
    expect(bars.find((b) => b.label === "Loan rate")!.span).toBeGreaterThan(1);
    // plot price lever is the land rate
    expect(bars.some((b) => b.label === "Land price/sqft")).toBe(true);
  });
});
