/**
 * Spoken names: how a screen reader reads a chart as music. Built from the
 * parsed structure, never from the symbol's text.
 */
import { type ChordParts, type ChordRecord, degreeOf, type Key, type Slot } from "barmark";
import type { CellModel } from "./types.js";

const NUMBERS: Record<string, string> = {
	"1": "one",
	"2": "two",
	"3": "three",
	"4": "four",
	"5": "five",
	"6": "six",
	"7": "seven",
	"9": "nine",
	"11": "eleven",
	"13": "thirteen",
};
const QUALITY: Record<ChordParts["quality"], string> = {
	"": "",
	m: "minor",
	dim: "diminished",
	aug: "augmented",
	"5": "five",
};
const EXTENSION: Record<NonNullable<ChordParts["extension"]>, string> = {
	"6": "six",
	"6/9": "six nine",
	"7": "seven",
	maj7: "major seven",
	"9": "nine",
	maj9: "major nine",
	"11": "eleven",
	"13": "thirteen",
	maj13: "major thirteen",
	"7alt": "seven altered",
};
const SUS: Record<NonNullable<ChordParts["sus"]>, string> = { sus2: "sus two", sus4: "sus four" };
const GROUPS: Record<number, string> = {
	2: "duplet",
	3: "triplet",
	4: "quadruplet",
	5: "quintuplet",
	6: "sextuplet",
};

const number = (n: string) => NUMBERS[n] ?? n.split("").join(" ");
const ACCIDENTAL: Record<string, string> = {
	"#": " sharp",
	"##": " double sharp",
	b: " flat",
	bb: " double flat",
};

/** `F#` → "F sharp", `E1` → "E one". */
function speakPitch(label: string): string {
	const m = /^([A-G])(##|bb|#|b)?(-?\d+)?$/.exec(label);
	if (!m) return label;
	const octave =
		m[3] === undefined
			? ""
			: ` ${m[3].startsWith("-") ? "minus " : ""}${number(m[3].replace("-", ""))}`;
	return `${m[1]}${ACCIDENTAL[m[2] ?? ""] ?? ""}${octave}`;
}

/** `b9` → "flat nine"; a natural tone is added: `9` → "add nine". */
function speakTone(tone: string): string {
	const m = /^(#|b)?(\d+)$/.exec(tone);
	if (!m) return tone;
	return `${m[1] ? (m[1] === "#" ? "sharp" : "flat") : "add"} ${number(m[2] ?? "")}`;
}

function speakParts(p: ChordParts): string {
	return [
		speakPitch(p.root),
		QUALITY[p.quality],
		p.extension ? EXTENSION[p.extension] : "",
		p.sus ? SUS[p.sus] : "",
		...p.tones.map(speakTone),
		p.bass ? `over ${speakPitch(p.bass)}` : "",
	]
		.filter(Boolean)
		.join(" ");
}

/** A note set: "note E", "notes D, E (root), G". */
function speakNotes(record: ChordRecord): string {
	const labels = record.canonical
		.replace(/^\{|\}$/g, "")
		.split(/\s+/)
		.filter(Boolean);
	const spoken = labels.map((l) =>
		l.endsWith("!") ? `${speakPitch(l.slice(0, -1))} (root)` : speakPitch(l),
	);
	return `${spoken.length === 1 ? "note" : "notes"} ${spoken.join(", ")}`;
}

/** "five", "flat seven": a root's degree in a key. */
function speakDegree(root: string, key: Key): string {
	const d = degreeOf(root, key);
	if (!d) return "";
	const accidental = ACCIDENTAL[(d.alter < 0 ? "b" : "#").repeat(Math.abs(d.alter))] ?? "";
	return `${accidental.trim()} ${number(String(d.degree))}`.trim();
}

/** A chord's name; with a key, its degree first: "five, A seven". */
export function speakChord(record: ChordRecord, key?: Key): string {
	if (record.kind === "notes" || !record.parts) return speakNotes(record);
	const degree = key ? speakDegree(record.parts.root, key) : "";
	return `${degree ? `${degree}, ` : ""}${speakParts(record.parts)}`;
}

export function speakSlot(slot: Slot, key?: Key): string {
	switch (slot.kind) {
		case "chord":
			return speakChord(slot.chord, key);
		case "hold":
			return "hold";
		case "nc":
			return "no chord";
		case "silence":
			return "stop";
		case "unknown":
			return "unknown chord";
		case "group":
			return `${GROUPS[slot.members.length] ?? `group of ${slot.members.length}`}: ${slot.members.map((m) => speakSlot(m, key)).join(", ")}`;
	}
}

/** "bar 9: G, hold, D, hold"; a fermata is held until cued. With `numerals`, each chord's degree comes first. */
export function speakBar(barNumber: number | null, cell: CellModel, numerals = false): string {
	if (cell.kind === "fermata") return "fermata: hold until cued";
	const meter = cell.meter ? `, in ${cell.meter.n}/${cell.meter.d}` : "";
	const cut = cell.cut ? ", cut on this pass" : "";
	return `bar${barNumber === null ? "" : ` ${barNumber}`}${meter}: ${cell.slots.map((s) => speakSlot(s, numerals ? cell.key : undefined)).join(", ")}${cut}`;
}
