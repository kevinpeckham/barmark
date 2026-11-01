import { intervalBetween, noteSemitone, transpose } from "../chords/intervals.js";
import { parseNoteSet } from "../chords/noteSet.js";
import { parseChord } from "../chords/parse.js";
import { printChord } from "../chords/print.js";
import type { ChordRecord } from "../chords/types.js";
import { parseDirectiveLine } from "./directives.js";
import { parseChart } from "./parse.js";
import { printParsed } from "./print.js";
import type {
	Cell,
	ChartDiagnostic,
	ChartParse,
	Key,
	Line,
	Mode,
	SimpleSlot,
	Slot,
} from "./types.js";

/** What to transpose by: a target key (the chart needs a `key:`), or a number of semitones. */
export type TransposeBy = { to: string } | { semitones: number };

/** How each note moves: its new spelling, and how far it moves in pitch (for note-set octaves). */
type Move = { spell: (note: string) => string; semitones: number };

const SHARPS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLATS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
/** A chart with no key spells each root from this table. */
const TABLE = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
/** Each letter's place on the circle of fifths, and each mode's offset from its parent major. */
const FIFTHS: Record<string, number> = { F: -1, C: 0, G: 1, D: 2, A: 3, E: 4, B: 5 };
const MODE_FIFTHS: Record<Mode, number> = {
	lydian: 1,
	major: 0,
	ionian: 0,
	mixolydian: -1,
	dorian: -2,
	minor: -3,
	aeolian: -3,
	phrygian: -4,
	locrian: -5,
};

const mod = (n: number, m: number) => ((n % m) + m) % m;
const alterOf = (note: string) => (note.includes("#") ? 1 : -1) * (note.length - 1);

