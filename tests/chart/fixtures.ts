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

import type {
	Slot as AnySlot,
	ChartEvent,
	ChartParse,
	SimpleSlot as Simple,
} from "../../src/chart/types.js";

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/**
 * When each attack in a bar lands, as exact fractions of the bar, computed
 * without the printer's reduction: holds attack nothing, a repeated `--` or
 * `N.C.` attacks nothing, and every chord, note set and `?` attacks.
 */
function timeline(slots: AnySlot[]): string[] {
	const out: string[] = [];
	let sounding: Simple | null = null;
	const k = slots.length;
	slots.forEach((s, i) => {
		const members = s.kind === "group" ? s.members : [s];
		const n = members.length;
		members.forEach((m, j) => {
			if (m.kind === "hold") return;
			const quiet = (m.kind === "silence" || m.kind === "nc") && sounding?.kind === m.kind;
			sounding = m;
			if (quiet) return;
			const num = i * n + j;
			const den = k * n;
			const g = gcd(num, den) || 1;
			const name = m.kind === "chord" ? m.chord.canonical : m.kind;
			out.push(`${num / g}/${den / g}:${name}`);
		});
	});
	return out;
}

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
			timeline(b.slots),
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
