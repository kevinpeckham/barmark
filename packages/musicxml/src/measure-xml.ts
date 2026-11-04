/** One measure as MusicXML: attributes when they change, then its notes. */
import type { Key, Meter } from "barmark";
import { type Beam, beamsOf } from "./beams.js";
import type { Clef } from "./clefs.js";
import { direction, feelXml, jumpXml, tempoXml, textXml, wordsXml } from "./directions.js";
import type { MeasureEvents, SoundEvent } from "./events.js";
import { slotHarmonyXml } from "./harmony.js";
import type { Marks, Measure } from "./measures.js";
import { type Sound, type Stem, soundOf, soundValueXml, type Tie } from "./notes.js";
import {
	barLength,
	beatLength,
	beatPieces,
	type Frac,
	frac,
	meterValues,
	type NoteValue,
	noteValues,
	plus,
} from "./rhythm.js";
import { splitStaves } from "./staves.js";
import { el, text } from "./xml.js";

export type MeasureContext = {
	divisions: number;
	index: number;
	previous: Measure | null;
	next: Measure | null;
	/** This bar's clef, and the bar before's (null for the first). */
	clef: { now: Clef; before: Clef | null };
	/** Octaves the part is written above where it sounds (a bass's 1). */
	octave: number;
	/** Whether this bar shows its rhythm (`rhythmic`): its slashes stemmed, in the meter's values. */
	rhythmic: boolean;
	/** Whether this bar shows slashes, and the bar before it (null for the first). */
	slashed: { now: boolean; before: boolean | null };
	/** Two for a keyboard: treble and bass, the slashes on the upper. */
	staves: 1 | 2;
};

const LETTER_FIFTHS: Record<string, number> = { F: -1, C: 0, G: 1, D: 2, A: 3, E: 4, B: 5 };
/** How far each mode's key signature sits from its tonic's major one, in fifths. */
const MODE_FIFTHS: Record<Key["mode"], number> = {
	major: 0,
	ionian: 0,
	lydian: 1,
	mixolydian: -1,
	dorian: -2,
	minor: -3,
	aeolian: -3,
	phrygian: -4,
	locrian: -5,
};

function fifthsOf(key: Key): number {
	const letter = LETTER_FIFTHS[key.tonic[0] ?? "C"] ?? 0;
	const alter = [...key.tonic.slice(1)].reduce(
		(a, c) => a + (c === "#" ? 1 : c === "b" ? -1 : 0),
		0,
	);
	return letter + 7 * alter + MODE_FIFTHS[key.mode];
}

const sameKey = (a: Key | null, b: Key | null) => a?.tonic === b?.tonic && a?.mode === b?.mode;

/** The key, when it is the first or a change. */
function keyXml(m: Measure, prev: Measure | null): string {
	if (!m.key || (prev && sameKey(m.key, prev.key))) return "";
	return el("key", {}, [text("fifths", fifthsOf(m.key)), text("mode", m.key.mode)]);
}

/** The time signature, when it is the first or a change. */
function timeXml(m: Measure, prev: Measure | null): string {
	if (prev && prev.meter.n === m.meter.n && prev.meter.d === m.meter.d) return "";
	return el("time", {}, [text("beats", m.meter.n), text("beat-type", m.meter.d)]);
}

const CLEF_LINE = { G: 2, F: 4 };

/** Slash style on from the first slashed measure, off for a measure of notes, and on again after. */
function slashStyleXml({ now: on, before }: MeasureContext["slashed"], staves: 1 | 2): string {
	if (before === null ? !on : on === before) return "";
	return el(
		"measure-style",
		staves === 2 ? { number: 1 } : {},
		el("slash", on ? { type: "start", "use-stems": "no" } : { type: "stop" }),
	);
}

/** The clef, on the first measure and wherever it changes. */
function clefXml({ now, before }: MeasureContext["clef"], staff?: number): string {
	if (now === before) return "";
	const sign = now === "F" ? "F" : "G";
	return el("clef", staff ? { number: staff } : {}, [
		text("sign", sign),
		text("line", CLEF_LINE[sign]),
		now === "G8vb" ? text("clef-octave-change", -1) : "",
	]);
}

/** What a part written above its sound adds back, on its first measure. */
const transposeXml = (octave: number) =>
	octave === 0
		? ""
		: el("transpose", {}, [
				text("diatonic", 0),
				text("chromatic", 0),
				text("octave-change", -octave),
			]);

