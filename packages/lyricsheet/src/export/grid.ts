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
 * - Margins: a rehearsal mark is left-margin text (`@B`), the line's
 *   marks in order; words are right-margin text, the line's words in
 *   order, then its `x N`. The shape gives a margin cell each side, or
 *   the reference drops the text and warns "No margin cell for trailing
 *   comment".
 * - The shape is the first line's: its measures by its beats (a fermata
 *   is a measure of one cell, `*…`). The reference draws every cell of a
 *   grid the same width and draws a line with fewer cells than the shape
 *   short, left-aligned; a line with more warns "Too few cells for grid
 *   content" (measured 2026-11-19 with `chordpro` 6.101.0), so such a line
 *   closes the grid and opens another, unlabelled, with its own shape.
 * - An open repeat's line ends the grid; `{comment: repeat ad lib.}`
 *   follows, and any lines after it are a new grid, unlabelled.
 * - Key, time, tempo and feel changes and text lines are comments (and
 *   directives) between grid lines, as in lyric lines: the reference takes
 *   them there and draws the comment.
 */
import { beatsOf, type PlayedBar } from "barmark";
import { barCells } from "./cells.js";
import { changeLines } from "./changes.js";
import { byLine, type Context, headingTexts, labelOf, lose, runOf, texts } from "./lyrics.js";
import { directive } from "./meta.js";
import type { Occurrence } from "./plan.js";
import { plain, textChanged } from "./text.js";
import type { Out } from "./types.js";
import { type BarsLine, placeOf, straightLines, type Written, writtenSimile } from "./written.js";

export type GridContext = Context & { written: Written };

/** A grid line to write: its bars, and the bar symbols and count written around them. */
type Row = { bars: PlayedBar[]; open: string; close: string; times: string | null };

/** A written line's row: its bars' first plays, its repeat signs, its ending's volta and its `x N`. */
const writtenRow = (l: BarsLine, bars: PlayedBar[]): Row => ({
	bars,
	open: l.ending ? `|${l.ending[0]}` : l.opens ? "|:" : "|",
	close: l.closes ? ":|" : "|",
	times: typeof l.repeat === "number" ? `x${l.repeat}` : null,
});

/** The rows of an occurrence: its section's written lines when it plays them straight through, else its bars as played. */
function rowsOf(o: Occurrence, w: Written): Row[] {
	const lines = straightLines(o, w);
	if (!lines) return byLine(o.bars).map((bars) => ({ bars, open: "|", close: "|", times: null }));
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
	return lines.map((l) => writtenRow(l, firsts.get(l.line) ?? []));
}

/** A row as text, with the cells it takes and the shape a grid opened for it has. */
type Drawn = { text: string; cells: number; shape: string; capacity: number };

/** Words as right-margin text: plain, one line, spaces single. */
function wordsText(text: string, bar: PlayedBar, out: Out): string {
	const written = plain(text);
	if (written !== text) textChanged(out.losses, bar);
	return written.replace(/\s+/g, " ").trim();
}

/** A row's measures, each a bar's cells or a fermata's, and its margins' texts. */
type Parts = { measures: string[][]; left: string[]; right: string[] };

/** A fermata as a measure of its own, `*…`, and its loss. */
function fermata(parts: Parts, bar: PlayedBar, out: Out): void {
	lose(out, "fermata", bar);
	parts.measures.push(["*…"]);
}

/** One bar into a row's parts: a fermata before the first bar, its mark, its cells, its words, a fermata after it. */
function barParts(
	bar: PlayedBar,
	parts: Parts,
	last: { bar?: PlayedBar },
	out: Out,
	context: GridContext,
) {
	const { fermatas } = context.layout;
	if (bar.index === 1 && fermatas.has(0)) fermata(parts, bar, out);
	if (bar.rehearsal) parts.left.push(`@${bar.rehearsal}`);
	// `%` copies the bar written before it: written so only when that is the measure before it here.
	const simile = writtenSimile(context.written, bar) && last.bar?.written === bar.written - 1;
	parts.measures.push(barCells(bar, simile, out));
	for (const w of bar.words ?? []) parts.right.push(wordsText(w.text, bar, out));
	if (fermatas.has(bar.index)) fermata(parts, bar, out);
	last.bar = bar;
}

/** A row's parts; `last` is the bar written before it in the occurrence, for `%`. */
function partsOf(row: Row, last: { bar?: PlayedBar }, out: Out, context: GridContext): Parts {
	const parts: Parts = { measures: [], left: [], right: [] };
	for (const bar of row.bars) barParts(bar, parts, last, out, context);
	if (row.times) parts.right.push(row.times);
	return parts;
}

/** A row's grid line, its cells, and the shape for it: its measures by the most beats any bar or measure has. */
function drawRow(row: Row, last: { bar?: PlayedBar }, out: Out, context: GridContext): Drawn {
	const { measures, left, right } = partsOf(row, last, out, context);
	const body = measures.map((m) => m.join(" ")).join(" | ");
	const text = [left.join(" "), row.open, body, row.close, right.join(" ")].filter((t) => t !== "");
	const beats = Math.max(
		...row.bars.map((b) => beatsOf(b.time ?? b.meter)),
		...measures.map((m) => m.length),
	);
	const cells = measures.reduce((n, m) => n + m.length, 0);
	const shape = `1+${measures.length}x${beats}+1`;
	return { text: text.join(" "), cells, shape, capacity: measures.length * beats };
}

/** Where the writing of an occurrence's grids stands. */
type Writing = {
	open: boolean;
	current: Drawn | null;
	label: string | null;
	last: { bar?: PlayedBar };
};

/** Opens a grid for a row when none is open or the row has more cells than its shape: the label on the first only. */
function place(drawn: Drawn, w: Writing, out: Out): void {
	const fits = w.current !== null && drawn.cells <= w.current.capacity;
	if (w.open && fits) return;
	if (w.open) out.lines.push(directive("end_of_grid"));
	if (!fits) w.current = drawn;
	const shape = `shape="${w.current?.shape}"`;
	out.lines.push(directive("start_of_grid", w.label === null ? shape : `${w.label} ${shape}`));
	w.label = null;
	w.open = true;
}

/** A section occurrence with no words as one grid, or several (spec 4.1, 4.3, 4.5, 4.6). */
export function gridSection(o: Occurrence, out: Out, context: GridContext): void {
	const { layout } = context;
	const rows = rowsOf(o, context.written);
	if (out.lines.length) out.lines.push("");
	out.lines.push(...headingTexts(o, context, out));
	const w: Writing = {
		open: false,
		current: null,
		label: labelOf(o.name, out, o.bars[0]),
		last: {},
	};
	let prev = context.previous.at(-1)?.bars.at(-1);
	rows.forEach((row, g) => {
		const [first] = row.bars;
		const end = row.bars.at(-1);
		if (!first || !end) return;
		const run = runOf(layout, first);
		const drawn = drawRow(row, w.last, out, context);
		place(drawn, w, out);
		if (g === 0 || runOf(layout, rows[g - 1]?.bars[0]) !== run)
			out.lines.push(...texts(run, "before", first, out));
		out.lines.push(...changeLines(prev, first, context.first, out), drawn.text);
		if (layout.openEnds.has(end.index)) {
			out.lines.push(directive("end_of_grid"), directive("comment", "repeat ad lib."));
			w.open = false;
		}
		if (runOf(layout, rows[g + 1]?.bars[0]) !== run)
			out.lines.push(...texts(run, "after", end, out));
		prev = end;
	});
	if (w.open) out.lines.push(directive("end_of_grid"));
}
