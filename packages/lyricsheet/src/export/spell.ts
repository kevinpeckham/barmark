/**
 * How a chord name is written (spec 4.7): barmark's canonical spelling,
 * except where the reference `chordpro`'s chord parser rejects it and
 * accepts another spelling barmark reads as the same chord. A **gap** is a
 * chord whose every such spelling the parser rejects (its quoted "Unknown
 * chord" warning); a name it parses but has no built-in diagram for is
 * not a gap. Measured against `chordpro` 6.101.0 on 2026-11-18 over every
 * suffix barmark enumerates, on every root and over every bass; the rules
 * below are that measurement in our words.
 *
 * No renaming across families: a chord is written as the chart wrote it
 * (`C(6)` stays `C(6)`, a gap, though `C6` sounds the same notes).
 */
import type { ChordParts, ChordRecord } from "barmark";

/** Quality, extension and sus, as the canonical spelling writes them: `m7`, `7sus4`, `` for a major triad. */
const familyOf = (p: ChordParts) => `${p.quality}${p.extension ?? ""}${p.sus ?? ""}`;

/** With no tones, the parser takes every chord barmark has but these. */
const REJECTED_BARE = new Set(["9sus2", "9sus4", "augmaj7", "m6/9"]);

/**
 * An alteration after an extension loses its parentheses (`C7b9`), a
 * ninth's alteration first (`C7b9b5`). The parser takes these runs only,
 * by family: on a dominant seventh any one alteration but `b6`, or `b9` or
 * `#9` followed by another; on the others a few single ones. Its own
 * irregular list, so a table.
 */
const RUN_ON: Record<string, string[]> = {
	"7": [
		...["b5", "#5", "b9", "#9", "#11", "b13"],
		...["b9b5", "b9#5", "b9#9", "b9#11", "b9b13", "#9b5", "#9#5", "#9#11"],
	],
	"9": ["b5", "#5", "#11"],
	"13": ["b9", "#9", "#11"],
	maj7: ["#5", "#11"],
	maj9: ["#11"],
	m7: ["b5"],
};

/**
 * One added tone, written `add` where the parser rejects its parentheses:
 * on a major triad 2, 4, 9 or 11, on a minor triad 9, on a seventh 11 and
 * on a ninth 6. `C6(9)` and `C9(11)` it takes as written.
 */
const ADDED: Record<string, string[]> = {
	"": ["2", "4", "9", "11"],
	m: ["9"],
	"7": ["11"],
	"9": ["6"],
};
const GROUPED: Record<string, string[]> = { "6": ["9"], "9": ["11"] };

/** A note whose accidental lands on a natural (`Cb`, `Fb`, `B#`, `E#`): the parser takes none, as root or bass. */
const landsOnNatural = (note: string | null) => note !== null && /^(Cb|Fb|B#|E#)$/.test(note);

/** The tones with a ninth's alteration first, as the parser wants them. */
const ninthFirst = (tones: string[]) => [
	...tones.filter((t) => t.endsWith("9")),
	...tones.filter((t) => !t.endsWith("9")),
];

/** The text after the root that the parser accepts, or null when it accepts none. */
function acceptedSuffix(p: ChordParts): string | null {
	const family = familyOf(p);
	const [tone, ...more] = p.tones;
	if (tone === undefined) return REJECTED_BARE.has(family) ? null : family;
	const run = ninthFirst(p.tones).join("");
	if (p.tones.every((t) => /^[b#]/.test(t)) && RUN_ON[family]?.includes(run)) return family + run;
	if (more.length) return null;
	if (ADDED[family]?.includes(tone)) return `${family}add${tone}`;
	return GROUPED[family]?.includes(tone) ? `${family}(${tone})` : null;
}

/** The spelling the parser accepts, or null when it accepts none barmark reads as this chord. */
function acceptedSpelling(chord: ChordRecord): string | null {
	const p = chord.parts;
	if (!p || landsOnNatural(p.root) || landsOnNatural(p.bass)) return null;
	const suffix = acceptedSuffix(p);
	if (suffix === null) return null;
	if (p.bass === null) return `${p.root}${suffix}`;
	// The parser takes a bass under any name but one with parentheses or a slash of its own.
	return /[(/]/.test(suffix) ? null : `${p.root}${suffix}/${p.bass}`;
}

/** A chord as the export writes it: canonical, or the barmark alias ChordPro readers know (spec 4.7). */
export function spelled(chord: ChordRecord): string {
	return acceptedSpelling(chord) ?? chord.canonical;
}

/** Whether the reference's chord parser rejects this chord in every spelling (spec 4.7's gaps), for the losses. */
export function isGap(chord: ChordRecord): boolean {
	return acceptedSpelling(chord) === null;
}
