/**
 * Is this checkout ready to be tagged and released? The version is new
 * (no tag, not on npm), CHANGELOG.md has a dated section for it, and the
 * tree is clean on main. `--json` prints the result for the Swamp release
 * check; `--allow-dirty` skips the tree and branch checks while preparing.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const json = process.argv.includes("--json");
const allowDirty = process.argv.includes("--allow-dirty");
const problems: string[] = [];

const run = (cmd: string[]) => {
	const r = Bun.spawnSync(cmd, { cwd: root, stdout: "pipe", stderr: "pipe" });
	return { code: r.exitCode, out: r.stdout.toString().trim() };
};

const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
	version: string;
};
if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version))
	problems.push(`package.json version "${version}" is not semver`);

const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
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

const tag = `v${version}`;
if (run(["git", "tag", "--list", tag]).out) problems.push(`tag ${tag} already exists locally`);
if (run(["git", "ls-remote", "--tags", "origin", `refs/tags/${tag}`]).out)
	problems.push(`tag ${tag} already exists on origin`);
if (run(["npm", "view", `barmark@${version}`, "version"]).out === version)
	problems.push(`barmark@${version} is already on npm`);

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
