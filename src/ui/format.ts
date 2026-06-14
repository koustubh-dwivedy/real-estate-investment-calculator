/**
 * Locale-aware formatting (PRD §1). India: ₹ lakh/crore; US: $ millions.
 */
import type { Geography } from "../types";

export type Unit = "compact" | "raw";

export function currencySymbol(geo: Geography): string {
  return geo === "NewYork" || geo === "SanFrancisco" ? "$" : "₹";
}

const isIndia = (geo: Geography) => geo === "Bangalore" || geo === "Mumbai";

/** Format a money amount. India compact uses lakh/crore; US uses K/M. */
export function formatMoney(value: number, geo: Geography, unit: Unit = "compact"): string {
  const sym = currencySymbol(geo);
  if (!Number.isFinite(value)) return "—";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);

  if (unit === "raw") {
    return `${sign}${sym}${Math.round(abs).toLocaleString(isIndia(geo) ? "en-IN" : "en-US")}`;
  }

  if (isIndia(geo)) {
    if (abs >= 1e7) return `${sign}${sym}${(abs / 1e7).toFixed(2)} Cr`;
    if (abs >= 1e5) return `${sign}${sym}${(abs / 1e5).toFixed(2)} L`;
    return `${sign}${sym}${Math.round(abs).toLocaleString("en-IN")}`;
  }
  if (abs >= 1e6) return `${sign}${sym}${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}${sym}${(abs / 1e3).toFixed(1)}K`;
  return `${sign}${sym}${Math.round(abs).toLocaleString("en-US")}`;
}

export function formatPct(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatMultiple(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(2)}×`;
}
