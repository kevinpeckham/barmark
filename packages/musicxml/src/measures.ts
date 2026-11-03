/**
 * The measures a part writes, in written order, with the marks that make a
 * notation program play them in the chart's play order: repeats, endings
 * and jumps where MusicXML says the same thing, and bars written out where
 * it can't (a replay, or a repeated section holding repeats of its own).
 */
import type {
	Cell,
	ChartParse,
	Direction,
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
	meter: Meter;
	key: Key | null;
	slots: Slot[];
	words: Words[];
	/** The part rests here (grammar 7.4). */
	tacet: boolean;
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

const measureOf = (b: PlayedBar): Measure => ({
	shown: b.written,
	meter: b.meter,
	key: b.key,
	slots: b.slots,
	words: b.words ?? [],
	tacet: b.tacet === true,
	marks: blank(),
});

type Walk = {
	parse: ChartParse;
	out: Measure[];
	written: number;
	firstPlay: Map<number, PlayedBar>;
	/** Marks waiting for the next measure. */
	pending: { heading: string | null; rehearsal: string | null; start: Direction[] };
	section: { from: number; repeat: Repeat; line: number } | null;
};

function add(w: Walk, m: Measure): void {
	m.marks.heading = w.pending.heading;
	m.marks.rehearsal = w.pending.rehearsal;
	m.marks.start = w.pending.start;
	w.pending = { heading: null, rehearsal: null, start: [] };
	w.out.push(m);
}

const occurrenceAt = (w: Walk, line: number) => w.parse.sections.find((o) => o.line === line);

/** An occurrence's bars as played, one measure each. */
function playedOut(w: Walk, o: SectionOccurrence): void {
	if (o.firstBar === null || o.lastBar === null) return;
	for (const b of w.parse.bars.slice(o.firstBar - 1, o.lastBar)) add(w, measureOf(b));
}

/** A bar no pass plays, as written. */
function unplayed(w: Walk, cell: Extract<Cell, { kind: "slots" | "simile" }>): Measure {
	const slots = cell.kind === "slots" ? cell.slots : [];
	const meter = cell.kind === "slots" && cell.meter ? cell.meter : { n: 4, d: 4 };
	return { shown: w.written, meter, key: null, slots, words: [], tacet: false, marks: blank() };
}

/** A written bar, with `%` resolved as the parser first played it. */
function writtenBar(w: Walk, cell: Extract<Cell, { kind: "slots" | "simile" }>): Measure {
	w.written++;
	const played = w.firstPlay.get(w.written);
	return played ? measureOf(played) : unplayed(w, cell);
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
		if (l.kind === "text") continue;
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
	if (o && o.replayOf !== null) playedOut(w, o);
	else w.section = { from: w.out.length, repeat: line.repeat, line: line.line };
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
		pending: { heading: null, rehearsal: null, start: [] },
		section: null,
	};
	parse.lines.forEach((line, i) => {
		if (line.kind === "section") sectionLine(w, line);
		if (line.kind !== "bars") return;
		const from = w.out.length;
		for (const cell of line.cells) cellIn(w, cell);
		lineMarks(w, line, from, parse.lines, i + 1);
	});
	closeSection(w);
	return w.out;
}
