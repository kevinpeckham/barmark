import { describe, expect, test } from "bun:test";
import { parseNoteSet } from "../../src/chords/noteSet.js";
import { parseChord } from "../../src/chords/parse.js";

const parts = (s: string) => {
	const r = parseChord(s);
	if (!r.ok) throw new Error(r.error.message);
	return r.value.parts;
};

describe("chord parts", () => {
	test("the canonical parts of F#m7(b5)", () => {
		expect(parts("F#m7(b5)")).toEqual({
			root: "F#",
			quality: "m",
			extension: "7",
			sus: null,
			tones: ["b5"],
			bass: null,
		});
	});

	test("aliases give the canonical parts", () => {
		expect(parts("Cø")).toEqual(parts("Cm7(b5)"));
		expect(parts("C-7")).toEqual(parts("Cm7"));
		expect(parts("CΔ")).toEqual(parts("Cmaj7"));
		expect(parts("C♯7♭9")).toEqual(parts("C#7(b9)"));
	});

	test("tones are in canonical order and the bass is kept", () => {
		expect(parts("C7(#11,b9)")?.tones).toEqual(["b9", "#11"]);
		expect(parts("C/E")?.bass).toBe("E");
		expect(parts("A7sus4")).toMatchObject({ extension: "7", sus: "sus4" });
	});

	test("a note set has no parts", () => {
		const r = parseNoteSet("{D E! G}");
		expect(r.ok && r.value.parts).toBeNull();
	});
});
