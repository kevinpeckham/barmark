/**
 * The score's structure bar by bar (the design's "What it reads" and
 * "Sections and repeats"): headings, rehearsal marks, text lines, words,
 * direction cells, directives, one-bar meters, repeats and endings. Marks
 * of the whole score are read once, from whichever parts carry them. When
 * barmark can't hold the repeats as written, the bars come in played order.
 */
import { beatsOf, type Meter } from "barmark";
import { beatLength, div, type Frac } from "../rhythm.js";
import { directiveLines, type Settings, statesOf } from "./directives.js";
import type { Losses } from "./losses.js";
import { type MeasureMarks, readMarks } from "./marks.js";
import { playedOrder } from "./order.js";
import type { ReadMeasure, ReadScore } from "./read.js";
import { type DirectionCell, placeStructure, type Repeats, repeatsOf } from "./repeats.js";

export type BarInfo = {
	/** The measure's index in each part's `measures`. */
	index: number;
	/** The file's measure `number`. */
	measure: string;
	/** A one-bar meter (grammar 2.4): a `<time>` that reverts on the next measure, or a pickup. */
	meter: Meter | null;
	heading: string | null;
	rehearsal: string | null;
	/** A directive line before the bar, such as `"key: G, tempo: 120"`. */
	directives: string | null;
	textLines: string[];
	/** Words on the bar; `at` is the beat they fall in, from 0, the bar's beat count for its end. */
	words: { text: string; at: number }[];
	/** The bar carries the export's `?` words alone: an unknown bar (Task 8 writes `?`). */
	question: boolean;
	/** Cells between bars before this one and after it: directions (5.2) and `...`. */
	before: string[];
	after: string[];
	opens: boolean;
	/** The bar closes a repeat played this many times, or open-ended (`x ...`); on an ending bar always 2, a plain `:|`, as the endings give the count (grammar 5.1). */
	closes: number | "open" | null;
	/** The ending (5.1) this bar is part of: on every bar from its start to its stop. */
	ending: number[] | null;
};

export type Structure = { bars: BarInfo[]; writtenOut: boolean };

const WRITTEN_OUT =
	"repeats, endings or jumps barmark can't hold as written; bars written out in played order";

/** Each item once, in order: marks two parts share are read once, marks that differ kept from each. */
const once = <T>(items: T[], key: (t: T) => string = String): T[] =>
	items.filter((t, i) => items.findIndex((u) => key(u) === key(t)) === i);

const first = <T>(items: (T | null)[]): T | null => items.find((t) => t !== null) ?? null;

/** The parts' marks at one measure as the score's. */
function settingsOf(measures: (ReadMeasure | undefined)[], marks: MeasureMarks[]): Settings {
	const tempos = marks.map((m) => m.tempo);
	return {
		key: first(measures.map((m) => m?.key ?? null)),
		time: first(measures.map((m) => m?.time ?? null)),
		tempo: {
			metronome: first(tempos.map((t) => t.metronome)),
			sound: first(tempos.map((t) => t.sound)),
			change: first(tempos.map((t) => t.change)),
			aTempo: tempos.some((t) => t.aTempo),
		},
		feel: first(marks.map((m) => m.feel)),
	};
}

/** Words at a beat of the bar's meter: the beat they fall in, the bar's end after its last. */
function beatOf(at: Frac, meter: Meter): number {
	const beats = beatsOf(meter);
	const beat = div(at, beatLength(meter));
	return Math.max(0, Math.min(beats, Math.floor(beat.n / beat.d)));
}

type Jumps = { toCoda: boolean; fine: boolean };

/** A jump only a `<sound>` names: `al Coda` when the score has a To Coda, `al Fine` when it has a Fine. */
function jumpText(jump: MeasureMarks["soundJump"], jumps: Jumps): string | null {
	if (jump === null) return null;
	return jump + (jumps.toCoda ? " al Coda" : jumps.fine ? " al Fine" : "");
}

function cellsOf(marks: MeasureMarks[], jumps: Jumps): Pick<BarInfo, "before" | "after"> {
	const cells = marks.flatMap((m) => m.cells);
	const named = cells.some((c) => c.kind === "jump");
	const jump = named ? null : jumpText(first(marks.map((m) => m.soundJump)), jumps);
	const text = (before: boolean) =>
		once(cells.filter((c) => c.before === before).map((c) => c.text));
	return { before: text(true), after: [...text(false), ...(jump === null ? [] : [jump])] };
}

