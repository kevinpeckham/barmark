/**
 * The chart's written bar lines, for the grids (spec 4.5): which written
 * cell a played bar is (so `%` is written where the chart wrote it), and
 * whether an occurrence plays its section's written lines straight
 * through, so its grid can keep their repeat signs.
 */
import type { ChartParse, Line, PlayedBar } from "barmark";
import type { Occurrence } from "./plan.js";

export type BarsLine = Extract<Line, { kind: "bars" }>;

export type Written = {
	/** Each played bar line, by its line number. */
	lines: Map<number, BarsLine>;
	/** Each played bar line's bar cells (slots and `%`, not marks or fermatas), by its line number. */
	bars: Map<number, BarsLine["cells"]>;
	/** The written number of each bar line's first bar. */
	first: Map<number, number>;
	/** Each section's played bar lines in written order, by its heading's line (-1 before the first heading). */
	sections: Map<number, BarsLine[]>;
};

const isBar = (c: BarsLine["cells"][number]) => c.kind === "slots" || c.kind === "simile";

/** The bar lines the sheet's bars are played from, and where each section's are written. */
export function writtenOf(parse: ChartParse): Written {
	const first = new Map<number, number>();
	for (const b of parse.bars)
		first.set(b.line, Math.min(first.get(b.line) ?? b.written, b.written));
	const lines = new Map<number, BarsLine>();
	const bars = new Map<number, BarsLine["cells"]>();
	const sections = new Map<number, BarsLine[]>();
	let heading = -1;
	for (const l of parse.lines) {
		if (l.kind === "section") heading = l.line;
		// A part's other lines (7.6) and a part's lines in other systems are not played from.
		if (l.kind !== "bars" || !first.has(l.line)) continue;
		lines.set(l.line, l);
		bars.set(l.line, l.cells.filter(isBar));
		const section = sections.get(heading) ?? [];
		section.push(l);
		sections.set(heading, section);
	}
	return { lines, bars, first, sections };
}

/** A played bar's place in its written line, from 0. */
export const placeOf = (w: Written, bar: PlayedBar) => bar.written - (w.first.get(bar.line) ?? 0);

/** Whether the chart wrote `%` for this bar. */
export const writtenSimile = (w: Written, bar: PlayedBar) =>
	w.bars.get(bar.line)?.[placeOf(w, bar)]?.kind === "simile";

/** How many times a line or a repeat's block plays: `x N`, else once (an open `x ...` plays once). */
const times = (repeat: BarsLine["repeat"], otherwise = 1) =>
	typeof repeat === "number" ? repeat : repeat === null ? otherwise : 1;

/** A repeat's endings from line `k`: each ending's line and the lines it continues onto. */
function endingsFrom(lines: BarsLine[], k: number): BarsLine[][] {
	const out: BarsLine[][] = [];
	let j = k;
	while (lines[j]?.ending) {
		const ending = [lines[j] as BarsLine];
		j++;
		while (lines[j] && !lines[j]?.ending && lines[j]?.continues)
			ending.push(lines[j++] as BarsLine);
		out.push(ending);
	}
	return out;
}

/** Plays lines, each its own `x N` times but `closer`, whose count is its repeat's. */
function* play(block: BarsLine[], closer?: BarsLine): Generator<BarsLine> {
	for (const l of block) for (let n = l === closer ? 1 : times(l.repeat); n > 0; n--) yield l;
}

/** Where the repeat opened at line `i` ends: its `:|`, or its first ending; -1 for neither. */
function repeatEnd(lines: BarsLine[], i: number): number {
	for (let k = i; k < lines.length; k++)
		if (lines[k]?.closes || (k > i && lines[k]?.ending)) return k;
	return -1;
}

/** The repeat from line `i` to `k`: twice or `x N`, or once per ending's pass. */
function* playRepeat(lines: BarsLine[], i: number, k: number): Generator<BarsLine> {
	const end = lines[k] as BarsLine;
	if (!end.ending) {
		const block = lines.slice(i, k + 1);
		for (let n = times(end.repeat, 2); n > 0; n--) yield* play(block, end);
		return;
	}
	const endings = endingsFrom(lines, k);
	const passes = Math.max(...endings.flatMap((e) => e[0]?.ending ?? []));
	const body = lines.slice(i, k);
	for (let p = 1; p <= passes; p++)
		yield* play([...body, ...(endings.find((e) => e[0]?.ending?.includes(p)) ?? [])]);
}

/** The line after a repeat from line `i` to `k`, its endings included. */
function afterRepeat(lines: BarsLine[], k: number): number {
	return lines[k]?.ending ? k + endingsFrom(lines, k).flat().length : k + 1;
}

/**
 * The lines a section plays when each is played its full count (grammar
 * 5, 5.1), one at a time: a line `x N` times; a `|: :|` twice or its
 * `x N`; endings by pass, the bars before the first ending on every pass.
 * A generator, so a reader stops it when it has seen enough: a section
 * first reached after a jump is not capped by the parser, and its counts
 * may run to billions.
 */
function* fullPlay(lines: BarsLine[]): Generator<BarsLine> {
	let i = 0;
	while (i < lines.length) {
		const k = lines[i]?.opens ? repeatEnd(lines, i) : -1;
		if (k < 0) yield* play(lines.slice(i, ++i));
		else {
			yield* playRepeat(lines, i, k);
			i = afterRepeat(lines, k);
		}
	}
}

/** Whether the bars are the lines' bars in order, all of them: stops at the first difference or bar past the end. */
function playsAs(bars: PlayedBar[], lines: Iterable<BarsLine>, w: Written): boolean {
	let i = 0;
	for (const l of lines) {
		const count = w.bars.get(l.line)?.length ?? 0;
		for (let place = 0; place < count; place++, i++) {
			const b = bars[i];
			if (!b || b.line !== l.line || placeOf(w, b) !== place) return false;
		}
	}
	return i === bars.length;
}

/** The section's written lines, when the occurrence plays them straight through (spec 4.5); else null. */
export function straightLines(o: Occurrence, w: Written): BarsLine[] | null {
	const lines = w.sections.get(o.source ?? -1) ?? [];
	// ChordPro's volta names one pass (`|2`): an ending for several (`|1-3`) has none.
	if (lines.some((l) => l.ending && l.ending.length !== 1)) return null;
	return playsAs(o.bars, fullPlay(lines), w) ? lines : null;
}
