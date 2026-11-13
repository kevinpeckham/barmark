import { expect, test } from "bun:test";
import { lower, tableShape } from "../src/lookup.js";
import { pitchClass } from "../src/pitch.js";
import { shapeFrom, shapeOf, shapeText } from "../src/shape.js";
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

test("no two movable rows share a form and a bass string, where one could never win", () => {
	const keys = MOVABLE.map(([name, frets]) => {
		const c = chord(name);
		const root = c.root ? pitchClass(c.root) : 0;
		const up = (p: string) => (pitchClass(p) - root + 12) % 12;
		const tones = [...new Set([...c.pitches, c.bass].map(up))].sort((a, b) => a - b).join(".");
		return `${tones}/${up(c.bass)} on string ${frets.search(/[0-9]/)}`;
	});
	const twice = keys.filter((key, i) => keys.indexOf(key) !== i);
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
	// No row is written for maj13: the finder answers it.
	expect(tableShape(chord("Cmaj13"))).toBeNull();
});

const text = (n: string): string | null => {
	const shape = tableShape(chord(n));
	return shape ? shapeText(shape) : null;
};

test("familiar first-position and movable shapes", () => {
	const expected: [string, string][] = [
		["D(9)", "xx0252"],
		["A7sus2", "x02000"],
		["D7sus2", "xx0210"],
		["A9", "x02423"],
		["A13", "x02022"],
		["Em9", "020002"],
		["E7(b9)", "020101"],
		["Emaj9", "021102"],
		["Adim", "x0121x"],
		["Am7(b5)", "x0101x"],
		["Dm7(b5)", "xx0111"],
		["Daug", "xx0332"],
		["A6/9", "x02422"],
		["Amaj9", "x02424"],
		["C/B", "x22010"],
		["G/F#", "220003"],
		["Bm7(b5)", "x20201"],
		["Dm/F", "xx3231"],
		["A7(#9)", "575658"],
		["Cdim7", "x3424x"],
		["Cm6", "x3121x"],
		["C6", "x32210"],
		["Db6", "x4332x"],
		["C13", "x35355"],
		["D13", "x57577"],
		["Eb13", "x68688"],
		["Cm11", "x31331"],
		["G6/9", "322233"],
		["Cm6/9", "x3123x"],
		["Am/C", "x32210"],
		["Bbm/Db", "x4332x"],
		["F/G", "xx5565"],
		["Caug", "x32110"],
		["Dbaug", "x4322x"],
		["F#7sus2", "xx4654"],
		["Gaugmaj7", "xx5877"],
	];
	expect(expected.map(([n]) => [n, text(n)])).toEqual(expected);
});

test("Eb and Ebm are the A-shape barre: no fourth-string row for the plain triads", () => {
	// xx1343 is a thin four-finger stretch; players who know barre chords play the barre.
	expect(text("Eb")).toBe("x68886");
	expect(text("Ebm")).toBe("x68876");
});

test("the table steps aside above the seventh fret", () => {
	expect(text("Eb")).toBe("x68886");
	// 13sus4 has a fifth-string row only within reach: on E it sits at fret 7, and is used.
	expect(text("E13sus4")).toBe("x77779");
	// 13(b9) has one row, on B; on Bb it would sit at fret 12, so the finder answers.
	expect(tableShape(chord("Bb13(b9)"))).toBeNull();
	for (const { name, chord: c } of vocabulary()) {
		const shape = tableShape(c);
		if (!shape) continue;
		const fretted = shape.frets.filter((f) => f > 0);
		if (fretted.length > 0 && Math.min(...fretted) > 7)
			throw new Error(`${name}: ${shapeText(shape)} sits above fret 7`);
	}
});

test("of two moved shapes at one fret, the lower frets win, compared as numbers", () => {
	const ten = shapeFrom([-1, 8, 10, 10, 10, 8]);
	const eight = shapeFrom([-1, 8, 8, 8, 8, 8]);
	expect(lower(eight, ten)).toBe(true);
	expect(lower(ten, eight)).toBe(false);
});

test("rows added after review: G/A, Em6/9, and Ab/Bb at its lowest fret", () => {
	const first = (n: string) => {
		const shape = tableShape(chord(n));
		return shape ? shapeText(shape) : null;
	};
	expect(first("G/A")).toBe("x00003");
	expect(first("Em6/9")).toBe("022022");
	expect(first("Ab/Bb")).toBe("x1111x");
	expect(first("A/B")).toBe("x2222x");
	expect(first("Bb/C")).toBe("x3333x");
});

test("familiar first-position shapes that sat behind barres at frets 5 to 7", () => {
	const expected: [string, string][] = [
		["Dmmaj7", "xx0221"],
		["A7(b9)", "x02323"],
		["E7(b13)", "020110"],
		["Eaug7", "030110"],
		["Bm9", "x20222"],
		["Bm11", "x20220"],
		["B6", "x21102"],
		["Bm6", "x20102"],
		["C/Bb", "x12010"],
		["Bm/A", "x04432"],
		["Bbaug", "x10332"],
		["Baug", "x21003"],
		["Gaug/B", "x21003"],
		["F6/9", "100011"],
		["Bb6/9", "x10011"],
	];
	expect(expected.map(([n]) => [n, text(n)])).toEqual(expected);
});
