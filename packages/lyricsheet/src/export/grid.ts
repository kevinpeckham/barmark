/**
 * A section occurrence with no words as a ChordPro grid (spec 4.1, 4.3,
 * 4.5, 4.6): `{start_of_grid: label="Intro" shape="1+4x4+1"}`, then one
 * grid line per written bar line, its bars as measures and a cell per beat
 * (`cells.ts`).
 *
 * - An occurrence that plays its section's written lines straight through
 *   (`written.ts`) is written once, as written: `|:`, `:|`, a volta `|2`,
 *   and `x N` as right-margin text. Any other is written as played, bar
 *   by bar, with plain bar lines.
 * - Rows: a rehearsal mark starts its own row, so it is left-margin text
 *   (`@B`) at the start of the bars it marks. A written line with `x N`
 *   stays whole (the count is the line's): its marks are written at its
 *   start, a `mark-moved` loss. Words are right-margin text, the row's
 *   words in order, then its `x N`; words that read as a count (`x3`) are
 *   written in double quotes. The shape gives a margin cell each side, or
 *   the reference drops the text and warns "No margin cell for trailing
 *   comment".
 * - `%` is written where the chart wrote it and it plays the measure
 *   before it in the row: not after a time change or a fermata, and not
 *   first in a row.
 * - The shape is the widest row's (most cells): its measures by its beats
 *   (a fermata is a measure of one cell, `*…`). The reference draws every
 *   cell of a grid the same width, draws a line with fewer cells than the
 *   shape short, left-aligned, and warns "Too few cells for grid content"
 *   only for a line with more (measured 2026-11-19 with `chordpro`
 *   6.101.0), so an occurrence is always one grid, and a `|: :|` is never
 *   split across two.
 * - An open repeat's line is followed by `{comment: repeat ad lib.}`, a
 *   line of the grid like the changes below.
 * - Key, time, tempo and feel changes and text lines are comments (and
 *   directives) between grid lines, as in lyric lines: the reference takes
 *   them there and draws the comment.
 */
import { beatsOf, type PlayedBar } from "barmark";
import { barCells } from "./cells.js";
import { changeLines } from "./changes.js";
import { maxOf, pushAll } from "./lists.js";
import { byLine, type Context, headingTexts, labelOf, lose, runOf, texts } from "./lyrics.js";
import { directive } from "./meta.js";
import type { Occurrence } from "./plan.js";
import { plain, textChanged, unjoined } from "./text.js";
import type { Out } from "./types.js";
import { type BarsLine, placeOf, straightLines, type Written, writtenSimile } from "./written.js";

export type GridContext = Context & { written: Written };

/** A grid line to write: its bars, and the bar symbols and count written around them. */
type Row = { bars: PlayedBar[]; open: string; close: string; times: string | null };

/** Bars split before each rehearsal mark but the first bar's: a mark starts its own row. */
function atMarks(bars: PlayedBar[]): PlayedBar[][] {
	const out: PlayedBar[][] = [];
	for (const [i, bar] of bars.entries()) {
		if (i === 0 || bar.rehearsal) out.push([]);
		out.at(-1)?.push(bar);
	}
	return out;
}

/**
 * A written line's rows: its bars' first plays, its repeat signs, its
 * ending's volta and its `x N`; split at a rehearsal mark, the opening
 * sign on the first row and the closing one on the last. A line with
 * `x N` is kept whole (the count is the line's), its marks at its start.
 */
function writtenRows(l: BarsLine, bars: PlayedBar[], out: Out): Row[] {
	const times = typeof l.repeat === "number" ? `x${l.repeat}` : null;
	const open = l.ending ? `|${l.ending[0]}` : l.opens ? "|:" : "|";
	const close = l.closes ? ":|" : "|";
	if (times !== null) {
		const moved = bars.find((b, i) => i > 0 && b.rehearsal);
		if (moved) out.losses.add("mark-moved", MARK_MOVED, moved);
		return [{ bars, open, close, times }];
	}
	const parts = atMarks(bars);
	return parts.map((part, i) => ({
		bars: part,
		open: i === 0 ? open : "|",
		close: i === parts.length - 1 ? close : "|",
		times: null,
	}));
}

const MARK_MOVED = "a rehearsal mark inside a repeated line is written at the line's start";

/** Each written line's bars, first plays only, by line number. */
function firstPlays(o: Occurrence, w: Written): Map<number, PlayedBar[]> {
	const seen = new Set<string>();
	const firsts = new Map<number, PlayedBar[]>();
	for (const b of o.bars) {
		const key = `${b.line}:${placeOf(w, b)}`;
		if (seen.has(key)) continue;
		seen.add(key);
		const line = firsts.get(b.line) ?? [];
		line.push(b);
		firsts.set(b.line, line);
	}
	return firsts;
}

/** The rows of an occurrence: its section's written lines when it plays them straight through, else its bars as played. */
function rowsOf(o: Occurrence, w: Written, out: Out): Row[] {
	const lines = straightLines(o, w);
	if (!lines)
		return byLine(o.bars)
			.flatMap(atMarks)
			.map((bars) => ({ bars, open: "|", close: "|", times: null }));
	const firsts = firstPlays(o, w);
	return lines.flatMap((l) => writtenRows(l, firsts.get(l.line) ?? [], out));
}

/** A row as text, with the cells it takes and the shape a grid of its width has. */
type Drawn = { row: Row; text: string; cells: number; shape: string };

/** Words that read as a count (`x3`, `x 3`, `X3`): in the right margin they would read as the line's. */
const COUNT = /(?:^|\s)x\s*\d+$/i;

