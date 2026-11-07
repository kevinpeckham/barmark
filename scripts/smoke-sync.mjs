/**
 * Import @barmark/sync as Node sees it and use its timing map: hash a real
 * chart, check a one-entry map against it, and import the `./timing`
 * subpath. Plain Node, so it runs against the local build
 * (scripts/verify-package.ts) and against the copy installed from npm
 * (.github/workflows/release.yml, confirm).
 *
 *   node scripts/smoke-sync.mjs <module> <chart>
 *
 * Locally <module> is the built entry (dist/index.js) and the subpath is
 * read from the `exports` map in the package.json beside dist/, so a wrong
 * map fails; from npm <module> is the package name and `<name>/timing` is
 * resolved by Node itself. The chart is counted with `barmark` (the sibling
 * build locally, the installed dependency from npm). Prints the result as JSON; exit 1 if anything
 * differs.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [spec, chartPath] = process.argv.slice(2);
const local = /^[./]/.test(spec);
const chart = readFileSync(chartPath, "utf8");

let timingSpec = `${spec}/timing`;
let barmarkSpec = "barmark";
if (local) {
	const entry = resolve(spec);
	const pkg = JSON.parse(readFileSync(join(dirname(entry), "..", "package.json"), "utf8"));
	barmarkSpec = pathToFileURL(resolve(dirname(entry), "../../barmark/dist/index.js")).href;
	timingSpec = pathToFileURL(resolve(dirname(entry), "..", pkg.exports["./timing"].import)).href;
}
const { parseChart } = await import(barmarkSpec);
const main = await import(local ? pathToFileURL(resolve(spec)).href : spec);
const timing = await import(timingSpec);

const hash = timing.chartHash(chart);
// A map that plays every bar of the chart once, a second apiece: it reports nothing.
const count = parseChart(chart).bars.length;
const map = {
	format: "barmark-timing",
	version: 1,
	chart: { bars: count, hash },
	bars: Array.from({ length: count }, (_, i) => ({ bar: i + 1, start: i })),
	end: count,
};
const diagnostics = timing.checkTimingMap(map, { text: chart }).diagnostics;
const names = Object.keys(timing).sort();
const result = {
	hash,
	diagnostics,
	names,
	sameExports: names.join() === Object.keys(main).sort().join(),
};
const wanted = ["barAt", "chartHash", "checkTimingMap", "secondsAtBar"];
const good =
	/^[0-9a-f]{16}$/.test(hash) &&
	diagnostics.length === 0 &&
	names.join() === wanted.join() &&
	result.sameExports;
console.log(JSON.stringify(result));
process.exit(good ? 0 : 1);
