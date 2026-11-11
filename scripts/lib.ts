/** What the verify scripts share: the repo root, the packages, and a synchronous command runner. */
import { join } from "node:path";

export const root = join(import.meta.dir, "..");

/** Each published package: its directory, npm name, release tag prefix and Node smoke test. */
export const PACKAGES = {
	barmark: {
		dir: join(root, "packages/barmark"),
		name: "barmark",
		tagPrefix: "barmark-v",
		smoke: "scripts/smoke.mjs",
	},
	render: {
		dir: join(root, "packages/render"),
		name: "@barmark/render",
		tagPrefix: "render-v",
		smoke: "scripts/smoke-render.mjs",
	},
	musicxml: {
		dir: join(root, "packages/musicxml"),
		name: "@barmark/musicxml",
		tagPrefix: "musicxml-v",
		smoke: "scripts/smoke-musicxml.mjs",
	},
	score: {
		dir: join(root, "packages/score"),
		name: "@barmark/score",
		tagPrefix: "score-v",
		smoke: "scripts/smoke-score.mjs",
	},
	sync: {
		dir: join(root, "packages/sync"),
		name: "@barmark/sync",
		tagPrefix: "sync-v",
		smoke: "scripts/smoke-sync.mjs",
	},
	midi: {
		dir: join(root, "packages/midi"),
		name: "@barmark/midi",
		tagPrefix: "midi-v",
		smoke: "scripts/smoke-midi.mjs",
	},
	listen: {
		dir: join(root, "packages/listen"),
		name: "@barmark/listen",
		tagPrefix: "listen-v",
		smoke: "scripts/smoke-listen.mjs",
	},
	cli: {
		dir: join(root, "packages/cli"),
		name: "@barmark/cli",
		tagPrefix: "cli-v",
		smoke: "scripts/smoke-cli.mjs",
	},
	engraver: {
		dir: join(root, "packages/engraver"),
		name: "@barmark/engraver",
		tagPrefix: "engraver-v",
		smoke: "scripts/smoke-engraver.mjs",
	},
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
