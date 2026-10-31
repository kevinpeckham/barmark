/**
 * Build a package, check what `npm pack` would publish, and import the
 * built output in Node to read a real chart. Exit 0 when the package is
 * sound; `--json` prints the result for the Swamp release check.
 *
 *   bun scripts/verify-package.ts <package> [--json]
 */
import { join } from "node:path";
import { type PackageKey, packageArg, root, run } from "./lib.js";

const json = process.argv.includes("--json");
const pkg = packageArg();
const problems: string[] = [];

/** What each package must publish, everything it may, and its Node smoke test. */
const CONTENTS: Record<PackageKey, { required: string[]; allowed: RegExp; smoke: string[] }> = {
	barmark: {
		required: [
			"package.json",
			"README.md",
			"LICENSE",
			"CHANGELOG.md",
			"dist/index.js",
			"dist/index.d.ts",
		],
		allowed: /^(package\.json|README\.md|LICENSE|CHANGELOG\.md|dist\/.+\.(js|d\.ts))$/,
		smoke: [
			"node",
			"scripts/smoke.mjs",
			join(pkg.dir, "dist/index.js"),
			"examples/peaceful-dreams.chart.md",
		],
	},
};
const { required: REQUIRED, allowed: ALLOWED, smoke: SMOKE } = CONTENTS[pkg.key];

const build = run(["bun", "run", "build"], pkg.dir);
if (build.code !== 0)
	problems.push(`build failed: ${(build.err || build.out).trim().split("\n").slice(-3).join(" ")}`);

const pack = run(["npm", "pack", "--dry-run", "--json", "--ignore-scripts"], pkg.dir);
let files: string[] = [];
let size = 0;
let version = "";
try {
	const [info] = JSON.parse(pack.out) as {
		files: { path: string }[];
		unpackedSize: number;
		version: string;
	}[];
	files = info?.files.map((f) => f.path) ?? [];
	size = info?.unpackedSize ?? 0;
	version = info?.version ?? "";
} catch {
	problems.push(`npm pack --dry-run failed: ${pack.err.trim().split("\n").slice(-2).join(" ")}`);
}
const missing = REQUIRED.filter((f) => !files.includes(f));
const unexpected = files.filter((f) => !ALLOWED.test(f));
if (missing.length) problems.push(`missing from the package: ${missing.join(", ")}`);
if (unexpected.length) problems.push(`unexpected in the package: ${unexpected.join(", ")}`);

// The built package, imported by Node rather than Bun: what an npm user gets.
const smoke = run(SMOKE, root);
let node: { bars: number; diagnostics: number; roundTrip: boolean; harte: string | null } | null =
	null;
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
	unpackedSize: size,
	missing,
	unexpected,
	node,
	problems,
};
if (json) console.log(JSON.stringify(result));
else {
	console.log(
		`${pkg.name} ${version}: ${files.length} files, ${(size / 1024).toFixed(1)} KB unpacked`,
	);
	for (const p of problems) console.error(`✗ ${p}`);
	if (result.ok) console.log("✓ package contents and Node import");
}
process.exit(result.ok ? 0 : 1);
