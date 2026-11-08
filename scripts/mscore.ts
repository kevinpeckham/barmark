/**
 * MuseScore 4 on the VM, for the scripts that check our files against it:
 * `~/.local/bin/mscore` runs MuseScore's AppImage under `xvfb-run`
 * (FINDINGS.md). CI never runs these scripts.
 */
import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { homedir } from "node:os";

export const MSCORE = `${homedir()}/.local/bin/mscore`;

/** Stops a script off the VM, where MuseScore isn't installed. */
export function requireMscore(): void {
	if (!existsSync(MSCORE))
		throw new Error(`MuseScore not found at ${MSCORE} (this script runs on the VM)`);
}

/** Converts one file; MuseScore prints Qt warnings and may exit 0 on failure, so the output file decides. */
export function convert(source: string, out: string): void {
	rmSync(out, { force: true });
	const run = spawnSync(MSCORE, ["-o", out, source], { encoding: "utf8" });
	if (!existsSync(out)) throw new Error(`MuseScore didn't write ${out}:\n${run.stderr}`);
}
