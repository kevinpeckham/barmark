/**
 * One part's marks on one measure, sorted into what barmark makes of them
 * (the design's "What it reads" and "The export's own marks"): a heading,
 * a rehearsal mark, text lines, words on the bar, direction cells, and the
 * tempo and feel a directive line will carry.
 */
import { type Direction, parseBarLine, parseDirectiveLine, printDirection } from "barmark";
import { cmp, type Frac, ZERO } from "../rhythm.js";
import type { Losses } from "./losses.js";
import type { Mark, ReadMeasure } from "./read.js";
import { child, children, textOf } from "./tree.js";

/** A direction cell (grammar 5.2) or `...`: before the bar's first slot, or after its last. */
export type Cell = { kind: Direction["kind"] | "fermata"; text: string; before: boolean };

export type TempoMarks = {
	/** A `<metronome>`, in quarter notes a minute. */
	metronome: number | null;
	/** A `<sound tempo>`: quarter notes a minute. */
	sound: number | null;
	/** rit. or accel. words, with the tempo they name, if any. */
	change: { kind: "rit" | "accel"; to: number | null } | null;
	aTempo: boolean;
};

export type MeasureMarks = {
	headings: string[];
	rehearsals: string[];
	/** Text lines before the bar, after its heading. */
	textLines: string[];
	/** Text lines before the bar's heading: words below written ahead of it. */
	leadLines: string[];
	/** Text lines after the bar: words below written after its notes. */
	footLines: string[];
	words: { text: string; at: Frac }[];
	cells: Cell[];
	/** The jump a `<sound>` makes with no words to name it, its `al` still to settle. */
	soundJump: "D.C." | "D.S." | null;
	question: boolean;
	tempo: TempoMarks;
	feel: string | null;
};

/** Text as barmark writes it: no-break spaces (the export's after a leading "A") plain, whitespace collapsed. */
const tidy = (text: string) => text.replace(/\s+/g, " ").trim();

/** The measure, its part's name, whether the file is the export's own, the marks written ahead of its heading, and whether it has a `<swing>`. */
type Context = {
	m: ReadMeasure;
	part: string;
	losses: Losses;
	own: boolean;
	ahead: Set<Mark>;
	swing: boolean;
	/** Whether plain words naming a section are a heading: another program's file, its first part. */
	sections: boolean;
};

const atStart = (mark: Mark) => cmp(mark.at, ZERO) === 0;

/**
 * A section's name, perhaps numbered or lettered (`Verse 2`, `Chorus B`).
 * `Coda` is left out: plain, it is the coda sign's direction (grammar 5.2).
 */
const SECTION =
	/^((?:intro|verse|pre-chorus|chorus|bridge|solo|interlude|break|tag|outro|ending|refrain|instrumental)(?: (?:\d+|[a-z]))?)[:.]?$/i;

const aboveAtStart = (mark: Mark) =>
	mark.kind === "words" && mark.placement !== "below" && atStart(mark);

/** Bold words over the start of the bar: a heading, in any file. */
const isBoldHeading = (mark: Mark) => aboveAtStart(mark) && mark.bold;

/**
 * The heading words over the start of the bar give: bold words, or on the
 * first part of another program's file (where Dorico writes system text,
 * with no `font-weight`) plain, not italic words naming a section, a
 * trailing `:` or `.` left out. Null when they aren't one.
 */
function headingOf(mark: Mark, text: string, c: Context): string | null {
	if (isBoldHeading(mark)) return text;
	if (!c.sections || !aboveAtStart(mark) || mark.node.attrs["font-style"] === "italic") return null;
	return SECTION.exec(text)?.[1] ?? null;
}

/**
 * A text line's place: before the heading, after the notes, or before the
 * notes. Only the export's own files say "before the heading" by writing
 * the line first; another program's direction order means nothing.
 */
function textPlace(mark: Mark, c: Context): "leadLines" | "footLines" | "textLines" {
	if (atStart(mark) && c.ahead.has(mark)) return "leadLines";
	const end = cmp(c.m.length, ZERO) > 0 && cmp(mark.at, c.m.length) >= 0;
	return end ? "footLines" : "textLines";
}

const blank = (): MeasureMarks => ({
	headings: [],
	rehearsals: [],
	textLines: [],
	leadLines: [],
	footLines: [],
	words: [],
	cells: [],
	soundJump: null,
	question: false,
	tempo: { metronome: null, sound: null, change: null, aTempo: false },
	feel: null,
});