/** Words as right-margin text: plain, one line, spaces single; in double quotes when they end like a count. */
function wordsText(text: string, bar: PlayedBar, out: Out): string {
	const flat = plain(text).replace(/\s+/g, " ").trim();
	const written = COUNT.test(flat) ? `"${flat}"` : flat;
	if (written !== text.replace(/\s+/g, " ").trim()) textChanged(out.losses, bar);
	return written;
}

/** A row's measures, each a bar's cells or a fermata's, and its margins' texts. */
type Parts = { measures: string[][]; left: string[]; right: string[] };

/** A fermata as a measure of its own, `*…`, and its loss. */
function fermata(parts: Parts, bar: PlayedBar, out: Out): void {
	lose(out, "fermata", bar);
	parts.measures.push(["*…"]);
}

/** The same meter: `%` across a time change plays its bar in another. */
const sameMeter = (a: PlayedBar, b: PlayedBar) =>
	a.meter.n === b.meter.n &&
	a.meter.d === b.meter.d &&
	a.time?.n === b.time?.n &&
	a.time?.d === b.time?.d;

/**
 * Whether a bar is written `%`: the chart wrote it, and the measure
 * before it in its row is the bar it copies, in the same meter, with no
 * fermata between them. (A `%` never follows a pickup: two short bars in
 * a row open none, grammar 2.4.)
 */
function simileHere(bar: PlayedBar, before: PlayedBar | undefined, context: GridContext): boolean {
	return (
		before !== undefined &&
		writtenSimile(context.written, bar) &&
		before.written === bar.written - 1 &&
		!context.layout.fermatas.has(before.index) &&
		sameMeter(before, bar)
	);
}

/** One bar into a row's parts: a fermata before the first bar, its mark, its cells, its words, a fermata after it. */
function barParts(
	bar: PlayedBar,
	parts: Parts,
	before: PlayedBar | undefined,
	out: Out,
	context: GridContext,
) {
	const { fermatas } = context.layout;
	if (bar.index === 1 && fermatas.has(0)) fermata(parts, bar, out);
	if (bar.rehearsal) parts.left.push(`@${bar.rehearsal}`);
	parts.measures.push(barCells(bar, simileHere(bar, before, context), out));
	for (const w of bar.words ?? []) parts.right.push(wordsText(w.text, bar, out));
	if (fermatas.has(bar.index)) fermata(parts, bar, out);
}

/** A row's parts. */
function partsOf(row: Row, out: Out, context: GridContext): Parts {
	const parts: Parts = { measures: [], left: [], right: [] };
	for (const [i, bar] of row.bars.entries()) barParts(bar, parts, row.bars[i - 1], out, context);
	if (row.times) parts.right.push(row.times);
	return parts;
}

/** A row's grid line, its cells, and the shape for it: its measures by the most beats any bar or measure has. */
function drawRow(row: Row, out: Out, context: GridContext): Drawn {
	const { measures, left, right } = partsOf(row, out, context);
	const body = measures.map((m) => m.join(" ")).join(" | ");
	const text = [left.join(" "), row.open, body, row.close, right.join(" ")].filter((t) => t !== "");
	const beats = Math.max(
		maxOf(row.bars.map((b) => beatsOf(b.time ?? b.meter))),
		maxOf(measures.map((m) => m.length)),
	);
	const cells = measures.reduce((n, m) => n + m.length, 0);
	const written = unjoined(text.join(" "));
	if (written !== text.join(" ")) textChanged(out.losses, row.bars.at(-1));
	return { row, text: written, cells, shape: `1+${measures.length}x${beats}+1` };
}

/**
 * The occurrence's grid line: its label, and the widest row's shape. The
 * reference counts a line's cells against the shape's and draws a line
 * with fewer short, so every row fits the widest one's shape and the
 * occurrence is one grid.
 */
function startLine(drawn: Drawn[], label: string | null): string {
	const widest = drawn.reduce((a, b) => (b.cells > a.cells ? b : a));
	const shape = `shape="${widest.shape}"`;
	return directive("start_of_grid", label === null ? shape : `${label} ${shape}`);
}

/** A section occurrence with no words as one grid (spec 4.1, 4.3, 4.5, 4.6). */
export function gridSection(o: Occurrence, out: Out, context: GridContext): void {
	const { layout } = context;
	const drawn = rowsOf(o, context.written, out)
		.filter((row) => row.bars.length)
		.map((row) => drawRow(row, out, context));
	if (out.lines.length) out.lines.push("");
	pushAll(out.lines, headingTexts(o, context, out));
	const label = labelOf(o.name, out, o.bars[0]);
	if (!drawn.length) return;
	out.lines.push(startLine(drawn, label));
	let prev = context.previous.at(-1)?.bars.at(-1);
	drawn.forEach(({ row, text }, g) => {
		const first = row.bars[0] as PlayedBar;
		const end = row.bars.at(-1) as PlayedBar;
		const run = runOf(layout, first);
		if (g === 0 || runOf(layout, drawn[g - 1]?.row.bars[0]) !== run)
			pushAll(out.lines, texts(run, "before", first, out));
		pushAll(out.lines, changeLines(prev, first, context.first, out));
		out.lines.push(text);
		if (layout.openEnds.has(end.index)) out.lines.push(directive("comment", "repeat ad lib."));
		if (runOf(layout, drawn[g + 1]?.row.bars[0]) !== run)
			pushAll(out.lines, texts(run, "after", end, out));
		prev = end;
	});
	out.lines.push(directive("end_of_grid"));
}
