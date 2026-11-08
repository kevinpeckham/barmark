/**
 * Verovio's score beside Dorico's, on the VM only (like scripts/dorico-midi.ts,
 * never in CI): it needs mac-bench beside this repo (`~/projects/mac-bench`, or
 * `MAC_BENCH_DIR`) and its `MAC_BENCH_TOKEN`.
 *
 * Each chart (the examples and Amazing Grace's lead sheet) is exported as a
 * full-score MusicXML; `mac-bench dorico` has Dorico open each and write a PDF;
 * `engraveChart` draws the same chart with Verovio; `index.html` in the output
 * folder puts the two side by side. Advice for a person to read, not a test.
 *
 *   bun scripts/score-dorico.ts [outdir]     (default /tmp/score-dorico)
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { AMAZING_GRACE } from "../packages/render/tests/fixtures.js";
import { engraveChart } from "../packages/score/src/engrave.js";
import { loadToolkit } from "../packages/score/tests/helpers/toolkit.js";
import { runMacBench } from "./mac-bench.js";
import { type Entry, sideBySide } from "./score-dorico-page.js";

const ROOT = new URL("../", import.meta.url);
const WIDTH = 900;

type Toolkit = Awaited<ReturnType<typeof loadToolkit>>;

const charts = (): [string, string][] => [
	...readdirSync(new URL("examples/", ROOT))
		.filter((f) => f.endsWith(".chart.md"))
		.sort()
		.map((f): [string, string] => [
			f.replace(".chart.md", ""),
			readFileSync(new URL(`examples/${f}`, ROOT), "utf8"),
		]),
	["amazing-grace", AMAZING_GRACE],
];

/** mac-bench's job on `files`; the files it wrote no PDF for. */
function dorico(files: string[], out: string): string[] {
	runMacBench(["dorico", ...files], out);
	return files.filter((f) => !existsSync(join(out, `${basename(f, ".musicxml")}.pdf`)));
}

/** Each chart's MusicXML written into `out`, and its Verovio engraving. */
function prepare(vrv: Toolkit, out: string) {
	const xmls: string[] = [];
	const svgs = new Map<string, string>();
	for (const [name, text] of charts()) {
		const e = engraveChart(vrv, text, { width: WIDTH });
		if (!e.ok) throw new Error(`${name}: ${e.reason}`);
		const path = join(out, `${name}.musicxml`);
		// The very MusicXML Verovio drew is what Dorico gets.
		writeFileSync(path, e.xml);
		xmls.push(path);
		svgs.set(name, e.svg);
	}
	return { xmls, svgs };
}

/** mac-bench on `xmls`, and once more on the ones that failed (the Export dialog's timing is a known flake). */
function doricoWithRetry(xmls: string[], out: string): string[] {
	const missing = dorico(xmls, out);
	// A run that wrote nothing is a wedged Dorico or a missing token, not the flake.
	return missing.length && missing.length < xmls.length ? dorico(missing, out) : missing;
}

/** The page for the charts that got a PDF, written to `out`; the exit code. */
function writePage(
	out: string,
	xmls: string[],
	svgs: Map<string, string>,
	missing: string[],
): number {
	const entries: Entry[] = xmls
		.filter((x) => !missing.includes(x))
		.map((x) => basename(x, ".musicxml"))
		.map((name) => ({ name, svg: svgs.get(name) ?? "", pdf: `${name}.pdf` }));
	writeFileSync(join(out, "index.html"), sideBySide(entries));
	console.log(`\n${entries.length} charts beside Dorico: ${join(out, "index.html")}`);
	if (missing.length) console.error(`no PDF for: ${missing.join(", ")}`);
	return missing.length ? 1 : 0;
}

async function main(): Promise<number> {
	const out = resolve(process.argv[2] ?? "/tmp/score-dorico");
	mkdirSync(out, { recursive: true });
	const { xmls, svgs } = prepare(await loadToolkit(), out);
	return writePage(out, xmls, svgs, doricoWithRetry(xmls, out));
}

process.exit(await main());
