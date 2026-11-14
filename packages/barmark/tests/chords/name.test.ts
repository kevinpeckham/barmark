import { describe, expect, test } from "bun:test";
import type { Key } from "../../src/chart/types.js";
import { noteSemitone } from "../../src/chords/intervals.js";
import { nameNotes } from "../../src/chords/name.js";
import { parseNoteSet } from "../../src/chords/noteSet.js";
import { parseChord } from "../../src/chords/parse.js";

/** A symbol or note set's pitch classes and bass, as an importer would hear them. */
const heard = (input: string) => {
	const r = input.startsWith("{") ? parseNoteSet(input) : parseChord(input);
	if (!r.ok) throw new Error(`${input}: ${r.error.message}`);
	return { pcs: r.value.pitches.map(noteSemitone), bass: noteSemitone(r.value.bass) };
};
const name = (input: string, key: Key | null = null) => {
	const { pcs, bass } = heard(input);
	return nameNotes(pcs, bass, key);
};

const A4 = [
	"C",
	"Cm",
	"Cdim",
	"Caug",
	"Csus2",
	"Csus4",
	"C5",
	"C6",
	"Cm6",
	"C6/9",
	"C7",
	"Cmaj7",
	"Cm7",
	"Cmmaj7",
	"Cdim7",
	"Cm7(b5)",
	"Caug7",
	"C7sus4",
	"C9",
	"Cmaj9",
	"Cm9",
	"Cm11",
	"C13",
	"Cm13",
	"Cmaj13",
	"C9sus4",
	"C7(b9)",
	"C7(#9)",
	"C7(#11)",
	"C7(b13)",
	"C(9)",
	"C5(7)",
	"C/E",
];

const keys: (Key | null)[] = [
	null,
	...["C", "G", "D", "A", "E", "B", "F#", "C#", "F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb"].map(
		(tonic): Key => ({ tonic, mode: "major" }),
	),
];

/** Every set of three or four of the twelve pitch classes. */
const smallSets = (() => {
	const sets: number[][] = [];
	const grow = (set: number[]) => {
		if (set.length >= 3) sets.push(set);
		if (set.length === 4) return;
		for (let pc = (set.at(-1) ?? -1) + 1; pc < 12; pc++) grow([...set, pc]);
	};
	grow([]);
	return sets;
})();

const EXHAUSTIVE_TIMEOUT = 60_000;

