/**
 * The engraver equivalence gate: stock Verovio and @barmark/engraver's
 * build must draw the same SVG, byte for byte, with the same page counts.
 * Every chart of the corpus (scripts/engraver-corpus.ts) is exported to
 * MusicXML, then scripts/engraver-engrave.mjs engraves them all in Node,
 * once with stock verovio/wasm and once with the build, at widths 375 and
 * 1000. Needs the root `bun run build` (score's dist/) and a compiled
 * engraver dist/ (`bun run compile` in packages/engraver).
 *
 *   bun scripts/engraver-equivalence.ts [--lite <dir>] [--json]
 *
 * --lite is the folder holding verovio-module.{mjs,wasm} (default
 * packages/engraver/dist). --json prints { ok, engravings, problems, summary }
 * for Swamp. Exit 1 on any problem; timings are reported, never gated.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { exportMusicXml } from "../packages/musicxml/src/index.js";
import { engraverCorpus } from "./engraver-corpus.js";
import { type Engraving, gateProblems, type Run, summary } from "./engraver-equivalence-report.js";

const root = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const ENGRAVE = root("scripts/engraver-engrave.mjs");

/** Each corpus chart's MusicXML written into `dir`; the names of those that did not export. */
function writeCorpus(dir: string): string[] {
	const skipped: string[] = [];
	for (const [name, text] of engraverCorpus()) {
		const r = exportMusicXml(text);
		if (r.ok) writeFileSync(join(dir, `${name}.musicxml`), r.xml);
		else skipped.push(name);
	}
	return skipped;
}

/** One engraver's run over `xmlDir` into `out`, or why there is none. */
function engraveAll(module: string, xmlDir: string, out: string): Run | string {
	mkdirSync(out);
	const r = spawnSync("node", [ENGRAVE, module, xmlDir, out], {
		stdio: ["ignore", "inherit", "inherit"],
	});
	const runFile = join(out, "run.json");
	if (r.status !== 0 || !existsSync(runFile))
		return `node ${ENGRAVE} ${module} failed (exit ${r.status})`;
	return JSON.parse(readFileSync(runFile, "utf8")) as Run;
}

function readSvg(dir: string, e: Engraving): string {
	const file = join(dir, `${e.name}.${e.width}.svg`);
	return existsSync(file) ? readFileSync(file, "utf8") : "";
}

type Result = { ok: boolean; engravings: number; problems: string[]; summary: string };

const failed = (problems: string[]): Result => ({
	ok: false,
	engravings: 0,
	problems,
	summary: "",
});

/** Both runs over the corpus in `tmp`, compared. */
function compare(tmp: string, stockModule: string, liteModule: string): Result {
	const xmlDir = join(tmp, "xml");
	mkdirSync(xmlDir);
	const skipped = writeCorpus(xmlDir);
	const dirs = { stock: join(tmp, "stock"), lite: join(tmp, "lite") };
	const stock = engraveAll(stockModule, xmlDir, dirs.stock);
	const lite = engraveAll(liteModule, xmlDir, dirs.lite);
	if (typeof stock === "string" || typeof lite === "string")
		return failed([stock, lite].filter((r) => typeof r === "string"));
	const problems = gateProblems(stock, lite, (e, which) => readSvg(dirs[which], e));
	const notes = skipped.map((name) => `\nskipped (no MusicXML): ${name}`).join("");
	return {
		ok: problems.length === 0,
		engravings: lite.engravings.length,
		problems,
		summary: summary(stock, lite) + notes,
	};
}

function gate(liteDir: string): Result {
	const stockModule = createRequire(root("packages/score/package.json")).resolve("verovio/wasm");
	const liteModule = join(liteDir, "verovio-module.mjs");
	const missing = [root("packages/score/dist/index.js"), liteModule].filter((f) => !existsSync(f));
	if (missing.length > 0)
		return failed(missing.map((f) => `missing ${f}: run bun run build and bun run compile`));
	const tmp = mkdtempSync(join(tmpdir(), "engraver-equivalence-"));
	try {
		return compare(tmp, stockModule, liteModule);
	} finally {
		rmSync(tmp, { recursive: true, force: true });
	}
}

const args = process.argv.slice(2);
const liteAt = args.indexOf("--lite");
const liteDir = resolve(liteAt >= 0 ? (args[liteAt + 1] ?? "") : root("packages/engraver/dist"));
const result = gate(liteDir);
if (args.includes("--json")) console.log(JSON.stringify(result));
else {
	if (result.summary) console.log(result.summary);
	console.log(
		result.ok
			? `✓ ${result.engravings} engravings, stock and lite byte-identical`
			: `✗ engraver equivalence:\n${result.problems.map((p) => `- ${p}`).join("\n")}`,
	);
}
process.exit(result.ok ? 0 : 1);
