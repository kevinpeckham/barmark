/**
 * The played bars as the sheet writes them (spec 4.1, 4.5): section
 * occurrences in play order, each one environment unless a repeat sings a
 * new verse on bars it played (then one per verse sung), and stacked verses
 * one pass each; and what sits between the bars (text lines, fermatas, the
 * end of an open repeat) by where it is written.
 */
import type { ChartEvent, ChartParse, PlayedBar, SectionOccurrence } from "barmark";
import { pushAll } from "./lists.js";

export type Occurrence = {
	name: string | null;
	bars: PlayedBar[];
	/** Some bar sings words: a lyric environment, else (the next task) a grid. */
	sung: boolean;
	/** A replay heading's occurrence, or a jump's return through a section. */
	replay: boolean;
	/** The one verse sung, when one is; null when none is, or several. */
	verse: number | null;
	/** Which written section this plays (`SectionOccurrence.form`, shared by its replays); null before the first heading. */
	form: number | null;
	/** The line of the heading it is played under (a replay's own heading); null before the first heading. */
	heading: number | null;
	/** The line of the heading its bars are written under (a replay's written section's); null before the first heading. */
	source: number | null;
	/** One pass of verses stacked on the same bars (spec 4.5): its bars hold that verse only. */
	stacked?: true;
};

type Span = Pick<Occurrence, "name" | "replay" | "form" | "heading" | "source"> & {
	bars: PlayedBar[];
};
type Played = SectionOccurrence & { firstBar: number; lastBar: number };

const played = (s: SectionOccurrence): s is Played => s.firstBar !== null && s.lastBar !== null;

/** The first section from `s` that has not ended before bar `index`. */
function advance(sections: Played[], s: number, index: number): number {
	let at = s;
	while (at < sections.length && index > (sections[at]?.lastBar ?? 0)) at += 1;
	return at;
}

/** The section bar `index` is in, if it has begun; null for a bar before it (before the first heading). */
const within = (section: Played | undefined, index: number) =>
	section && index >= section.firstBar ? section : null;

const spanOf = (section: Played | null): Span =>
	section === null
		? { name: null, replay: false, form: null, heading: null, source: null, bars: [] }
		: {
				name: section.name,
				replay: section.replayOf !== null,
				form: section.form,
				heading: section.line,
				source: section.replayOf ?? section.line,
				bars: [],
			};

/** The bars of each section occurrence in play order; bars before the first heading are one unnamed span. */
function spans(parse: ChartParse): Span[] {
	const sections = parse.sections.filter(played);
	const out: Span[] = [];
	let s = 0;
	let owner: Played | null | undefined;
	for (const bar of parse.bars) {
		s = advance(sections, s, bar.index);
		const section = within(sections[s], bar.index);
		if (section !== owner) out.push(spanOf(section));
		owner = section;
		out.at(-1)?.bars.push(bar);
	}
	return out;
}

/** A span's passes: a new one where the written bar number falls back (a repeat going round). */
function passes(bars: PlayedBar[]): PlayedBar[][] {
	const out: PlayedBar[][] = [];
	let prev: PlayedBar | undefined;
	for (const bar of bars) {
		if (!prev || bar.written <= prev.written) out.push([]);
		out.at(-1)?.push(bar);
		prev = bar;
	}
	return out;
}

/** Which verses a bar sings, as a key. */
const verseKey = (bar: PlayedBar) => (bar.lyrics ?? []).map((l) => l.verse).join(",");

/**
 * A span's environments: its passes together, except that a pass singing
 * a different verse on a bar the environment already played starts a new
 * one (pass 1 verse 1, pass 2 verse 2). A repeat singing the same row
 * again stays in the one environment, its bars written again as played.
 */
function environments(bars: PlayedBar[]): PlayedBar[][] {
	const out: PlayedBar[][] = [];
	let sang = new Map<number, string>();
	for (const pass of passes(bars)) {
		const differs = (b: PlayedBar) => sang.has(b.written) && sang.get(b.written) !== verseKey(b);
		if (!out.length || pass.some(differs)) {
			out.push([]);
			sang = new Map();
		}
		for (const b of pass) sang.set(b.written, verseKey(b));
		const last = out.at(-1);
		if (last) pushAll(last, pass);
	}
	return out;
}

const sings = (bar: PlayedBar) =>
	bar.lyrics?.some((l) => l.syllables.some((s) => s.syllable.kind === "sung")) ?? false;

/** A bar with only verse `verse`'s words, or none. */
function withVerse(bar: PlayedBar, verse: number): PlayedBar {
	const { lyrics, ...rest } = bar;
	const kept = (lyrics ?? []).filter((l) => l.verse === verse);
	return kept.length ? { ...rest, lyrics: kept } : rest;
}