/** Double sharps and flats are written as the plain note: Fx is G, Ebb is D. */
function plain(note: string): string {
	if (!/##|bb/.test(note)) return note;
	return (note.includes("#") ? SHARPS : FLATS)[noteSemitone(note)] ?? note;
}

/** Sharps (positive) or flats (negative) in a key's signature. */
const signature = (tonic: string, mode: Mode) =>
	(FIFTHS[tonic[0] ?? "C"] ?? 0) + 7 * alterOf(tonic) + MODE_FIFTHS[mode];

/** The key `semitones` away, spelled with the fewest accidentals; sharps win a tie (F# over Gb). */
function nearestKey(key: Key, semitones: number): string {
	const pc = mod(noteSemitone(key.tonic) + semitones, 12);
	const [a = "C", b = "C"] = [SHARPS[pc], FLATS[pc]];
	const sa = signature(a, key.mode);
	const sb = signature(b, key.mode);
	return Math.abs(sb) < Math.abs(sa) || (Math.abs(sb) === Math.abs(sa) && sb > sa) ? b : a;
}

function firstKey(parsed: ChartParse): Key | undefined {
	for (const l of parsed.lines) if (l.kind === "directive" && l.set.key) return l.set.key;
	return undefined;
}

const fail = (message: string, token: string): ChartDiagnostic => ({
	line: 1,
	severity: "error",
	message,
	token,
});

/** The move from the first key to `to`, the nearer way round. */
function moveTo(key: Key | undefined, to: string): Move | ChartDiagnostic {
	const target = parseDirectiveLine(`key: ${to}`, 1);
	const tonic = target?.set.key?.tonic;
	if (!tonic || target.diagnostics.length || Object.keys(target.set).length !== 1)
		return fail(`can't transpose to "${to}": it isn't a key`, to);
	if (!key) return fail("transposing to a key needs a key: line in the chart", to);
	const semis = mod(noteSemitone(tonic) - noteSemitone(key.tonic), 12);
	const interval = intervalBetween(key.tonic, tonic);
	return { spell: (n) => plain(transpose(n, interval)), semitones: semis > 6 ? semis - 12 : semis };
}

function moveBy(key: Key | undefined, semitones: number): Move | ChartDiagnostic {
	if (!Number.isInteger(semitones))
		return fail("transpose by a whole number of semitones", String(semitones));
	if (!key) return { spell: (n) => TABLE[mod(noteSemitone(n) + semitones, 12)] ?? n, semitones };
	const interval = intervalBetween(key.tonic, nearestKey(key, semitones));
	return { spell: (n) => plain(transpose(n, interval)), semitones };
}

/** Pitch number (C4 = 60) of a spelled note in an octave, with the octave belonging to the letter. */
const pitch = (name: string, octave: number) =>
	12 * (octave + 1) + noteSemitone(name[0] ?? "C") + alterOf(name);

function moveNoteSet(chord: ChordRecord, move: Move, warn: (token: string) => void): ChordRecord {
	const tokens = chord.canonical.slice(1, -1).split(" ");
	const moved = tokens.map((t) => {
		const m = /^([A-G](?:#*|b*))(\d)?(!)?$/.exec(t);
		if (!m?.[1]) return t;
		const name = move.spell(m[1]);
		if (m[2] === undefined) return `${name}${m[3] ?? ""}`;
		const octave = (pitch(m[1], Number(m[2])) + move.semitones - pitch(name, 0)) / 12;
		if (octave >= 0 && octave <= 8) return `${name}${octave}${m[3] ?? ""}`;
		warn(`${m[1]}${m[2]}`);
		return t;
	});
	const r = parseNoteSet(`{${moved.join(" ")}}`);
	return r.ok ? r.value : chord;
}

function moveChord(chord: ChordRecord, move: Move, warn: (token: string) => void): ChordRecord {
	if (!chord.parts) return moveNoteSet(chord, move, warn);
	const { root, bass } = chord.parts;
	const r = parseChord(
		printChord({ ...chord.parts, root: move.spell(root), bass: bass && move.spell(bass) }),
	);
	return r.ok ? r.value : chord;
}

function moveCells(cells: Cell[], move: Move, warn: (token: string) => void): Cell[] {
	const simple = (s: SimpleSlot): SimpleSlot =>
		s.kind === "chord" ? { kind: "chord", chord: moveChord(s.chord, move, warn) } : s;
	const slot = (s: Slot): Slot =>
		s.kind === "group" ? { kind: "group", members: s.members.map(simple) } : simple(s);
	return cells.map((c) => (c.kind === "slots" ? { ...c, slots: c.slots.map(slot) } : c));
}

function moveLine(l: Line, move: Move, warn: (line: number, token: string) => void): Line {
	if (l.kind === "bars") return { ...l, cells: moveCells(l.cells, move, (t) => warn(l.line, t)) };
	if (l.kind === "directive" && l.set.key)
		return { ...l, set: { ...l.set, key: { ...l.set.key, tonic: move.spell(l.set.key.tonic) } } };
	return l;
}

/**
 * The chart in another key, as canonical text (spec §8). Chord roots, slash
 * basses, note sets and every `key:` line move; text never does. Spelling
 * follows the interval from the chart's first key, so every chord keeps its
 * place in the key. Lines with errors stay as written, with a warning; a
 * target that isn't a key, or a target key for a chart with none, returns
 * the text unchanged with an error. Never throws.
 */
export function transposeChart(
	text: string,
	by: TransposeBy,
): { text: string; diagnostics: ChartDiagnostic[] } {
	const parsed = parseChart(text);
	const key = firstKey(parsed);
	const move = "to" in by ? moveTo(key, by.to) : moveBy(key, by.semitones);
	if ("severity" in move) return { text, diagnostics: [move] };

	const physical = text.replace(/^﻿/, "").split(/\r?\n/);
	const diagnostics: ChartDiagnostic[] = [];
	for (const line of new Set(
		parsed.diagnostics.filter((d) => d.severity === "error").map((d) => d.line),
	))
		diagnostics.push({
			line,
			severity: "warning",
			message: "not transposed: this line has an error",
			token: physical[line - 1]?.trim() ?? "",
		});
	const warn = (line: number, token: string) =>
		diagnostics.push({
			line,
			severity: "warning",
			message: `${token} can't move: octaves run 0–8, so it stays as written`,
			token,
		});
	const out = printParsed(text, parsed, (l) => moveLine(l, move, warn));
	return { text: out, diagnostics: diagnostics.sort((a, b) => a.line - b.line) };
}
