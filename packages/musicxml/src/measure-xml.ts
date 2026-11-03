/** One measure as MusicXML: attributes when they change, then its notes. */
import type { Key, SimpleSlot, Slot } from "barmark";
import { harmonyXml, noChordXml } from "./harmony.js";
import type { Measure } from "./measures.js";
import { noteSetOf, pitchesOf, type Sound, slashed, soundValueXml } from "./notes.js";
import { barLength, type Frac, memberLength, noteValues, slotLengths } from "./rhythm.js";
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

/** One slot's sound for `length`: tied values when one can't write it. */
function simpleXml(slot: SimpleSlot, length: Frac, divisions: number): string {
	const values = noteValues(length);
	const sound = soundOf(slot);
	const articulation = slot.kind === "chord" ? slot.articulation : undefined;
	const notes = values.map((v, i) =>
		soundValueXml(
			sound,
			v,
			whole(v.length, divisions),
			{ stop: i > 0, start: i < values.length - 1 },
			i === 0 ? articulation : undefined,
		),
	);
	return (slot.kind === "unknown" ? wordsXml("?") : "") + harmonyOf(slot) + notes.join("");
}

function slotXml(slot: Slot, length: Frac, divisions: number): string {
	if (slot.kind !== "group") return simpleXml(slot, length, divisions);
	return slot.members
		.map((m) => simpleXml(m, memberLength(length, slot.members.length), divisions))
		.join("");
}

/** The slots, each after the words written before it; words at the end come last. */
function slotsXml(m: Measure, divisions: number): string {
	const before = (at: number) =>
		m.words
			.filter((w) => w.at === at)
			.map((w) => wordsXml(w.text))
			.join("");
	const slots = slotLengths(m.slots, m.meter).map(
		(len, i) => before(i) + slotXml(m.slots[i] as Slot, len, divisions),
	);
	return slots.join("") + before(m.slots.length);
}

export function measureXml(m: Measure, ctx: MeasureContext): string {
	const body = m.tacet
		? el("note", {}, [
				el("rest", { measure: "yes" }),
				text("duration", whole(barLength(m.meter), ctx.divisions)),
				text("voice", 1),
			])
		: slotsXml(m, ctx.divisions);
	return el("measure", { number: ctx.index + 1, text: m.shown }, [attributesXml(m, ctx), body]);
}
