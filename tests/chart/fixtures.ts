import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");

/** The spec's "At a glance" chart, read from the grammar so the test tracks the spec. */
export const AT_A_GLANCE = (() => {
	const spec = readFileSync(join(root, "docs/grammar-v0.1-draft.md"), "utf8");
	const m = /## At a glance\n\n```\n([\s\S]*?)\n```/.exec(spec);
	if (!m?.[1]) throw new Error("At a glance example not found in the grammar");
	return m[1];
})();

export const PEACEFUL_DREAMS = readFileSync(
	join(root, "examples/peaceful-dreams.chart.md"),
	"utf8",
);
