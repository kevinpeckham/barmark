/**
 * Import @barmark/score as Node sees it: the server entry draws a chart as
 * <barmark-score> (the grid and the switch, no Verovio), and the root entry
 * engraves it with the real Verovio into an SVG score. Plain Node, so it
 * runs against the local build (scripts/verify-package.ts) and against the
 * copy installed from npm (.github/workflows/release.yml, confirm).
 *
 *   node scripts/smoke-score.mjs <module> <chart>
 *
 * <module> is a path to the built entry or a bare specifier
 * ("@barmark/score"), resolved from this file's directory. Prints the
 * result as JSON; exit 1 if anything differs.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const [spec, chartPath] = process.argv.slice(2);
const local = spec.startsWith(".") || spec.startsWith("/");
const rootUrl = local ? pathToFileURL(resolve(spec)).href : import.meta.resolve(spec);
const serverUrl = local
	? new URL("./server.js", rootUrl).href
	: import.meta.resolve(`${spec}/server`);
const { renderScoreHtml } = await import(serverUrl);
const { engraveChart } = await import(rootUrl);

const html = renderScoreHtml("| C | G |\n");
const text = readFileSync(chartPath, "utf8");

// Verovio is the package's own dependency, installed beside it.
// It sits in the package's node_modules, not this script's, so find it from the entry.
const dist = dirname(createRequire(fileURLToPath(rootUrl)).resolve("verovio/wasm"));
const { VerovioToolkit } = await import(pathToFileURL(join(dist, "verovio.mjs")).href);
const { default: createModule } = await import(
	pathToFileURL(join(dist, "verovio-module.mjs")).href
);
const vrv = new VerovioToolkit(await createModule());
const r = engraveChart(vrv, text, { width: 1000 });
const result = {
	element: html.includes("<barmark-score"),
	switch: html.includes('role="radiogroup"') || html.includes("Score"),
	engraved: r.ok,
	pages: r.ok ? r.pages : 0,
	svg: r.ok && r.svg.includes("<svg"),
};
console.log(JSON.stringify(result));
process.exit(result.element && result.engraved && result.pages > 0 && result.svg ? 0 : 1);
