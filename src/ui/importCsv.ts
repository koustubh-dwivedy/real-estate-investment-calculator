/**
 * Re-import a scenario from a previously exported "full CSV".
 *
 * The export embeds a machine-readable `## INPUTS_JSON` block (see exportCsv.ts):
 *   ## INPUTS_JSON (paste into compute() to reproduce exactly)
 *   "{...JSON.stringify(inputs)...}"
 *
 * We restore from that block (exact, robust) — NOT from the human-readable
 * assumptions rows. Parsed values are layered over fresh defaults so CSVs exported
 * by an older build (missing newer fields) still load cleanly.
 */
import type { Inputs, Geography, AcquisitionType, AssetType } from "../types";
import { getDefaults } from "../defaults";

export type ParseResult = { inputs: Inputs } | { error: string };

const GEOS = new Set<Geography>(["Bangalore", "Mumbai", "NewYork", "SanFrancisco"]);
const ACQS = new Set<AcquisitionType>(["ReadyApartment", "UnderConstructionApartment", "PlotSelfBuild"]);
const ASSETS = new Set<AssetType>([
  "LandPlot",
  "PlottedDevelopmentVilla",
  "StandaloneApartment",
  "MidRiseSociety",
  "HighRiseSociety",
]);

/** Strip CSV quoting from a single field: "...""..." → ..."... */
function csvUnquote(cell: string): string {
  const c = cell.trim();
  if (c.startsWith('"') && c.endsWith('"')) {
    return c.slice(1, -1).replace(/""/g, '"');
  }
  return c;
}

/**
 * Parse the inputs out of a full-export CSV. Returns `{ inputs }` on success or
 * `{ error }` with a friendly message — never throws.
 */
export function parseInputsFromCsv(text: string): ParseResult {
  if (!text || !text.trim()) return { error: "The file is empty." };

  const lines = text.split(/\r?\n/);
  const markerIdx = lines.findIndex((l) => l.startsWith("## INPUTS_JSON"));
  if (markerIdx === -1) {
    return { error: "No INPUTS_JSON block found — is this a full export from this app?" };
  }
  // first non-empty line after the marker is the quoted JSON cell
  let cell: string | undefined;
  for (let i = markerIdx + 1; i < lines.length; i++) {
    if (lines[i]!.trim().length) {
      cell = lines[i];
      break;
    }
  }
  if (!cell) return { error: "The INPUTS_JSON block is empty." };

  let parsed: unknown;
  try {
    parsed = JSON.parse(csvUnquote(cell));
  } catch {
    return { error: "Couldn't parse the inputs JSON in the CSV." };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { error: "The inputs JSON is not a valid object." };
  }

  const obj = parsed as Record<string, unknown>;
  const geography = obj.geography as Geography;
  const acquisitionType = obj.acquisitionType as AcquisitionType;
  const assetType = obj.assetType as AssetType;
  if (!GEOS.has(geography) || !ACQS.has(acquisitionType) || !ASSETS.has(assetType)) {
    return { error: "The CSV is missing a valid geography / acquisition / asset type." };
  }

  // Layer parsed values over fresh defaults → fills any fields a newer build added
  // that an older CSV lacks (e.g. rentAgreementMonths, Y21–30 bands).
  const inputs = {
    ...getDefaults({ geography, acquisitionType, assetType }),
    ...obj,
  } as Inputs;

  return { inputs };
}