/** One environment's bars as occurrences: themselves, or with verses stacked, one per verse in verse order. */
function ofEnvironment(span: Span, bars: PlayedBar[]): Occurrence[] {
	const verses = [...new Set(bars.flatMap((b) => (b.lyrics ?? []).map((l) => l.verse)))].sort(
		(a, b) => a - b,
	);
	const { bars: _, ...base } = span;
	if (!bars.some((b) => (b.lyrics?.length ?? 0) > 1)) {
		const verse = verses.length === 1 ? (verses[0] ?? null) : null;
		return [{ ...base, bars, sung: bars.some(sings), verse }];
	}
	// A stacked verse that sings no syllable (`lyrics 2: | -- |`) writes nothing.
	const sung = verses
		.map((verse) => ({ verse, own: bars.map((b) => withVerse(b, verse)) }))
		.filter((v) => v.own.some(sings));
	if (!sung.length) return [{ ...base, bars, sung: false, verse: null }];
	const stacked = sung.length > 1 ? { stacked: true as const } : {};
	return sung.map(({ verse, own }) => ({ ...base, bars: own, sung: true, verse, ...stacked }));
}

/** The played bars as section occurrences in play order; bars before the first heading are one unnamed occurrence. */
export function occurrences(parse: ChartParse): Occurrence[] {
	return spans(parse).flatMap((span) =>
		environments(span.bars).flatMap((bars) => ofEnvironment(span, bars)),
	);
}

/** Text lines around a run of consecutive bar lines (a system, or several written together). */
export type Run = { before: string[]; after: string[] };

/** What the sheet writes between bars, found by where it is written. */
export type Layout = {
	/** Text lines before the first section and the first bar: written after the header. */
	header: string[];
	/** Each bar line's run, by its line number. */
	runs: Map<number, Run>;
	/**
	 * Text lines under a heading with no bar lines of its own (a replay), by
	 * the heading's line: written once, outside any environment, before it.
	 */
	headings: Map<number, string[]>;
	/** The played bars a fermata follows, by `PlayedBar.index`; 0 for one before the first bar. */
	fermatas: Set<number>;
	/** The last bar of each open repeat's pass, by `PlayedBar.index`. */
	openEnds: Set<number>;
};

/** Where the walk over the written lines stands. */
type Walk = Pick<Layout, "header" | "runs" | "headings"> & {
	pending: string[];
	current: Run | null;
	last: Run | null;
	/** The current section's heading line, and whether it has written a bar line. */
	heading: number | null;
	hasRun: boolean;
};

/** The text lines waiting, given to the heading with no bar lines, the last run, or the header. */
function settle(w: Walk): void {
	if (!w.pending.length) return;
	if (w.heading !== null && !w.hasRun) w.headings.set(w.heading, w.pending);
	else pushAll(w.last ? w.last.after : w.header, w.pending);
	w.pending = [];
}

/** A bar line: in the current run, or the first of a new one, taking the text before it. */
function barLine(w: Walk, line: number): void {
	w.current ??= { before: w.pending, after: [] };
	w.pending = [];
	w.runs.set(line, w.current);
	w.last = w.current;
	w.hasRun = true;
}

/**
 * Text lines by the run of bar lines they belong to: those before a run
 * are its `before`; those after a section's last run, before the next
 * heading or the chart's end, its `after`; those under a heading with no
 * bar lines its own; those before any bar and any heading the header's.
 */
function runsOf(parse: ChartParse): Pick<Layout, "header" | "runs" | "headings"> {
	const w: Walk = {
		...{ header: [], runs: new Map(), headings: new Map(), pending: [] },
		...{ current: null, last: null, heading: null, hasRun: false },
	};
	for (const line of parse.lines) {
		if (line.kind === "text") {
			w.current = null;
			w.pending.push(line.text);
		} else if (line.kind === "bars" || line.kind === "invalid") barLine(w, line.line);
		else if (line.kind === "section") {
			settle(w);
			Object.assign(w, { current: null, heading: line.line, hasRun: false });
		} else if (line.kind === "directive") w.current = null;
	}
	settle(w);
	return { header: w.header, runs: w.runs, headings: w.headings };
}

/** The bars fermatas follow and the bars that end an open repeat's pass, from the events. */
function eventMarks(
	events: ChartEvent[],
	into: Pick<Layout, "fermatas" | "openEnds">,
	before: number | null = null,
): number | null {
	let lastBar = before;
	for (const e of events) {
		if (e.kind === "bar") lastBar = e.bar.index;
		else if (e.kind === "fermata") into.fermatas.add(lastBar ?? 0);
		else {
			const end = eventMarks(e.events, into, lastBar);
			if (end !== null && end !== lastBar) into.openEnds.add(end);
			lastBar = end;
		}
	}
	return lastBar;
}

/** What the sheet writes between a chart's bars (spec 4.3, 4.5, 4.6). */
export function layout(parse: ChartParse): Layout {
	const marks = { fermatas: new Set<number>(), openEnds: new Set<number>() };
	eventMarks(parse.events, marks);
	return { ...runsOf(parse), ...marks };
}
