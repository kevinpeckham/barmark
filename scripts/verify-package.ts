/**
 * Build a package, check what `npm pack` would publish, and import the
 * built output in Node to read a real chart. Exit 0 when the package is
 * sound; `--json` prints the result for the Swamp release check.
 *
 *   bun scripts/verify-package.ts <package> [--json]
 */
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { type PackageKey, packageArg, root, run } from "./lib.js";

const json = process.argv.includes("--json");
const pkg = packageArg();
const problems: string[] = [];

/** What each package must publish, beyond package.json, the README, LICENSE and CHANGELOG. */
const CONTENTS: Record<PackageKey, { required: string[]; allowed: RegExp }> = {
	barmark: {
		required: ["dist/index.js", "dist/index.d.ts"],
		allowed: /^dist\/.+\.(js|d\.ts)$/,
	},
	render: {
		required: [
			"dist/index.js",
			"dist/index.d.ts",
			"dist/element.js",
			"fonts/Edwin-Roman.otf",
			"fonts/OFL.txt",
			"fonts/README.md",
		],
		allowed: /^(dist\/.+\.(js|d\.ts)|fonts\/(Edwin-Roman\.otf|OFL\.txt|README\.md))$/,
	},
};
const COMMON = ["package.json", "README.md", "LICENSE", "CHANGELOG.md"];
const REQUIRED = [...COMMON, ...CONTENTS[pkg.key].required];
const allowed = (f: string) => COMMON.includes(f) || CONTENTS[pkg.key].allowed.test(f);

const build = run(["bun", "run", "build"], pkg.dir);
if (build.code !== 0)
	problems.push(`build failed: ${(build.err || build.out).trim().split("\n").slice(-3).join(" ")}`);

// Pack as the release workflow does: bun pm pack turns workspace: ranges into versions.
const out = mkdtempSync(join(tmpdir(), "verify-package-"));
const pack = run(
	["bun", "pm", "pack", "--ignore-scripts", "--quiet", "--destination", out],
	pkg.dir,
);
const tarball = join(out, basename(pack.out.split("\n").at(-1) ?? ""));
const files = run(["tar", "-tzf", tarball])
	.out.split("\n")
	.filter(Boolean)
	.map((f) => f.replace(/^package\//, ""));
if (pack.code !== 0 || !files.length)
	problems.push(`bun pm pack failed: ${(pack.err || pack.out).split("\n").slice(-2).join(" ")}`);
const manifest = run(["tar", "-xOzf", tarball, "package/package.json"]).out;
const { version = "", dependencies = {} } = (manifest ? JSON.parse(manifest) : {}) as {
	version?: string;
	dependencies?: Record<string, string>;
};
const size = statSync(tarball, { throwIfNoEntry: false })?.size ?? 0;
rmSync(out, { recursive: true, force: true });
const missing = REQUIRED.filter((f) => !files.includes(f));
const unexpected = files.filter((f) => !allowed(f));
if (missing.length) problems.push(`missing from the package: ${missing.join(", ")}`);
if (unexpected.length) problems.push(`unexpected in the package: ${unexpected.join(", ")}`);
const unresolved = Object.entries(dependencies).filter(([, range]) =>
	range.startsWith("workspace:"),
);
if (unresolved.length)
	problems.push(`dependencies left as workspace ranges: ${unresolved.map(([n]) => n).join(", ")}`);

// The built package, imported by Node rather than Bun: what an npm user gets.
const smoke = run(
	["node", pkg.smoke, join(pkg.dir, "dist/index.js"), "examples/peaceful-dreams.chart.md"],
	root,
);
let node: Record<string, unknown> | null = null;
try {
	node = JSON.parse(smoke.out);
} catch {
	problems.push(
		`Node could not import the built package: ${smoke.err.split("\n").slice(-3).join(" ")}`,
	);
}
if (node && smoke.code !== 0) problems.push(`Node smoke test gave ${JSON.stringify(node)}`);

const result = {
	ok: problems.length === 0,
	version,
	files: files.length,
	packedSize: size,
	dependencies,
	missing,
	unexpected,
	node,
	problems,
};
if (json) console.log(JSON.stringify(result));
else {
	console.log(
		`${pkg.name} ${version}: ${files.length} files, ${(size / 1024).toFixed(1)} KB packed`,
	);
	for (const p of problems) console.error(`✗ ${p}`);
	if (result.ok) console.log("✓ package contents and Node import");
}
process.exit(result.ok ? 0 : 1);
