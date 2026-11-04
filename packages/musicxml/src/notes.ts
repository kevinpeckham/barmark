/** Notes as MusicXML <note>s: slash notes, rests, and the real notes of note sets and voicings. */
import type { Articulation, ChordRecord, Slot, WrittenInterval } from "barmark";
import type { Beam } from "./beams.js";
import type { Clef } from "./clefs.js";
import type { MeasureEvents, SoundEvent } from "./events.js";
import { beatLength, type Frac, type NoteValue, onBeat, plus } from "./rhythm.js";
import { writtenPitch } from "./written.js";
import { el, text } from "./xml.js";

export type Pitch = { step: string; alter: number; octave: number };

/** What a value sounds: a rest, a slash, or real notes. */
export type Sound = { kind: "rest" } | { kind: "slash" } | { kind: "notes"; pitches: Pitch[] };

export type Tie = { start: boolean; stop: boolean };

const SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const height = (p: Pitch) => p.octave * 12 + (SEMITONES[p.step] ?? 0) + p.alter;
const MIDDLE_C = height({ step: "C", alter: 0, octave: 4 });

/** A note set's pitches: written octaves kept; the rest rise from the note before, or from octave 4. */
export function pitchesOf(record: ChordRecord): Pitch[] {
	const out: Pitch[] = [];
	for (const label of record.pitches) {
		const m = /^([A-G])([#b]*)(-?\d+)?$/.exec(label);
		const step = m?.[1] ?? "C";
		const alter = [...(m?.[2] ?? "")].reduce((a, c) => a + (c === "#" ? 1 : -1), 0);
		const prev = out[out.length - 1];
		const p = { step, alter, octave: m?.[3] ? Number(m[3]) : (prev?.octave ?? 4) };
		if (!m?.[3] && prev) while (height(p) <= height(prev)) p.octave++;
		out.push(p);
	}
	return out;
}

/** The note set a slot plays: its own, or its chord's voicing. */
export function noteSetOf(slot: Slot): ChordRecord | null {
	if (slot.kind !== "chord") return null;
	if (slot.voicing) return slot.voicing;
	return slot.chord.kind === "notes" ? slot.chord : null;
}

/** What an event sounds: a rest, a slash, or real notes; a hold sounds what it holds. */
export function soundOf(e: SoundEvent): Sound {
	if (e.notes) return e.notes.length > 0 ? { kind: "notes", pitches: e.notes } : { kind: "rest" };
	const slot = e.held ?? e.slot;
	if (slot.kind === "silence") return { kind: "rest" };
	const set = noteSetOf(slot);
	return set ? { kind: "notes", pitches: pitchesOf(set) } : { kind: "slash" };
}

/**
 * A bar shows its rhythm when something sounds anew off the beat (a push's
 * early note, a group's member, a triplet): a hold continues, so it doesn't
 * count.
 */
export function rhythmic(bar: MeasureEvents): boolean {
	const beat = beatLength(bar.measure.meter);
	let at: Frac = { n: 0, d: 1 };
	return bar.events.some((e) => {
		const off = e.slot.kind !== "hold" && !onBeat(at, beat);
		at = plus(at, e.length);
		return off;
	});
}

/**
 * A bar shows slashes in slash style unless it writes real notes or a rest
 * (a program draws slash style over a rest and hides it: Dorico does), or
 * shows its rhythm.
 */
export const slashed = (bar: MeasureEvents) =>
	!bar.measure.tacet && bar.events.every((e) => soundOf(e).kind === "slash") && !rhythmic(bar);

/** Whether a note sounds below middle C. */
export const belowMiddleC = (p: Pitch) => height(p) < MIDDLE_C;

const tieEnds = (name: string, tie: Tie) => [
	tie.stop ? el(name, { type: "stop" }) : "",
	tie.start ? el(name, { type: "start" }) : "",
];

/** A value's type, dots and tuplet, after its duration and voice. */
const valueXml = (v: NoteValue, voice: number) => [
	text("voice", voice),
	text("type", v.type),
	...Array.from({ length: v.dots }, () => el("dot")),
	v.tuplet
		? el("time-modification", {}, [
				text("actual-notes", v.tuplet.actual),
				text("normal-notes", v.tuplet.normal),
			])
		: "",
];

const ARTICULATIONS: Record<Articulation, string> = {
	accent: el("accent"),
	hit: el("accent") + el("staccato"),
};

/** How a slash's stem is written: none in slash style, up when it shows a rhythm. */
export type Stem = "none" | "up";

type Pitched = {
	chord: boolean;
	pitch: Pitch;
	slash: Stem | null;
	articulation?: Articulation;
};

/** How one written value is drawn, beyond its type: its duration, ties, accent, stem and beams. */
export type ValueStyle = {
	duration: number;
	tie: Tie;
	articulation?: Articulation;
	stem: Stem;
	beams: Beam[];
	/** The clef in force: a slash sits on its staff's middle line. */
	clef: Clef;
	/** How far a note is written above where it sounds (barmark's grammar 7.3). */
	written: WrittenInterval;
	/** The voice, and the staff of a part on two (null on one). */
	voice: number;
	staff: number | null;
};

const staffXml = (staff: number | null) => (staff === null ? "" : text("staff", staff));

function pitchedXml(n: Pitched, v: NoteValue, style: ValueStyle): string {
	const { duration, tie } = style;
	const notations = [
		...tieEnds("tied", tie),
		n.articulation ? el("articulations", {}, ARTICULATIONS[n.articulation]) : "",
	];
	return el("note", {}, [
		n.chord ? el("chord") : "",
		el("pitch", {}, [
			text("step", n.pitch.step),
			n.pitch.alter ? text("alter", n.pitch.alter) : "",
			text("octave", n.pitch.octave),
		]),
		text("duration", duration),
		...tieEnds("tie", tie),
		...valueXml(v, style.voice),
		n.slash ? text("stem", n.slash) : "",
		n.slash ? text("notehead", "slash") : "",
		staffXml(style.staff),
		...(n.chord ? [] : style.beams.map((b, i) => text("beam", b, { number: i + 1 }))),
		notations.some(Boolean) ? el("notations", {}, notations) : "",
	]);
}

/** Each staff's middle line, where a slash sits. */
const SLASH: Record<Clef, Pitch> = {
	G: { step: "B", alter: 0, octave: 4 },
	F: { step: "D", alter: 0, octave: 3 },
	G8vb: { step: "B", alter: 0, octave: 3 },
	C: { step: "C", alter: 0, octave: 4 },
};

/** One written value of a sound: a rest, a slash note, or a chord of notes. */
export function soundValueXml(sound: Sound, v: NoteValue, style: ValueStyle): string {
	if (sound.kind === "rest")
		return el("note", {}, [
			el("rest"),
			text("duration", style.duration),
			...valueXml(v, style.voice),
			staffXml(style.staff),
		]);
	const pitches =
		sound.kind === "slash"
			? [SLASH[style.clef]]
			: sound.pitches.map((p) => writtenPitch(p, style.written));
	const slash = sound.kind === "slash" ? style.stem : null;
	return pitches
		.map((pitch, i) => {
			const articulation = i === 0 ? style.articulation : undefined;
			return pitchedXml(
				{ chord: i > 0, pitch, slash, ...(articulation ? { articulation } : {}) },
				v,
				style,
			);
		})
		.join("");
}
