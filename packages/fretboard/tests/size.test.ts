import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const ROOT = join(import.meta.dir, "../../..");
const BUDGET = 4500;

test("the minified, gzipped entry is within budget and works", async () => {
	// The entry lives outside the package: one inside a `sideEffects: false`
	// package can build to an empty bundle (FINDINGS).
	const dir = mkdtempSync(join(ROOT, ".size-"));
	try {
		mkdirSync(dir, { recursive: true });
		const entry = join(dir, "entry.ts");
		writeFileSync(entry, `export * from "../packages/fretboard/src/index.ts";\n`);
		const built = await Bun.build({
			entrypoints: [entry],
			minify: true,
			external: ["barmark"],
			target: "browser",
		});
		expect(built.success).toBe(true);
		const code = await built.outputs[0]?.text();
		if (!code) throw new Error("empty bundle");
		const bytes = gzipSync(code, { level: 9 }).length;
		console.log(`fretboard entry: ${code.length} bytes minified, ${bytes} gzipped`);
		expect(bytes).toBeLessThanOrEqual(BUDGET);
		const file = join(dir, "bundle.js");
		writeFileSync(file, code);
		const mod = await import(file);
		const { parseChord } = await import("barmark");
		const parsed = parseChord("C");
		if (!parsed.ok) throw new Error("C does not read");
		expect(mod.shapeText(mod.shapeFor(parsed.value).shape)).toBe("x32010");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
