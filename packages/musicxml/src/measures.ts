/**
 * The measures a part writes, in written order, with the marks that make a
 * notation program play them in the chart's play order: repeats, endings
 * and jumps where MusicXML says the same thing, and bars written out where
 * it can't (a replay, or a repeated section holding repeats of its own).
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
	/** Text lines written before the measure (lyrics, `###` notes, prose). */
	text: { text: string; note: boolean }[];
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
	marks: { ...blank(), rehearsal: b.rehearsal ?? null, fermata: fermatas.has(b.index) },
});

type Pending = {
	heading: string | null;
	rehearsal: string | null;
	start: Direction[];
	text: Measure["text"];
};

const nothing = (): Pending => ({ heading: null, rehearsal: null, start: [], text: [] });

type Walk = {
	parse: ChartParse;
	out: Measure[];
	written: number;
	firstPlay: Map<number, PlayedBar>;
	fermatas: Set<number>;
	/** Each played bar's text lines, so a bar written out again keeps them. */
	texts: Map<number, Measure["text"]>;
	/** Some section's passes were written out. */
	flattened: boolean;
	/** Marks waiting for the next measure. */
	pending: Pending;
	/** The first measure of the replay being walked, which takes its section's text lines. */
	replay: number | null;
	section: { from: number; repeat: Repeat; line: number } | null;
};

function add(w: Walk, m: Measure): void {
	m.marks.heading = w.pending.heading;
	m.marks.rehearsal = w.pending.rehearsal ?? m.marks.rehearsal;
	m.marks.start = w.pending.start;
	const own = m.played === null ? undefined : w.texts.get(m.played);
	m.text = own ? [...own, ...w.pending.text] : w.pending.text;
	if (m.played !== null && !own) w.texts.set(m.played, m.text);
	w.pending = nothing();
	w.out.push(m);
}

const occurrenceAt = (w: Walk, line: number) => w.parse.sections.find((o) => o.line === line);

/** An occurrence's bars as played, one measure each. */
function playedOut(w: Walk, o: SectionOccurrence): void {
	if (o.firstBar === null || o.lastBar === null) return;
	for (const b of w.parse.bars.slice(o.firstBar - 1, o.lastBar)) add(w, measureOf(b, w.fermatas));
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
	else if (cell.kind === "direction") {
		const before = cell.direction.kind === "segno" || cell.direction.kind === "coda";
		if (before) w.pending.start.push(cell.direction);
		else last?.marks.end.push(cell.direction);
	}
}

/** The passes a repeat closed by this ending plays: the highest number of its endings. */
function passes(lines: Line[], i: number): number {
	let max = 0;
	for (const l of lines.slice(i)) {
		if (l.kind === "text" || l.kind === "credit") continue;
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
		const heading = inside[0]?.marks.heading ?? null;
		w.out.length = s.from;
		w.pending.heading = heading;
		w.flattened = true;
		playedOut(w, o);
		return;
	}
	(inside[0] as Measure).marks.repeatStart = true;
	(inside[inside.length - 1] as Measure).marks.repeatEnd = s.repeat;
}

function sectionLine(w: Walk, line: Extract<Line, { kind: "section" }>): void {
	closeSection(w);
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
		flattened: false,
		pending: nothing(),
		replay: null,
		section: null,
	};
	parse.lines.forEach((line, i) => {
		if (line.kind === "section") sectionLine(w, line);
		if (line.kind === "text") textLine(w, line.text);
		if (line.kind !== "bars") return;
		w.replay = null;
		const from = w.out.length;
		for (const cell of line.cells) cellIn(w, cell);
		lineMarks(w, line, from, parse.lines, i + 1);
	});
	closeSection(w);
	w.out[w.out.length - 1]?.text.push(...w.pending.text);
	return w.flattened && hasJump(parse) ? inPlayOrder(w) : w.out;
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
 * marks, fermatas and text lines stay.
 */
function inPlayOrder(w: Walk): Measure[] {
	const headings = new Map<number, string>();
	for (const o of w.parse.sections) if (o.firstBar !== null) headings.set(o.firstBar, o.name);
	return w.parse.bars.map((b) => {
		const m = measureOf(b, w.fermatas);
		m.marks.heading = headings.get(b.index) ?? null;
		m.text = w.texts.get(b.index) ?? [];
		return m;
	});
}
