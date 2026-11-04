/**
 * Written pitch (barmark's grammar 7.3): a chart is at concert pitch, and
 * a transposing instrument's part is written an interval above it.
 */
import type { WrittenInterval } from "barmark";
import type { Pitch } from "./notes.js";
import { el, text } from "./xml.js";

const STEPS = "CDEFGAB";
const NATURAL = [0, 2, 4, 5, 7, 9, 11];

const semitones = (p: Pitch) => p.octave * 12 + (NATURAL[STEPS.indexOf(p.step)] ?? 0) + p.alter;

/** The pitch written `by` above `p`: its letter `by.diatonic` steps up, its alteration whatever reaches `by.chromatic` semitones. */
export function writtenPitch(p: Pitch, by: WrittenInterval): Pitch {
	if (by.diatonic === 0 && by.chromatic === 0) return p;
	const steps = p.octave * 7 + STEPS.indexOf(p.step) + by.diatonic;
	const step = STEPS[steps % 7] ?? "C";
	const octave = Math.floor(steps / 7);
	const natural = semitones({ step, alter: 0, octave });
	return { step, alter: semitones(p) + by.chromatic - natural, octave };
}

/** A note name (`Bb`, `F#`) written `by` above: for chord roots and slash basses. */
export function writtenName(name: string, by: WrittenInterval): string {
	const alter = [...name.slice(1)].reduce((a, c) => a + (c === "#" ? 1 : c === "b" ? -1 : 0), 0);
	const p = writtenPitch({ step: name[0] ?? "C", alter, octave: 4 }, by);
	return p.step + (p.alter > 0 ? "#".repeat(p.alter) : "b".repeat(-p.alter));
}

/** A key signature written `by` above: an interval moves a key 7×semitones − 12×steps fifths. */
export const writtenKey = (fifths: number, by: WrittenInterval) =>
	fifths + 7 * by.chromatic - 12 * by.diatonic;

/**
 * The spelling of `by` a part's keys read best in: as given while every
 * written key has seven sharps or flats at most, or else the enharmonic
 * interval a step up or down (an alto sax's diminished seventh in B major,
 * written A♭ not G♯) when that keeps them all within seven.
 */
export function fitWritten(by: WrittenInterval, fifths: number[]): WrittenInterval {
	const fits = (w: WrittenInterval) => fifths.every((f) => Math.abs(writtenKey(f, w)) <= 7);
	if (fits(by)) return by;
	const other = [1, -1]
		.map((step) => ({ diatonic: by.diatonic + step, chromatic: by.chromatic }))
		.find(fits);
	return other ?? by;
}

/** The `<transpose>` that takes the written part back to sounding pitch; none at concert pitch. */
export function transposeXml(by: WrittenInterval): string {
	if (by.diatonic === 0 && by.chromatic === 0) return "";
	const octaves = Math.floor(by.diatonic / 7);
	return el("transpose", {}, [
		text("diatonic", -(by.diatonic - 7 * octaves)),
		text("chromatic", -(by.chromatic - 12 * octaves)),
		octaves ? text("octave-change", -octaves) : "",
	]);
}
