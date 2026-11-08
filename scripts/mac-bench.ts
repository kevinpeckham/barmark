import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * The environment `scripts/dorico-midi.ts` gives mac-bench. Bun loads
 * barmark's `.env.local` into the script, and its `OP_ENV_ID` and
 * `OP_TOKEN` name barmark's own 1Password environment: passed on, they
 * would point mac-bench's varlock there, which has no `MAC_BENCH_TOKEN`
 * (FINDINGS 2026-11-08).
 */
export function macBenchEnv(env: Record<string, string | undefined>): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [key, value] of Object.entries(env))
		if (value !== undefined && key !== "OP_ENV_ID" && key !== "OP_TOKEN") out[key] = value;
	return out;
}

const MAC_BENCH = process.env.MAC_BENCH_DIR ?? join(homedir(), "projects/mac-bench");

/**
 * `mac-bench <args> --out <out>` from mac-bench's own folder, with the
 * environment it needs. Its output lines (each echoed), and whether it
 * exited cleanly.
 */
export function runMacBench(args: string[], out: string): { lines: string[]; ok: boolean } {
	const bin = join(MAC_BENCH, "bin/mac-bench");
	if (!existsSync(bin)) throw new Error(`no mac-bench at ${MAC_BENCH} (set MAC_BENCH_DIR)`);
	const r = Bun.spawnSync([bin, ...args, "--out", out], {
		cwd: MAC_BENCH,
		env: macBenchEnv(process.env),
		stdout: "pipe",
		stderr: "inherit",
	});
	const lines = r.stdout.toString().split("\n").filter(Boolean);
	for (const line of lines) console.log(`mac-bench: ${line}`);
	return { lines, ok: r.exitCode === 0 };
}
