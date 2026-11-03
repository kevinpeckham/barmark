/**
 * The 33 MusicXML 4.0 harmony kinds and the intervals each spells, as
 * barmark writes intervals: a diatonic degree and its alteration from the
 * major or perfect interval. Common chords come first, so they win ties.
 * Kinds MusicXML defines by function rather than by intervals (Neapolitan,
 * the augmented sixths, Tristan) and `other` and `none` have no intervals,
 * and are never chosen for a chord symbol.
 */
import type { Interval } from "barmark";

const iv = (spec: string): Interval[] =>
	spec.split(" ").map((s) => {
		const alter =
			[...s].filter((c) => c === "b").length * -1 + [...s].filter((c) => c === "#").length;
		return { degree: Number(s.replace(/[b#]/g, "")), alter };
	});

export const KINDS: { kind: string; intervals: Interval[] | null }[] = [
	{ kind: "major", intervals: iv("1 3 5") },
	{ kind: "minor", intervals: iv("1 b3 5") },
	{ kind: "dominant", intervals: iv("1 3 5 b7") },
	{ kind: "major-seventh", intervals: iv("1 3 5 7") },
	{ kind: "minor-seventh", intervals: iv("1 b3 5 b7") },
	{ kind: "major-sixth", intervals: iv("1 3 5 6") },
	{ kind: "minor-sixth", intervals: iv("1 b3 5 6") },
	{ kind: "suspended-fourth", intervals: iv("1 4 5") },
	{ kind: "suspended-second", intervals: iv("1 2 5") },
	{ kind: "power", intervals: iv("1 5") },
	{ kind: "diminished", intervals: iv("1 b3 b5") },
	{ kind: "augmented", intervals: iv("1 3 #5") },
	{ kind: "half-diminished", intervals: iv("1 b3 b5 b7") },
	{ kind: "diminished-seventh", intervals: iv("1 b3 b5 bb7") },
	{ kind: "augmented-seventh", intervals: iv("1 3 #5 b7") },
	{ kind: "major-minor", intervals: iv("1 b3 5 7") },
	{ kind: "dominant-ninth", intervals: iv("1 3 5 b7 9") },
	{ kind: "major-ninth", intervals: iv("1 3 5 7 9") },
	{ kind: "minor-ninth", intervals: iv("1 b3 5 b7 9") },
	{ kind: "dominant-11th", intervals: iv("1 3 5 b7 9 11") },
	{ kind: "major-11th", intervals: iv("1 3 5 7 9 11") },
	{ kind: "minor-11th", intervals: iv("1 b3 5 b7 9 11") },
	{ kind: "dominant-13th", intervals: iv("1 3 5 b7 9 11 13") },
	{ kind: "major-13th", intervals: iv("1 3 5 7 9 11 13") },
	{ kind: "minor-13th", intervals: iv("1 b3 5 b7 9 11 13") },
	{ kind: "pedal", intervals: iv("1") },
	{ kind: "Neapolitan", intervals: null },
	{ kind: "Italian", intervals: null },
	{ kind: "French", intervals: null },
	{ kind: "German", intervals: null },
	{ kind: "Tristan", intervals: null },
	{ kind: "other", intervals: null },
	{ kind: "none", intervals: null },
];
