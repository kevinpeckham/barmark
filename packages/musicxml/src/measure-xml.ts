/** One measure as MusicXML: attributes when they change, then its notes. */
import type { Direction, Key, SimpleSlot } from "barmark";
import type { MeasureEvents, SoundEvent } from "./events.js";
import { harmonyXml, noChordXml } from "./harmony.js";
import type { Marks, Measure } from "./measures.js";
import { noteSetOf, pitchesOf, type Sound, slashed, soundValueXml } from "./notes.js";
import { barLength, type Frac, noteValues } from "./rhythm.js";
import { el, text } from "./xml.js";

export type MeasureContext = {
	divisions: number;
	index: number;
	previous: Measure | null;
	clef: "G" | "F";
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
function slashStyleXml(m: Measure, prev: Measure | null): string {
	const on = slashed(m);
	if (prev ? on === slashed(prev) : !on) return "";
	return el(
		"measure-style",
		{},
		el("slash", on ? { type: "start", "use-stems": "no" } : { type: "stop" }),
	);
}

function attributesXml(m: Measure, ctx: MeasureContext): string {
	const prev = ctx.previous;
	const head = prev
		? [keyXml(m, prev), timeXml(m, prev), slashStyleXml(m, prev)]
		: [
				text("divisions", ctx.divisions),
				keyXml(m, null),
				timeXml(m, null),
				el("clef", {}, [text("sign", ctx.clef), text("line", CLEF_LINE[ctx.clef])]),
				slashStyleXml(m, null),
			];
	return head.some(Boolean) ? el("attributes", {}, head) : "";
}

const whole = (f: Frac, divisions: number) => (f.n * divisions) / f.d;

/** The chord symbol a slot sounds, if it names one. */
function harmonyOf(slot: SimpleSlot): string {
	if (slot.kind === "nc") return noChordXml();
	return slot.kind === "chord" && slot.chord.kind === "chord" ? harmonyXml(slot.chord) : "";
}

const wordsXml = (words: string) =>
	el("direction", { placement: "above" }, el("direction-type", {}, text("words", words)));

function soundOf(slot: SimpleSlot): Sound {
	if (slot.kind === "silence") return { kind: "rest" };
	const set = noteSetOf(slot);
	return set ? { kind: "notes", pitches: pitchesOf(set) } : { kind: "slash" };
}

/** One event: its words, its harmony, then its values, tied when one value can't write it. */
function eventXml(e: SoundEvent, divisions: number): string {
	const values = noteValues(e.length);
	const sound = soundOf(e.slot);
	const notes = values.map((v, i) =>
		soundValueXml(
			sound,
			v,
			whole(v.length, divisions),
			{ stop: i > 0 || e.tie.stop, start: i < values.length - 1 || e.tie.start },
			i === 0 ? e.articulation : undefined,
		),
	);
	return [
		...e.words.map(wordsXml),
		e.slot.kind === "unknown" ? wordsXml("?") : "",
		e.harmony ? harmonyOf(e.slot) : "",
		...notes,
	].join("");
}

const direction = (types: string, sound?: Record<string, string>) =>
	el("direction", { placement: "above" }, [
		el("direction-type", {}, types),
		sound ? el("sound", sound) : "",
	]);

const JUMP_WORDS = { start: "D.C.", segno: "D.S." };
const AL_WORDS = { fine: " al Fine", coda: " al Coda" };

function directionXml(d: Direction): string {
	if (d.kind === "segno") return direction(el("segno"), { segno: "s1" });
	if (d.kind === "coda") return direction(el("coda"), { coda: "c1" });
	if (d.kind === "to coda") return direction(text("words", "To Coda"), { tocoda: "c1" });
	if (d.kind === "fine") return direction(text("words", "Fine"), { fine: "yes" });
	const words = JUMP_WORDS[d.to] + (d.al ? AL_WORDS[d.al] : "");
	return direction(text("words", words), d.to === "start" ? { dacapo: "yes" } : { dalsegno: "s1" });
}

/** Before the notes: the heading, the rehearsal mark, Segno and Coda. */
function startXml(marks: Marks): string {
	return [
		marks.heading ? direction(text("words", marks.heading, { "font-weight": "bold" })) : "",
		marks.rehearsal ? direction(text("rehearsal", marks.rehearsal)) : "",
		...marks.start.map(directionXml),
	].join("");
}

/** After the notes: an open repeat's words, To Coda, Fine and the jump. */
function endXml(marks: Marks): string {
	return [
		marks.repeatEnd === "open" ? direction(text("words", "repeat as needed")) : "",
		...marks.end.map(directionXml),
	].join("");
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
	const body = m.tacet
		? el("note", {}, [
				el("rest", { measure: "yes" }),
				text("duration", whole(barLength(m.meter), ctx.divisions)),
				text("voice", 1),
			])
		: bar.events.map((e) => eventXml(e, ctx.divisions)).join("") + bar.after.map(wordsXml).join("");
	return el("measure", { number: ctx.index + 1, text: m.shown }, [
		attributesXml(m, ctx),
		leftBarlineXml(m.marks),
		startXml(m.marks),
		body,
		endXml(m.marks),
		rightBarlineXml(m.marks),
	]);
}
