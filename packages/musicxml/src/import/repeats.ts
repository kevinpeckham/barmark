/**
 * Repeats and endings bar by bar (grammar 5, 5.1), and whether barmark can
 * hold them and the direction cells (5.2) as written: the candidate bar
 * lines are built and parsed, so the parser's own rules decide.
 */
import { parseChart } from "barmark";
import type { ReadMeasure } from "./read.js";

export type Repeats = { opens: boolean; closes: number | "open" | null; ending: number[] | null };

/** What the bar lines around measure `i` say, from every part (the export writes them in each). */
function marksAt(measures: (ReadMeasure | undefined)[]) {
	const found = measures.filter((m): m is ReadMeasure => m !== undefined);
	const close = found.find((m) => m.repeatEnd)?.repeatEnd ?? null;
	return {
		opens: found.some((m) => m.repeatStart),
		// times="1" plays once: barmark's open repeat, which the export writes so.
		closes: close === null ? null : close.times === 1 ? ("open" as const) : close.times,
		ending: found.find((m) => m.ending)?.ending ?? null,
	};
}

/** Each measure's bar-line marks with every ending bar marked, from its start to its stop. */
function withEndings(parts: ReadMeasure[][], count: number) {
	let ending: number[] | null = null;
	return Array.from({ length: count }, (_, i) => {
		const m = marksAt(parts.map((p) => p[i]));
		if (m.ending?.start) ending = m.ending.numbers;
		const bar = { ...m, ending, last: Boolean(m.ending?.stop || m.ending?.discontinue) };
		if (bar.last) ending = null;
		return bar;
	});
}

/**
 * Each measure's repeats, from the parts' measures at that index. An ending
 * marks every bar from its start to its stop, and its `:|` is a plain one:
 * the endings give the count (grammar 5.1). A backward repeat with no
 * forward one goes back to the bar after the last repeat (or the first
 * bar), as notation programs play it, so that bar opens.
 */
export function repeatsOf(parts: ReadMeasure[][], count: number): Repeats[] {
	const marks = withEndings(parts, count);
	const out = marks.map(
		(m): Repeats => ({
			opens: m.opens,
			closes: m.closes !== null && m.ending !== null ? 2 : m.closes,
			ending: m.ending,
		}),
	);
	let open = false;
	let from = 0;
	marks.forEach((m, i) => {
		open ||= m.opens;
		if (m.closes !== null && !open) (out[from] as Repeats).opens = open = true;
		const done = m.ending ? m.last && !marks[i + 1]?.ending : m.closes !== null;
		if (done) [open, from] = [false, i + 1];
	});
	return out;
}

/** A bar for the candidate: its cells and what its bar line says. */
export type CandidateBar = Repeats & { heading: boolean; before: string[]; after: string[] };

const sameEnding = (a: number[] | null, b: number[] | null) => a?.join() === b?.join();

/** How a bar line ends after `bar`: `|`, `:|`, `:| x3` or `:| x ...` (an ending's close is always plain). */
export function closing(bar: Repeats): string {
	if (bar.closes === null) return "|";
	if (bar.ending !== null || bar.closes === 2) return ":|";
	return bar.closes === "open" ? ":| x ..." : `:| x${bar.closes}`;
}

/** A new bar line starts at a heading, at `|:`, and where an ending starts or ends. */
const breaksBefore = (bar: CandidateBar, before: CandidateBar | undefined) =>
	bar.heading || bar.opens || !sameEnding(bar.ending, before?.ending ?? null);

/** How a bar line starting at `bar` opens: `|`, `|:` or an ending's `|1`. */
export function opening(bar: Repeats): string {
	if (bar.ending) return `|${bar.ending.join(",")}`;
	return bar.opens ? "|:" : "|";
}

/** The bar lines barmark would write: a new line at a heading, `|:` or an ending, a line ending at `:|`. */
function candidate(bars: CandidateBar[]): string {
	const lines: string[] = [];
	let cells: string[] = [];
	let open = "";
	const flush = (close: string) => {
		if (cells.length > 0) lines.push(`${open} ${cells.join(" | ")} ${close}`);
		cells = [];
	};
	bars.forEach((bar, i) => {
		if (breaksBefore(bar, bars[i - 1])) flush("|");
		if (bar.heading) lines.push(`## Section ${i + 1}`);
		if (cells.length === 0) open = opening(bar);
		cells.push(...bar.before, "C", ...bar.after);
		if (bar.closes !== null) flush(closing(bar));
	});
	flush("|");
	return lines.join("\n");
}

const clean = (bars: CandidateBar[]) =>
	!parseChart(candidate(bars)).diagnostics.some((d) => d.severity === "error");

/** A direction cell on a bar (`...` isn't one: it holds the bar before it). */
export type DirectionCell = { bar: number; before: boolean; text: string };

const keyOf = (c: DirectionCell) => `${c.bar}|${c.before}|${c.text}`;

/** The bars with only the direction cells in `kept`. */
function keeping(bars: CandidateBar[], kept: Set<string>): CandidateBar[] {
	const keeps = (bar: number, before: boolean) => (text: string) =>
		text === "..." || kept.has(keyOf({ bar, before, text }));
	return bars.map((b, i) => ({
		...b,
		before: b.before.filter(keeps(i, true)),
		after: b.after.filter(keeps(i, false)),
	}));
}

/** The most directions tried in every combination; a score with more keeps all of them or none. */
const MOST_TRIED = 10;

/**
 * Ways to keep `cells`: every subset when there are few, else all or none.
 * Most cells first, and among as many, the earlier cells kept (a jump goes
 * to the first sign, as play order does).
 */
function choices(cells: DirectionCell[]): DirectionCell[][] {
	if (cells.length > MOST_TRIED) return [cells, []];
	const n = cells.length;
	const keeps = (m: number) => cells.filter((_, i) => m & (1 << (n - 1 - i)));
	const masks = Array.from({ length: 2 ** n }, (_, m) => 2 ** n - 1 - m);
	return masks.map(keeps).sort((a, b) => b.length - a.length);
}

/**
 * Whether barmark can hold the repeats and endings where they are, and if
 * so which direction cells it can't place. Only repeat and ending pairing
 * writes a score out; a direction the parser rejects (a stray Fine, a
 * second Coda) is dropped, keeping as many as parse cleanly together.
 */
export function placeStructure(
	bars: CandidateBar[],
): { holds: false } | { holds: true; dropped: DirectionCell[] } {
	if (!clean(keeping(bars, new Set()))) return { holds: false };
	const cells = bars.flatMap((b, bar) => [
		...b.before.filter((t) => t !== "...").map((text) => ({ bar, before: true, text })),
		...b.after.filter((t) => t !== "...").map((text) => ({ bar, before: false, text })),
	]);
	const kept = choices(cells).find((c) => clean(keeping(bars, new Set(c.map(keyOf))))) ?? [];
	const keys = new Set(kept.map(keyOf));
	return { holds: true, dropped: cells.filter((c) => !keys.has(keyOf(c))) };
}
