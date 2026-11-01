import { describe, expect, test } from "bun:test";
import { degreeOf, type Key } from "../../src/index.js";

const D: Key = { tonic: "D", mode: "major" };

describe("degreeOf", () => {
	test("a root's degree above the tonic, against the major scale", () => {
		expect(degreeOf("D", D)).toEqual({ degree: 1, alter: 0 });
		expect(degreeOf("F#", D)).toEqual({ degree: 3, alter: 0 });
		expect(degreeOf("A", D)).toEqual({ degree: 5, alter: 0 });
		expect(degreeOf("B", D)).toEqual({ degree: 6, alter: 0 });
	});
	test("chromatic roots are flat or sharp degrees, by their spelling", () => {
		expect(degreeOf("C", D)).toEqual({ degree: 7, alter: -1 });
		expect(degreeOf("Bb", D)).toEqual({ degree: 6, alter: -1 });
		expect(degreeOf("G#", D)).toEqual({ degree: 4, alter: 1 });
		expect(degreeOf("Ab", D)).toEqual({ degree: 5, alter: -1 });
	});
	test("a minor key counts from its own tonic", () => {
		const Am: Key = { tonic: "A", mode: "minor" };
		expect(degreeOf("A", Am)).toEqual({ degree: 1, alter: 0 });
		expect(degreeOf("C", Am)).toEqual({ degree: 3, alter: -1 });
		expect(degreeOf("G", Am)).toEqual({ degree: 7, alter: -1 });
	});
	test("a mode counts from its tonic too", () => {
		expect(degreeOf("G", { tonic: "A", mode: "mixolydian" })).toEqual({ degree: 7, alter: -1 });
	});
	test("something that isn't a note is null", () => {
		expect(degreeOf("H", D)).toBeNull();
		expect(degreeOf("", D)).toBeNull();
		expect(degreeOf("D", { tonic: "X", mode: "major" })).toBeNull();
	});
});
