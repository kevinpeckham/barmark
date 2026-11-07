/**
 * The measures a part writes, in written order, with the marks that make a
 * notation program play them in the chart's play order: repeats, endings
 * and jumps where MusicXML says the same thing, and bars written out where
 * it can't (a replay, or a repeat holding a repeat of its own: MusicXML's
 * repeats don't nest).
 */
import type {
	Cell,
	ChartEvent,
	ChartParse,
	Direction,
	Feel,
	Key,
	Line,
	Meter,
	PlayedBar,
	Repeat,
	SectionOccurrence,
	Slot,
	Words,
} from "barmark";
import { type Sung, withLyrics } from "./lyrics.js";

export type Marks = {
	repeatStart: boolean;
	repeatEnd: Exclude<Repeat, null> | null;
	ending: { numbers: number[]; start: boolean; stop: "stop" | "discontinue" | null } | null;
	heading: string | null;
	rehearsal: string | null;
	/** Directions before the measure's notes: Segno and Coda. */
	start: Direction[];
	/** Directions after them: To Coda, Fine and the jump. */
	end: Direction[];
	/** A fermata cell follows: a fermata on this measure's closing bar line. */
	fermata: boolean;
};

export type Measure = {
	/** barmark's written number, shown as the measure's number. */
	shown: number;
	/** The played bar (`PlayedBar.index`) this measure was made from; null for a bar no pass plays. */
	played: number | null;
	meter: Meter;
	key: Key | null;
	slots: Slot[];
	words: Words[];
	/** The part rests here (grammar 7.4). */
	tacet: boolean;
	tempo: number | null;
	tempoChange: PlayedBar["tempoChange"];
	feel: Feel;
	swingPercent?: number;
	/** Text lines written before the measure (lyrics, `###` notes, prose), after its heading. */
	text: { text: string; note: boolean }[];
	/** Text lines written before its heading: the chart's text before the first heading. */
	lead: Measure["text"];
	/** Text lines written after the measure: at a section's foot, or after the chart's last bar. */
	foot: Measure["text"];
	/** The syllables it sings (grammar 4.3, 7.7): every pass's verses, in verse order. */
	lyrics: Sung[];
	marks: Marks;
};

const blank = (): Marks => ({
	repeatStart: false,
	repeatEnd: null,
	ending: null,
	heading: null,
	rehearsal: null,
	start: [],
	end: [],
	fermata: false,
});

/** The played bars a fermata cell follows. */
function fermataBars(
	events: ChartEvent[],
	out = new Set<number>(),
	last = { bar: 0 },
): Set<number> {
	for (const e of events) {
		if (e.kind === "bar") last.bar = e.bar.index;
		else if (e.kind === "fermata") out.add(last.bar);
		else fermataBars(e.events, out, last);
	}
	return out;
}

const measureOf = (b: PlayedBar, fermatas: Set<number>): Measure => ({
	shown: b.written,
	played: b.index,
	meter: b.meter,
	key: b.key,
	slots: b.slots,
	words: b.words ?? [],
	tacet: b.tacet === true,
	tempo: b.tempo,
	tempoChange: b.tempoChange,
	feel: b.feel,
	...(b.swingPercent === undefined ? {} : { swingPercent: b.swingPercent }),
	text: [],
	lead: [],
	foot: [],
	lyrics: [],
	marks: { ...blank(), rehearsal: b.rehearsal ?? null, fermata: fermatas.has(b.index) },
});

type Pending = {
	heading: string | null;
	rehearsal: string | null;
	start: Direction[];
	text: Measure["text"];
	/** Text before a heading with no bar before it to close. */
	lead: Measure["text"];
};

const nothing = (): Pending => ({ heading: null, rehearsal: null, start: [], text: [], lead: [] });

type Walk = {
	parse: ChartParse;
	out: Measure[];
	written: number;
	firstPlay: Map<number, PlayedBar>;
	fermatas: Set<number>;
	/** Each played bar's text lines, so a bar written out again keeps them. */
	texts: Map<number, Measure["text"]>;
	/** Each played bar's text lines after it, likewise. */
	feet: Map<number, Measure["text"]>;
	/** Some passes were written out, or a replay holds a Fine or To Coda: a jump needs the chart in play order. */
	flattened: boolean;
	/** Marks waiting for the next measure. */
	pending: Pending;
	/** The first measure of the replay being walked, which takes its section's text lines. */
	replay: number | null;
	section: { from: number; repeat: Repeat; line: number } | null;
	/** The `|: … :|` being walked: its first measure, and whether a line inside it repeats too. */
	bracket: { from: number; nested: boolean } | null;
	/** Text lines of bars no pass plays, written out of the measures: they go after the last bar. */
	orphans: Measure["text"];
};

