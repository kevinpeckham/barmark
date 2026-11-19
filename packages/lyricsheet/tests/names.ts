/** Many distinct chord names, for the scale tests: a root, a kind, some alterations and a bass. */
import { parseChord } from "barmark";

const NOTES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const ALTERED = ["b5", "#5", "b9", "#9", "#11", "b13"];
const KINDS = [
	"",
	"m",
	"7",
	"m7",
	"maj7",
	"9",
	"13",
	"sus4",
	"dim",
	"aug",
	"6",
	"m6",
	"m9",
	"11",
	"maj9",
	"sus2",
	"7sus4",
	"dim7",
	"m11",
];

/** Whether a name parses with no warning (more warnings than a line lists make the chart an error). */
const clean = (name: string) => {
	const c = parseChord(name);
	return c.ok && c.warnings.length === 0;
};

/** The suffixes (a kind and some alterations) that make a different chord on C. */
function suffixes(): string[] {
	const sets: string[][] = [[]];
	for (const a of ALTERED) for (const s of [...sets]) sets.push([...s, a]);
	const found = new Map<string, string>();
	for (const kind of KINDS)
		for (const set of sets) {
			const suffix = kind + (set.length ? `(${set.join(",")})` : "");
			const c = parseChord(`C${suffix}`);
			if (c.ok && c.warnings.length === 0) found.set(c.value.canonical, suffix);
		}
	return [...found.values()];
}

/** Chord names that parse with no warning, each a different chord (over 140,000). */
export function distinctNames(): string[] {
	const names = suffixes().flatMap((suffix) =>
		NOTES.flatMap((root) =>
			NOTES.filter((bass) => bass !== root).map((bass) => `${root}${suffix}/${bass}`),
		),
	);
	return names.filter(clean);
}
