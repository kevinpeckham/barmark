import { expect, test } from "bun:test";
import { shapeFrom, shapeOf, shapeText, sounding } from "../src/index.js";
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
