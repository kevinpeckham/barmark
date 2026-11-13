import { expect, test } from "bun:test";
import { findShapes } from "../src/finder.js";
import { shapeText, sounding } from "../src/shape.js";
import { soundsChord, wantOf, withinLimits } from "../src/sounds.js";
import type { Shape } from "../src/types.js";
import { chord, FORMS, ROOTS, vocabulary, wantNamed } from "./helpers/vocabulary.js";

test("every chord of the vocabulary has a shape, and each sounds its chord within limits", () => {
	const all = vocabulary();
	expect(all.length).toBe(660);
	const slash = all.filter((v) => v.family === "slash").length;
	expect(all.length - slash).toBe(Object.values(FORMS).flat().length * ROOTS.length);
	expect(slash).toBe(96);
	for (const { name, chord } of all) {
		const want = wantOf(chord);
		if (!want) throw new Error(`${name}: no want`);
		const [first] = findShapes(want);
		if (!first) throw new Error(`${name}: no shape`);
		if (!soundsChord(first, chord))
			throw new Error(`${name}: ${shapeText(first)} does not sound it`);
		if (!withinLimits(first, want.minStrings))
			throw new Error(`${name}: ${shapeText(first)} is outside the limits`);
	}
});

test("the finder is deterministic and best first", () => {
	const want = wantNamed("Am7");
	expect(findShapes(want).map(shapeText)).toEqual(findShapes(want).map(shapeText));
	expect(findShapes(want, 3)).toHaveLength(3);
});

/** The best shape for a named chord; throws when there is none. */
function best(name: string): Shape {
	const [first] = findShapes(wantNamed(name));
	if (!first) throw new Error(`${name}: no shape`);
	return first;
}

test("a slash chord puts its bass on the lowest string that sounds", () => {
	expect((sounding(best("C/G"))[0] ?? -1) % 12).toBe(7);
});

test("a power chord may be two strings; a triad never is", () => {
	expect(best("C5").frets.filter((f) => f >= 0).length).toBeGreaterThanOrEqual(2);
	for (const s of findShapes(wantNamed("C")))
		expect(s.frets.filter((f) => f >= 0).length).toBeGreaterThanOrEqual(3);
});

test("7alt is found as a shell of three tones", () => {
	expect(new Set(sounding(best("C7alt")).map((n) => n % 12))).toEqual(new Set([0, 4, 10]));
});

test("a set of tones no hand can hold gives no shape", () => {
	const want = {
		required: new Set([0, 1, 2, 3, 4, 5, 6]),
		optional: new Set<number>(),
		bass: 0,
		root: 0,
		minStrings: 3 as const,
		shell: false,
	};
	expect(findShapes(want)).toEqual([]);
});

test("the result does not depend on the cache, warm or fresh", () => {
	const warm = new Map<string, ReturnType<typeof findShapes>>();
	for (const name of ["G7", "Fmaj7", "Am", "C13"]) findShapes(wantNamed(name), 10, warm);
	for (const name of ["Am7", "C/G", "Bb13", "F#m7(b5)"]) {
		const want = wantNamed(name);
		expect(findShapes(want, 10, warm).map(shapeText)).toEqual(
			findShapes(want, 10, new Map()).map(shapeText),
		);
	}
});

test("a returned shape is a copy: changing it does not change later answers", () => {
	const cache = new Map<string, ReturnType<typeof findShapes>>();
	const want = wantNamed("Am7");
	const first = findShapes(want, 10, cache);
	const snapshot = JSON.parse(JSON.stringify(first));
	for (const s of first) {
		s.frets.fill(7);
		s.base = 99;
	}
	first.length = 0;
	expect(JSON.parse(JSON.stringify(findShapes(want, 10, cache)))).toEqual(snapshot);
});

test("two chords with the same tones and bass share a cache entry", () => {
	const cache = new Map<string, ReturnType<typeof findShapes>>();
	findShapes(wantNamed("C7"), 10, cache);
	findShapes(wantNamed("C7/C"), 10, cache);
	expect(cache.size).toBe(1);
	expect(chord("C7/C").bass).toBe("C");
});
