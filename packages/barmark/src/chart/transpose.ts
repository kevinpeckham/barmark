import { intervalBetween, noteSemitone, transpose } from "../chords/intervals.js";
import { parseNoteSet } from "../chords/noteSet.js";
import { parseChord } from "../chords/parse.js";
import { printChord } from "../chords/print.js";
import type { ChordRecord } from "../chords/types.js";
import { parseDirectiveLine } from "./directives.js";
import { alterOf, conventionalKey, plain, SHARPS, spellPitch } from "./keys.js";
import { parseChart } from "./parse.js";
import { printedAsWritten, printParsed, unreadSlots } from "./print.js";
import type { Cell, ChartDiagnostic, ChartParse, Key, Line, SimpleSlot, Slot } from "./types.js";

/** What to transpose by: a target key (the chart needs a `key:`), or a number of semitones. */
export type TransposeBy = { to: string } | { semitones: number };

/** How each note moves: its new spelling, and how far it moves in pitch (for note-set octaves). */
type Move = { spell: (note: string) => string; semitones: number };

const mod = (n: number, m: number) => ((n % m) + m) % m;

/** The key `semitones` away, spelled with the fewest accidentals; sharps win a tie (F# over Gb). */
function nearestKey(key: Key, semitones: number): string {
	const pc = mod(noteSemitone(key.tonic) + semitones, 12);
	return conventionalKey({ tonic: SHARPS[pc] ?? "C", mode: key.mode }).tonic;
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
	if (!key) return { spell: (n) => spellPitch(noteSemitone(n) + semitones, null), semitones };
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
	const simple = (s: SimpleSlot): SimpleSlot => {
		if (s.kind !== "chord") return s;
		const chord = moveChord(s.chord, move, warn);
		return s.voicing
			? { ...s, chord, voicing: moveNoteSet(s.voicing, move, warn) }
			: { ...s, chord };
	};
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

/** A warning for an unreadable slot (grammar 2.3), which transposing leaves as written. */
const unmoved = (line: number, slot: SimpleSlot): ChartDiagnostic => {
	const token = slot.kind === "unknown" ? (slot.text ?? "?") : "";
	return {
		line,
		severity: "warning",
		message: `${token} can't move: it can't be read, so it stays as written`,
		token,
	};
};

/**
 * The chart in another key, as canonical text (spec §8). Chord roots, slash
 * basses, note sets and every `key:` line move; text never does. Spelling
 * follows the interval from the chart's first key, so every chord keeps its
 * place in the key. A slot that can't be read stays as written, with a
 * warning, and its line's other chords move; a line excluded for an error
 * stays as written, with a warning; a
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
	const asWritten = printedAsWritten(parsed);
	for (const line of asWritten)
		diagnostics.push({
			line,
			severity: "warning",
			message: "not transposed: this line has an error",
			token: physical[line - 1]?.trim() ?? "",
		});
	for (const l of parsed.lines)
		if (l.kind === "bars" && !asWritten.has(l.line))
			for (const s of unreadSlots(l)) diagnostics.push(unmoved(l.line, s));
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
