/**
 * Repeats and endings bar by bar (grammar 5, 5.1), and whether barmark can
 * hold them as written: the candidate bar lines are built and parsed, so
 * the parser's own pairing rules decide.
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

/**
 * Each measure's repeats, from the parts' measures at that index. An ending
 * marks every bar from its start to its stop; a backward repeat with no
 * forward one before it goes back to the first bar, as MusicXML plays it.
 */
export function repeatsOf(parts: ReadMeasure[][], count: number): Repeats[] {
	let ending: number[] | null = null;
	const out = Array.from({ length: count }, (_, i): Repeats => {
		const m = marksAt(parts.map((p) => p[i]));
		if (m.ending?.start) ending = m.ending.numbers;
		const bar = { opens: m.opens, closes: m.closes, ending };
		if (m.ending?.stop || m.ending?.discontinue) ending = null;
		return bar;
	});
	const firstClose = out.findIndex((r) => r.closes !== null);
	const first = out[0];
	if (first && firstClose >= 0 && !out.slice(0, firstClose + 1).some((r) => r.opens))
		first.opens = true;
	return out;
}

/** A bar for the candidate: its cells and what its bar line says. */
export type CandidateBar = Repeats & { heading: boolean; before: string[]; after: string[] };

const sameEnding = (a: number[] | null, b: number[] | null) => a?.join() === b?.join();

function closing(bar: CandidateBar): string {
	if (bar.closes === null) return "|";
	if (bar.ending !== null || bar.closes === 2) return ":|";
	return bar.closes === "open" ? ":| x ..." : `:| x${bar.closes}`;
}

/** A new bar line starts at a heading, at `|:`, and where an ending starts or ends. */
const breaksBefore = (bar: CandidateBar, before: CandidateBar | undefined) =>
	bar.heading || bar.opens || !sameEnding(bar.ending, before?.ending ?? null);

function opening(bar: CandidateBar): string {
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

/** Whether barmark can write these repeats, endings and directions where they are. */
export function holdsAsWritten(bars: CandidateBar[]): boolean {
	return !parseChart(candidate(bars)).diagnostics.some((d) => d.severity === "error");
}
