/**
 * Spoken names: how a screen reader reads a chart as music. Built from the
 * parsed structure, never from the symbol's text.
 */
import {
	type ChordParts,
	type ChordRecord,
	type Direction,
	degreeOf,
	type Key,
	type SimpleSlot,
	type Slot,
	type Syllable,
} from "barmark";
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
const LEFT_OUT: Record<string, string> = { no3: "no third", no5: "no fifth" };

function speakTone(tone: string): string {
	if (LEFT_OUT[tone]) return LEFT_OUT[tone];
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

const PUSHED = { eighth: "pushed", sixteenth: "pushed a sixteenth" } as const;

/** A chord with its voicing and articulation: "accented D", "G short hit", "C major seven voiced E3 G3". */
function speakChordSlot(slot: Extract<Slot, { kind: "chord" }>, key?: Key): string {
	const name = speakChord(slot.chord, key);
	const voiced = slot.voicing ? `${name} voiced ${slot.voicing.pitches.join(" ")}` : name;
	if (slot.articulation === "accent") return `accented ${voiced}`;
	return slot.articulation === "hit" ? `${voiced} short hit` : voiced;
}

const PEDALLED = { press: "pedal", release: "pedal up" } as const;

export function speakSlot(slot: Slot, key?: Key): string {
	const unpushed = speakUnpushed(slot, key);
	const said = "push" in slot && slot.push ? `${unpushed} ${PUSHED[slot.push]}` : unpushed;
	const dotted = "dotted" in slot && slot.dotted ? `${said} dotted` : said;
	return slot.kind === "chord" && slot.pedal ? `${PEDALLED[slot.pedal]} ${dotted}` : dotted;
}

/** "triplet: C, D, E"; a dotted figure is its members: "C dotted, D". */
function speakGroup(members: SimpleSlot[], key?: Key): string {
	const said = members.map((m) => speakSlot(m, key)).join(", ");
	if (members.some((m) => m.dotted)) return said;
	return `${GROUPS[members.length] ?? `group of ${members.length}`}: ${said}`;
}

function speakUnpushed(slot: Slot, key?: Key): string {
	switch (slot.kind) {
		case "chord":
			return speakChordSlot(slot, key);
		case "hold":
			return "hold";
		case "nc":
			return "no chord";
		case "silence":
			return "stop";
		case "unknown":
			return "unknown chord";
		case "group":
			return speakGroup(slot.members, key);
	}
}

/** "segno", "to coda", "dal segno al coda", "da capo al fine". */
function speakDirection(d: Direction): string {
	if (d.kind !== "jump") return d.kind;
	return `${d.to === "start" ? "da capo" : "dal segno"}${d.al ? ` al ${d.al}` : ""}`;
}

/** "bar 9: G, hold, D, hold"; a fermata is held until cued. With `numerals`, each chord's degree comes first. */
export function speakBar(barNumber: number | null, cell: CellModel, numerals = false): string {
	if (cell.kind === "fermata") return "fermata: hold until cued";
	if (cell.kind === "direction") return speakDirection(cell.direction);
	if (cell.kind === "rehearsal") return `rehearsal ${cell.label}`;
	const bar = `bar${barNumber === null ? "" : ` ${barNumber}`}`;
	if (cell.simile) return `${bar}: each part repeats its bar before`;
	const meter = cell.meter ? `, in ${cell.meter.n}/${cell.meter.d}` : "";
	const cut = cell.cut ? ", cut on this pass" : "";
	const words = (at: number) =>
		(cell.words ?? []).filter((w) => w.at === at).map((w) => `“${w.text}”`);
	const slots = cell.slots.map((s, i) =>
		[...words(i), speakSlot(s, numerals ? cell.key : undefined)].join(" "),
	);
	const spoken = [...slots, ...words(cell.slots.length)].join(", ");
	return `bar${barNumber === null ? "" : ` ${barNumber}`}${meter}: ${spoken}${cut}`;
}

/** A verse's syllables as words: "maz-ing"; elided syllables apart, a held one silent. */
function speakSyllables(syllables: Syllable[]): string {
	let words = "";
	for (const s of syllables)
		if (s.kind === "sung") words += `${s.parts.join(" ")}${s.continues ? "-" : " "}`;
	return words.trim();
}

/**
 * The words on a bar, each verse's: `sung “maz-ing”` (or `words “…”` in a
 * lyric row on no melody), or with several verses `verse 1 “maz-ing”,
 * verse 2 “grace that”`. Empty when nothing is sung there.
 */
export function speakVerses(
	verses: { verse: number; syllables: Syllable[] }[],
	numbered: boolean,
	label: "sung" | "words",
): string {
	return verses
		.map((v) => ({ verse: v.verse, words: speakSyllables(v.syllables) }))
		.filter((v) => v.words)
		.map((v) => `${numbered ? `verse ${v.verse}` : label} “${v.words}”`)
		.join(", ");
}
