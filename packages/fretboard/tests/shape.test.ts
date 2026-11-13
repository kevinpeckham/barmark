import { expect, test } from "bun:test";
import { shapeFor, shapeFrom, shapeOf, shapeText, sounding } from "../src/index.js";
import { chord, vocabulary } from "./helpers/vocabulary.js";
import { fingersNeeded } from "../src/shape.js";

test("shapeOf and shapeText read and write the six strings", () => {
	expect(shapeOf("x32010")).toEqual({ frets: [-1, 3, 2, 0, 1, 0], base: 1 });
	expect(shapeText(shapeOf("x32010"))).toBe("x32010");
	expect(shapeText(shapeFrom([-1, 10, 12, 12, 11, 10]))).toBe("x 10 12 12 11 10");
});

test("base: 1 through the fifth fret, else the lowest fretted fret", () => {
	expect(shapeFrom([-1, 3, 5, 5, 5, 3]).base).toBe(1);
	expect(shapeFrom([-1, 5, 7, 7, 7, 5]).base).toBe(5);
});

test("a barre only when more than four strings are fretted", () => {
	expect(shapeOf("133211").barre).toEqual({ fret: 1, from: 0, to: 5 }); // F
	expect(shapeOf("x24432").barre).toEqual({ fret: 2, from: 1, to: 5 }); // Bm
	expect(shapeOf("xx0232").barre).toBeUndefined(); // D: three fingers
	expect(shapeOf("x02220").barre).toBeUndefined(); // A: three fingers
});

test("fingersNeeded: a barre counts as one; an open string under it is impossible", () => {
	expect(fingersNeeded([1, 3, 3, 2, 1, 1])).toBe(4);
	expect(fingersNeeded([-1, 3, 2, 0, 1, 0])).toBe(3);
	expect(fingersNeeded([2, 2, 2, 0, 2, 2])).toBe(99);
});

test("sounding: C from x32010", () => {
	expect(sounding(shapeOf("x32010"))).toEqual([48, 52, 55, 60, 64]);
});

test("shapeOf throws on text that is not six strings", () => {
	expect(() => shapeOf("x3201")).toThrow("x3201");
	expect(() => shapeOf("x3201a")).toThrow("x3201a");
});

test("a barre spans at least two strings", () => {
	expect(shapeFrom([-1, 3, 3, 3, 3, 1]).barre).toBeUndefined();
	expect(shapeOf("133211").barre).toEqual({ fret: 1, from: 0, to: 5 });
	expect(shapeOf("x24432").barre).toEqual({ fret: 2, from: 1, to: 5 });
});

test("shapeOf reads the spaced form shapeText writes", () => {
	expect(shapeOf("x 10 12 12 11 10")).toEqual(shapeFrom([-1, 10, 12, 12, 11, 10]));
	expect(shapeOf("0 3 2 0 1 0")).toEqual(shapeOf("032010"));
	expect(shapeOf("x 3 2 0 1 24")).toEqual(shapeFrom([-1, 3, 2, 0, 1, 24]));
});

test("shapeOf throws on text that is neither form", () => {
	for (const bad of [
		"x 10 12 12 11",
		"x 10 12 12 11 10 9",
		"x 10 12 12 11 25",
		"x  10 12 12 11 10",
		" x 10 12 12 11 10",
		"x 10 12 12 11 1a",
		"x 10 12 12 11 -1",
		"x 10 12 12 11 01",
		"x10 12 12 11 10",
		"",
	])
		expect(() => shapeOf(bad)).toThrow();
});

test("shapeOf reads what shapeText writes, for every answer of the vocabulary", () => {
	let tens = 0;
	for (const { chord: c } of vocabulary()) {
		const r = shapeFor(c);
		if (!r.ok) continue;
		if (r.shape.frets.some((f) => f >= 10)) tens++;
		expect(shapeOf(shapeText(r.shape))).toEqual(r.shape);
	}
	expect(tens).toBeGreaterThan(0);
	const e = shapeFor(chord("Eaug7"));
	expect(e.ok && shapeOf(shapeText(e.shape))).toEqual(e.ok ? e.shape : null);
});
