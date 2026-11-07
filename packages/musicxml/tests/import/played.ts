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

/** Each text line, with the section it is written in and the bars written before it. */
export function texts(text: string) {
	let section: string | null = null;
	let bars = 0;
	const out: { section: string | null; bars: number; text: string }[] = [];
	for (const line of parseChart(text).lines) {
		if (line.kind === "section") section = line.name.replace(/\s+/g, " ");
		else if (line.kind === "text") out.push({ section, bars, text: line.text });
		else if (line.kind === "bars")
			bars += line.cells.filter((c) => c.kind === "slots" || c.kind === "simile").length;
	}
	return out;
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
