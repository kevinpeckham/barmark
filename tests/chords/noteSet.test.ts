import { describe, expect, test } from "bun:test";
import { formatInterval } from "../../src/chords/intervals.js";
import { parseNoteSet } from "../../src/chords/noteSet.js";
import type { ChordRecord } from "../../src/chords/types.js";

const ok = (text: string): ChordRecord => {
	const r = parseNoteSet(text);
	if (!r.ok) throw new Error(`${text}: ${r.error.message}`);
	return r.value;
};
const warnings = (text: string) => {
	const r = parseNoteSet(text);
	if (!r.ok) throw new Error(r.error.message);
	return r.warnings;
};

describe("note sets", () => {
	test("a single note has no root and is its own bass", () => {
		const r = ok("{E}");
		expect(r.kind).toBe("notes");
		expect(r.root).toBeNull();
		expect(r.bass).toBe("E");
		expect(r.pitches).toEqual(["E"]);
		expect(r.canonical).toBe("{E}");
	});
	test("! marks the root; the first note stays the bass", () => {
		const r = ok("{D E! G}");
		expect(r.root).toBe("E");
		expect(r.bass).toBe("D");
		expect(r.intervals.map(formatInterval)).toEqual(["1", "b3", "b7"]);
		expect(r.canonical).toBe("{D E! G}");
	});
	test("Unicode accidentals normalize", () => {
		expect(ok("{F♯ B♭}").canonical).toBe("{F# Bb}");
	});
});

describe("octaves", () => {
	test("ascending voicing reads without warnings", () => {
		expect(warnings("{C3 G3 E4}")).toEqual([]);
		expect(ok("{C3 G3 E4}").pitches).toEqual(["C3", "G3", "E4"]);
	});
	test("out of order warns and prints ascending, lowest note as bass", () => {
		expect(warnings("{E4 C3}")).toHaveLength(1);
		const r = ok("{E4 C3}");
		expect(r.canonical).toBe("{C3 E4}");
		expect(r.bass).toBe("C");
	});
	test("the octave belongs to the letter: B#3 sounds as C4", () => {
		expect(warnings("{B#3 C#4}")).toEqual([]);
	});
});

describe("note set errors and warnings", () => {
	for (const bad of ["{}", "{E2 B}", "{E9}", "{D! E!}", "{X}"]) {
		test(`${bad} is an error`, () => expect(parseNoteSet(bad).ok).toBe(false));
	}
	test("a repeated note without octaves warns", () => {
		expect(warnings("{E E}")).toHaveLength(1);
	});
});
