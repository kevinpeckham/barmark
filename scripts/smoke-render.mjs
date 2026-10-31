/**
 * Import @barmark/render as Node sees it and render a real chart: one
 * <barmark-chart> with a declarative shadow root, every bar spoken, no line
 * shown as an error, and the font's licence beside the font. Plain Node, so
 * it runs against the local build (scripts/verify-package.ts) and against
 * the copy installed from npm (.github/workflows/release.yml, confirm).
 *
 *   node scripts/smoke-render.mjs <module> <chart>
 *
 * <module> is a path to the built entry or a bare specifier
 * ("@barmark/render"), resolved from this file's directory. Prints the
 * result as JSON; exit 1 if anything differs.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const [spec, chartPath] = process.argv.slice(2);
const url =
	spec.startsWith(".") || spec.startsWith("/")
		? pathToFileURL(resolve(spec)).href
		: import.meta.resolve(spec);
const entry = fileURLToPath(url);
const m = await import(url);
const html = m.renderChart(readFileSync(chartPath, "utf8"));
const font = join(dirname(entry), "../fonts");
const result = {
	element: html.startsWith('<barmark-chart><template shadowrootmode="open">'),
	bars: (html.match(/part="bar"/g) ?? []).length,
	spoken: (html.match(/class="bm-sr">bar \d+: /g) ?? []).length,
	errors: (html.match(/class="bm-error"/g) ?? []).length,
	font: existsSync(join(font, "Edwin-Roman.otf")) && existsSync(join(font, "OFL.txt")),
};
console.log(JSON.stringify(result));
const ok =
	result.element && result.bars > 100 && result.spoken > 100 && result.errors === 0 && result.font;
process.exit(ok ? 0 : 1);