type Context = { losses: Losses; jumps: Jumps };

/** The heading and rehearsal mark; a second heading is kept as a text line, a second mark is a loss. */
function namesOf(marks: MeasureMarks[], measure: string, c: Context) {
	const [heading = null, ...more] = once(marks.flatMap((m) => m.headings));
	const [rehearsal = null, ...others] = once(marks.flatMap((m) => m.rehearsals));
	if (others.length > 0)
		c.losses.add("rehearsals", "a second rehearsal mark on a bar left out", undefined, measure);
	return { heading, rehearsal, extra: more };
}

function barInfo(
	i: number,
	measures: (ReadMeasure | undefined)[],
	marks: MeasureMarks[],
	meter: Meter,
	c: Context,
): Omit<BarInfo, keyof Repeats | "directives"> {
	const read = measures.find((m) => m !== undefined) as ReadMeasure;
	const own = read.oneBar ?? meter;
	const { heading, rehearsal, extra } = namesOf(marks, read.number, c);
	const words = marks.flatMap((m) => m.words.map((w) => ({ text: w.text, at: beatOf(w.at, own) })));
	return {
		index: i,
		measure: read.number,
		meter: read.oneBar,
		heading,
		rehearsal,
		textLines: once([...extra, ...marks.flatMap((m) => m.textLines)]),
		words: once(words, (w) => `${w.at}|${w.text}`),
		question: marks.some((m) => m.question),
		...cellsOf(marks, c.jumps),
	};
}

/** A bar as played order writes it: no repeats, endings or jumps; a fermata stays. */
const flattened = (bar: BarInfo, directives: string | null): BarInfo => ({
	...bar,
	directives,
	opens: false,
	closes: null,
	ending: null,
	before: [],
	after: bar.after.filter((t) => t === "..."),
	textLines: [...bar.textLines],
	words: bar.words.map((w) => ({ ...w })),
});

/** The bars without the direction cells barmark can't place, each a loss. */
function withoutCells(bars: BarInfo[], dropped: DirectionCell[], losses: Losses): BarInfo[] {
	for (const c of dropped) {
		const bar = bars[c.bar] as BarInfo;
		const side = c.before ? bar.before : bar.after;
		side.splice(side.indexOf(c.text), 1);
		losses.add(
			`direction ${c.text}`,
			`a ${c.text} barmark can't place left out`,
			undefined,
			bar.measure,
		);
	}
	return bars;
}

/** The score's structure bar by bar, in written order, or in played order when the repeats can't be held. */
export function readStructure(score: ReadScore, losses: Losses): Structure {
	const parts = score.parts.map((p) => p.measures);
	const count = Math.max(0, ...parts.map((p) => p.length));
	const at = (i: number) => parts.map((p) => p[i]);
	const own = score.software?.startsWith("@barmark/musicxml") ?? false;
	const marks = Array.from({ length: count }, (_, i) =>
		score.parts.flatMap((p) => {
			const m = p.measures[i];
			return m ? [readMarks(m, p.name, losses, own)] : [];
		}),
	);
	const all = marks.flat().flatMap((m) => m.cells);
	const c: Context = {
		losses,
		jumps: {
			toCoda: all.some((x) => x.kind === "to coda"),
			fine: all.some((x) => x.kind === "fine"),
		},
	};
	const states = statesOf(marks.map((m, i) => settingsOf(at(i), m)));
	const repeats = repeatsOf(parts, count);
	const written = Array.from({ length: count }, (_, i) => i);
	const lines = directiveLines(states, written);
	const bars = written.map(
		(i): BarInfo => ({
			...barInfo(i, at(i), marks[i] ?? [], states[i]?.time ?? { n: 4, d: 4 }, c),
			directives: lines[i] ?? null,
			...(repeats[i] as Repeats),
		}),
	);
	const placed = placeStructure(bars.map((b) => ({ ...b, heading: b.heading !== null })));
	if (placed.holds) return { bars: withoutCells(bars, placed.dropped, losses), writtenOut: false };
	losses.note({ severity: "warning", message: WRITTEN_OUT });
	const longest = parts.reduce((a, p) => (p.length > a.length ? p : a), [] as ReadMeasure[]);
	const order = playedOrder(longest, losses);
	const played = directiveLines(states, order);
	return {
		bars: order.map((i, k) => flattened(bars[i] as BarInfo, played[k] ?? null)),
		writtenOut: true,
	};
}
