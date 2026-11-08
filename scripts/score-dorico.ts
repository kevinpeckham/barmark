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
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { exportMusicXml } from "../packages/musicxml/src/index.js";
import { AMAZING_GRACE } from "../packages/render/tests/fixtures.js";
import { engraveChart } from "../packages/score/src/engrave.js";
import { macBenchEnv } from "./dorico-env.js";
import { type Entry, sideBySide } from "./score-dorico-page.js";

const ROOT = new URL("../", import.meta.url);
const MAC_BENCH = process.env.MAC_BENCH_DIR ?? join(homedir(), "projects/mac-bench");
const WIDTH = 900;

type Toolkit = Parameters<typeof engraveChart>[0];

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

/** Verovio lives in packages/score's node_modules, which a root script can't import by name. */
async function toolkit() {
	const req = createRequire(new URL("packages/score/package.json", ROOT));
	const load = async (id: string) => import(pathToFileURL(req.resolve(id)).href);
	const { VerovioToolkit } = await load("verovio/esm");
	const create = (await load("verovio/wasm")).default;
	return new VerovioToolkit(await create());
}

/** mac-bench's job on `files`; the names of the PDFs it did not write. */
function dorico(files: string[], out: string): string[] {
	if (!existsSync(join(MAC_BENCH, "bin/mac-bench")))
		throw new Error(`no mac-bench at ${MAC_BENCH} (set MAC_BENCH_DIR)`);
	const r = Bun.spawnSync([join(MAC_BENCH, "bin/mac-bench"), "dorico", ...files, "--out", out], {
		cwd: MAC_BENCH,
		env: macBenchEnv(process.env),
		stdout: "pipe",
		stderr: "inherit",
	});
	for (const line of r.stdout.toString().split("\n").filter(Boolean))
		console.log(`mac-bench: ${line}`);
	return files.filter((f) => !existsSync(pdfOf(out, f)));
}

const pdfOf = (out: string, xml: string): string =>
	join(out, xml.replace(/^.*\//, "").replace(/\.musicxml$/, ".pdf"));

/** Each chart's MusicXML written into `out`, and its Verovio engraving. */
function prepare(vrv: Toolkit, out: string) {
	const xmls: string[] = [];
	const svgs = new Map<string, string>();
	for (const [name, text] of charts()) {
		const x = exportMusicXml(text, { title: name });
		if (!x.ok) throw new Error(`${name}: ${x.diagnostics.map((d) => d.message).join("; ")}`);
		const e = engraveChart(vrv, text, { width: WIDTH });
		if (!e.ok) throw new Error(`${name}: ${e.reason}`);
		const path = join(out, `${name}.musicxml`);
		writeFileSync(path, x.xml);
		xmls.push(path);
		svgs.set(name, e.svg);
	}
	return { xmls, svgs };
}

/** mac-bench on `xmls`, and once more on the ones that failed (the Export dialog's timing is a known flake). */
function doricoWithRetry(xmls: string[], out: string): string[] {
	const missing = dorico(xmls, out);
	return missing.length ? dorico(missing, out) : missing;
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
	const { xmls, svgs } = prepare(await toolkit(), out);
	return writePage(out, xmls, svgs, doricoWithRetry(xmls, out));
}

process.exit(await main());
