import { inScale, spellPitch } from "../chart/keys.js";
import type { Key } from "../chart/types.js";
import { noteSemitone, transpose } from "./intervals.js";
import { enumerateSuffixes, intervalSetKey, type Suffix } from "./suffixes.js";
import type { Interval } from "./types.js";

const mod12 = (n: number) => ((n % 12) + 12) % 12;
const iv = (degree: number, alter = 0): Interval => ({ degree, alter });

/** Each semitone count above a root, every way the vocabulary spells it. */
const SPELLINGS: Interval[][] = [
	[iv(1)],
	[iv(9, -1)],
	[iv(9)],
	[iv(3, -1), iv(9, 1)],
	[iv(3)],
	[iv(11)],
	[iv(5, -1), iv(11, 1)],
	[iv(5)],
	[iv(5, 1), iv(13, -1)],
	[iv(13), iv(7, -2)],
	[iv(7, -1)],
	[iv(7)],
];

type Candidate = { root: number; suffix: Suffix; supplied: boolean };

/** Every spelling of a set of semitone counts above a root. */
function spellings(offsets: number[]): Interval[][] {
	let out: Interval[][] = [[]];
	for (const o of offsets) out = out.flatMap((s) => (SPELLINGS[o] ?? []).map((i) => [...s, i]));
	return out;
}

/** Every suffix naming these semitone counts above a root, clusters left out. */
function named(offsets: number[]): Suffix[] {
	const table = enumerateSuffixes();
	return spellings(offsets).flatMap((intervals) =>
		(table.get(intervalSetKey(intervals)) ?? []).filter((suffix) => !clashes(suffix)),
	);
}

/** Every suffix naming the notes from each sounding root, with the fifth supplied where it is missing. */
function candidates(set: number[]): Candidate[] {
	return set.flatMap((root) => {
		const offsets = set.map((p) => mod12(p - root));
		const found = named(offsets).map((suffix) => ({ root, suffix, supplied: false }));
		if (set.length < 3 || offsets.includes(7)) return found;
		return [
			...found,
			...named([...offsets, 7]).map((suffix) => ({ root, suffix, supplied: true })),
		];
	});
}

/**
 * Suffixes the table spells but no one writes: a degree held both plain and
 * altered (`b9` with `9`, `b7` with `7`), a `(7)` on a sixth chord, any tone
 * on `dim` or `dim7`, an altered tone on `5`, `6` or `6/9`.
 */
function clashes(suffix: Suffix): boolean {
	return degreeClash(suffix) || unwritten(suffix);
}

function degreeClash({ intervals }: Suffix): boolean {
	const plain = new Set(intervals.filter((i) => i.alter === 0).map((i) => (i.degree - 1) % 7));
	return intervals.some((i) => i.alter !== 0 && plain.has((i.degree - 1) % 7));
}

