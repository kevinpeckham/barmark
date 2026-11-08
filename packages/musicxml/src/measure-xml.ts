/** One measure as MusicXML: attributes when they change, then its notes. */
import type { Key, Meter, WrittenInterval } from "barmark";
import { type Marked, marksAtStart, marksBefore, marksOf, writesNotes } from "./bare.js";
import { type Beam, beamsOf } from "./beams.js";
import type { Clef } from "./clefs.js";
import {
	feelXml,
	jumpXml,
	ownText,
	scoreDirection,
	tempoXml,
	textXml,
	wordsXml,
} from "./directions.js";
import type { MeasureEvents, SoundEvent } from "./events.js";
import { slotHarmonyXml } from "./harmony.js";
import { lyricsXml } from "./lyrics.js";
import type { Marks, Measure } from "./measures.js";
import { type Sound, type Stem, soundOf, soundValueXml, type Tie } from "./notes.js";
import { pedalXml } from "./pedal.js";
import {
	barLength,
	beatLength,
	beatPieces,
	cmp,
	type Frac,
	frac,
	meterValues,
	type NoteValue,
	noteValues,
	pickupMeter,
	plus,
} from "./rhythm.js";
import { splitStaves } from "./staves.js";
import { transposeXml, writtenKey } from "./written.js";
import { el, text } from "./xml.js";

export type MeasureContext = {
	divisions: number;
	index: number;
	previous: Measure | null;
	next: Measure | null;
	/** The part opens with a pickup (`opensWithPickup`): its first measure is measure 0, implicit. */
	pickup: boolean;
	/** This bar's clef, and the bar before's (null for the first). */
	clef: { now: Clef; before: Clef | null };
	/** How far the part is written above where it sounds (a bass's octave; barmark's grammar 7.3). */
	written: WrittenInterval;
	/** Whether this bar shows its rhythm (`rhythmic`): its slashes stemmed, in the meter's values. */
	rhythmic: boolean;
	/** Whether this bar shows slashes, and the bar before it (null for the first). */
	slashed: { now: boolean; before: boolean | null };
	/** Two for a keyboard: treble and bass, the slashes on the upper. */
	staves: 1 | 2;
	/** Each of a part's lines' events in this bar, its first line's first (barmark's grammar 7.6); absent when it writes none. */
	lines?: SoundEvent[][];
	/** The part's bare line in this bar, when it writes one there beside its named lines (grammar 7.6). */
	bare?: MeasureEvents;
	/** Whether this part writes the score's marks: the top part, or a part exported alone. */
	score: boolean;
	/** The first measure of a lyric row's staff, marked so the import reads it back as one. */
	lyricRow?: true;
};

