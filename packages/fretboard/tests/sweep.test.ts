import { expect, test } from "bun:test";
import { type ChordRecord, parseChord } from "barmark";
import { shapeFor, shapesFor, soundsChord } from "../src/index.js";
import { wantOf, withinLimits } from "../src/sounds.js";
import { chord, FORMS, ROOTS } from "./helpers/vocabulary.js";

/** The vocabulary's roots and their other spellings, so the sweep covers every name a player may write. */
const SPELLINGS = [...ROOTS, "C#", "D#", "G#", "A#", "Cb", "E#", "Fb", "B#"];
const SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

/** The chord `name/bass` for the first spelling of a pitch class that barmark reads, or null. */
function slash(name: string, pc: number): ChordRecord | null {
	for (const bass of [SHARP[pc], FLAT[pc]]) {
		const r = parseChord(`${name}/${bass}`);
		if (r.ok && r.value.kind === "chord") return r.value;
	}
	return null;
}

const shapeOk = (shape: Parameters<typeof soundsChord>[0], c: ChordRecord): boolean =>
	soundsChord(shape, c) && withinLimits(shape, wantOf(c)?.minStrings);

test("the five chords the review found: each shape sounds its chord", () => {
	for (const name of ["Am7/C", "Edim/C", "Em7(b5)/C", "Gm6/C", "Am(9)/F"]) {
		const c = chord(name);
		const r = shapeFor(c);
		if (r.ok) expect(shapeOk(r.shape, c)).toBe(true);
		for (const s of shapesFor(c)) expect(shapeOk(s, c)).toBe(true);
	}
	const r = shapeFor(chord("Am7/C"));
	expect(r.ok && r.shape.frets.join(",")).toBe([-1, 3, 2, 0, 5, 5].join(","));
});

/** The chord's notes, bass and intervals: what the answer depends on, so equal ones are checked once. */
const keyOf = (c: ChordRecord): string =>
	`${c.pitches.join(" ")}|${c.bass}|${c.intervals.map((i) => `${i.degree}${i.alter}`).join()}|${c.alteredOpen}`;

/** Throws, naming the chord, when `shapeFor` or `shapesFor` gives a shape that fails to sound it. */
function checkAnswers(name: string, c: ChordRecord): void {
	const r = shapeFor(c);
	if (r.ok && !shapeOk(r.shape, c)) throw new Error(`${name}/${c.bass}: ${r.shape.frets}`);
	for (const s of shapesFor(c))
		if (!shapeOk(s, c)) throw new Error(`${name}/${c.bass} list: ${s.frets}`);
}

/** Every name `root`+form on the vocabulary's forms, with each of the twelve basses barmark reads for it. */
function slashChords(): { name: string; chord: ChordRecord }[] {
	const out: { name: string; chord: ChordRecord }[] = [];
	for (const root of SPELLINGS)
		for (const form of Object.values(FORMS).flat())
			for (let pc = 0; pc < 12; pc++) {
				const c = slash(`${root}${form}`, pc);
				if (c) out.push({ name: `${root}${form}`, chord: c });
			}
	return out;
}

test("every slash chord of the vocabulary: no shape that fails to sound it", () => {
	const all = slashChords();
	const seen = new Set<string>();
	for (const { name, chord: c } of all) {
		if (seen.has(keyOf(c))) continue;
		seen.add(keyOf(c));
		checkAnswers(name, c);
	}
	expect(all.length).toBeGreaterThan(10_000);
}, 60_000);
