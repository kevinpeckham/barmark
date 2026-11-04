/** Notes as MusicXML <note>s: slash notes, rests, and the real notes of note sets and voicings. */
import type { Articulation, ChordRecord, Slot } from "barmark";
import type { MeasureEvents, SoundEvent } from "./events.js";
import type { Measure } from "./measures.js";
import { beatLength, type Frac, type NoteValue, onBeat, plus } from "./rhythm.js";
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

const allSlots = (m: Measure) => m.slots.flatMap((s) => (s.kind === "group" ? s.members : [s]));

/** What an event sounds: a rest, a slash, or real notes; a hold sounds what it holds. */
export function soundOf(e: SoundEvent): Sound {
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

/** A bass clef when most of a part's written notes sit below middle C. */
export function clefFor(measures: Measure[]): "G" | "F" {
	const pitches = measures.flatMap((m) =>
		allSlots(m).flatMap((s) => {
			const set = noteSetOf(s);
			return set ? pitchesOf(set) : [];
		}),
	);
	const low = pitches.filter((p) => height(p) < MIDDLE_C).length;
	return pitches.length > 0 && low > pitches.length / 2 ? "F" : "G";
}

const tieEnds = (name: string, tie: Tie) => [
	tie.stop ? el(name, { type: "stop" }) : "",
	tie.start ? el(name, { type: "start" }) : "",
];

/** A value's type, dots and tuplet, after its duration and voice. */
const valueXml = (v: NoteValue) => [
	text("voice", 1),
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

function pitchedXml(n: Pitched, v: NoteValue, duration: number, tie: Tie): string {
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
		...valueXml(v),
		n.slash ? text("stem", n.slash) : "",
		n.slash ? text("notehead", "slash") : "",
		notations.some(Boolean) ? el("notations", {}, notations) : "",
	]);
}

const SLASH: Pitch = { step: "B", alter: 0, octave: 4 };

/** One written value of a sound: a rest, a slash note, or a chord of notes. */
export function soundValueXml(
	sound: Sound,
	v: NoteValue,
	duration: number,
	tie: Tie,
	articulation?: Articulation,
	stem: Stem = "none",
): string {
	if (sound.kind === "rest")
		return el("note", {}, [el("rest"), text("duration", duration), ...valueXml(v)]);
	const pitches = sound.kind === "slash" ? [SLASH] : sound.pitches;
	return pitches
		.map((pitch, i) =>
			pitchedXml(
				{
					chord: i > 0,
					pitch,
					slash: sound.kind === "slash" ? stem : null,
					...(i === 0 && articulation ? { articulation } : {}),
				},
				v,
				duration,
				tie,
			),
		)
		.join("");
}
