/** Charts and temp folders the command tests share. */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Io } from "../src/io.js";
import { fakeIo } from "./io.js";

export const ROOT = join(import.meta.dir, "../../..");
export const PEACEFUL_DREAMS = join(ROOT, "examples/peaceful-dreams.chart.md");
export const FIXTURES = join(ROOT, "packages/barmark/tests/conformance/fixtures");

/** One warning (line 3) and one error (line 5). */
export const PROBLEMS = "key: D\n\n## Chorus 2x\n| D | A |\n| Q |\n";
/** One warning (line 3), no errors. */
export const WARNING = "key: D\n\n## Chorus 2x\n| D | A |\n";

/** A temp folder holding these files (path → text), and an Io rooted there. */
export function folder(
	files: Record<string, string>,
	overrides: Partial<Io> & { stdin?: string } = {},
) {
	const cwd = mkdtempSync(join(tmpdir(), "barmark-cli-"));
	for (const [path, text] of Object.entries(files)) {
		mkdirSync(dirname(join(cwd, path)), { recursive: true });
		writeFileSync(join(cwd, path), text);
	}
	return Object.assign(fakeIo({ cwd, ...overrides }), { dir: cwd });
}
