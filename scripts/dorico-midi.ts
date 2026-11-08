/**
 * How Dorico reads the MIDI files @barmark/midi exports, on the VM only
 * (like scripts/midi-fixtures.ts, never in CI): it needs mac-bench beside
 * this repo (`~/projects/mac-bench`, or `MAC_BENCH_DIR`) and its
 * `MAC_BENCH_TOKEN`, which its own `bin/mac-bench` loads through varlock.
 *
 * Each chart (the examples, the lead sheet the MuseScore check uses, and
 * the small charts in dorico-midi-charts.ts) is exported with `exportMidi`
 * into a temporary folder; `mac-bench dorico --midi` has Dorico import
 * each file and export MusicXML, recording its MIDI Import Options window;
 * and each MusicXML is compared with what the file plays (`perform`):
 * measures, notes, signatures, tempi, markers and lyrics
 * (dorico-compare.ts). The report is printed; with `--keep` the files are
 * kept and the report written beside them as `report.json`.
 *
 * Differences don't fail it: the first runs tell us what to expect. It
 * fails only when a job does.
 *
 *   bun scripts/dorico-midi.ts [--keep] [name…]
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { parseChart } from "../packages/barmark/src/index.js";
import { exportMidi } from "../packages/midi/src/index.js";
import { perform } from "../packages/midi/src/perform/index.js";
import { compareFile, type FileReport, formatReport } from "./dorico-compare.js";
import { DORICO_CHARTS } from "./dorico-midi-charts.js";

const ROOT = new URL("../", import.meta.url);
const MAC_BENCH = process.env.MAC_BENCH_DIR ?? join(homedir(), "projects/mac-bench");

/** The charts, by the name their files get. */
const FILES: [string, string][] = [
	["peaceful-dreams", "examples/peaceful-dreams.chart.md"],
	["morning-song", "examples/morning-song.chart.md"],
	["shenandoah", "examples/shenandoah.chart.md"],
	["lead-sheet", "packages/musicxml/tests/fixtures/import/lead-sheet.chart.md"],
];

const charts = (): [string, string][] => [
	...FILES.map(([name, path]): [string, string] => [
		name,
		readFileSync(new URL(path, ROOT), "utf8"),
	]),
	...DORICO_CHARTS,
];

/** Each chart's `.mid` in `dir`; a chart that exports nothing stops the run. */
function exportAll(dir: string, list: [string, string][]): string[] {
	return list.map(([name, text]) => {
		const r = exportMidi(text, { title: name });
		if (!r.ok) throw new Error(`${name}: ${r.diagnostics.map((d) => d.message).join("; ")}`);
		const path = join(dir, `${name}.mid`);
		writeFileSync(path, r.bytes);
		return path;
	});
}

/** mac-bench's MIDI job on every file; its output lines, and whether it succeeded. */
function runMacBench(mids: string[], out: string): { lines: string[]; ok: boolean } {
	const bin = join(MAC_BENCH, "bin/mac-bench");
	if (!existsSync(bin)) throw new Error(`no mac-bench at ${MAC_BENCH} (set MAC_BENCH_DIR)`);
	const r = Bun.spawnSync([bin, "dorico", "--midi", ...mids, "--out", out], {
		cwd: MAC_BENCH,
		stdout: "pipe",
		stderr: "inherit",
	});
	const lines = r.stdout.toString().split("\n").filter(Boolean);
	for (const line of lines) console.log(`mac-bench: ${line}`);
	return { lines, ok: r.exitCode === 0 };
}

const readJson = (path: string): unknown =>
	existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;

/** Each chart's report, from the files mac-bench wrote into `out`; the jobs that wrote none. */
function compareAll(list: [string, string][], out: string, lines: string[]) {
	const reports: FileReport[] = [];
	const failed: string[] = [];
	for (const [name, text] of list) {
		const xml = join(out, `${name}.dorico.musicxml`);
		if (!existsSync(xml)) {
			failed.push(lines.find((l) => l.startsWith(`FAIL ${name}.mid`)) ?? `${name}: no file`);
			continue;
		}
		const report = compareFile(
			name,
			perform(parseChart(text)),
			readFileSync(xml, "utf8"),
			readJson(join(out, `${name}.midi-import.json`)),
		);
		reports.push(report);
		console.log(`\n${formatReport(report)}`);
	}
	return { reports, failed };
}

/** The charts named on the command line, or all. */
function chosen(): [string, string][] {
	const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
	const list = charts().filter(([name]) => only.length === 0 || only.includes(name));
	if (list.length === 0) throw new Error(`no chart named ${only.join(", ")}`);
	return list;
}

/** No job failed; or the ones that did, named. */
function noneFailed(failed: string[]): boolean {
	if (failed.length) console.error(`\njobs that failed:\n${failed.join("\n")}`);
	return failed.length === 0;
}

/** The charts through mac-bench and the comparison, in `dir`; the exit code. */
function check(dir: string, list: [string, string][], keep: boolean): number {
	const out = join(dir, "dorico");
	mkdirSync(out);
	const { lines, ok } = runMacBench(exportAll(dir, list), out);
	const { reports, failed } = compareAll(list, out, lines);
	if (keep) writeFileSync(join(dir, "report.json"), `${JSON.stringify(reports, null, 2)}\n`);
	return noneFailed(failed) && ok ? 0 : 1;
}

function main(): number {
	const keep = process.argv.includes("--keep");
	const list = chosen();
	const dir = mkdtempSync(join(tmpdir(), "barmark-dorico-midi-"));
	try {
		return check(dir, list, keep);
	} finally {
		if (keep) console.log(`\nfiles and report.json kept in ${dir}`);
		else rmSync(dir, { recursive: true, force: true });
	}
}

process.exit(main());
