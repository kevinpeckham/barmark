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

	test("root and bass never take a double accidental, in any major key or none", () => {
		const bad = keys.flatMap((key) =>
			smallSets.flatMap((pcs) => pcs.map((bass) => nameNotes(pcs, bass, key) ?? "")),
		);
		expect(bad.filter(doublySpelled)).toEqual([]);
	});

	test("ties prefer (9) to (2)", () => {
		expect(name("{C E G D}")).toBe("C(9)");
	});

	test("nothing fits", () => {
		expect(name("{C C# D D# E}")).toBeNull();
	});
});
