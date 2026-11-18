/**
 * How a chord name is written (spec 4.7): barmark's canonical spelling,
 * except where a ChordPro reader knows the same chord under another
 * spelling barmark also reads. What the reference knows was measured
 * against `chordpro` 6.101.0 in strict mode on 2026-11-18, over every
 * suffix barmark enumerates, every root and every bass; the rules below
 * are that measurement in our words.
 *
 * The reference reads a name in one of two ways. Common chords it finds
 * in its own list ("listed"); those take a slash bass only where its list
 * has one. Other names it builds from their parts ("built"), and those
 * take any bass.
 */
import type { ChordParts, ChordRecord } from "barmark";

/** Quality, extension and sus, as the canonical spelling writes them: `m7`, `7sus4`, `` for a major triad. */
const familyOf = (p: ChordParts) => `${p.quality}${p.extension ?? ""}${p.sus ?? ""}`;

/**
 * With no tones, every chord barmark has is listed, except these, which it
 * knows in no spelling.
 */
const UNKNOWN_BARE = new Set(["7sus2", "9sus2", "9sus4", "augmaj7", "m6/9", "m13"]);

/** Bare chords the reference builds rather than lists, so any bass goes under them. */
const BUILT_BARE = new Set(["13sus2", "13sus4", "mmaj9", "7alt"]);

/**
 * An extension's alterations, written run on with no parentheses (`C7b9#11`),
 * by family: a dominant seventh takes any one alteration but `b6`, `b9` with
 * one more, or `#9#11`; the others take only these. Each run is in canonical
 * order. Only the half-diminished `m7b5` is listed; the others are built.
 */
const RUN_ON: Record<string, string[]> = {
	"7": ["b5", "#5", "b9", "#9", "#11", "b13", "b9#9", "b9#11", "b9b13", "#9#11"],
	"9": ["b5", "#5", "#11"],
	"13": ["b9", "#9", "#11"],
	maj7: ["#5", "#11"],
	maj9: ["#11"],
	m7: ["b5"],
};

/**
 * One added tone, written `add` (`Cadd9`), by family: on a major triad 4, 9
 * or 11 (not 2, and nothing on a minor triad), 11 on a seventh, 6 on a
 * ninth and 9 on a sixth. `add9` and `6add9` are listed; the rest built.
 */
const ADDED: Record<string, string[]> = {
	"": ["4", "9", "11"],
	"7": ["11"],
	"9": ["6"],
	"6": ["9"],
};
const LISTED_ADDED = new Set(["add9", "6add9"]);

/** One added tone the reference knows only in parentheses, as barmark writes it: `C9(11)`, listed. */
const GROUPED: Record<string, string[]> = { "9": ["11"] };

/**
 * The basses a listed chord takes, in semitones above its root: a major
 * triad its 2nd, 3rd, 4th, 5th, flat 7th or 7th; a minor triad its minor
 * 3rd or flat 7th; a seventh its 3rd; a major seventh its 2nd or 3rd; a
 * minor seventh its flat 7th. No other listed chord takes a bass.
 */
const LISTED_BASS: Record<string, number[]> = {
	"": [2, 4, 5, 7, 10, 11],
	m: [3, 10],
	"7": [4],
	maj7: [2, 4],
	m7: [10],
};

/**
 * The reference's own slips over a bass, measured: slash chords its list
 * misplaces by a semitone or a letter, so the rule above calls them
 * wrongly. `true` is known, `false` unknown.
 */
const SLIPS: Record<string, boolean> = {
	"Db/C": false,
	"Db/D": true,
	"A#/D": false,
	"A#/A": false,
	"Gb/Bb": false,
	"Gb/A#": false,
	"Gbm/A": false,
	"Gbm/Bb": true,
	"Gbm/A#": true,
};

const NATURAL: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const semitone = (note: string) =>
	(NATURAL[note[0] ?? ""] ?? 0) + (note[1] === "#" ? 1 : note[1] === "b" ? -1 : 0);

/** A note whose accidental lands on another natural (`Cb`, `Fb`, `B#`, `E#`): the reference knows none. */
const landsOnNatural = (note: string) => /^(Cb|Fb|B#|E#)$/.test(note);

type Known = { suffix: string; listed: boolean };

/** The chord without its root and bass as the reference knows it, or null when it knows it in no spelling. */
function knownSuffix(p: ChordParts): Known | null {
	const family = familyOf(p);
	const [tone, ...more] = p.tones;
	if (tone === undefined)
		return UNKNOWN_BARE.has(family) ? null : { suffix: family, listed: !BUILT_BARE.has(family) };
	const run = p.tones.join("");
	if (p.tones.every((t) => /^[b#]/.test(t)) && RUN_ON[family]?.includes(run))
		return { suffix: family + run, listed: family === "m7" };
	if (more.length) return null;
	if (ADDED[family]?.includes(tone)) {
		const suffix = `${family}add${tone}`;
		return { suffix, listed: LISTED_ADDED.has(suffix) };
	}
	if (GROUPED[family]?.includes(tone)) return { suffix: `${family}(${tone})`, listed: true };
	return null;
}

/** Whether the reference knows the chord over its bass. */
function bassKnown(p: ChordParts, known: Known): boolean {
	const { root, bass } = p;
	if (bass === null) return true;
	if (landsOnNatural(bass)) return false;
	const slip = SLIPS[`${root}${p.quality}/${bass}`];
	if (slip !== undefined && known.suffix === p.quality) return slip;
	if (!known.listed) return true;
	const above = (semitone(bass) - semitone(root) + 12) % 12;
	return LISTED_BASS[known.suffix]?.includes(above) ?? false;
}

/** The spelling the reference knows, or null when it knows the chord in no spelling barmark reads. */
function knownSpelling(chord: ChordRecord): string | null {
	const p = chord.parts;
	if (!p || landsOnNatural(p.root)) return null;
	const known = knownSuffix(p);
	if (!known || !bassKnown(p, known)) return null;
	return `${p.root}${known.suffix}${p.bass ? `/${p.bass}` : ""}`;
}

/** A chord as the export writes it: canonical, or the barmark alias ChordPro readers know (spec 4.7). */
export function spelled(chord: ChordRecord): string {
	return knownSpelling(chord) ?? chord.canonical;
}

/** Whether the reference is known not to read this spelling (spec 4.7's gaps), for the losses. */
export function isGap(chord: ChordRecord): boolean {
	return knownSpelling(chord) === null;
}
