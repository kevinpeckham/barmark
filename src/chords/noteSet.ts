import { toHarte } from "./harte.js";
import { intervalBetween, intervalKey, noteSemitone } from "./intervals.js";
import type { ChordRecord, Diagnostic, ParseResult } from "./types.js";
import { byDegree } from "./vocabulary.js";

type Note = { name: string; octave: number | null; root: boolean };

const NOTE = /^([A-G](?:#*|b*))([0-8])?(!)?$/;

/** Pitch number with the octave belonging to the letter: B#3 sounds as C4. */
const pitchOf = (n: Note) => {
	const accidentals = n.name.slice(1);
	const alter = accidentals.startsWith("#") ? accidentals.length : -accidentals.length;
	return 12 * ((n.octave ?? 0) + 1) + noteSemitone(n.name[0] ?? "C") + alter;
};

const label = (n: Note) => `${n.name}${n.octave ?? ""}`;

/** A brace note set (grammar section 4): exact notes, low to high, an optional `!` root. */
export function parseNoteSet(text: string): ParseResult {
	const fail = (message: string, token = text): ParseResult => ({
		ok: false,
		error: { message: `${text}: ${message}`, token },
	});
	const inner = /^\{(.*)\}$/.exec(text.replace(/♯/g, "#").replace(/♭/g, "b"))?.[1];
	if (inner === undefined) return fail("a note set is written in braces");
	const tokens = inner.trim().split(/\s+/).filter(Boolean);
	if (tokens.length === 0) return fail("a note set needs at least one note");

	let notes: Note[] = [];
	for (const t of tokens) {
		const m = NOTE.exec(t);
		if (!m) {
			return fail(
				/^[A-G](?:#*|b*)\d+!?$/.test(t) ? `"${t}": octaves run 0–8` : `"${t}" is not a note name`,
				t,
			);
		}
		notes.push({ name: m[1] ?? "", octave: m[2] ? Number(m[2]) : null, root: !!m[3] });
	}
	if (notes.filter((n) => n.root).length > 1)
		return fail("at most one note is marked ! as the root");
	const withOctave = notes.filter((n) => n.octave !== null).length;
	if (withOctave !== 0 && withOctave !== notes.length) {
		return fail("every note has an octave, or none does");
	}

	const warnings: Diagnostic[] = [];
	if (withOctave) {
		const sorted = [...notes].sort((a, b) => pitchOf(a) - pitchOf(b));
		if (sorted.some((n, i) => n !== notes[i])) {
			warnings.push({ message: `${text}: notes are not in ascending order`, token: text });
		}
		notes = sorted;
	} else {
		const seen = new Set<string>();
		for (const n of notes) {
			if (seen.has(n.name))
				warnings.push({ message: `${text}: ${n.name} appears twice`, token: n.name });
			seen.add(n.name);
		}
	}

	const bass = notes[0]?.name ?? "";
	const root = notes.find((n) => n.root)?.name ?? null;
	const from = root ?? bass;
	const intervals = [...new Map(notes.map((n) => [n.name, intervalBetween(from, n.name)])).values()]
		.filter((i, idx, all) => all.findIndex((j) => intervalKey(j) === intervalKey(i)) === idx)
		.sort(byDegree);
	const value: ChordRecord = {
		kind: "notes",
		source: text,
		canonical: `{${notes.map((n) => `${label(n)}${n.root ? "!" : ""}`).join(" ")}}`,
		root,
		intervals,
		pitches: notes.map(label),
		bass,
		alteredOpen: false,
		harte: "",
	};
	value.harte = toHarte(value);
	return { ok: true, warnings, value };
}