/** A root or slash bass with more than one accidental. */
const doublySpelled = (symbol: string) => /^[A-G][#b]{2}|\/[A-G][#b]{2}$/.test(symbol);

describe("nameNotes", () => {
	test("every A.4 symbol on C names itself", () => {
		for (const symbol of A4) expect([symbol, name(symbol)]).toEqual([symbol, symbol]);
	});

	test("same notes, the preferred name", () => {
		expect(name("C11")).toBe("C9sus4");
		expect(name("C/Bb")).toBe("C7/Bb");
		expect(name("Am7/C")).toBe("C6");
		expect(name("F/G")).toBe("G9sus4");
	});

	test("inversions", () => {
		expect(name("{E G C}")).toBe("C/E");
		expect(name("G7/B")).toBe("G7/B");
		expect(name("Em/B")).toBe("Em/B");
		expect(name("Cmaj7/E")).toBe("Cmaj7/E");
		expect(name("Dm7/C")).toBe("Dm7/C");
	});

	test("a first-inversion triad is the triad over its third, not a sixth chord", () => {
		expect(name("{Eb C G}")).toBe("Cm/Eb");
		expect(name("{G B E}")).toBe("Em/G");
		expect(name("{Eb C Gb}")).toBe("Cdim/Eb");
	});

	test("a missing fifth is supplied", () => {
		expect(name("{C E Bb}")).toBe("C7");
		expect(name("{G B F}")).toBe("G7");
		expect(name("{C Eb Bb}")).toBe("Cm7");
		expect(name("{C E}")).toBeNull();
	});

	test("half-diminished counts as a shorthand", () => {
		expect(name("{B D F A}")).toBe("Bm7(b5)");
		expect(name("Cm7(b5)")).toBe("Cm7(b5)");
	});

	test("dyads", () => {
		expect(name("{E B}")).toBe("E5");
		expect(name("{B E}")).toBe("E5/B");
		expect(name("{C D}")).toBeNull();
		expect(name("{C}")).toBeNull();
		expect(nameNotes([], 0, null)).toBeNull();
	});

	test("pitch classes are taken mod 12, deduplicated, and the bass added", () => {
		expect(nameNotes([12, 16, 19, 28, -5], 0, null)).toBe("C");
		expect(nameNotes([16, 19], 0, null)).toBe("C");
		expect(nameNotes([0, 4, 7], -8, null)).toBe("C/E");
	});

	test("spelled for the key", () => {
		expect(nameNotes([10, 2, 5], 10, { tonic: "F", mode: "major" })).toBe("Bb");
		expect(nameNotes([10, 2, 5], 10, { tonic: "D", mode: "major" })).toBe("Bb");
		expect(nameNotes([1, 5, 8], 1, { tonic: "Db", mode: "major" })).toBe("Db");
		expect(nameNotes([1, 5, 8], 1, { tonic: "C#", mode: "minor" })).toBe("C#");
	});

	// Every set of three or four pitch classes, on each of its notes, in 16 keys: about 40,000 names,
	// a few seconds alone and more under load, so these exhaustive tests take a timeout of their own.
	test(
		"root and bass never take a double accidental, in any major key or none",
		() => {
			const bad = keys.flatMap((key) =>
				smallSets.flatMap((pcs) => pcs.map((bass) => nameNotes(pcs, bass, key) ?? "")),
			);
			expect(bad.filter(doublySpelled)).toEqual([]);
		},
		EXHAUSTIVE_TIMEOUT,
	);

	test(
		"keyless: no double accidental and no E#, B#, Cb or Fb anywhere in the name",
		() => {
			const bad = smallSets.flatMap((pcs) => pcs.map((bass) => nameNotes(pcs, bass, null) ?? ""));
			expect(bad.filter((n) => /##|bb|E#|B#|Cb|Fb/.test(n))).toEqual([]);
		},
		EXHAUSTIVE_TIMEOUT,
	);

	test("a flat sixth is named as it was before b6 was a tone: (b13) wins", () => {
		expect(name("C7(b6)")).toBe("C7(b13)");
		expect(name("C9(b6)")).toBe("C9(b13)");
		expect(name("C(b6,9)")).toBe("C(9,b13)");
		expect(name("F#m(b6)")).toBe("Dmaj7/F#");
	});

	test("a bass the interval would double is spelled by pitch", () => {
		expect(name("{G E G#}")).toBe("E(#9)/G");
	});

	test("nonsense from the suffix table loses to the musician's name", () => {
		expect(name("{B G F Ab}")).toBe("G7(b9)/B");
		expect(name("{C E Bb A}")).toBe("C7(13)");
		expect(name("{C E G A Bb}")).toBe("C7(13)");
		expect(name("{G B F E}")).toBe("G7(13)");
		expect(name("{C E Bb Db F#}")).toBe("C7(b5,b9)");
	});

	test("on a tie, the root in the bass wins", () => {
		expect(name("{C E G Bb Db Eb}")).toBe("C7(b9,#9)");
		expect(name("{G C F}")).toBe("G7sus4");
	});

	test("keyless roots on black keys take the spelling with fewer faults", () => {
		expect(name("{Db F Ab}")).toBe("Db");
		expect(name("{F Ab Db}")).toBe("Db/F");
		expect(name("{C# E G#}")).toBe("C#m");
		expect(name("{G# B D F}")).toBe("G#dim7");
	});

	test("an in-scale root keeps the key's spelling", () => {
		expect(nameNotes([8, 0, 3], 8, { tonic: "E", mode: "major" })).toBe("G#");
		expect(nameNotes([1, 5, 8], 5, { tonic: "C#", mode: "major" })).toBe("C#/E#");
		expect(nameNotes([11, 3, 6], 6, { tonic: "Gb", mode: "major" })).toBe("Cb/Gb");
	});

	test("ties prefer (9) to (2)", () => {
		expect(name("{C E G D}")).toBe("C(9)");
	});

	test("nothing fits", () => {
		expect(name("{C C# D D# E}")).toBeNull();
	});
});