function add(w: Walk, m: Measure): void {
	m.marks.heading = w.pending.heading;
	m.marks.rehearsal = w.pending.rehearsal ?? m.marks.rehearsal;
	m.marks.start = w.pending.start;
	m.lead = w.pending.lead;
	const own = m.played === null ? undefined : w.texts.get(m.played);
	m.text = own ? [...own, ...w.pending.text] : w.pending.text;
	if (m.played !== null && !own) w.texts.set(m.played, m.text);
	w.pending = nothing();
	w.out.push(m);
}

const occurrenceAt = (w: Walk, line: number) => w.parse.sections.find((o) => o.line === line);

/** The text lines of the measures no pass plays. */
const unplayedText = (ms: Measure[]) =>
	ms.filter((m) => m.played === null).flatMap((m) => [...m.text, ...m.foot]);

/**
 * The measures from `from` on, written again as these bars play, with no
 * repeat marks: the first keeps its heading, lead text and Segno or Coda.
 */
function rewrite(w: Walk, from: number, bars: PlayedBar[]): void {
	const first = w.out[from];
	const pending = w.pending;
	w.orphans.push(...unplayedText(w.out.slice(from)));
	w.out.length = from;
	w.pending = {
		...nothing(),
		heading: first?.marks.heading ?? null,
		start: first?.marks.start ?? [],
		lead: first?.lead ?? [],
	};
	for (const b of bars) add(w, measureOf(b, w.fermatas));
	w.pending = pending;
	w.flattened = true;
}

const stops = (d: Direction) => d.kind === "fine" || d.kind === "to coda";

/**
 * A replay a jump can't pass through as written: one that plays a bar
 * twice (its passes written out, which barmark plays once after the
 * jump), or whose bars, the one its elision cuts included, are followed by
 * a Fine or To Coda (its measures carry no directions).
 */
function needsPlayOrder(w: Walk, o: SectionOccurrence, bars: PlayedBar[]): boolean {
	const written = new Set(bars.map((b) => b.written));
	if (written.size < bars.length) return true;
	if (o.elided) written.add(Math.max(...written) + 1);
	return w.out.some((m) => written.has(m.shown) && m.marks.end.some(stops));
}

/** An occurrence's bars as played, one measure each. */
function playedOut(w: Walk, o: SectionOccurrence): void {
	if (o.firstBar === null || o.lastBar === null) return;
	const bars = w.parse.bars.slice(o.firstBar - 1, o.lastBar);
	if (needsPlayOrder(w, o, bars)) w.flattened = true;
	for (const b of bars) add(w, measureOf(b, w.fermatas));
}

type Running = Pick<Measure, "meter" | "key" | "tempo" | "feel" | "swingPercent">;

/** The meter, key, tempo and feel a bar carries on from the one before it; a chart's defaults at its start. */
function runningAfter(m: Measure | undefined): Running {
	if (!m) return { meter: { n: 4, d: 4 }, key: null, tempo: null, feel: "straight" };
	const { meter, key, tempo, feel, swingPercent } = m;
	return { meter, key, tempo, feel, ...(swingPercent === undefined ? {} : { swingPercent }) };
}

/** A bar no pass plays, as written, in the meter, key, tempo and feel of the bar before it. */
function unplayed(w: Walk, cell: Extract<Cell, { kind: "slots" | "simile" }>): Measure {
	const running = runningAfter(w.out.at(-1));
	if (cell.kind === "slots" && cell.meter) running.meter = cell.meter;
	return {
		...running,
		shown: w.written,
		played: null,
		slots: cell.kind === "slots" ? cell.slots : [],
		words: [],
		tacet: false,
		tempoChange: null,
		text: [],
		lead: [],
		foot: [],
		lyrics: [],
		marks: blank(),
	};
}

/** A written bar, with `%` resolved as the parser first played it. */
function writtenBar(w: Walk, cell: Extract<Cell, { kind: "slots" | "simile" }>): Measure {
	w.written++;
	const played = w.firstPlay.get(w.written);
	return played ? measureOf(played, w.fermatas) : unplayed(w, cell);
}

function cellIn(w: Walk, cell: Cell): void {
	const last = w.out[w.out.length - 1];
	if (cell.kind === "slots" || cell.kind === "simile") add(w, writtenBar(w, cell));
	else if (cell.kind === "rehearsal") w.pending.rehearsal = cell.label;
	else if (cell.kind === "fermata" && last) last.marks.fermata = true;
	else if (cell.kind === "direction") directionCell(w, cell.direction, last);
}

