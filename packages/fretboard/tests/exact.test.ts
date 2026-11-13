import { expect, test } from "bun:test";
import { exactShapes, orderedShapes } from "../src/exact.js";
import { shapeText, sounding } from "../src/shape.js";

const texts = (shapes: ReturnType<typeof exactShapes>) => shapes.map(shapeText);

test("exact: each note on its own string, strings ascending", () => {
	const all = exactShapes([48, 55, 64]);
	expect(all.length).toBe(10);
	expect(shapeText(all[0] as never)).toBe("x3x0x0");
	for (const s of all) expect(sounding(s)).toEqual([48, 55, 64]);
});

test("exact: unsorted input is sorted; a repeated pitch cannot be placed", () => {
	expect(texts(exactShapes([64, 48, 55]))).toEqual(texts(exactShapes([48, 55, 64])));
	expect(exactShapes([48, 48])).toEqual([]);
	expect(exactShapes([])).toEqual([]);
});

test("exact: two notes of one string, a note below or above the guitar", () => {
	expect(exactShapes([40, 52]).length).toBeGreaterThan(0);
	expect(exactShapes([28])).toEqual([]);
	expect(exactShapes([100])).toEqual([]);
	expect(exactShapes([40, 41, 42, 43, 44, 45, 46])).toEqual([]);
});

test("exact: the best has the lowest highest fret", () => {
	expect(texts(exactShapes([40, 64]))[0]).toBe("0xxxx0");
	const all = exactShapes([53, 60, 64]);
	const tops = all.map((s) => Math.max(...s.frets));
	expect(tops).toEqual([...tops].sort((a, b) => a - b));
	expect(tops[0]).toBeLessThan(tops.at(-1) as number);
});

test("exact: then the fewest muted strings inside", () => {
	// E2 open; C#3 on the A string fret 4; B3 on the G string fret 4 or the B string open.
	// Both top out at fret 4; the G string leaves one muted string inside, the B string two.
	expect(texts(exactShapes([40, 49, 59]))).toEqual(["04x4xx", "04xx0x"]);
});

test("exact: then the frets as numbers, muted before any fret", () => {
	// E2 open, B3 (G string fret 4 or B string open), G#4 (e string fret 4 or B string fret 9).
	// All top out at fret 4 and span five strings: 0xxx04 has a muted fourth string, 0xx4x4 a fret.
	expect(texts(exactShapes([40, 59, 68]))[0]).toBe("0xxx04");
});

test("exact: frets of 10 or more order as numbers, not as text", () => {
	// E3 and B3: the same notes on several string pairs, frets of 7 to 14
	const all = exactShapes([52, 59]);
	const tops = all.map((s) => Math.max(...s.frets));
	expect(tops).toEqual([...tops].sort((a, b) => a - b));
	expect(tops[0]).toBeLessThan(tops.at(-1) as number);
});

test("exact: equal in top fret and reach, the frets decide, a muted string first", () => {
	// E2, D3, C4: 0x05xx and 05x5xx both top out at fret 5 and reach four strings
	expect(texts(exactShapes([40, 50, 60]))).toEqual(["0x0x1x", "0x05xx", "05x5xx"]);
});

test("exact: equal in top fret and reach with a fret of 10 or more, a muted string comes before it", () => {
	// E2, G3, A4: both of the last two top out at fret 10 and reach five strings; as text "x" would sort after "10"
	expect(texts(exactShapes([40, 55, 69]))).toEqual([
		"0xx0x5",
		"0x5xx5",
		"0 x x 0 10 x",
		"0 10 x x 10 x",
	]);
});

test("exact: span, fingers and frets", () => {
	for (const s of exactShapes([43, 47, 50, 55, 59, 62])) {
		const fretted = s.frets.filter((f) => f > 0);
		if (fretted.length > 0)
			expect(Math.max(...fretted) - Math.min(...fretted)).toBeLessThanOrEqual(3);
	}
	expect(exactShapes([41, 69])).toEqual([]);
});

test("ordered: pitch classes low to high, each higher than the last, octaves free", () => {
	const all = orderedShapes([0, 4, 7]);
	expect(all.length).toBeGreaterThan(0);
	for (const s of all) {
		const notes = sounding(s);
		expect(notes.map((n) => n % 12)).toEqual([0, 4, 7]);
		expect(notes[0]).toBeLessThan(notes[1] as number);
		expect(notes[1]).toBeLessThan(notes[2] as number);
	}
});

test("ordered: a repeated pitch class goes up an octave; too many notes have none", () => {
	const all = orderedShapes([0, 4, 0]);
	expect(all.length).toBeGreaterThan(0);
	for (const s of all) {
		const n = sounding(s);
		expect(n[2]).toBeGreaterThan(n[0] as number);
	}
	expect(orderedShapes([0, 1, 2, 3, 4, 5, 6])).toEqual([]);
	expect(orderedShapes([])).toEqual([]);
});

test("ordered: a note set the hand cannot reach has none", () => {
	expect(orderedShapes([0, 6, 0, 6, 0, 6])).toEqual([]);
});