/** Words that spell a direction (grammar 5.2's table), as the direction. */
function directionOf(text: string): Direction | null {
	if (text.includes("|")) return null;
	const cell = parseBarLine(`| ${text} |`, 0).bars?.cells;
	const [only] = cell ?? [];
	return cell?.length === 1 && only?.kind === "direction" ? only.direction : null;
}

/** A direction cell; only a sign (Segno, Coda) goes before the bar: a jump, To Coda and Fine act at its end, where play takes them. */
function addCell(out: MeasureMarks, kind: Cell["kind"], text: string, start: boolean): void {
	const before = start && (kind === "segno" || kind === "coda");
	if (!out.cells.some((c) => c.kind === kind)) out.cells.push({ kind, text, before });
}

/** "×3" beside a repeat played three times, or "repeat as needed" beside an open one. */
function repeatWords(text: string, m: ReadMeasure): boolean {
	if (!m.repeatEnd) return false;
	if (/^repeat as needed$/i.test(text)) return m.repeatEnd.times === 1;
	const count = /^[×xX]\s*(\d+)$/.exec(text)?.[1];
	return count !== undefined && Number(count) === m.repeatEnd.times;
}

/** Words that are a gradual tempo change (grammar 7.2) or its end. */
function tempoWords(text: string, out: MeasureMarks): boolean {
	const change = parseDirectiveLine(`tempo: ${text}`, 0);
	const read = change?.diagnostics.length === 0 ? change.set.tempoChange : undefined;
	if (!read) return false;
	if (read.kind === "a tempo") out.tempo.aTempo = true;
	else out.tempo.change = { kind: read.kind, to: read.to };
	return true;
}

/** The feel a value names in its canonical spelling, or null when it isn't one. */
function feelText(text: string): string | null {
	const read = parseDirectiveLine(`feel: ${text}`, 0);
	const set = read?.diagnostics.length === 0 ? read.set : null;
	if (!set?.feel) return null;
	return set.swingPercent === undefined ? set.feel : `${set.feel} ${set.swingPercent}%`;
}

/** The words the export writes beside a `<swing>`: the feel's name, which says its amount exactly. */
function feelWords(text: string, c: Context, out: MeasureMarks): boolean {
	if (!c.swing) return false;
	const feel = feelText(text);
	if (feel !== null) out.feel = feel;
	return feel !== null;
}

/** Words that stand for something else: a repeat's count, a direction, a tempo change, a feel. */
function meaningful(mark: Mark, text: string, c: Context, out: MeasureMarks): boolean {
	if (repeatWords(text, c.m) || tempoWords(text, out) || feelWords(text, c, out)) return true;
	const direction = directionOf(text);
	if (direction) addCell(out, direction.kind, printDirection(direction), atStart(mark));
	return direction !== null;
}

/** Words over the bar: a heading, the export's `?`, or what they stand for, else words on the bar. */
function wordsAbove(mark: Mark, text: string, out: MeasureMarks, c: Context): void {
	const heading = headingOf(mark, text, c);
	if (heading !== null) out.headings.push(heading);
	else if (text === "?" && c.m.harmonies.length === 0) out.question = true;
	// The export writes its own marks over the whole score (`system`): in its
	// files other words are a bar's words, whatever they say.
	else if ((c.own && !mark.system) || !meaningful(mark, text, c, out))
		out.words.push({ text, at: mark.at });
}

/**
 * Words: below the staff a text line (italic, a `###` note), before the
 * heading when written ahead of it and after the bar when written after its
 * notes; else read as words above.
 */
function readWords(mark: Mark, out: MeasureMarks, c: Context): void {
	const text = tidy(mark.text);
	if (text === "") return;
	const italic = mark.node.attrs["font-style"] === "italic";
	if (mark.placement !== "below") wordsAbove(mark, text, out, c);
	else out[textPlace(mark, c)].push(italic ? `### ${text}` : text);
}

const UNIT_QUARTERS: Record<string, number> = {
	whole: 4,
	half: 2,
	quarter: 1,
	eighth: 1 / 2,
	"16th": 1 / 4,
	"32nd": 1 / 8,
};

/** A `<metronome>` in quarter notes a minute, or null when it names no number. */
function metronomeQuarters(node: Mark["node"]): number | null {
	const perMinute = /\d+(?:\.\d+)?/.exec(textOf(node, "per-minute"))?.[0];
	const unit = UNIT_QUARTERS[textOf(node, "beat-unit")];
	if (perMinute === undefined || unit === undefined) return null;
	const dots = children(node, "beat-unit-dot").length;
	return Number(perMinute) * unit * (2 - 0.5 ** dots);
}

