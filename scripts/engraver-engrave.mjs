/**
 * One side of the engraver equivalence gate (scripts/engraver-equivalence.ts):
 * engrave every MusicXML file in <xmldir> with the Verovio module given,
 * through @barmark/score's built engraveXml, at widths 375 and 1000. Plain
 * Node 22, because the gate compares what Node draws, and Node cannot import
 * the workspace's .ts sources: score must be built (root `bun run build`).
 *
 *   node scripts/engraver-engrave.mjs <module.mjs> <xmldir> <outdir>
 *
 * <module.mjs> is stock verovio/wasm's verovio-module.mjs or the engraver's
 * dist/verovio-module.mjs. Writes <name>.<width>.svg for each engraving (empty
 * if it failed) and run.json: { version, instantiateMs, engravings }.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

const [modulePath, xmlDir, outDir] = process.argv.slice(2);
if (!modulePath || !xmlDir || !outDir) {
	console.error("usage: node scripts/engraver-engrave.mjs <module.mjs> <xmldir> <outdir>");
	process.exit(2);
}
const WIDTHS = [375, 1000];

// The toolkit class from score's own Verovio, as scripts/smoke-score.mjs finds it.
const score = new URL("../packages/score/", import.meta.url);
const verovio = dirname(createRequire(new URL("package.json", score)).resolve("verovio/wasm"));
const { VerovioToolkit, enableLog, LOG_OFF } = await import(
	pathToFileURL(join(verovio, "verovio.mjs")).href
);
const { engraveXml } = await import(new URL("dist/index.js", score).href);

const started = performance.now();
const mod = await (await import(pathToFileURL(resolve(modulePath)).href)).default();
const instantiateMs = performance.now() - started;
enableLog(LOG_OFF, mod);
const vrv = new VerovioToolkit(mod);

/** One engraving: the SVG (empty on a failure) and its record. */
function engrave(name, xml, width) {
	// Verovio keeps options across calls: the IDs are seeded before every engraving.
	vrv.setOptions({ xmlIdSeed: 1 });
	const t = performance.now();
	let svg = "";
	let pages = 0;
	try {
		({ svg, pages } = engraveXml(vrv, xml, { width }));
	} catch (error) {
		console.error(`${name} at ${width}: ${error?.message ?? error}`);
	}
	const ms = performance.now() - t;
	writeFileSync(join(outDir, `${name}.${width}.svg`), svg);
	return { name, width, pages, bytes: Buffer.byteLength(svg), ms };
}

const engravings = [];
for (const file of readdirSync(xmlDir)
	.filter((f) => f.endsWith(".musicxml"))
	.sort()) {
	const xml = readFileSync(join(xmlDir, file), "utf8");
	const name = file.slice(0, -".musicxml".length);
	for (const width of WIDTHS) engravings.push(engrave(name, xml, width));
}
const run = { version: vrv.getVersion(), instantiateMs, engravings };
writeFileSync(join(outDir, "run.json"), `${JSON.stringify(run, null, "\t")}\n`);
