import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { featuresOf } from "./helpers/features.js";

const ENTRY = join(import.meta.dir, "../src/features/index.ts");
const dir = mkdtempSync(join(tmpdir(), "listen-features-entry-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

test("the ./features entry bundles with no imports", async () => {
	// Bun 1.3.14 drops every re-exported definition when the entry point
	// itself sits in a `"sideEffects": false` package (FINDINGS.md), so
	// the entry is bundled through a one-line re-export outside the package,
	// as a consumer's bundler reaches it.
	const wrapper = join(dir, "entry.ts");
	writeFileSync(wrapper, `export * from ${JSON.stringify(ENTRY)};\n`);
	const built = await Bun.build({ entrypoints: [wrapper], external: ["barmark", "@barmark/sync"] });
	expect(built.success).toBe(true);
	const [output] = built.outputs;
	if (!output) throw new Error("no output");
	const text = await output.text();
	expect(text).not.toContain('from "barmark"');
	expect(text).not.toContain('from "@barmark/sync"');
	expect(text).not.toMatch(/^\s*import[\s{*"'(]/m);
	expect(text).not.toMatch(/\bimport\s*\(/);

	// The bundle is whole: it runs on its own and does what the source does.
	const bundle = join(dir, "bundle.js");
	writeFileSync(bundle, text);
	const mod = await import(bundle);
	expect(Object.keys(mod).sort()).toEqual([
		"FEATURES_VERSION",
		"chromaFeatures",
		"joinFeatures",
		"onsetFeatures",
		"readFeatures",
		"recordingFeatures",
	]);
	expect(mod.readFeatures(featuresOf({ duration: 2 })).ok).toBe(true);
	const tone = Float32Array.from({ length: 22050 }, (_, i) => Math.sin(i / 10));
	expect(mod.readFeatures(mod.recordingFeatures(tone, 22050).value).ok).toBe(true);
});