/** Segno and Coda wait for the next measure; the others go on the last. */
function directionCell(w: Walk, d: Direction, last: Measure | undefined): void {
	if (d.kind === "segno" || d.kind === "coda") w.pending.start.push(d);
	else last?.marks.end.push(d);
	// A jump on a bar line after a repeat's is taken after its passes, but
	// MuseScore takes a jump on a repeat's last measure on its first.
	if (d.kind === "jump" && last && last.marks.repeatEnd !== null) w.flattened = true;
}

/** Lines that may stand between a repeat's endings (barmark's `repeats.ts`). */
const BETWEEN_ENDINGS = new Set<Line["kind"]>(["text", "credit", "lyrics", "break"]);

/** The passes a repeat closed by this ending plays: the highest number of its endings. */
function passes(lines: Line[], i: number): number {
	let max = 0;
	for (const l of lines.slice(i)) {
		if (BETWEEN_ENDINGS.has(l.kind)) continue;
		if (l.kind !== "bars" || !l.ending) break;
		max = Math.max(max, ...l.ending);
	}
	return max;
}

type BarsLine = Extract<Line, { kind: "bars" }>;

/** An ending is its whole bar line: it starts on the first measure and stops on the last. */
function endingMarks(line: BarsLine, first: Measure, last: Measure): void {
	if (!line.ending) return;
	first.marks.ending = { numbers: line.ending, start: true, stop: null };
	last.marks.ending = {
		...(last.marks.ending ?? { numbers: line.ending, start: false }),
		stop: line.closes ? "stop" : "discontinue",
	};
}

function lineMarks(w: Walk, line: BarsLine, from: number, lines: Line[], i: number): void {
	const first = w.out[from];
	const last = w.out[w.out.length - 1];
	if (!first || !last) return;
	if (line.opens) first.marks.repeatStart = true;
	endingMarks(line, first, last);
	if (line.closes)
		last.marks.repeatEnd = line.ending
			? Math.max(...line.ending, passes(lines, i))
			: (line.repeat ?? 2);
	else if (line.repeat !== null) {
		first.marks.repeatStart = true;
		last.marks.repeatEnd = line.repeat;
	}
}

/** The played bars of the section occurrence that plays bar `p` first, from `p` on. */
function occurrenceFrom(w: Walk, p: number): PlayedBar[] {
	const o = w.parse.sections.find(
		(s) => s.firstBar !== null && s.firstBar <= p && p <= (s.lastBar ?? 0),
	);
	return w.parse.bars.slice(p - 1, o?.lastBar ?? undefined);
}

/**
 * A `|: … :|`'s first pass to its last, from its first measure: through the
 * `times`-th play of its last measure, so a repeat around it doesn't count,
 * and no further than its own bars and its section's occurrence (a jump
 * inside it leaves them).
 */
function bracketPlays(w: Walk, from: number, times: number): PlayedBar[] {
	const first = w.out[from];
	const last = w.out.at(-1);
	if (!first || first.played === null || !last) return [];
	const inside = (b: PlayedBar) => b.written >= first.shown && b.written <= last.shown;
	const out: PlayedBar[] = [];
	let seen = 0;
	for (const b of occurrenceFrom(w, first.played)) {
		if (!inside(b) || seen === times) break;
		out.push(b);
		if (b.written === last.shown) seen++;
	}
	return out;
}

/** The passes a `|: … :|` closed by this line plays: its endings' last pass plays once, an open repeat's one pass. */
const closingPasses = (line: BarsLine) =>
	line.ending ? 1 : line.repeat === "open" ? 1 : (line.repeat ?? 2);

/** The `|: … :|`'s last line: its last ending, or its `:|` with no endings after it. */
const endsBracket = (line: BarsLine, lines: Line[], next: number) =>
	line.ending ? !line.closes : line.closes && passes(lines, next) === 0;

/**
 * A `|: … :|` holding a bar line's `x N`, written out in play order once
 * its last line (its last ending's) is walked: MusicXML's repeats don't
 * nest, so no program plays the two backward repeats as barmark does.
 */
function bracketLine(w: Walk, line: BarsLine, from: number, lines: Line[], next: number): void {
	if (line.opens) w.bracket = { from, nested: false };
	const b = w.bracket;
	if (!b) return;
	if (!line.closes && line.repeat !== null) b.nested = true;
	if (!endsBracket(line, lines, next)) return;
	w.bracket = null;
	const bars = b.nested ? bracketPlays(w, b.from, closingPasses(line)) : [];
	if (bars.length) rewrite(w, b.from, bars);
}

