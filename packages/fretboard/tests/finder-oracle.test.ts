import { expect, test } from "bun:test";
import type { ChordRecord } from "barmark";
import { findShapes } from "../src/finder.js";
import { shapeFrom, shapeText, sounding } from "../src/shape.js";
import { soundsChord, type Want, wantOf, withinLimits } from "../src/sounds.js";
import { GUITAR } from "../src/types.js";
import { vocabulary, wantNamed } from "./helpers/vocabulary.js";

/** The cost in whole tenths (spec §2.3). */
function tenths(frets: readonly number[]): number {
	const fretted = frets.filter((f) => f > 0);
	const lowest = fretted.length === 0 ? 0 : Math.min(...fretted);
	const span = fretted.length === 0 ? 0 : Math.max(...fretted) - lowest;
	return lowest * 10 + span * 10 + (6 - frets.filter((f) => f >= 0).length) * 8;
}

/** Every fingering the rules allow, by plain enumeration: no pruning, no cache. */
function oracle(record: ChordRecord, want: Want): string[] {
	const tones = new Set([...want.required, ...want.optional]);
	const found = new Map<string, number>();
	for (let base = 1; base <= 12; base++) {
		const options = GUITAR.strings.map((open) => {
			const o = [-1];
			if (tones.has(open % 12)) o.push(0);
			for (let f = base; f < base + 4; f++) if (tones.has((open + f) % 12)) o.push(f);
			return o;
		});
		const frets: number[] = [];
		const go = (i: number): void => {
			if (i === 6) {
				const shape = shapeFrom(frets);
				if (!soundsChord(shape, record) || !withinLimits(shape, want.minStrings)) return;
				const notes = sounding(shape);
				const classes = new Set(notes.map((n) => n % 12));
				const left = [...want.optional].filter((p) => !classes.has(p)).length;
				const top = (notes[notes.length - 1] ?? 0) % 12;
				found.set(shapeText(shape), tenths(frets) + 15 * left - (top === want.root ? 3 : 0));
				return;
			}
			for (const f of options[i] ?? []) {
				frets[i] = f;
				go(i + 1);
			}
		};
		go(0);
	}
	return [...found.entries()]
		.sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
		.map(([text]) => text);
}

test("the finder returns exactly what a plain enumeration of the rules returns", () => {
	const seen = new Map<string, string[]>();
	for (const { name, chord: record } of vocabulary()) {
		const want = wantOf(record);
		if (!want) throw new Error(`${name}: no want`);
		const key = `${[...want.required]}|${[...want.optional]}|${want.bass}|${want.root}|${want.minStrings}|${record.bass}`;
		let plain = seen.get(key);
		if (!plain) {
			plain = oracle(record, want).slice(0, 10);
			seen.set(key, plain);
		}
		const got = findShapes(want, 10).map(shapeText);
		if (got.join(" ") !== plain.join(" "))
			throw new Error(`${name}: finder ${got.join(" ")} / oracle ${plain.join(" ")}`);
	}
}, 120_000);

test("named cases: shapes with muted strings above the top note are found", () => {
	expect(findShapes(wantNamed("C"), 1000).map(shapeText)).toContain("x320xx");
	expect(
		findShapes(wantNamed("C5(7)"))[0] && shapeText(findShapes(wantNamed("C5(7)"))[0] as never),
	).toBe("x353xx");
});

test("equal costs tie on shapeText, ascending", () => {
	const list = findShapes(wantNamed("Db7/F"), 1000).map(shapeText);
	const a = list.indexOf("xx3604");
	const b = list.indexOf("xx342x");
	expect(a).toBeGreaterThanOrEqual(0);
	expect(b).toBeGreaterThanOrEqual(0);
	// character by character: "xx34" ties, then "2" < "6", so xx342x sorts first
	expect("xx342x" < "xx3604").toBe(true);
	expect(b).toBeLessThan(a);
});
