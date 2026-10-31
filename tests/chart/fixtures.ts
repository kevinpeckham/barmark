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

import { printSlot, reduceSlots } from "../../src/chart/print.js";
import type { ChartEvent, ChartParse } from "../../src/chart/types.js";

const shape = (events: ChartEvent[]): unknown[] =>
	events.map((e) => (e.kind === "open" ? ["open", shape(e.events)] : e.kind));

/** What a chart means, with line numbers and slot spelling left out: the round-trip yardstick. */
export function meaning(p: ChartParse) {
	return {
		title: p.title,
		sections: p.sections.map((s) => [
			s.name.replace(/\s+/g, " "),
			s.replayOf === null
				? null
				: p.sections.findIndex((o) => o.line === s.replayOf && o.replayOf === null),
			s.firstBar,
			s.lastBar,
			s.elided,
		]),
		events: shape(p.events),
		bars: p.bars.map((b) => [
			b.meter,
			b.key,
			b.tempo,
			b.feel,
			b.section?.replace(/\s+/g, " ") ?? null,
			reduceSlots(b.slots).map(printSlot).join(" "),
		]),
		errors: p.diagnostics
			.filter((d) => d.severity === "error")
			.map((d) => [d.message, d.token])
			.sort(),
		warnings: new Set(
			p.diagnostics.filter((d) => d.severity === "warning").map((d) => `${d.message}|${d.token}`),
		),
	};
}