const SOUND_CELLS: [string, Cell["kind"], string][] = [
	["segno", "segno", "Segno"],
	["coda", "coda", "Coda"],
	["tocoda", "to coda", "To Coda"],
	["fine", "fine", "Fine"],
];

/** A `<sound>`'s tempo and the direction cells it plays; its own words, when written, came first. */
function readSound(mark: Mark, out: MeasureMarks): void {
	const a = mark.node.attrs;
	const tempo = Number(a.tempo);
	if (a.tempo !== undefined && tempo > 0) out.tempo.sound = tempo;
	for (const [attr, kind, text] of SOUND_CELLS)
		if (a[attr] !== undefined) addCell(out, kind, text, atStart(mark));
	if (a.dacapo === "yes" || a.dalsegno !== undefined)
		out.soundJump = a.dacapo === "yes" ? "D.C." : "D.S.";
}

/** A `<swing>` as a feel: straight, or a kind with an amount when it isn't the triplet feel. */
function swingFeel(node: Mark["node"]): string | null {
	if (child(node, "straight")) return "straight";
	const first = Number(textOf(node, "first"));
	const second = Number(textOf(node, "second"));
	if (!(first > 0 && second > 0)) return null;
	const kind =
		textOf(node, "swing-type") === "16th"
			? "swing 16"
			: textOf(node, "swing-style") === "shuffle"
				? "shuffle"
				: "swing";
	if (first === 2 * second) return kind;
	return feelText(`${kind} ${Number(((100 * first) / (first + second)).toFixed(1))}%`);
}

function readRehearsal(mark: Mark, out: MeasureMarks, c: Context): void {
	const label = tidy(mark.text).replace(/[^A-Za-z0-9]/g, "");
	if (label) out.rehearsals.push(label);
	else
		c.losses.add(
			"rehearsal",
			"a rehearsal mark that isn't letters or digits left out",
			c.part,
			c.m.number,
		);
}

function readMetronome(mark: Mark, out: MeasureMarks, c: Context): void {
	const quarters = metronomeQuarters(mark.node);
	if (quarters !== null) out.tempo.metronome = quarters;
	else c.losses.add("metronome", "a metronome mark with no tempo left out", c.part, c.m.number);
}

function readSwing(mark: Mark, out: MeasureMarks, c: Context): void {
	const feel = swingFeel(mark.node);
	if (out.feel === null && feel !== null) out.feel = feel;
	if (feel === null)
		c.losses.add("swing", "a swing barmark can't write left out", c.part, c.m.number);
}

const READERS: Record<Mark["kind"], (mark: Mark, out: MeasureMarks, c: Context) => void> = {
	words: readWords,
	rehearsal: readRehearsal,
	segno: (mark, out) => addCell(out, "segno", "Segno", atStart(mark)),
	coda: (mark, out) => addCell(out, "coda", "Coda", atStart(mark)),
	metronome: readMetronome,
	sound: (mark, out) => readSound(mark, out),
	swing: readSwing,
};

/** A fermata on the bar line closing the measure, or on its last attack. */
function fermataAtEnd(m: ReadMeasure): boolean {
	if (m.fermataEnd) return true;
	return m.lines.some((line) => line.at(-1)?.fermata === true);
}

/** One part's marks on one measure (`firstPart`: the score's first). Words are read before `<sound>`s, which add only what words didn't name. */
export function readMarks(
	m: ReadMeasure,
	part: string,
	losses: Losses,
	own: boolean,
	firstPart = true,
): MeasureMarks {
	const out = blank();
	// Built once: working these out per word would be quadratic in the marks.
	const ahead = new Set(own ? m.marks.slice(0, Math.max(m.marks.findIndex(isBoldHeading), 0)) : []);
	const swing = m.marks.some((k) => k.kind === "swing");
	const c: Context = { m, part, losses, own, ahead, swing, sections: !own && firstPart };
	const words = m.marks.filter((k) => k.kind === "words");
	for (const mark of [...words, ...m.marks.filter((k) => k.kind !== "words")])
		READERS[mark.kind](mark, out, c);
	if (fermataAtEnd(m)) out.cells.unshift({ kind: "fermata", text: "...", before: false });
	return out;
}
