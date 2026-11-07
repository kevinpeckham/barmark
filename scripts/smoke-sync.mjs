/**
 * Import @barmark/sync as Node sees it and use it: hash a real chart, check
 * a one-entry map against it, import the `./timing` subpath, and build a
 * four-bar chart whose timing map checks clean. Plain Node, so it runs against the local build
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
// The builder: four bars from a grid and three chord runs, parsed back cleanly,
// with a timing map that checks clean against the chart it wrote.
const built = main.chartFromDetections({
	grid: { bars: [0, 2, 4, 6, 8] },
	meter: "4/4",
	chords: {
		runs: [
			{ start: 0, end: 4, label: "C:maj" },
			{ start: 4, end: 6, label: "G:maj" },
			{ start: 6, end: 8, label: "A:min" },
		],
	},
});
const builtParse = parseChart(built.chart);
const builtErrors = builtParse.diagnostics.filter((d) => d.severity === "error").length;
const builtChecks = built.timing
	? timing.checkTimingMap(built.timing, { text: built.chart }).diagnostics
	: [{ message: "no timing map" }];
const builtGood =
	builtErrors === 0 &&
	builtParse.bars.length === 4 &&
	builtChecks.length === 0 &&
	built.diagnostics.length === 0;
const names = Object.keys(timing).sort();
const result = {
	hash,
	diagnostics,
	names,
	mainHasThem: names.every((n) => n in main),
	built: builtGood,
};
const wanted = ["barAt", "chartHash", "checkTimingMap", "secondsAtBar"];
const good =
	/^[0-9a-f]{16}$/.test(hash) &&
	diagnostics.length === 0 &&
	names.join() === wanted.join() &&
	result.mainHasThem &&
	builtGood;
console.log(JSON.stringify(result));
process.exit(good ? 0 : 1);
