// Build a single, self-contained HTML file that runs the calculator from a
// double-click (the file:// protocol) with zero network access.
//
// Vite's normal `dist/index.html` can't be double-clicked: it points at its JS/CSS
// with absolute paths AND loads the JS as an external ES module — browsers block
// both over file://. This script inlines the JS and CSS into one HTML file so the
// script runs inline (which file:// allows) and nothing has to be fetched.
//
// Run after `vite build` (see the `build:standalone` npm script).

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(root, "dist");
const assetsDir = join(distDir, "assets");
const outFile = join(root, "Real-Estate-Calculator.html");

function fail(msg) {
  console.error(`make-standalone: ${msg}`);
  process.exit(1);
}

if (!existsSync(distDir) || !existsSync(assetsDir)) {
  fail("dist/ not found — run `npm run build` first (or use `npm run build:standalone`).");
}

const pickOne = (ext) => {
  const matches = readdirSync(assetsDir).filter((f) => f.endsWith(ext));
  if (matches.length === 0) fail(`no ${ext} asset found in dist/assets/.`);
  if (matches.length > 1) {
    fail(
      `expected exactly one ${ext} asset but found ${matches.length} ` +
        `(${matches.join(", ")}). The inliner assumes a single bundled chunk; ` +
        `update scripts/make-standalone.mjs if the build now code-splits.`
    );
  }
  return matches[0];
};

const jsName = pickOne(".js");
const cssName = pickOne(".css");

const js = readFileSync(join(assetsDir, jsName), "utf8");
const css = readFileSync(join(assetsDir, cssName), "utf8");

let html = readFileSync(join(distDir, "index.html"), "utf8");

// Replace the external stylesheet <link> with an inline <style>.
// NOTE: use function replacers so `$`-sequences in the JS/CSS (e.g. `$&`) are
// inserted literally rather than interpreted by String.prototype.replace.
const linkRe = /<link[^>]*rel="stylesheet"[^>]*>/;
if (!linkRe.test(html)) fail("could not find the stylesheet <link> in dist/index.html.");
html = html.replace(linkRe, () => `<style>\n${css}\n</style>`);

// Replace the external module <script> with an inline module <script>.
// Inline module scripts run fine over file://; only *external* ones are blocked.
const scriptRe = /<script[^>]*type="module"[^>]*src="[^"]*"[^>]*><\/script>/;
if (!scriptRe.test(html)) fail("could not find the module <script> in dist/index.html.");
html = html.replace(scriptRe, () => `<script type="module">\n${js}\n</script>`);

if (/src="\/assets\//.test(html) || /href="\/assets\//.test(html)) {
  fail("leftover /assets/ reference after inlining — the file would not work via file://.");
}

writeFileSync(outFile, html, "utf8");

const kb = (Buffer.byteLength(html, "utf8") / 1024).toFixed(0);
console.log(`make-standalone: wrote Real-Estate-Calculator.html (${kb} KB).`);
console.log("Double-click it to open the calculator in your browser — no server needed.");
