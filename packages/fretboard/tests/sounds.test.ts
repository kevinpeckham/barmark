import { expect, test } from "bun:test";
import { shapeOf, soundsChord } from "../src/index.js";
import { wantOf, withinLimits } from "../src/sounds.js";
import { chord } from "./helpers/chord.js";

test("soundsChord: the open chords sound their names", () => {
	for (const [name, text] of [
		["C", "x32010"],
		["Am", "x02210"],
		["G", "320003"],
		["E7", "020100"],
		["Dm", "xx0231"],
		["G/B", "x20003"],
	] as const)
		expect(soundsChord(shapeOf(text), chord(name))).toBe(true);
});

test("soundsChord refuses a wrong note, a missing tone and a wrong bass", () => {
	expect(soundsChord(shapeOf("x35353"), chord("Bb7"))).toBe(false); // a C7: the error ChordPro's table has
	expect(soundsChord(shapeOf("x3201x"), chord("C7"))).toBe(false); // no flat seventh
	expect(soundsChord(shapeOf("x32010"), chord("C/E"))).toBe(false); // C in the bass
	expect(soundsChord(shapeOf("032010"), chord("C/E"))).toBe(true);
});

test("the fifth may go in a seventh chord, never in a triad", () => {
	// x3x310 sounds C, B flat, C, E: no G. The tones are right; the muted string inside is the limits' matter.
	expect(soundsChord(shapeOf("x3x310"), chord("C7"))).toBe(true);
	expect(withinLimits(shapeOf("x3x310"))).toBe(false);
	expect(wantOf(chord("C7"))?.optional.has(7)).toBe(true);
	expect(wantOf(chord("C"))?.optional.size).toBe(0);
});

test("a thirteenth may leave out the fifth, the ninth and the eleventh", () => {
	const w = wantOf(chord("C13"));
	expect([...(w?.required ?? [])].sort((a, b) => a - b)).toEqual([0, 4, 9, 10]); // C E A Bb
});

test("7alt is a shell: root, third and flat seventh", () => {
	const w = wantOf(chord("C7alt"));
	expect(w?.shell).toBe(true);
	expect([...(w?.required ?? [])].sort((a, b) => a - b)).toEqual([0, 4, 10]);
	expect(w?.optional.size).toBe(0);
});

test("a power chord needs two strings; a note set wants nothing", () => {
	expect(wantOf(chord("C5"))?.minStrings).toBe(2);
	expect(wantOf(chord("{C3 G3 E4}"))).toBeNull();
	expect(soundsChord(shapeOf("x32010"), chord("{C3 G3 E4}"))).toBe(false);
});

test("withinLimits: span, fingers, interior mutes and string count", () => {
	expect(withinLimits(shapeOf("x32010"))).toBe(true);
	expect(withinLimits(shapeOf("x3x010"))).toBe(false); // a muted string inside
	expect(withinLimits(shapeOf("1x5xxx"))).toBe(false);
	expect(withinLimits(shapeOf("xxxx13"))).toBe(false); // two strings
	expect(withinLimits(shapeOf("xxxx13"), 2)).toBe(true);
});
