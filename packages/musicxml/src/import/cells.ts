/** A line's bars as cells: chords, voicings, note sets, rests and holds on barmark's grid. */
import { type Meter, parseBarLine } from "barmark";
import { cmp, type Frac, ZERO } from "../rhythm.js";
import { type Event, placeBar } from "./grid.js";
import type { Attack } from "./read.js";

/** A chord symbol read from a `<harmony>`: its slot symbol, and the program's text when that is `?`. */
export type Chord = { at: Frac; slot: string; original: string | null };

/** A measure as all of a part's lines share it: its length, its own meter and its chords. */
export type Bar = { number: string; length: Frac; meter: Meter; chords: Chord[] };

/** An unreadable chord's place (measure index, slot index) and the program's own text. */
export type Unread = { measure: number; at: number; text: string };

/** One line read bar by bar: its cells, and what didn't come through (by measure number). */
export type LineRead = {
	cells: (string | null)[];
	offGrid: string[];
	moved: string[];
	stray: string[];
	unread: Unread[];
};

/** How a line is read: whether it carries the chords, and whether its notes are read. */
export type Reading = { chords: boolean; notes: boolean };

type Pitch = Attack["pitches"][number];

const LETTERS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** A pitch's place, in semitones: `B#3` sounds as C4. */
function semitone(p: Pitch): number {
	const accidental = [...p.name.slice(1)].reduce((s, c) => s + (c === "#" ? 1 : -1), 0);
	return (LETTERS[p.name[0] ?? "C"] ?? 0) + accidental + 12 * p.octave;
}

/** Pitches as a note set, low to high with octaves, the first marked root as `!` (grammar 4, 4.1). */
function noteSet(pitches: Pitch[]): string {
	const seen = new Set<string>();
	const unique = pitches.filter((p) => {
		const key = `${p.name}${p.octave}`;
		const fresh = !seen.has(key);
		seen.add(key);
		return fresh;
	});
	const root = unique.find((p) => p.root);
	const sorted = [...unique].sort((a, b) => semitone(a) - semitone(b));
	return `{${sorted.map((p) => `${p.name}${p.octave}${p === root ? "!" : ""}`).join(" ")}}`;
}

/** The chord voiced with these pitches, or null when a pitch isn't in it (grammar 4.2). */
function voicing(slot: string, pitches: Pitch[]): string | null {
	const text = `${slot}${noteSet(pitches)}`;
	const { diagnostics } = parseBarLine(`| ${text} |`, 1);
	return diagnostics.some((d) => d.severity === "error") ? null : text;
}

/** Whether an attack starts new notes (not a tie's continuation). */
const attacked = (a: Attack) => a.kind === "notes" && !a.tieIn && a.pitches.length > 0;

/** An attack without a chord: a note set, `--`, or nothing (a hold). */
function attackSymbol(a: Attack): string | null {
	if (a.kind === "rest") return "--";
	return attacked(a) ? noteSet(a.pitches) : null;
}

/** An attack's symbol: with a chord at its onset, the chord voiced by the notes it attacks (alone when they aren't all in it); else a note set, `--`, or a hold. */
function symbolOf(a: Attack, chord: Chord | undefined, stray: () => void): string | null {
	if (!chord) return attackSymbol(a);
	if (!attacked(a)) return chord.slot;
	const voiced = voicing(chord.slot, a.pitches);
	if (voiced === null) stray();
	return voiced ?? chord.slot;
}

/** The bar's events: chords (voiced by notes attacked with them), note sets and rests; slashes and ties hold. */
function eventsOf(attacks: Attack[], chords: Chord[], stray: () => void): Event[] {
	const events: Event[] = [];
	const used = new Set<Chord>();
	for (const a of attacks) {
		const chord = chords.find((c) => cmp(c.at, a.at) === 0);
		if (chord) used.add(chord);
		const symbol = symbolOf(a, chord, stray);
		if (symbol !== null) events.push({ at: a.at, symbol });
	}
	for (const c of chords) if (!used.has(c)) events.push({ at: c.at, symbol: c.slot });
	return events;
}

/** Where each `?` in a cell is, matched in order with the bar's unreadable chords. */
function unreadIn(cell: string, chords: Chord[], measure: number): Unread[] {
	const originals = chords
		.filter((c) => c.slot === "?")
		.sort((a, b) => cmp(a.at, b.at))
		.map((c) => c.original);
	const out: Unread[] = [];
	cell.split(" ").forEach((slot, at) => {
		for (const member of slot.split("_")) {
			if (member.replace(/\.$/, "") !== "?") continue;
			const text = originals.shift();
			if (text) out.push({ measure, at, text });
		}
	});
	return out;
}

/** One bar's cell, noting in `out` what didn't come through. */
function cellOf(
	bar: Bar,
	attacks: Attack[],
	sounding: boolean,
	reading: Reading,
	out: LineRead,
): string | null {
	const events = eventsOf(reading.notes ? attacks : [], reading.chords ? bar.chords : [], () =>
		out.stray.push(bar.number),
	);
	if (events.length === 0) return holdOrRest(sounding, reading, attacks);
	const placed = place(events, bar, sounding, reading);
	if (!placed) {
		out.offGrid.push(bar.number);
		return reading.chords ? "?" : "--";
	}
	if (placed.moved) out.moved.push(bar.number);
	return placed.cell;
}

/**
 * Reads one line: each bar's events placed on its grid. A bar with nothing
 * new holds (`/`) what sounds, or rests (`null`) when nothing does; a bar
 * after a rest that starts with a hold starts with `N.C.` (or `--` on a
 * line of notes) instead, since there is nothing to hold.
 */
export function readLine(bars: Attack[][], shared: Bar[], reading: Reading): LineRead {
	const out: LineRead = { cells: [], offGrid: [], moved: [], stray: [], unread: [] };
	let sounding = false;
	shared.forEach((bar, i) => {
		const cell = cellOf(bar, bars[i] ?? [], sounding, reading, out);
		if (cell !== null && reading.chords) out.unread.push(...unreadIn(cell, bar.chords, i));
		out.cells.push(cell);
		sounding = cell !== null;
	});
	return out;
}

/** A bar with no events: a hold while something sounds, else a rest; a line of notes resting the whole bar rests. */
function holdOrRest(sounding: boolean, reading: Reading, attacks: Attack[]): string | null {
	return sounding && !(reading.notes && attacks.length === 0) ? "/" : null;
}

/** The bar's events placed, with `N.C.` (or `--`) on the downbeat when nothing sounds to hold. */
function place(events: Event[], bar: Bar, sounding: boolean, reading: Reading) {
	const downbeat = events.some((e) => e.at.n === 0);
	const filled =
		sounding || downbeat
			? events
			: [...events, { at: ZERO, symbol: reading.chords ? "N.C." : "--" }];
	return placeBar(filled, bar.length, bar.meter, false);
}