/** A keyboard's two staves and their clefs on its first measure; one staff's clef where it changes. */
function clefsXml(ctx: MeasureContext): string {
	if (ctx.staves === 1) return clefXml(ctx.clef);
	if (ctx.previous) return "";
	const first = (clef: Clef, staff: number) => clefXml({ now: clef, before: null }, staff);
	return text("staves", 2) + first("G", 1) + first("F", 2);
}

function attributesXml(m: Measure, ctx: MeasureContext): string {
	const prev = ctx.previous;
	const slash = slashStyleXml(ctx.slashed, ctx.staves);
	const head = prev
		? [keyXml(m, prev), timeXml(m, prev), clefsXml(ctx), slash]
		: [
				text("divisions", ctx.divisions),
				keyXml(m, null),
				timeXml(m, null),
				clefsXml(ctx),
				transposeXml(ctx.octave),
				slash,
			];
	return head.some(Boolean) ? el("attributes", {}, head) : "";
}

const whole = (f: Frac, divisions: number) => (f.n * divisions) / f.d;

/** A written value: its type, where it starts in its bar, and its ties. */
type Written = { v: NoteValue; start: Frac; tie: Tie };

/** How an event is written: slash style one slash per beat; anything else in values that show the meter. */
function valuesOf(e: SoundEvent, sound: Sound, start: Frac, meter: Meter, rhythmic: boolean) {
	const beats = sound.kind === "slash" && !rhythmic;
	const pieces = beats ? beatPieces(start, e.length, beatLength(meter)) : [e.length];
	const written = (piece: Frac) =>
		beats ? noteValues(piece) : meterValues(start, piece, meter, sound.kind === "rest");
	let at = start;
	return pieces.flatMap((piece, p) =>
		written(piece).map((v, i, values): Written => {
			const value = {
				v,
				start: at,
				tie: {
					stop: i > 0 || (p === 0 && e.tie.stop),
					start: i < values.length - 1 || (p === pieces.length - 1 && e.tie.start),
				},
			};
			at = plus(at, v.length);
			return value;
		}),
	);
}

/** How a bar's values are drawn: their divisions, slash stems and clef. */
type BarStyle = {
	divisions: number;
	stem: Stem;
	clef: Clef;
	octave: number;
	voice: number;
	staff: number | null;
};

/** An event with what it sounds and how it is written. */
type EventValues = { e: SoundEvent; sound: Sound; values: Written[] };

/** One event: its words, its harmony, then its values, each with its beams. */
function eventXml(w: EventValues, style: BarStyle, beams: () => Beam[]): string {
	const { e, sound } = w;
	const notes = w.values.map(({ v, tie }, i) =>
		soundValueXml(sound, v, {
			duration: whole(v.length, style.divisions),
			tie,
			...(i === 0 && e.articulation ? { articulation: e.articulation } : {}),
			stem: style.stem,
			clef: style.clef,
			octave: style.octave,
			voice: style.voice,
			staff: style.staff,
			beams: beams(),
		}),
	);
	return [
		...e.words.map(wordsXml),
		e.slot.kind === "unknown" ? wordsXml("?") : "",
		e.harmony ? slotHarmonyXml(e.slot) : "",
		...notes,
	].join("");
}

/** Where a voice is written: its voice, its staff (null on a part of one), and that staff's clef. */
type Staff = { voice: number; staff: number | null; clef: Clef };

/** A staff's events, each at its place in the bar, beamed across the bar. */
function voiceXml(events: SoundEvent[], meter: Meter, ctx: MeasureContext, staff: Staff): string {
	const stem: Stem = ctx.rhythmic ? "up" : "none";
	let at = frac(0);
	const written = events.map((e): EventValues => {
		const sound = soundOf(e);
		const values = valuesOf(e, sound, at, meter, ctx.rhythmic);
		at = plus(at, e.length);
		return { e, sound, values };
	});
	const unbeamed = (s: Sound) => s.kind === "rest" || (s.kind === "slash" && stem === "none");
	const beams = beamsOf(
		written.flatMap((w) =>
			w.values.map((x) => ({ start: x.start, v: x.v, rest: unbeamed(w.sound) })),
		),
		meter,
	);
	let k = 0;
	const next = () => beams[k++] ?? [];
	const style = { divisions: ctx.divisions, stem, octave: ctx.octave, ...staff };
	return written.map((w) => eventXml(w, style, next)).join("");
}

const UPPER: Staff = { voice: 1, staff: 1, clef: "G" };
const LOWER: Staff = { voice: 5, staff: 2, clef: "F" };

