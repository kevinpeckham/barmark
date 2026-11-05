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

/**
 * Where a line stands between bars: the last chord sounded, whether the
 * line is silent (after a rest, or a bar it rests), and whether its last
 * bar was written (so a hold has something to hold).
 */
type Run = { last: string | null; silent: boolean; sounding: boolean };

/** The latest chord before `at` in the bar, else the last chord sounded. */
function chordBefore(chords: Chord[], at: Frac, run: Run): string | null {
	const before = chords.filter((c) => cmp(c.at, at) < 0).sort((a, b) => cmp(a.at, b.at));
	return before[before.length - 1]?.slot ?? run.last;
}

/**
 * The bar's events: chords (voiced by notes attacked with them), note sets
 * and rests; slashes and ties hold. Slashes coming back after a rest with
 * no new chord restate the chord last sounded: the band comes back in on it.
 */
function eventsOf(attacks: Attack[], chords: Chord[], run: Run, stray: () => void): Event[] {
	const events: Event[] = [];
	const used = new Set<Chord>();
	let silent = run.silent;
	for (const a of attacks) {
		const chord = chords.find((c) => cmp(c.at, a.at) === 0);
		if (chord) used.add(chord);
		const symbol = resumes(a, chord, silent)
			? chordBefore(chords, a.at, run)
			: symbolOf(a, chord, stray);
		if (symbol !== null) events.push({ at: a.at, symbol });
		silent = a.kind === "rest" && !chord;
	}
	for (const c of chords) if (!used.has(c)) events.push({ at: c.at, symbol: c.slot });
	return events;
}

/** Whether an attack is slashes coming back after a rest, with no chord of its own. */
const resumes = (a: Attack, chord: Chord | undefined, silent: boolean) =>
	a.kind === "slash" && silent && !chord;

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
function cellOf(bar: Bar, attacks: Attack[], run: Run, reading: Reading, out: LineRead) {
	const events = eventsOf(reading.notes ? attacks : [], reading.chords ? bar.chords : [], run, () =>
		out.stray.push(bar.number),
	);
	if (events.length === 0) return holdOrRest(run, attacks);
	const placed = place(events, bar, run.sounding, reading);
	if (!placed) {
		out.offGrid.push(bar.number);
		return reading.chords ? "?" : "--";
	}
	if (placed.moved) out.moved.push(bar.number);
	return placed.cell;
}

/** Where the line stands after a bar: its latest chord, and whether it ends silent. */
function after(run: Run, bar: Bar, attacks: Attack[], cell: string | null): Run {
	const latest = [...bar.chords].sort((a, b) => cmp(a.at, b.at)).pop()?.slot ?? run.last;
	const end = attacks[attacks.length - 1];
	const restsAtEnd = end?.kind === "rest" && !bar.chords.some((c) => cmp(c.at, end.at) === 0);
	return { last: latest, silent: cell === null || restsAtEnd, sounding: cell !== null };
}

/**
 * Reads one line: each bar's events placed on its grid. A bar with nothing
 * new holds (`/`) while something sounds, restates the last chord when the
 * line comes back from a rest, and rests (`null`) when the line has no
 * attacks; a bar after a rest that starts with a hold starts with `N.C.`
 * (or `--` on a line of notes), since there is nothing to hold.
 */
export function readLine(bars: Attack[][], shared: Bar[], reading: Reading): LineRead {
	const out: LineRead = { cells: [], offGrid: [], moved: [], stray: [], unread: [] };
	let run: Run = { last: null, silent: true, sounding: false };
	shared.forEach((bar, i) => {
		const attacks = bars[i] ?? [];
		const cell = cellOf(bar, attacks, run, reading, out);
		if (cell !== null && reading.chords) out.unread.push(...unreadIn(cell, bar.chords, i));
		out.cells.push(cell);
		run = after(run, bar, attacks, cell);
	});
	return out;
}

/** A bar with no events: a rest when the line only rests (no attacks, or rests alone), else a hold while something sounds, else the last chord again. */
function holdOrRest(run: Run, attacks: Attack[]): string | null {
	if (attacks.every((a) => a.kind === "rest")) return null;
	return run.sounding ? "/" : run.last;
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
