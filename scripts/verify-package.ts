/**
 * Build the package, check what `npm pack` would publish, and import the
 * built output in Node to parse and print a real chart. Exit 0 when the
 * package is sound; `--json` prints the result for the Swamp release check.
 */
import { join } from "node:path";
import { root, run } from "./lib.js";

const json = process.argv.includes("--json");
const problems: string[] = [];

const build = run(["bun", "run", "build"]);
if (build.code !== 0)
	problems.push(`build failed: ${(build.err || build.out).trim().split("\n").slice(-3).join(" ")}`);

const REQUIRED = [
	"package.json",
	"README.md",
	"LICENSE",
	"CHANGELOG.md",
	"dist/index.js",
	"dist/index.d.ts",
];
const ALLOWED = /^(package\.json|README\.md|LICENSE|CHANGELOG\.md|dist\/.+\.(js|d\.ts))$/;
const pack = run(["npm", "pack", "--dry-run", "--json", "--ignore-scripts"]);
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
const smokeScript = `
import { readFileSync } from "node:fs";
const m = await import(${JSON.stringify(join(root, "dist/index.js"))});
const text = readFileSync(${JSON.stringify(join(root, "examples/peaceful-dreams.chart.md"))}, "utf8");
const parsed = m.parseChart(text);
const chord = m.parseChord("Bm7(b5)");
console.log(JSON.stringify({
	bars: parsed.bars.length,
	diagnostics: parsed.diagnostics.length,
	roundTrip: m.printChart(text) === text,
	harte: chord.ok ? chord.value.harte : null,
}));`;
const smoke = run(["node", "--input-type=module", "-e", smokeScript]);
let node: { bars: number; diagnostics: number; roundTrip: boolean; harte: string | null } | null =
	null;
try {
	node = JSON.parse(smoke.out);
} catch {
	problems.push(
		`Node could not import the built package: ${smoke.err.trim().split("\n").slice(-3).join(" ")}`,
	);
}
if (
	node &&
	(node.bars !== 152 || node.diagnostics !== 0 || !node.roundTrip || node.harte !== "B:hdim7")
)
	problems.push(`Node smoke test gave ${JSON.stringify(node)}`);

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
	console.log(`barmark ${version}: ${files.length} files, ${(size / 1024).toFixed(1)} KB unpacked`);
	for (const p of problems) console.error(`✗ ${p}`);
	if (result.ok) console.log("✓ package contents and Node import");
}
process.exit(result.ok ? 0 : 1);
