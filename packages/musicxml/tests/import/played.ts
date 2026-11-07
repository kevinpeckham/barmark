/** The round trip's yardstick: what a chart plays, bar by bar, part by part and line by line, timed as barmark's own round trip times it. */
import { type ChartParse, parseChart, type Slot } from "barmark";
import { timeline } from "../../../barmark/tests/chart/fixtures.js";

/** Each played bar: meter, key, tempo, feel, section, rehearsal mark, words, and every part's and line's timeline. */
export function played(text: string) {
	return parseChart(text).bars.map((b) => [
		b.meter,
		b.key,
		b.tempo,
		b.feel,
		// Whitespace collapsed: the printer collapses a heading's whitespace, so a
		// canonical chart (all the import writes) can't keep a non-canonical original's.
		b.section?.replace(/\s+/g, " ") ?? null,
		b.rehearsal ?? null,
		b.words ?? null,
		timeline(b.slots),
		b.lines?.map((l) => timeline(l.slots)),
		b.parts?.map((p) => p && [timeline(p.slots), p.lines?.map((l) => timeline(l.slots))]),
	]);
}

/** Where a text line is in its section: before its bars, among them (after this many written bars), after them, or in a section with none. */
type Place = "before" | "after" | "alone" | number;

/** Text lines waiting for a place: after the section's last bars line, unless more bars follow. */
type Open = { text: string; at: number; occurrence: number; section: string | null }[];

/**
 * Each text line by the section occurrence it is written in (its heading's
 * place among the chart's headings, and its name) and its place there:
 * before the section's first bar line, after its last, between them
 * after so many written bars, or alone in a section with no bar line (a
 * replay, or the text before the first heading). Rows the import joins or splits, and a
 * section's bar count, don't move a line before or after its bars.
 */
export function texts(text: string) {
	const out: { occurrence: number; section: string | null; place: Place; text: string }[] = [];
	let occurrence = 0;
	let section: string | null = null;
	let bars = 0;
	let open: Open = [];
	let system: number | undefined;
	const settle = (more: boolean) => {
		for (const { at, ...t } of open)
			out.push({ ...t, place: at === 0 ? (more ? "before" : "alone") : more ? at : "after" });
		open = [];
	};
	for (const line of parseChart(text).lines) {
		if (line.kind === "section") {
			settle(false);
			occurrence++;
			section = line.name.replace(/\s+/g, " ");
			bars = 0;
		} else if (line.kind === "text") open.push({ text: line.text, at: bars, occurrence, section });
		else if (line.kind === "bars") {
			settle(true);
			// A system's lines share its bars: count them once.
			if (line.system !== undefined && line.system === system) continue;
			system = line.system;
			bars += line.cells.filter((c) => c.kind === "slots" || c.kind === "simile").length;
		}
	}
	settle(false);
	return out.sort((a, b) => a.occurrence - b.occurrence);
}

const slotsOf = (p: ChartParse): Slot[] =>
	p.bars.flatMap((b) => [
		...b.slots,
		...(b.lines ?? []).flatMap((l) => l.slots),
		...(b.parts ?? []).flatMap((part) => [
			...(part?.slots ?? []),
			...(part?.lines ?? []).flatMap((l) => l.slots),
		]),
	]);

/** A chart that writes rhythm figures (an articulation, a push or pedal) anywhere: outside the round trip's scope. */
export function usesRhythmFigures(p: ChartParse): boolean {
	return slotsOf(p)
		.flatMap((s) => (s.kind === "group" ? s.members : [s]))
		.some(
			(m) =>
				("articulation" in m && m.articulation) ||
				("push" in m && m.push) ||
				("pedal" in m && m.pedal),
		);
}
