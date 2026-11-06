/**
 * Regenerates the MuseScore files the import tests read
 * (packages/musicxml/tests/fixtures/import/): each `.mscx` source we wrote,
 * converted by MuseScore 4 to `.musicxml`, and the lead sheet also to a
 * compressed `.mxl`. It runs on the VM only, where `~/.local/bin/mscore`
 * runs MuseScore's AppImage under `xvfb-run` (FINDINGS.md); CI reads the
 * checked-in outputs and never needs MuseScore.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const MSCORE = `${homedir()}/.local/bin/mscore`;
const DIR = fileURLToPath(new URL("../packages/musicxml/tests/fixtures/import/", import.meta.url));

/** Each source and the formats it is converted to. */
const SOURCES: [string, string[]][] = [
	["lead-sheet", ["musicxml", "mxl"]],
	["comping-guitar", ["musicxml"]],
	["piano", ["musicxml"]],
	["band", ["musicxml"]],
];

/** Converts one file; MuseScore prints Qt warnings and may exit 0 on failure, so the output file decides. */
function convert(source: string, out: string): void {
	rmSync(out, { force: true });
	const run = spawnSync(MSCORE, ["-o", out, source], { encoding: "utf8" });
	if (!existsSync(out)) throw new Error(`MuseScore didn't write ${out}:\n${run.stderr}`);
}

/** The importer must take the file as another program's: MuseScore names itself in `<software>`. */
function checkSoftware(xml: string): void {
	if (!readFileSync(xml, "utf8").includes("<software>MuseScore"))
		throw new Error(`${xml} doesn't name MuseScore as its software`);
}

if (!existsSync(MSCORE))
	throw new Error(`MuseScore not found at ${MSCORE} (this script runs on the VM)`);
for (const [name, formats] of SOURCES)
	for (const format of formats) {
		convert(`${DIR}${name}.mscx`, `${DIR}${name}.${format}`);
		if (format === "musicxml") checkSoftware(`${DIR}${name}.${format}`);
		console.log(`${name}.${format}`);
	}
