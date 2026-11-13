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

test("every slash chord of the vocabulary: no shape that fails to sound it", () => {
	let covered = 0;
	const seen = new Set<string>();
	for (const root of SPELLINGS)
		for (const form of Object.values(FORMS).flat()) {
			const name = `${root}${form}`;
			for (let pc = 0; pc < 12; pc++) {
				const c = slash(name, pc);
				if (!c) continue;
				covered++;
				const key = `${c.pitches.join(" ")}|${c.bass}|${c.intervals.map((i) => `${i.degree}${i.alter}`).join()}|${c.alteredOpen}`;
				if (seen.has(key)) continue;
				seen.add(key);
				const r = shapeFor(c);
				if (r.ok && !shapeOk(r.shape, c)) throw new Error(`${name}/${c.bass}: ${r.shape.frets}`);
				for (const s of shapesFor(c))
					if (!shapeOk(s, c)) throw new Error(`${name}/${c.bass} list: ${s.frets}`);
			}
		}
	expect(covered).toBeGreaterThan(10_000);
}, 60_000);
