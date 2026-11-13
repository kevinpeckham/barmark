import { expect, test } from "bun:test";
import { tableShape } from "../src/lookup.js";
import { pitchClass } from "../src/pitch.js";
import { shapeOf, shapeText } from "../src/shape.js";
import { soundsChord, wantOf, withinLimits } from "../src/sounds.js";
import { MOVABLE, OPEN } from "../src/table.js";
import { chord, vocabulary } from "./helpers/vocabulary.js";

test("every row sounds its name, within the limits, and reads back", () => {
	for (const [name, frets] of [...OPEN, ...MOVABLE]) {
		const c = chord(name);
		const shape = shapeOf(frets);
		if (!soundsChord(shape, c)) throw new Error(`${name} ${frets} does not sound its name`);
		if (!withinLimits(shape, wantOf(c)?.minStrings))
			throw new Error(`${name} ${frets} is outside the limits`);
		expect(shapeText(shape)).toBe(frets);
	}
});

test("no row is written twice, and no two open rows name one chord", () => {
	const rows = [...OPEN, ...MOVABLE].map(([name, frets]) => `${name} ${frets}`);
	expect(new Set(rows).size).toBe(rows.length);
	const identities = OPEN.map(([name]) => {
		const c = chord(name);
		const tones = [...new Set(c.pitches.map(pitchClass))].sort((a, b) => a - b).join(".");
		return `${tones}/${pitchClass(c.bass)}`;
	});
	const twice = identities.filter((id, i) => identities.indexOf(id) !== i);
	expect(twice).toEqual([]);
});

test("a movable row has no open string", () => {
	for (const [, frets] of MOVABLE) expect(frets).not.toContain("0");
});

test("the table is at least the size the design asks for", () => {
	expect(OPEN.length).toBeGreaterThanOrEqual(100);
	expect(MOVABLE.length).toBeGreaterThanOrEqual(100);
});

test("the shapes most players learn first", () => {
	const first = (n: string) => {
		const shape = tableShape(chord(n));
		return shape ? shapeText(shape) : null;
	};
	expect(first("C")).toBe("x32010");
	expect(first("G")).toBe("320003");
	expect(first("D")).toBe("xx0232");
	expect(first("A")).toBe("x02220");
	expect(first("E")).toBe("022100");
	expect(first("Am")).toBe("x02210");
	expect(first("Em")).toBe("022000");
	expect(first("Dm")).toBe("xx0231");
	expect(first("F")).toBe("133211");
	expect(first("Bm")).toBe("x24432");
	expect(first("B7")).toBe("x21202");
	expect(first("G/B")).toBe("x20003");
	// Many players mute the A string here (2x0232). The limits forbid a muted string inside a named
	// chord's shape, and the open A is in the chord, so the table's row lets it ring.
	expect(first("D/F#")).toBe("200232");
});

test("a movable shape follows its root along the neck", () => {
	expect(shapeText(tableShape(chord("F#")) ?? { frets: [], base: 1 })).toBe("244322");
	expect(shapeText(tableShape(chord("Bb")) ?? { frets: [], base: 1 })).toBe("x13331");
	expect(shapeText(tableShape(chord("C#m")) ?? { frets: [], base: 1 })).toBe("x46654");
	expect(tableShape(chord("C#m"))?.base).toBe(4);
});

test("enharmonic and respelled names get one shape", () => {
	for (const [a, b] of [
		["F#", "Gb"],
		["C#m7", "Dbm7"],
		["B", "Cb"],
		["F", "E#"],
	] as const) {
		const shape = tableShape(chord(a));
		expect(shape).not.toBeNull();
		expect(shape).toEqual(tableShape(chord(b)));
	}
});

test("every table answer across the vocabulary sounds its chord within limits", () => {
	let hits = 0;
	for (const { name, chord: c } of vocabulary()) {
		const shape = tableShape(c);
		if (!shape) continue;
		hits++;
		if (!soundsChord(shape, c) || !withinLimits(shape, wantOf(c)?.minStrings))
			throw new Error(`${name}: ${shapeText(shape)}`);
	}
	expect(hits / vocabulary().length).toBeGreaterThan(0.6);
});

test("a note set, and a chord the table lacks, get null", () => {
	expect(tableShape(chord("{C3 G3 E4}"))).toBeNull();
});
