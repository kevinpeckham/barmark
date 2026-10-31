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

import { readDocument } from "../../src/chart/document.js";
import { expand, flattenBars } from "../../src/chart/expand.js";
import type { PlayedBar, SimpleSlot, Slot } from "../../src/chart/types.js";

const simple = (s: SimpleSlot): string =>
	s.kind === "chord"
		? s.chord.canonical
		: { hold: "/", nc: "N.C.", silence: "--", unknown: "?" }[s.kind];
const slotText = (s: Slot): string =>
	s.kind === "group" ? s.members.map(simple).join("_") : simple(s);

/** A played bar as compact text: `C G`, `D / / /_G`. */
export const barText = (b: PlayedBar) => b.slots.map(slotText).join(" ");

/** Read and expand a chart in one step. */
export function play(text: string) {
	const doc = readDocument(text);
	const r = expand(doc.lines);
	const bars = flattenBars(r.events);
	return { ...r, bars, texts: bars.map(barText), all: [...doc.diagnostics, ...r.diagnostics] };
}
