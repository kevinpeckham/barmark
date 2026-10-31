/** What the verify scripts share: the repo root, the packages, and a synchronous command runner. */
import { join } from "node:path";

export const root = join(import.meta.dir, "..");

/** Each published package: its directory, npm name and release tag prefix. */
export const PACKAGES = {
	barmark: { dir: join(root, "packages/barmark"), name: "barmark", tagPrefix: "barmark-v" },
} as const;
export type PackageKey = keyof typeof PACKAGES;

/** The package named by the first non-flag argument, or exit with usage. */
export function packageArg() {
	const key = process.argv.slice(2).find((a) => !a.startsWith("--"));
	if (!key || !(key in PACKAGES)) {
		console.error(`usage: ${process.argv[1]} <${Object.keys(PACKAGES).join("|")}> [--json]`);
		process.exit(2);
	}
	return { key: key as PackageKey, ...PACKAGES[key as PackageKey] };
}

export const run = (cmd: string[], cwd: string = root) => {
	const r = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
	return { code: r.exitCode, out: r.stdout.toString().trim(), err: r.stderr.toString().trim() };
};
