/**
 *   bun scripts/verify-release.ts <package> [--allow-dirty] [--json]
 *
 * Is this checkout ready to be tagged and released? The version is new
 * (no tag, not on npm), CHANGELOG.md has a dated section for it, and the
 * tree is clean on main. `--json` prints the result for the Swamp release
 * check; `--allow-dirty` skips the tree and branch checks while preparing.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PACKAGES, type PackageKey, packageArg, run } from "./lib.js";
import { staleRanges } from "./packed-range.js";

const json = process.argv.includes("--json");
const allowDirty = process.argv.includes("--allow-dirty");
const pkg = packageArg();
const problems: string[] = [];

const { version } = JSON.parse(readFileSync(join(pkg.dir, "package.json"), "utf8")) as {
	version: string;
};
if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version))
	problems.push(`package.json version "${version}" is not semver`);

const changelog = readFileSync(join(pkg.dir, "CHANGELOG.md"), "utf8");
const heading = new RegExp(
	`^## \\[${version.replace(/\./g, "\\.")}\\] - (\\d{4}-\\d{2}-\\d{2})$`,
	"m",
).exec(changelog);
if (!heading) problems.push(`CHANGELOG.md has no "## [${version}] - YYYY-MM-DD" section`);
else {
	const rest = changelog.slice((heading.index ?? 0) + heading[0].length);
	const body = rest
		.slice(0, rest.search(/^## \[/m) === -1 ? undefined : rest.search(/^## \[/m))
		.trim();
	if (!body) problems.push(`CHANGELOG.md's ${version} section is empty`);
}
if (!/^## \[Unreleased\]$/m.test(changelog))
	problems.push("CHANGELOG.md has no [Unreleased] section");

const tag = `${pkg.tagPrefix}${version}`;
if (run(["git", "tag", "--list", tag]).out) problems.push(`tag ${tag} already exists locally`);
if (run(["git", "ls-remote", "--tags", "origin", `refs/tags/${tag}`]).out)
	problems.push(`tag ${tag} already exists on origin`);
if (run(["npm", "view", `${pkg.name}@${version}`, "version"]).out === version)
	problems.push(`${pkg.name}@${version} is already on npm`);

// A workspace dependency must already be on npm at the version this package will name.
const manifest = JSON.parse(readFileSync(join(pkg.dir, "package.json"), "utf8")) as {
	dependencies?: Record<string, string>;
};
for (const [name, range] of Object.entries(manifest.dependencies ?? {})) {
	if (!range.startsWith("workspace:")) continue;
	const dep = Object.values(PACKAGES).find((p) => p.name === name);
	const depVersion = dep
		? (JSON.parse(readFileSync(join(dep.dir, "package.json"), "utf8")) as { version: string })
				.version
		: "";
	if (run(["npm", "view", `${name}@${depVersion}`, "version"]).out !== depVersion)
		problems.push(`${name}@${depVersion} (a dependency) is not on npm yet: release it first`);
}

type Manifest = { version: string; dependencies?: Record<string, string> };
const localManifest = (key: PackageKey): Manifest =>
	JSON.parse(readFileSync(join(PACKAGES[key].dir, "package.json"), "utf8"));
const keys = Object.keys(PACKAGES) as PackageKey[];
const manifestAt = (tag: string, key: PackageKey): Manifest =>
	JSON.parse(run(["git", "show", `${tag}:packages/${key}/package.json`]).out);

/**
 * The library's dependencies on the other libraries, as packed at its tag,
 * must admit the local versions the binaries bundle: else npm users of the
 * CLI get other code (after a `sync` minor with no `midi` patch, say).
 */
function rangeProblems(key: PackageKey, tag: string): string[] {
	return staleRanges(
		{ name: PACKAGES[key].name, tag },
		manifestAt(tag, key).dependencies ?? {},
		(name) => {
			const dep = keys.find((k) => PACKAGES[k].name === name);
			return dep && { atTag: manifestAt(tag, dep).version, local: localManifest(dep).version };
		},
	);
}

// The CLI's binaries bundle the libraries from this checkout, so their code must be what was
// released under the version they report: no change since each library's own tag, and each
// one's dependency ranges at that tag admitting the versions bundled beside it.
const RELEASED_CODE = {
	barmark: ["src"],
	render: ["src", "fonts"],
	musicxml: ["src"],
	sync: ["src"],
	midi: ["src"],
} as const;
if (pkg.key === "cli")
	for (const [key, folders] of Object.entries(RELEASED_CODE)) {
		const dep = PACKAGES[key as keyof typeof RELEASED_CODE];
		const depVersion = localManifest(key as PackageKey).version;
		const depTag = `${dep.tagPrefix}${depVersion}`;
		const paths = folders.map((f) => `packages/${key}/${f}`);
		if (run(["git", "rev-parse", "--quiet", "--verify", `refs/tags/${depTag}`]).code !== 0)
			problems.push(`tag ${depTag} is not in this checkout: git fetch --tags`);
		else {
			if (run(["git", "diff", "--quiet", depTag, "--", ...paths]).code !== 0)
				problems.push(
					`${dep.name} has changed since ${depTag} (${paths.join(", ")}): release ${dep.name} first, so the binaries carry only released code`,
				);
			problems.push(...rangeProblems(key as PackageKey, depTag));
		}
	}

const branch = run(["git", "branch", "--show-current"]).out;
const dirty = run(["git", "status", "--porcelain"]).out;
if (!allowDirty) {
	if (branch !== "main") problems.push(`on branch "${branch}", not main`);
	if (dirty) problems.push("the working tree has uncommitted changes");
}

const result = {
	ok: problems.length === 0,
	version,
	tag,
	branch,
	clean: !dirty,
	changelogDate: heading?.[1] ?? null,
	problems,
};
if (json) console.log(JSON.stringify(result));
else {
	for (const p of problems) console.error(`✗ ${p}`);
	if (result.ok) console.log(`✓ ready to release ${tag}`);
}
process.exit(result.ok ? 0 : 1);
