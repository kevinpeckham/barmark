/**
 * A test player, two ways: what a MIDI file sounds at each beat, read with
 * `midi-file` alone, and what a chart sounds there, read from `parse.bars`
 * and the grammar alone (never `perform`), so the two check each other.
 * Each beat is heard a 64th note in, so a note ending on the beat doesn't
 * count and one starting on it does; a beat is its pitch classes, sorted
 * and joined by spaces, or "" for none.
 */
import {
	beatsOf,
	type ChartParse,
	type ChordRecord,
	type InstrumentName,
	instrumentInfo,
	memberShares,
	type PartBar,
	type PlayedBar,
	type SimpleSlot,
	type Slot,
} from "barmark";
import { type MidiEvent, parseMidi } from "midi-file";

/** How far into a beat it is heard: a 64th note, in quarters. */
const LISTEN = 1 / 16;
const EPSILON = 1e-9;

const heard = (pcs: Iterable<number>) => [...new Set(pcs)].sort((a, b) => a - b).join(" ");
/** A bar's beats in quarters from its start, as grammar 2.1 counts them: dotted quarters in 6/8, 9/8, 12/8. */
const beatOnsets = (n: number, d: number) => {
	const beats = beatsOf({ n, d });
	return Array.from({ length: beats }, (_, i) => (i * (4 * n)) / d / beats);
};

type FileNote = { pitch: number; on: number; off: number };
type FileMeter = { tick: number; n: number; d: number };

/** A track's notes, each note-on paired with the next note-off of its channel and pitch; its time signatures; its last tick. */
function readTrack(track: MidiEvent[]): { notes: FileNote[]; meters: FileMeter[]; end: number } {
	const notes: FileNote[] = [];
	const meters: FileMeter[] = [];
	const open = new Map<string, number[]>();
	let tick = 0;
	for (const e of track) {
		tick += e.deltaTime;
		if (e.type === "timeSignature") meters.push({ tick, n: e.numerator, d: e.denominator });
		if (e.type !== "noteOn" && e.type !== "noteOff") continue;
		const key = `${e.channel}:${e.noteNumber}`;
		if (e.type === "noteOn" && e.velocity > 0) open.set(key, [...(open.get(key) ?? []), tick]);
		else {
			const on = open.get(key)?.shift();
			if (on !== undefined) notes.push({ pitch: e.noteNumber, on, off: tick });
		}
	}
	return { notes, meters, end: tick };
}

/** For each beat of the file (from its time signatures), the pitch classes sounding a 64th note in, over every track. */
export function heardByBeat(bytes: Uint8Array): string[] {
	const midi = parseMidi(bytes);
	const ppq = midi.header.ticksPerBeat ?? 480;
	const tracks = midi.tracks.map(readTrack);
	const notes = tracks.flatMap((t) => t.notes);
	const meters = tracks.flatMap((t) => t.meters);
	const end = Math.max(0, ...tracks.map((t) => t.end));
	const out: string[] = [];
	for (let bar = 0; bar < end; ) {
		const meter = meters.filter((m) => m.tick <= bar).at(-1) ?? { n: 4, d: 4 };
		for (const beat of beatOnsets(meter.n, meter.d)) {
			const t = bar + (beat + LISTEN) * ppq;
			out.push(heard(notes.filter((x) => x.on <= t && t < x.off).map((x) => x.pitch % 12)));
		}
		bar += ((4 * meter.n) / meter.d) * ppq;
	}
	return out;
}

/** A slot on a line, at its onset and with its length in quarters; `sound` null for silence, undefined for a hold. */
type Heard = { at: number; length: number; slot: SimpleSlot; sound?: number[] | null };

const STEPS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** A spelled note's pitch class: its letter and every sharp or flat after it; an octave doesn't matter. */
const pitchClassOf = (name: string) => {
	const letter = STEPS[name[0] ?? "C"] ?? 0;
	const alter = [...name.slice(1)].reduce((a, c) => a + (c === "#" ? 1 : c === "b" ? -1 : 0), 0);
	return (((letter + alter) % 12) + 12) % 12;
};
const BASSES = new Set<InstrumentName>(["electric bass", "double bass"]);

/** What a slot sounds, as pitch classes (grammar 2.3, 4.2, 7.3): a chord on a bass instrument only its bass. */
function soundOf(slot: SimpleSlot, bassInstrument: boolean): number[] | null | undefined {
	if (slot.kind === "hold") return undefined;
	if (slot.kind !== "chord") return null;
	// A voicing or a note set sounds exactly its notes, on any instrument.
	if (slot.voicing) return slot.voicing.pitches.map(pitchClassOf);
	const record: ChordRecord = slot.chord;
	if (record.kind === "notes") return record.pitches.map(pitchClassOf);
	const bass = pitchClassOf(record.bass);
	return bassInstrument ? [bass] : [...record.pitches.map(pitchClassOf), bass];
}