const repeats = (m: Measure) =>
	m.marks.repeatStart || m.marks.repeatEnd !== null || m.marks.ending !== null;

/** A section's `x N`: repeat bar lines around it, or its passes written out when it holds repeats. */
function closeSection(w: Walk): void {
	const s = w.section;
	w.section = null;
	if (!s || s.repeat === null || w.out.length === s.from) return;
	const inside = w.out.slice(s.from);
	const o = occurrenceAt(w, s.line);
	if (inside.some(repeats) && o) {
		if (o.firstBar !== null && o.lastBar !== null)
			rewrite(w, s.from, w.parse.bars.slice(o.firstBar - 1, o.lastBar));
		return;
	}
	(inside[0] as Measure).marks.repeatStart = true;
	(inside[inside.length - 1] as Measure).marks.repeatEnd = s.repeat;
}

/**
 * Text waiting for a bar when a heading or the chart's end comes: after the
 * last bar written, at its section's foot, or before the heading when no bar
 * came before it. Taken before a section is closed, whose passes written out
 * would give it to their first bar.
 */
function closeText(w: Walk): void {
	const text = w.pending.text;
	w.pending.text = [];
	closeSection(w);
	const last = w.out[w.out.length - 1];
	if (!last) {
		w.pending.lead.push(...text);
		return;
	}
	last.foot.push(...text);
	if (last.played !== null) w.feet.set(last.played, last.foot);
}

function sectionLine(w: Walk, line: Extract<Line, { kind: "section" }>): void {
	closeText(w);
	const o = occurrenceAt(w, line.line);
	w.pending.heading = line.name;
	w.replay = null;
	if (o && o.replayOf !== null) {
		w.replay = w.out.length;
		playedOut(w, o);
	} else w.section = { from: w.out.length, repeat: line.repeat, line: line.line };
}

/** A text line goes below the next bar, or below a replay's first bar when it is the replay's own. */
function textLine(w: Walk, line: string): void {
	const note = /^#{3,}\s*/.exec(line);
	const t = { text: note ? line.slice(note[0].length) : line, note: note !== null };
	const replay = w.replay === null ? undefined : w.out[w.replay];
	if (replay) replay.text.push(t);
	else w.pending.text.push(t);
}

/** The bars as written, in written order, with the marks that play them in play order. */
export function writtenMeasures(parse: ChartParse): Measure[] {
	const firstPlay = new Map<number, PlayedBar>();
	for (const b of parse.bars) if (!firstPlay.has(b.written)) firstPlay.set(b.written, b);
	const w: Walk = {
		parse,
		out: [],
		written: 0,
		firstPlay,
		fermatas: fermataBars(parse.events),
		texts: new Map(),
		feet: new Map(),
		flattened: false,
		pending: nothing(),
		replay: null,
		section: null,
		bracket: null,
		orphans: [],
	};
	parse.lines.forEach((line, i) => {
		if (line.kind === "section") sectionLine(w, line);
		if (line.kind === "text") textLine(w, line.text);
		if (line.kind !== "bars") return;
		w.replay = null;
		const from = w.out.length;
		for (const cell of line.cells) cellIn(w, cell);
		lineMarks(w, line, from, parse.lines, i + 1);
		bracketLine(w, line, from, parse.lines, i + 1);
	});
	closeText(w);
	const out = w.flattened && hasJump(parse) ? inPlayOrder(w) : w.out;
	withLyrics(parse, out);
	return out;
}

const hasJump = (parse: ChartParse) =>
	parse.lines.some(
		(l) =>
			l.kind === "bars" &&
			l.cells.some((c) => c.kind === "direction" && c.direction.kind === "jump"),
	);

/**
 * The whole chart in play order, with no repeats or jumps: what a chart
 * needs when a jump passes through passes written out, since a written bar
 * can't play once after the jump and twice before it. Headings, rehearsal
 * marks, fermatas and text lines stay; the text lines of bars no pass
 * plays go after the last bar.
 */
function inPlayOrder(w: Walk): Measure[] {
	const headings = new Map<number, string>();
	for (const o of w.parse.sections) if (o.firstBar !== null) headings.set(o.firstBar, o.name);
	const out = w.parse.bars.map((b, i) => {
		const m = measureOf(b, w.fermatas);
		m.marks.heading = headings.get(b.index) ?? null;
		m.text = w.texts.get(b.index) ?? [];
		m.foot = w.feet.get(b.index) ?? [];
		if (i === 0) m.lead = w.out[0]?.lead ?? [];
		return m;
	});
	out.at(-1)?.foot.push(...w.orphans, ...unplayedText(w.out));
	return out;
}