const altered = (tone: string) => /[#b]/.test(tone);

function unwritten({ parts }: Suffix): boolean {
	const sixth = parts.extension === "6" || parts.extension === "6/9";
	if (parts.quality === "dim") return parts.tones.length > 0;
	if (sixth && parts.tones.includes("7")) return true;
	return (sixth || parts.quality === "5") && parts.tones.some(altered);
}

/** Tones in parentheses, the half-diminished `m7(b5)`'s b5 not counted. */
function addedTones({ parts }: Suffix): number {
	const halfDiminished = parts.quality === "m" && parts.extension === "7";
	return parts.tones.filter((t) => !(halfDiminished && t === "b5")).length;
}

/** Triads, sevenths, sixths, sus, extended chords, then added tones. */
function family(suffix: Suffix): number {
	const { extension, sus } = suffix.parts;
	if (addedTones(suffix) > 0) return 5;
	if (sus) return 3;
	if (extension === null) return 0;
	if (extension === "7" || extension === "maj7") return 1;
	if (extension === "6" || extension === "6/9") return 2;
	return 4;
}

/** A tone the plain-tone tie-break puts last: `(2)`, `(4)`, `(6)` lose to `(9)`, `(11)`, `(13)`. */
const PLAIN_TONES = ["2", "4", "6"];

/**
 * The order spec 5.6 ranks candidates by: cost (added tones, a slash, a
 * supplied fifth), then family, root in the bass, plain tones, the shorter
 * suffix and the root nearest above the bass.
 */
function order(c: Candidate, bass: number): number[] {
	const slash = c.root === bass ? 0 : 1;
	const cost = addedTones(c.suffix) + slash + (c.supplied ? 1 : 0);
	const plainTone = c.suffix.parts.tones.some((t) => PLAIN_TONES.includes(t)) ? 1 : 0;
	return [cost, family(c.suffix), slash, plainTone, c.suffix.suffix.length, mod12(c.root - bass)];
}

function before(a: number[], b: number[]): boolean {
	for (let i = 0; i < a.length; i++) {
		const d = (a[i] ?? 0) - (b[i] ?? 0);
		if (d !== 0) return d < 0;
	}
	return false;
}

function cheapest(found: Candidate[], bass: number): Candidate | null {
	let best: { c: Candidate; rank: number[] } | null = null;
	for (const c of found) {
		const rank = order(c, bass);
		if (!best || before(rank, best.rank)) best = { c, rank };
	}
	return best?.c ?? null;
}

/** How a candidate is being spelled: the key, and whether the root is in its scale (then trusted). */
type Spelling = { key: Key | null; trusted: boolean };

const doubled = (note: string) => /##|bb/.test(note);

/** A double accidental, or an E#, B#, Cb or Fb the key would not write itself. */
const faulty = (note: string, key: Key | null) =>
	doubled(note) || (/^(?:E#|B#|Cb|Fb)$/.test(note) && spellPitch(noteSemitone(note), key) !== note);

/** The bass by its interval from the root; by pitch when that spelling is faulty. */
function bassName(c: Candidate, root: string, bass: number, s: Spelling): string {
	const interval = c.suffix.intervals.find(
		(i) => noteSemitone(transpose("C", i)) === mod12(bass - c.root),
	);
	const spelled = interval && transpose(root, interval);
	if (!spelled || doubled(spelled) || (!s.trusted && faulty(spelled, s.key)))
		return spellPitch(bass, s.key);
	return spelled;
}

function write(c: Candidate, root: string, bass: number, s: Spelling): string {
	const slash = c.root === bass ? "" : `/${bassName(c, root, bass, s)}`;
	return `${root}${c.suffix.suffix}${slash}`;
}

/** Faulty spellings among the root, its third and the bass. */
function faults(c: Candidate, root: string, bass: number, s: Spelling): number {
	const thirds = c.suffix.intervals.filter((i) => i.degree === 3).map((i) => transpose(root, i));
	const notes = [root, ...thirds, ...(c.root === bass ? [] : [bassName(c, root, bass, s)])];
	return notes.filter((n) => faulty(n, s.key)).length;
}

const LETTERS = "CDEFGAB";

/** The pitch class's other spelling with at most one accidental: `Db` for `C#`, `Fb` for `E`. */
function enharmonic(pc: number, first: string): string | undefined {
	for (const letter of LETTERS) {
		const alter = mod12(pc - noteSemitone(letter) + 6) - 6;
		const name = `${letter}${alter < 0 ? "b" : alter > 0 ? "#" : ""}`;
		if (Math.abs(alter) <= 1 && name !== first) return name;
	}
	return undefined;
}

/**
 * The root by `spellPitch`; a root with no key or outside the key's scale takes
 * its enharmonic spelling when that has fewer faults.
 */
function spell(c: Candidate, bass: number, key: Key | null): string {
	const s: Spelling = { key, trusted: key !== null && inScale(c.root, key) };
	const first = spellPitch(c.root, key);
	const other = s.trusted ? undefined : enharmonic(c.root, first);
	if (other !== undefined && faults(c, other, bass, s) < faults(c, first, bass, s))
		return write(c, other, bass, s);
	return write(c, first, bass, s);
}

/**
 * A chord symbol for sounding pitch classes over a bass, spelled for the key;
 * null when none fits (spec 5.6). Pitch classes are taken mod 12 and
 * deduplicated; the bass is added when missing. Two pitch classes name only a
 * power chord. The suggestion grammar 4's linter may make for a note set.
 */
export function nameNotes(pitchClasses: number[], bass: number, key: Key | null): string | null {
	const b = mod12(bass);
	const set = [...new Set([...pitchClasses.map(mod12), b])];
	if (set.length < 2) return null;
	let found = candidates(set);
	if (set.length === 2) found = found.filter((c) => c.suffix.suffix === "5");
	const best = cheapest(found, b);
	return best && spell(best, b, key);
}
