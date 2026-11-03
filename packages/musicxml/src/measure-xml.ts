/** One measure as MusicXML: attributes when they change, then its notes. */
import type { Key, SimpleSlot, Slot } from "barmark";
import { harmonyXml, noChordXml } from "./harmony.js";
import type { Measure } from "./measures.js";
import {
	barLength,
	type Frac,
	memberLength,
	type NoteValue,
	noteValues,
	slotLengths,
} from "./rhythm.js";
import { el, text } from "./xml.js";

export type MeasureContext = { divisions: number; index: number; previous: Measure | null };

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

function attributesXml(m: Measure, ctx: MeasureContext): string {
	const prev = ctx.previous;
	const head = prev
		? [keyXml(m, prev), timeXml(m, prev)]
		: [
				text("divisions", ctx.divisions),
				keyXml(m, null),
				timeXml(m, null),
				el("clef", {}, [text("sign", "G"), text("line", 2)]),
				el("measure-style", {}, el("slash", { type: "start", "use-stems": "no" })),
			];
	return head.some(Boolean) ? el("attributes", {}, head) : "";
}

const whole = (f: Frac, divisions: number) => (f.n * divisions) / f.d;

type Tie = { start: boolean; stop: boolean };

const tieEnds = (name: string, tie: Tie) => [
	tie.stop ? el(name, { type: "stop" }) : "",
	tie.start ? el(name, { type: "start" }) : "",
];

/** A value's type, dot and tuplet, after its duration and voice. */
const valueXml = (v: NoteValue) => [
	text("voice", 1),
	text("type", v.type),
	v.dot ? el("dot") : "",
	v.tuplet
		? el("time-modification", {}, [
				text("actual-notes", v.tuplet.actual),
				text("normal-notes", v.tuplet.normal),
			])
		: "",
];

const restXml = (v: NoteValue, divisions: number) =>
	el("note", {}, [el("rest"), text("duration", whole(v.length, divisions)), ...valueXml(v)]);

/** A slash note on B4, tied to its neighbours when one value can't write the slot. */
function slashXml(v: NoteValue, divisions: number, tie: Tie): string {
	const tied = tieEnds("tied", tie);
	return el("note", {}, [
		el("pitch", {}, [text("step", "B"), text("octave", 4)]),
		text("duration", whole(v.length, divisions)),
		...tieEnds("tie", tie),
		...valueXml(v),
		text("stem", "none"),
		text("notehead", "slash"),
		tied.some(Boolean) ? el("notations", {}, tied) : "",
	]);
}

/** The chord symbol a slot sounds, if it names one. */
function harmonyOf(slot: SimpleSlot): string {
	if (slot.kind === "nc") return noChordXml();
	return slot.kind === "chord" && slot.chord.kind === "chord" ? harmonyXml(slot.chord) : "";
}

/** One slot's sound for `length`: tied values when one can't write it. */
function soundXml(slot: SimpleSlot, length: Frac, divisions: number): string {
	const values = noteValues(length);
	if (slot.kind === "silence") return values.map((v) => restXml(v, divisions)).join("");
	return (
		harmonyOf(slot) +
		values
			.map((v, i) => slashXml(v, divisions, { stop: i > 0, start: i < values.length - 1 }))
			.join("")
	);
}

function slotXml(slot: Slot, length: Frac, divisions: number): string {
	if (slot.kind !== "group") return soundXml(slot, length, divisions);
	return slot.members
		.map((m) => soundXml(m, memberLength(length, slot.members.length), divisions))
		.join("");
}

export function measureXml(m: Measure, ctx: MeasureContext): string {
	const body = m.tacet
		? el("note", {}, [
				el("rest", { measure: "yes" }),
				text("duration", whole(barLength(m.meter), ctx.divisions)),
				text("voice", 1),
			])
		: slotLengths(m.slots, m.meter)
				.map((len, i) => slotXml(m.slots[i] as Slot, len, ctx.divisions))
				.join("");
	return el("measure", { number: ctx.index + 1, text: m.shown }, [attributesXml(m, ctx), body]);
}
