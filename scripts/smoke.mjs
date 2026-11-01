/**
 * Import barmark as Node sees it and read a real chart: 153 bars, no
 * diagnostics, an unchanged canonical print, and a Harte label. Plain Node,
 * so it runs against the local build (scripts/verify-package.ts) and against
 * the copy installed from npm (.github/workflows/release.yml, confirm).
 *
 *   node scripts/smoke.mjs <module> <chart>
 *
 * <module> is a path to the built entry or a bare specifier ("barmark"),
 * resolved from this file's directory. Prints the result as JSON; exit 1 if
 * anything differs.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [spec, chartPath] = process.argv.slice(2);
const target =
	spec.startsWith(".") || spec.startsWith("/") ? pathToFileURL(resolve(spec)).href : spec;
const m = await import(target);
const text = readFileSync(chartPath, "utf8");
const parsed = m.parseChart(text);
const chord = m.parseChord("Bm7(b5)");
const result = {
	bars: parsed.bars.length,
	diagnostics: parsed.diagnostics.length,
	roundTrip: m.printChart(text) === text,
	harte: chord.ok ? chord.value.harte : null,
};
console.log(JSON.stringify(result));
const ok =
	result.bars === 153 && result.diagnostics === 0 && result.roundTrip && result.harte === "B:hdim7";
process.exit(ok ? 0 : 1);
