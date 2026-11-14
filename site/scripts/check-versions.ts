/**
 * Fails when barmark.dev runs an older barmark or @barmark/* package than its
 * latest release tag: after a release, bump site/package.json (RELEASING.md).
 * Every one the site installs is checked, its dev dependencies too: the CLI,
 * whose commands Get Started runs and whose version its CI example names,
 * and the libraries (@barmark/musicxml, sync, midi, listen, fretboard) whose snippets
 * Get Started tests against the installed version, while the `npm install`
 * it shows gets the latest. A pin behind it would test an API readers don't
 * get.
 * Run from the repository root with the tags fetched: bun site/scripts/check-versions.ts
 */
import { join } from "node:path";

/** A package's tag prefix: `barmark-v`, or `render-v` for `@barmark/render`; null when it isn't ours. */
export function tagPrefix(name: string): string | null {
	if (name === "barmark") return "barmark-v";
	const m = /^@barmark\/([a-z-]+)$/.exec(name);
	return m ? `${m[1]}-v` : null;
}

const parse = (version: string) => {
	const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
	return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};

const compare = (a: number[], b: number[]) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

export function latestTag(tags: string[], prefix: string): string | null {
	let best: { tag: string; version: number[] } | null = null;
	for (const tag of tags) {
		const version = tag.startsWith(prefix) ? parse(tag.slice(prefix.length)) : null;
		if (version && (!best || compare(version, best.version) > 0)) best = { tag, version };
	}
	return best?.tag ?? null;
}

/** "name pinned < released" for each package the site is behind on. */
export function behind(pins: Record<string, string>, tags: string[]): string[] {
	const lagging: string[] = [];
	for (const [name, pinned] of Object.entries(pins)) {
		const prefix = tagPrefix(name);
		const tag = prefix ? latestTag(tags, prefix) : null;
		const released = tag?.slice(prefix?.length);
		const a = parse(pinned);
		const b = released ? parse(released) : null;
		if (a && b && compare(a, b) < 0) lagging.push(`${name} ${pinned} < ${released}`);
	}
	return lagging;
}

if (import.meta.main) {
	const pkg = await Bun.file(join(import.meta.dir, "../package.json")).json();
	const tags = Bun.spawnSync(["git", "tag", "--list"])
		.stdout.toString()
		.split("\n")
		.filter(Boolean);
	const lagging = behind({ ...pkg.dependencies, ...pkg.devDependencies }, tags);
	if (lagging.length) {
		console.error(`barmark.dev is behind the latest release:\n  ${lagging.join("\n  ")}`);
		console.error("Bump site/package.json and site/bun.lock (RELEASING.md).");
		process.exit(1);
	}
	console.log("barmark.dev runs the latest releases.");
}