const LETTER_FIFTHS: Record<string, number> = { F: -1, C: 0, G: 1, D: 2, A: 3, E: 4, B: 5 };
/** How far each mode's key signature sits from its tonic's major one, in fifths. */
export const MODE_FIFTHS: Record<Key["mode"], number> = {
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

export function fifthsOf(key: Key): number {
	const letter = LETTER_FIFTHS[key.tonic[0] ?? "C"] ?? 0;
	const alter = [...key.tonic.slice(1)].reduce(
		(a, c) => a + (c === "#" ? 1 : c === "b" ? -1 : 0),
		0,
	);
	return letter + 7 * alter + MODE_FIFTHS[key.mode];
}

const sameKey = (a: Key | null, b: Key | null) => a?.tonic === b?.tonic && a?.mode === b?.mode;

/** The key, when it is the first or a change. */
function keyXml(m: Measure, prev: Measure | null, written: WrittenInterval): string {
	if (!m.key || (prev && sameKey(m.key, prev.key))) return "";
	return el("key", {}, [
		text("fifths", writtenKey(fifthsOf(m.key), written)),
		text("mode", m.key.mode),
	]);
}

/**
 * Whether a part's first measure is a pickup MusicXML can say: a one-bar meter shorter
 * than the `time:` meter (grammar 2.4), then a bar in that meter, and a length a reader
 * counting the running meter's beat reads back as the same meter. An implicit measure has
 * no meter of its own, so `[1/4]` in 6/8, which would read back `[2/8]`, keeps its own
 * time signature, as does `| [2/4] G | % |`, two bars of 2/4.
 */
function opensWithPickup([first, second]: Measure[]): boolean {
	if (!first?.time || second?.time) return false;
	const length = barLength(first.meter);
	const back = pickupMeter(length, first.time);
	return (
		cmp(length, barLength(first.time)) < 0 && back?.n === first.meter.n && back.d === first.meter.d
	);
}

/** The meter a measure's time signature shows: a pickup shows the running meter. */
const shownMeter = (m: Measure, index: number, pickup: boolean): Meter =>
	pickup && index === 0 ? (m.time ?? m.meter) : m.meter;

/** The time signature, when it is the first or a change. */
function timeXml(m: Measure, ctx: MeasureContext): string {
	const meter = shownMeter(m, ctx.index, ctx.pickup);
	const prev = ctx.previous && shownMeter(ctx.previous, ctx.index - 1, ctx.pickup);
	if (prev && prev.n === meter.n && prev.d === meter.d) return "";
	return el("time", {}, [text("beats", meter.n), text("beat-type", meter.d)]);
}

const CLEF_LINE: Record<string, number> = { G: 2, F: 4, C: 3 };

const slashStyle = (on: boolean) =>
	el(
		"measure-style",
		{},
		el("slash", on ? { type: "start", "use-stems": "no" } : { type: "stop" }),
	);

/**
 * Slash style on from the first slashed measure, off for a measure of notes, and on again
 * after. A keyboard's two staves never turn it on: its slash notes already carry slash
 * noteheads and no stems, and Verovio slashes both staves (whole-bar rests and all) from
 * `<measure-style number="1">`. Its first measure turns it off instead, as Verovio carries
 * slash style on from the part before.
 */
function slashStyleXml({ now: on, before }: MeasureContext["slashed"], staves: 1 | 2): string {
	if (staves === 2) return before === null ? slashStyle(false) : "";
	if (before === null ? !on : on === before) return "";
	return slashStyle(on);
}

/** A rhythm staff's percussion clef, on one line. */
const RHYTHM_CLEF =
	el("clef", {}, text("sign", "percussion")) + el("staff-details", {}, text("staff-lines", 1));

/** The clef, on the first measure and wherever it changes. */
function clefXml({ now, before }: MeasureContext["clef"], staff?: number): string {
	if (now === before) return "";
	if (now === "rhythm") return RHYTHM_CLEF;
	const sign = now === "G8vb" ? "G" : now;
	return el("clef", staff ? { number: staff } : {}, [
		text("sign", sign),
		text("line", CLEF_LINE[sign] ?? 2),
		now === "G8vb" ? text("clef-octave-change", -1) : "",
	]);
}

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
		? [keyXml(m, prev, ctx.written), timeXml(m, ctx), clefsXml(ctx), slash]
		: [
				text("divisions", ctx.divisions),
				keyXml(m, null, ctx.written),
				timeXml(m, ctx),
				clefsXml(ctx),
				transposeXml(ctx.written),
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
	written: WrittenInterval;
	voice: number;
	staff: number | null;
	noteStem?: "up" | "down";
	/** The staff a pedal mark goes under: a keyboard's lower; null on one staff. */
	pedalStaff: number | null;
};

/** An event with what it sounds and how it is written. */
type EventValues = { e: SoundEvent; sound: Sound; values: Written[] };

/** One event: its words, its harmony, then its values, each with its beams. */
function eventXml(w: EventValues, style: BarStyle, beams: () => Beam[], before = ""): string {
	const { e, sound } = w;
	const lyrics = e.lyrics?.length ? lyricsXml(e.lyrics) : "";
	const notes = w.values.map(({ v, tie }, i) =>
		soundValueXml(sound, v, {
			duration: whole(v.length, style.divisions),
			tie,
			...(i === 0 && e.articulation ? { articulation: e.articulation } : {}),
			...(i === 0 && lyrics ? { lyrics } : {}),
			stem: style.stem,
			clef: style.clef,
			written: style.written,
			voice: style.voice,
			staff: style.staff,
			...(style.noteStem ? { noteStem: style.noteStem } : {}),
			beams: beams(),
		}),
	);
	return [
		before,
		...e.words.map(wordsXml),
		...(e.pedal ?? []).map((p) => pedalXml(p, style.pedalStaff)),
		e.slot.kind === "unknown" ? wordsXml("?") : "",
		e.harmony ? slotHarmonyXml(e.slot, style.written) : "",
		...notes,
	].join("");
}

/** Where a voice is written: its voice, its staff (null on a part of one), that staff's clef, and its notes' stems on a shared staff. */
type Staff = { voice: number; staff: number | null; clef: Clef; noteStem?: "up" | "down" };

/** A staff's events, each at its place in the bar, beamed across the bar. */
function voiceXml(
	events: SoundEvent[],
	meter: Meter,
	ctx: MeasureContext,
	staff: Staff,
	marks: Marked[] = [],
): string {
	const stem: Stem = ctx.rhythmic ? "up" : "none";
	let at = frac(0);
	const starts: Frac[] = [];
	const written = events.map((e): EventValues => {
		const sound = soundOf(e);
		const values = valuesOf(e, sound, at, meter, ctx.rhythmic);
		starts.push(at);
		at = plus(at, e.length);
		return { e, sound, values };
	});
	const before = marksBefore(starts, marks, (f) => whole(f, ctx.divisions));
	const unbeamed = (s: Sound) => s.kind === "rest" || (s.kind === "slash" && stem === "none");
	const beams = beamsOf(
		written.flatMap((w) =>
			w.values.map((x) => ({ start: x.start, v: x.v, rest: unbeamed(w.sound) })),
		),
		meter,
	);
	let k = 0;
	const next = () => beams[k++] ?? [];
	const pedalStaff = ctx.staves === 2 ? 2 : null;
	const style = { divisions: ctx.divisions, stem, written: ctx.written, pedalStaff, ...staff };
	return written.map((w, i) => eventXml(w, style, next, before[i])).join("");
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

/**
 * Where each of a part's lines is written (barmark's grammar 7.6): on two
 * staves the first line on the upper, the second on the lower, a third and
 * fourth as second voices on those staves; on one staff voices 1 to 4.
 */
export function voicesFor(staves: 1 | 2, lines: number): { voice: number; staff: number }[] {
	const places =
		staves === 2
			? [
					{ voice: 1, staff: 1 },
					{ voice: 5, staff: 2 },
					{ voice: 2, staff: 1 },
					{ voice: 6, staff: 2 },
				]
			: [1, 2, 3, 4].map((voice) => ({ voice, staff: 1 }));
	return places.slice(0, lines);
}

/**
 * A bare line with notes of its own beside named lines (grammar 7.6): the
 * next voice on the upper staff, after the named lines' places.
 */
function besideNamed(places: { voice: number; staff: number }[]): { voice: number; staff: number } {
	const upper = places.filter((p) => p.staff === 1).map((p) => p.voice);
	return { voice: Math.max(0, ...upper) + 1, staff: 1 };
}

/** Each line's place, clef and stems: a staff two lines share stems its first line up and the others down. */
function lineStaves(ctx: MeasureContext, places: { voice: number; staff: number }[]): Staff[] {
	const shared = (staff: number) => places.filter((p) => p.staff === staff).length > 1;
	return places.map((p, i) => ({
		voice: p.voice,
		staff: ctx.staves === 2 ? p.staff : null,
		clef: ctx.staves === 2 ? (p.staff === 1 ? "G" : "F") : ctx.clef.now,
		...(shared(p.staff) ? { noteStem: i < ctx.staves ? ("up" as const) : ("down" as const) } : {}),
	}));
}

const resting = (events: SoundEvent[]) => events.every((e) => soundOf(e).kind === "rest");

/**
 * A bar of a part's lines: each line in its voice, back to the bar's start
 * between them. A staff's first line rests the bar where it has nothing to
 * play; a second voice resting writes nothing.
 */
function linesXml(bar: MeasureEvents, named: SoundEvent[][], ctx: MeasureContext): string {
	const { meter } = bar.measure;
	const length = whole(barLength(meter), ctx.divisions);
	const { lines, places, marks } = withBare(named, ctx);
	const staves = lineStaves(ctx, places);
	const written = lines.flatMap((events, i) => {
		const staff = staves[i];
		if (!staff) return [];
		const over = i === 0 ? marks : [];
		if (!resting(events)) return [voiceXml(events, meter, ctx, staff, over)];
		const before = marksAtStart(over, (f) => whole(f, ctx.divisions));
		return i < ctx.staves ? [before + measureRestXml(length, staff)] : [];
	});
	const [first, ...rest] = written;
	const after = [...bar.after, ...(ctx.bare?.after ?? [])];
	return [first ?? "", ...after.map(wordsXml), ...rest.map((x) => backupXml(length) + x)].join("");
}

/**
 * The lines a bar writes and where: the named lines in their places, and a
 * bare line beside them either as marks over the first (chords, slashes,
 * words) or, when it writes notes, as one more voice on the upper staff.
 */
function withBare(named: SoundEvent[][], ctx: MeasureContext) {
	const places = voicesFor(ctx.staves, named.length);
	const bare = ctx.bare?.events;
	if (!bare) return { lines: named, places, marks: [] };
	if (writesNotes(bare))
		return { lines: [...named, bare], places: [...places, besideNamed(places)], marks: [] };
	return { lines: named, places, marks: marksOf(bare, ctx.written) };
}

/** A bar on one staff: its events and the words after them, or a tacet bar's rest. */
function staffXml(bar: MeasureEvents, ctx: MeasureContext): string {
	const { meter } = bar.measure;
	const one: Staff = { voice: 1, staff: null, clef: ctx.clef.now };
	if (bar.measure.tacet && bar.events.length === 0)
		return measureRestXml(whole(barLength(meter), ctx.divisions), one);
	return voiceXml(bar.events, meter, ctx, one) + bar.after.map(wordsXml).join("");
}

/** The score's marks before the notes: the heading, the rehearsal mark, tempo, feel, Segno and Coda. */
function scoreStartXml(m: Measure, ctx: MeasureContext): string {
	const { marks } = m;
	return [
		marks.heading
			? scoreDirection(text("words", ownText(marks.heading), { "font-weight": "bold" }))
			: "",
		marks.rehearsal ? scoreDirection(text("rehearsal", marks.rehearsal)) : "",
		tempoXml(m, ctx.previous, ctx.next),
		feelXml(m, ctx.previous),
		...marks.start.map(jumpXml),
	].join("");
}

/**
 * Before the notes: the score's own (top part only): text before the heading, the chart's
 * description, and its marks; then the part's own text lines. A description in every part
 * was shown once per part.
 */
const startXml = (m: Measure, ctx: MeasureContext) =>
	(ctx.score ? textXml(m.lead) + scoreStartXml(m, ctx) : "") + textXml(m.text);

/**
 * How far back from the bar's end a repeat's words stand, in divisions: its last beat
 * (in the bar's own meter), so they sit over the bar the repeat ends. Written at the
 * bar's end, Verovio and Dorico drew them over the next bar. A whole number, as a beat
 * of a compound meter may not be: it only places the words.
 */
const lastBeat = (m: Measure, divisions: number) =>
	Math.max(1, Math.round(whole(beatLength(m.meter), divisions)));

/** A repeat's words: an open one's, or a count above 2, which Dorico won't read from `times`. */
function repeatWords(m: Measure, divisions: number): string {
	const end = m.marks.repeatEnd;
	const words =
		end === "open" ? "repeat as needed" : typeof end === "number" && end > 2 ? `×${end}` : "";
	if (!words) return "";
	return scoreDirection(text("words", words)).replace(
		"</direction-type></direction>",
		`</direction-type>${text("offset", -lastBeat(m, divisions))}</direction>`,
	);
}

/** After the notes (top part only): a repeat's words, To Coda, Fine and the jump. */
function endXml(m: Measure, ctx: MeasureContext): string {
	return ctx.score ? [repeatWords(m, ctx.divisions), ...m.marks.end.map(jumpXml)].join("") : "";
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
	end === null ? "" : el("repeat", { direction: "backward", times: end === "open" ? 1 : end });

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

/** A measure's place among a part's measures: its index, the measures either side, and whether the part opens with a pickup. */
export const placeIn = (measures: Measure[], index: number) => ({
	index,
	previous: measures[index - 1] ?? null,
	next: measures[index + 1] ?? null,
	pickup: opensWithPickup(measures),
});

/** A measure's number and, for a pickup, `implicit`: MuseScore numbers its pickup 0. */
const numbering = ({ index, pickup }: MeasureContext) =>
	pickup ? { number: index, ...(index === 0 ? { implicit: "yes" } : {}) } : { number: index + 1 };

export function measureXml(bar: MeasureEvents, ctx: MeasureContext): string {
	const m = bar.measure;
	const body = ctx.lines
		? linesXml(bar, ctx.lines, ctx)
		: ctx.staves === 2
			? stavesXml(bar, ctx)
			: staffXml(bar, ctx);
	return el("measure", { ...numbering(ctx), text: m.shown }, [
		// A processing instruction: other programs ignore it, the importer reads a lyric row.
		ctx.lyricRow ? "<?barmark lyrics?>" : "",
		attributesXml(m, ctx),
		leftBarlineXml(m.marks),
		startXml(m, ctx),
		bar.lift === "start" ? pedalXml("stop", ctx.staves === 2 ? 2 : null) : "",
		body,
		bar.lift === "end" ? pedalXml("stop", ctx.staves === 2 ? 2 : null) : "",
		endXml(m, ctx),
		textXml(m.foot),
		rightBarlineXml(m.marks),
	]);
}
