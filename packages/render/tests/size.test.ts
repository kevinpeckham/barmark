import { expect, test } from "bun:test";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const ROOT = join(import.meta.dir, "../../..");

/**
 * The element's gzipped size at this plan's base commit (4ee2724, main before
 * chord diagrams), by this test's own method, 2026-11-13: 46,302 bytes.
 * Today's size by the same method: 52,841 bytes (see FINDINGS.md).
 *
 * The method: copy the sources the element needs (`packages/*\/src`) and the
 * root `tsconfig.json` into a temp directory with no `package.json`, and
 * build the element entry from that copy. With no package.json to read,
 * resolution (tsconfig paths) and tree-shaking (no `sideEffects` flags)
 * are the same however the test is started. The directory's name is fixed,
 * because Bun's minifier picks names from the module paths, so a random
 * directory moves the gzipped size by a few bytes. The base number comes from
 * `git archive 4ee2724 packages/render/src packages/barmark/src tsconfig.json`
 * built the same way.
 */
const BEFORE_DIAGRAMS = 46_302;
// Kevin's decision (design §6.2): 5,500 at first, raised on 2026-11-13 once the
// built feature measured 6,539 bytes and no trimming could close the gap.
const BUDGET = 6_750;

/** The sources the element's bundle reads, copied beside the root tsconfig. */
function copySources(dir: string): void {
	cpSync(join(ROOT, "tsconfig.json"), join(dir, "tsconfig.json"));
	for (const pkg of ["render", "barmark", "fretboard"])
		cpSync(join(ROOT, "packages", pkg, "src"), join(dir, "packages", pkg, "src"), {
			recursive: true,
		});
}

/** A minified browser bundle of everything `source` imports, nothing external. */
async function bundle(dir: string, name: string, source: string): Promise<string> {
	const entry = join(dir, `${name}.ts`);
	writeFileSync(entry, source);
	const built = await Bun.build({ entrypoints: [entry], minify: true, target: "browser" });
	expect(built.success).toBe(true);
	const code = await built.outputs[0]?.text();
	if (!code) throw new Error("empty bundle");
	return code;
}

const gzipped = (code: string) => gzipSync(code, { level: 9 }).length;

/** Runs `check` on a temp directory holding the copied sources, then removes it. */
async function inCopy<T>(check: (dir: string) => Promise<T>): Promise<T> {
	const dir = join(tmpdir(), "barmark-render-size");
	rmSync(dir, { recursive: true, force: true });
	try {
		mkdirSync(dir, { recursive: true });
		copySources(dir);
		return await check(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

const elementEntry = (dir: string) =>
	`export * from ${JSON.stringify(join(dir, "packages/render/src/element.ts"))};\n`;

test("the bundles that are measured work", async () => {
	await inCopy(async (dir) => {
		// The measured bundle itself loads without throwing. It registers the
		// element only where there is a DOM, which Bun lacks, so it exposes
		// what element.ts exports.
		const measured = join(dir, "measured.js");
		writeFileSync(measured, await bundle(dir, "element", elementEntry(dir)));
		const element = await import(measured);
		expect(typeof element.optionsFromAttributes).toBe("function");
		expect(
			element.optionsFromAttributes({
				getAttribute: (n: string) => (n === "chord-diagrams" ? "guitar" : null),
				hasAttribute: () => false,
			}).chordDiagrams,
		).toBe("guitar");
		// The same code through the root entry renders a chart with the strip.
		const root = join(dir, "packages/render/src/index.ts");
		const file = join(dir, "run.js");
		writeFileSync(
			file,
			await bundle(dir, "run", `export { renderChart } from ${JSON.stringify(root)};\n`),
		);
		const html: string = (await import(file)).renderChart("| C | G |", { chordDiagrams: "guitar" });
		expect(html).toContain("bm-diagrams");
		expect(html).toContain("bm-diagram-svg");
	});
});

test("chord diagrams cost the element at most 6.75 KB gzipped", async () => {
	const bytes = await inCopy(async (dir) =>
		gzipped(await bundle(dir, "element", elementEntry(dir))),
	);
	console.log(`element: ${bytes} gzipped`);
	expect(bytes).toBeLessThanOrEqual(BEFORE_DIAGRAMS + BUDGET);
});
