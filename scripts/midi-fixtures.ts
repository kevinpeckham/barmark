/**
 * MuseScore checks for @barmark/midi. `--check-export` exports Peaceful
 * Dreams, Morning Song and the lead sheet to `.mid` in a temporary folder,
 * has MuseScore 4 convert each to MusicXML, and checks every part of what
 * it wrote has as many measures as the chart has played bars. It runs on
 * the VM only, where `~/.local/bin/mscore` runs MuseScore's AppImage under
 * `xvfb-run` (FINDINGS.md); CI never needs MuseScore. Pass `--keep` to keep
 * the files, to open them in MuseScore by hand.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseChart } from "../packages/barmark/src/index.js";
import { exportMidi } from "../packages/midi/src/index.js";
import { convert, requireMscore } from "./mscore.js";

const ROOT = new URL("../", import.meta.url);

/** The charts exported, by the name their files get. */
const CHARTS: [string, string][] = [
	["peaceful-dreams", "examples/peaceful-dreams.chart.md"],
	["morning-song", "examples/morning-song.chart.md"],
	["lead-sheet", "packages/musicxml/tests/fixtures/import/lead-sheet.chart.md"],
];

/** Each `<part>`'s measure count in a MusicXML file. */
const measuresPerPart = (xml: string): number[] =>
	[...xml.matchAll(/<part id="[^"]*">([\s\S]*?)<\/part>/g)].map(
		([, body = ""]) => body.match(/<measure\b/g)?.length ?? 0,
	);

/** A chart's file and its losses' codes as a list; a chart that exports nothing stops the check. */
function exported(name: string, text: string): { bytes: Uint8Array; losses: string } {
	const result = exportMidi(text);
	if (!result.ok)
		throw new Error(`${name}: ${result.diagnostics.map((d) => d.message).join("; ")}`);
	return { bytes: result.bytes, losses: result.losses.map((l) => l.code).join(", ") || "none" };
}

/** Every part MuseScore wrote must have the chart's played bars. */
function checkMeasures(name: string, played: number, parts: number[]): void {
	if (parts.length === 0 || parts.some((n) => n !== played))
		throw new Error(`${name}: ${played} played bars, MuseScore's parts have ${parts.join(", ")}`);
}

/** Exports one chart, has MuseScore read the `.mid`, and checks its measures against the chart's played bars. */
function checkOne(dir: string, name: string, path: string): void {
	const text = readFileSync(new URL(path, ROOT), "utf8");
	const { bytes, losses } = exported(name, text);
	const mid = join(dir, `${name}.mid`);
	const xml = join(dir, `${name}.musicxml`);
	writeFileSync(mid, bytes);
	convert(mid, xml);
	const played = parseChart(text).bars.length;
	const parts = measuresPerPart(readFileSync(xml, "utf8"));
	checkMeasures(name, played, parts);
	console.log(`${name}: ${played} bars in each of ${parts.length} parts (losses: ${losses})`);
}

/** Every chart through MuseScore, in one temporary folder, kept with `--keep`. */
function checkExport(): void {
	const dir = mkdtempSync(join(tmpdir(), "barmark-midi-"));
	try {
		for (const [name, path] of CHARTS) checkOne(dir, name, path);
	} finally {
		if (process.argv.includes("--keep")) console.log(`files kept in ${dir}`);
		else rmSync(dir, { recursive: true, force: true });
	}
}

if (!process.argv.includes("--check-export"))
	throw new Error("usage: bun scripts/midi-fixtures.ts --check-export [--keep]");
requireMscore();
checkExport();