/** A bar's slots, each simple slot at its onset and length (grammar 2.1, 2.2). */
function timedSlots(slots: Slot[], start: number, barLength: number): Heard[] {
	const out: Heard[] = [];
	let at = start;
	for (const s of slots) {
		const members = s.kind === "group" ? s.members : [s];
		memberShares(members).forEach((share, i) => {
			const length = (barLength / slots.length) * share;
			out.push({ at, length, slot: members[i] as SimpleSlot });
			at += length;
		});
	}
	return out;
}

const PUSH = { eighth: 1 / 2, sixteenth: 1 / 4 };
/**
 * Pushes (grammar 2.8): a pushed slot attacks early, taking the time from
 * the slot before it on the line, which ends there; a push no longer than
 * that slot leaves it on the beat (the controller's ruling: no written
 * chord is taken whole).
 */
function pushed(line: Heard[]): Heard[] {
	const out: Heard[] = [];
	for (const h of line) {
		const giver = out.at(-1);
		const push = h.slot.kind === "hold" || h.slot.kind === "unknown" ? undefined : h.slot.push;
		const by = push ? PUSH[push] : 0;
		if (giver && by > 0 && giver.length > by + EPSILON) {
			out[out.length - 1] = { ...giver, length: giver.length - by };
			out.push({ ...h, at: h.at - by, length: h.length + by });
		} else out.push(h);
	}
	return out;
}

/** A part's share of a played bar: its bar, or null where it's tacet. */
const partBarsOf = (bar: PlayedBar): PartBar[] => bar.parts ?? [bar.tacet ? null : bar];

/** Each line's slots in play order, by part and line name; a line not playing in a bar rests there. */
function linesOf(parse: ChartParse): Map<string, { bass: boolean; slots: Heard[] }> {
	const lines = new Map<string, { bass: boolean; slots: Heard[] }>();
	const named = (pb: PartBar, i: number) =>
		pb ? (pb.lines ?? [{ name: parse.parts[i]?.lines?.[0] ?? "", slots: pb.slots }]) : [];
	const key = (i: number, name: string) => `${i}.${name}`;
	for (const bar of parse.bars)
		partBarsOf(bar).forEach((pb, i) => {
			const instrument = parse.parts[i]?.instrument;
			const info = instrument ? instrumentInfo(instrument) : null;
			const bass = info !== null && BASSES.has(info.name);
			for (const l of named(pb, i)) lines.set(key(i, l.name), { bass, slots: [] });
		});
	let at = 0;
	for (const bar of parse.bars) {
		const length = (4 * bar.meter.n) / bar.meter.d;
		const playing = new Map<string, Slot[]>();
		partBarsOf(bar).forEach((pb, i) => {
			for (const l of named(pb, i)) playing.set(key(i, l.name), l.slots);
		});
		for (const [k, line] of lines)
			line.slots.push(...timedSlots(playing.get(k) ?? [{ kind: "nc" }], at, length));
		at += length;
	}
	return lines;
}

/** A line's slots with holds resolved: a `/` sounds what sounds before it, nothing after silence. */
function resolved(line: Heard[], bass: boolean): Heard[] {
	let before: number[] | null = null;
	return line.map((h) => {
		const own = soundOf(h.slot, bass);
		const sound: number[] | null = own === undefined ? before : own;
		before = sound;
		return { ...h, sound };
	});
}

/** For each beat of the chart, the pitch classes its lines sound a 64th note in, unioned. */
export function chartByBeat(parse: ChartParse): string[] {
	const lines = [...linesOf(parse).values()].map(({ bass, slots }) =>
		pushed(resolved(slots, bass)),
	);
	const out: string[] = [];
	let at = 0;
	for (const bar of parse.bars) {
		for (const beat of beatOnsets(bar.meter.n, bar.meter.d)) {
			const t = at + beat + LISTEN;
			const sounding = lines.flatMap((line) =>
				line
					.filter((h) => h.at <= t + EPSILON && t + EPSILON < h.at + h.length)
					.flatMap((h) => h.sound ?? []),
			);
			out.push(heard(sounding));
		}
		at += (4 * bar.meter.n) / bar.meter.d;
	}
	return out;
}
