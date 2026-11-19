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
	const sections = new Map<number, BarsLine[]>();
	let heading = -1;
	for (const l of parse.lines) {
		if (l.kind === "section") heading = l.line;
		// A part's other lines (7.6) and a part's lines in other systems are not played from.
		if (l.kind !== "bars" || !first.has(l.line)) continue;
		lines.set(l.line, l);
		const section = sections.get(heading) ?? [];
		section.push(l);
		sections.set(heading, section);
	}
	return { lines, first, sections };
}

/** A played bar's place in its written line, from 0. */
export const placeOf = (w: Written, bar: PlayedBar) => bar.written - (w.first.get(bar.line) ?? 0);

/** Whether the chart wrote `%` for this bar. */
export function writtenSimile(w: Written, bar: PlayedBar): boolean {
	const cells = w.lines.get(bar.line)?.cells.filter(isBar);
	return cells?.[placeOf(w, bar)]?.kind === "simile";
}

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

/** Plays lines into `out`, each its own `x N` times but `closer`, whose count is its repeat's. */
function play(block: BarsLine[], out: BarsLine[], closer?: BarsLine): void {
	for (const l of block) for (let n = l === closer ? 1 : times(l.repeat); n > 0; n--) out.push(l);
}

/** Where the repeat opened at line `i` ends: its `:|`, or its first ending; -1 for neither. */
function repeatEnd(lines: BarsLine[], i: number): number {
	for (let k = i; k < lines.length; k++)
		if (lines[k]?.closes || (k > i && lines[k]?.ending)) return k;
	return -1;
}

/** The repeat from line `i` to `k` into `out`: twice or `x N`, or once per ending's pass; the line after it. */
function playRepeat(lines: BarsLine[], i: number, k: number, out: BarsLine[]): number {
	const end = lines[k] as BarsLine;
	if (!end.ending) {
		for (let n = times(end.repeat, 2); n > 0; n--) play(lines.slice(i, k + 1), out, end);
		return k + 1;
	}
	const endings = endingsFrom(lines, k);
	const passes = Math.max(...endings.flatMap((e) => e[0]?.ending ?? []));
	for (let p = 1; p <= passes; p++) {
		const ending = endings.find((e) => e[0]?.ending?.includes(p)) ?? [];
		play([...lines.slice(i, k), ...ending], out);
	}
	return k + endings.flat().length;
}

/**
 * The lines a section plays when each is played its full count (grammar
 * 5, 5.1): a line `x N` times; a `|: :|` twice or its `x N`; endings by
 * pass, the bars before the first ending on every pass.
 */
function fullPlay(lines: BarsLine[]): BarsLine[] {
	const out: BarsLine[] = [];
	let i = 0;
	while (i < lines.length) {
		const k = lines[i]?.opens ? repeatEnd(lines, i) : -1;
		if (k >= 0) i = playRepeat(lines, i, k, out);
		else play(lines.slice(i, ++i), out);
	}
	return out;
}

/** The section's written lines, when the occurrence plays them straight through (spec 4.5); else null. */
export function straightLines(o: Occurrence, w: Written): BarsLine[] | null {
	const lines = w.sections.get(o.source ?? -1) ?? [];
	// ChordPro's volta names one pass (`|2`): an ending for several (`|1-3`) has none.
	if (lines.some((l) => l.ending && l.ending.length !== 1)) return null;
	const want = fullPlay(lines).flatMap((l) =>
		l.cells.filter(isBar).map((_, place) => `${l.line}:${place}`),
	);
	if (want.length !== o.bars.length) return null;
	return o.bars.every((b, i) => want[i] === `${b.line}:${placeOf(w, b)}`) ? lines : null;
}
