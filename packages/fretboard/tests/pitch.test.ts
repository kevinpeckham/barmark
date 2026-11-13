import { expect, test } from "bun:test";
import { midiOf, pitchClass } from "../src/pitch.js";

test("pitchClass: letters, accidentals and the octave ignored", () => {
	expect(["C", "F#", "Bb", "Cb", "E#", "Bbb", "F##", "C4", "Eb2"].map(pitchClass)).toEqual([
		0, 6, 10, 11, 5, 9, 7, 0, 3,
	]);
});

test("midiOf: an octave gives MIDI, none gives null", () => {
	expect(midiOf("E2")).toBe(40);
	expect(midiOf("C4")).toBe(60);
	expect(midiOf("Cb4")).toBe(59);
	expect(midiOf("C")).toBeNull();
});
