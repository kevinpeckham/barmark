/**
 * Import @barmark/midi as Node sees it: the main entry and the `./perform`
 * subpath. Plain Node, so it runs against the local build
 * (scripts/verify-package.ts) and against the copy installed from npm
 * (.github/workflows/release.yml, confirm).
 *
 *   node scripts/smoke-midi.mjs <module> <chart>
 *
 * Locally <module> is the built entry (dist/index.js) and the subpath is
 * read from the `exports` map in the package.json beside dist/, so a wrong
 * map fails; from npm <module> is the package name and `<name>/perform` is
 * resolved by Node itself. The main entry exports exactly `exportMidi` and
 * `VERSION`, and exports the chart as a file starting `MThd`; the subpath
 * exports exactly `perform` and `secondsAt`. Prints the result as JSON;
 * exit 1 if anything differs.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [spec, chartPath] = process.argv.slice(2);
const local = /^[./]/.test(spec);
const chart = readFileSync(chartPath, "utf8");

let performSpec = `${spec}/perform`;
if (local) {
	const entry = resolve(spec);
	const pkg = JSON.parse(readFileSync(join(dirname(entry), "..", "package.json"), "utf8"));
	performSpec = pathToFileURL(resolve(dirname(entry), "..", pkg.exports["./perform"].import)).href;
}
const main = await import(local ? pathToFileURL(resolve(spec)).href : spec);
const perform = await import(performSpec);

const exported = main.exportMidi(chart);
const result = {
	midi: exported.ok && Buffer.from(exported.bytes.subarray(0, 4)).toString("latin1"),
	main: Object.keys(main).sort(),
	perform: Object.keys(perform).sort(),
};
const good =
	result.midi === "MThd" &&
	JSON.stringify(result.main) === JSON.stringify(["VERSION", "exportMidi"]) &&
	JSON.stringify(result.perform) === JSON.stringify(["perform", "secondsAt"]);
console.log(JSON.stringify(result));
process.exit(good ? 0 : 1);