/**
 * A whole-bar rest: a tacet bar's, or a keyboard's lower staff with nothing
 * to play. Shown: Dorico honours a hidden rest in some bars and not others.
 */
function measureRestXml(duration: number, staff: Staff): string {
	return el("note", {}, [
		el("rest", { measure: "yes" }),
		text("duration", duration),
		text("voice", staff.voice),
		staff.staff === null ? "" : text("staff", staff.staff),
	]);
}

const backupXml = (duration: number) => el("backup", {}, text("duration", duration));

/** A keyboard bar: the upper staff, then back to the bar's start for the lower. */
function stavesXml(bar: MeasureEvents, ctx: MeasureContext): string {
	const { meter } = bar.measure;
	const length = whole(barLength(meter), ctx.divisions);
	if (bar.events.length === 0)
		return measureRestXml(length, UPPER) + backupXml(length) + measureRestXml(length, LOWER);
	const { upper, lower } = splitStaves(bar);
	const plays = lower.some((e) => soundOf(e).kind === "notes");
	return [
		voiceXml(upper, meter, ctx, UPPER),
		...bar.after.map(wordsXml),
		backupXml(length),
		plays ? voiceXml(lower, meter, ctx, LOWER) : measureRestXml(length, LOWER),
	].join("");
}

/** A bar on one staff: its events and the words after them, or a tacet bar's rest. */
function staffXml(bar: MeasureEvents, ctx: MeasureContext): string {
	const { meter } = bar.measure;
	const one: Staff = { voice: 1, staff: null, clef: ctx.clef.now };
	if (bar.measure.tacet && bar.events.length === 0)
		return measureRestXml(whole(barLength(meter), ctx.divisions), one);
	return voiceXml(bar.events, meter, ctx, one) + bar.after.map(wordsXml).join("");
}

/** Before the notes: the heading, the rehearsal mark, tempo, feel, Segno, Coda and text lines. */
function startXml(m: Measure, ctx: MeasureContext): string {
	const { marks } = m;
	return [
		marks.heading ? direction(text("words", marks.heading, { "font-weight": "bold" })) : "",
		marks.rehearsal ? direction(text("rehearsal", marks.rehearsal)) : "",
		tempoXml(m, ctx.previous, ctx.next),
		feelXml(m, ctx.previous),
		...marks.start.map(jumpXml),
		textXml(m.text),
	].join("");
}

/** A repeat's words: an open one's, or a count above 2, which Dorico won't read from `times`. */
function repeatWords(end: Marks["repeatEnd"]): string {
	if (end === "open") return direction(text("words", "repeat as needed"));
	return typeof end === "number" && end > 2 ? direction(text("words", `×${end}`)) : "";
}

/** After the notes: a repeat's words, To Coda, Fine and the jump. */
function endXml(marks: Marks): string {
	return [repeatWords(marks.repeatEnd), ...marks.end.map(jumpXml)].join("");
}

const endingXml = (marks: Marks, type: string | null | undefined) =>
	marks.ending && type ? el("ending", { number: marks.ending.numbers.join(", "), type }) : "";

function leftBarlineXml(marks: Marks): string {
	const ending = endingXml(marks, marks.ending?.start ? "start" : null);
	if (!ending && !marks.repeatStart) return "";
	return el("barline", { location: "left" }, [
		marks.repeatStart ? text("bar-style", "heavy-light") : "",
		ending,
		marks.repeatStart ? el("repeat", { direction: "forward" }) : "",
	]);
}

const backwardXml = (end: Marks["repeatEnd"]) =>
	end === null
		? ""
		: el("repeat", { direction: "backward", times: end === "open" ? undefined : end });

function rightBarlineXml(marks: Marks): string {
	const ending = endingXml(marks, marks.ending?.stop);
	const repeat = backwardXml(marks.repeatEnd);
	if (!ending && !repeat && !marks.fermata) return "";
	return el("barline", { location: "right" }, [
		repeat ? text("bar-style", "light-heavy") : "",
		marks.fermata ? el("fermata") : "",
		ending,
		repeat,
	]);
}

export function measureXml(bar: MeasureEvents, ctx: MeasureContext): string {
	const m = bar.measure;
	const body = ctx.staves === 2 ? stavesXml(bar, ctx) : staffXml(bar, ctx);
	return el("measure", { number: ctx.index + 1, text: m.shown }, [
		attributesXml(m, ctx),
		leftBarlineXml(m.marks),
		startXml(m, ctx),
		body,
		endXml(m.marks),
		rightBarlineXml(m.marks),
	]);
}
