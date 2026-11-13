import { expect, test } from "bun:test";
import { type ChordRecord, parseChart } from "barmark";
import {
	type Shape,
	type ShapeResult,
	shapeFor,
	shapeOf,
	shapesFor,
	shapeText,
	sounding,
	soundsChord,
} from "../src/index.js";
import { withinLimits } from "../src/sounds.js";
import { chord, vocabulary } from "./helpers/vocabulary.js";

const text = (r: ShapeResult): string => {
	if (!r.ok) throw new Error(`not ok: ${r.reason}`);
	return shapeText(r.shape);
};
const NP: ShapeResult = { ok: false, reason: "not-playable" };

test("how a voicing reaches shapeFor: the parser's own records", () => {
	const c = parseChart("| Cmaj7{E3 G3} |\n");
	const slot = c.bars[0]?.slots[0];
	if (slot?.kind !== "chord" || !slot.voicing) throw new Error("no voicing parsed");
	expect(slot.voicing).toEqual(chord("{E3 G3}"));
	expect(slot.chord).toEqual(chord("Cmaj7"));
});

test("the design's voicings", () => {
	const fit = (t: string) => shapeFor(chord(t));
	expect(shapeFor(chord("Cmaj7"), chord("{E3 G3 B3 C4}"))).toMatchObject({
		ok: true,
		notes: "voicing-replaced",
	});
	expect(text(shapeFor(chord("Dm7"), chord("{F3 C4 E4}")))).toBe("xx3x10");
	expect(text(shapeFor(chord("G13"), chord("{F2 B2 E3}")))).toBe("122xxx");
	expect(text(fit("{C3 G3 E4}"))).toBe("x3x0x0");
	expect(text(fit("{B2 F#3 D4}"))).toBe("x24x3x");
	expect(fit("{E1}")).toEqual({ ok: false, reason: "single-note" });
});

test("a voicing is placed with notes null; one that does not fit is replaced by the name's shape", () => {
	expect(shapeFor(chord("Dm7"), chord("{F3 C4 E4}"))).toMatchObject({ ok: true, notes: null });
	const replaced = shapeFor(chord("Cmaj7"), chord("{E3 G3 B3 C4}"));
	expect(replaced).toEqual({ ok: true, shape: shapeOf("x32000"), notes: "voicing-replaced" });
	expect(shapeFor(chord("Cmaj7"), chord("{E3}"))).toMatchObject({
		ok: true,
		notes: "voicing-replaced",
	});
	expect(shapeFor(chord("Cmaj7"), chord("{E1 G1}"))).toMatchObject({ notes: "voicing-replaced" });
});

test("named chords: the table's shape, a shell for 7alt, the finder's for the rest", () => {
	expect(shapeFor(chord("C"))).toEqual({ ok: true, shape: shapeOf("x32010"), notes: null });
	expect(shapeFor(chord("C7alt"))).toMatchObject({ ok: true, notes: "shell" });
	const r = shapeFor(chord("C13(b9)"));
	expect(r).toMatchObject({ ok: true, notes: null });
	if (r.ok) {
		expect(soundsChord(r.shape, chord("C13(b9)"))).toBe(true);
		expect(withinLimits(r.shape, 3)).toBe(true);
	}
});

test("chords outside the vocabulary: a shape that sounds them, or not-playable, never a throw", () => {
	for (const name of ["C7(b9,b13)", "Cmaj9(#11)", "C13sus4/G", "C13sus4/F#", "Gb5", "C/B"]) {
		const c = chord(name);
		const r = shapeFor(c);
		if (r.ok) {
			expect(soundsChord(r.shape, c)).toBe(true);
			expect(withinLimits(r.shape, 2)).toBe(true);
		} else expect(r).toEqual(NP);
	}
});

test("note sets without octaves, in written order", () => {
	const r = shapeFor(chord("{C E G}"));
	expect(r.ok).toBe(true);
	if (r.ok) expect(sounding(r.shape).map((n) => n % 12)).toEqual([0, 4, 7]);
	const spec = shapeFor(chord("{C E F# B}"));
	if (spec.ok) expect(sounding(spec.shape).map((n) => n % 12)).toEqual([0, 4, 6, 11]);
	else expect(spec).toEqual(NP);
});

test("note sets with octaves: below or above the guitar, two on one string, a repeat", () => {
	expect(shapeFor(chord("{E1 G1}"))).toEqual(NP);
	expect(shapeFor(chord("{E7 G7}"))).toEqual(NP);
	expect(shapeFor(chord("{E2 F2}"))).toEqual(NP);
	expect(shapeFor(chord("{E2 E3}"))).toMatchObject({ ok: true });
	expect(shapeFor(chord("{C3 C3}"))).toEqual(NP);
	expect(shapeFor(chord("{E2 E2 E3}"))).toEqual(NP);
	expect(shapeFor(chord("{E2 A2 D3 G3 B3 E4 A4}"))).toEqual(NP);
	expect(shapeFor(chord("{C D E F G A B}"))).toEqual(NP);
});

test("one pitch class in two octaves", () => {
	const r = shapeFor(chord("{C3 G3 C4}"));
	expect(r.ok).toBe(true);
	if (r.ok) expect(sounding(r.shape)).toEqual([48, 55, 60]);
});

test("one note is single-note, with or without an octave", () => {
	expect(shapeFor(chord("{E}"))).toEqual({ ok: false, reason: "single-note" });
	expect(shapeFor(chord("{E3}"))).toEqual({ ok: false, reason: "single-note" });
});

test("mixed octaves cannot be written; a hand-built record is not-playable", () => {
	expect(parseNoteSetFails("{C3 G E4}")).toBe(true);
	const mixed: ChordRecord = { ...chord("{C3 G3}"), pitches: ["C3", "G", "E4"], bass: "C" };
	expect(shapeFor(mixed)).toEqual(NP);
});

function parseNoteSetFails(t: string): boolean {
	try {
		chord(t);
		return false;
	} catch {
		return true;
	}
}

test("hand-built records that are not well formed give a reason, never a throw", () => {
	const base = chord("C");
	const set = chord("{C3 G3 E4}");
	const bad: unknown[] = [
		{ ...set, pitches: [] },
		{ ...base, root: null },
		{ ...base, pitches: [1, 2, 3] },
		{ ...set, pitches: [1, 2, 3] },
		{ ...base, pitches: [], bass: "" },
		{ ...set, pitches: ["H9", "Q"] },
		{ ...set, pitches: null },
		{ kind: "chord" },
		{},
		null,
		undefined,
		"C",
		42,
		{
			...base,
			get pitches(): string[] {
				throw new Error("boom");
			},
		},
		{
			...set,
			get pitches(): string[] {
				throw new Error("boom");
			},
		},
		{
			...set,
			get kind(): "notes" {
				throw new Error("boom");
			},
		},
	];
	for (const b of bad) {
		const r = shapeFor(b as ChordRecord);
		expect(r.ok).toBe(false);
		expect(shapesFor(b as ChordRecord)).toEqual([]);
		const v = shapeFor(base, b as ChordRecord);
		// no voicing at all (null, undefined) is a bare name
		if (b != null) expect(v.ok === false || v.notes === "voicing-replaced").toBe(true);
	}
	expect(
		shapeFor(base, {
			get pitches(): string[] {
				throw new Error("x");
			},
		} as never),
	).toMatchObject({
		ok: true,
		notes: "voicing-replaced",
	});
});

test("a chord with no intervals still gives a result", () => {
	expect(shapeFor({ ...chord("C"), intervals: [] }).ok).toBe(true);
});

test("the public calls take a slot and a voicing, and a slot", () => {
	expect(shapeFor.length).toBe(2);
	expect(shapesFor.length).toBe(1);
});

test("results are not shared: writing to one never changes the next", () => {
	const np = shapeFor(chord("{E1 G1}"));
	(np as { reason: string }).reason = "single-note";
	expect(shapeFor(chord("{E1 G1}"))).toEqual({ ok: false, reason: "not-playable" });
	const one = shapeFor(chord("{E3}"));
	(one as { reason: string }).reason = "not-playable";
	expect(shapeFor(chord("{E3}"))).toEqual({ ok: false, reason: "single-note" });
	const r = shapeFor(chord("C"));
	if (!r.ok) throw new Error("no shape");
	r.shape.frets[1] = 9;
	r.shape.base = 9;
	expect(shapeFor(chord("C"))).toEqual({ ok: true, shape: shapeOf("x32010"), notes: null });
	const t = shapeFor(chord("Cmaj7"), chord("{E3 G3 B3 C4}"));
	(t as { reason?: string }).reason = "x";
	expect(shapeFor(chord("Cmaj7"), chord("{E3 G3 B3 C4}"))).toEqual({
		ok: true,
		shape: shapeOf("x32000"),
		notes: "voicing-replaced",
	});
});

test("more than six written notes is not-playable at once", () => {
	const huge = { ...chord("{C E G}"), pitches: Array.from({ length: 100_000 }, () => "C") };
	let best = Number.POSITIVE_INFINITY;
	for (let i = 0; i < 3; i++) {
		const t = performance.now();
		expect(shapeFor(huge)).toEqual({ ok: false, reason: "not-playable" });
		best = Math.min(best, performance.now() - t);
	}
	expect(best).toBeLessThan(20);
});

test("shapesFor: the table's shape first, no repeats, every one sounds the chord", () => {
	const c = chord("Am7");
	const all = shapesFor(c);
	const first = shapeFor(c);
	expect(first.ok).toBe(true);
	expect(all[0]).toEqual((first as { shape: Shape }).shape);
	expect(new Set(all.map(shapeText)).size).toBe(all.length);
	expect(all.length).toBeGreaterThan(3);
	for (const s of all) expect(soundsChord(s, c)).toBe(true);
	expect(shapesFor(chord("{C E G}"))).toEqual([]);
});

test("deterministic: two calls give equal results", () => {
	for (const { chord: c } of vocabulary()
		.filter((_, i) => i % 13 === 0)
		.slice(0, 50)) {
		expect(shapeFor(c)).toEqual(shapeFor(c));
		expect(shapesFor(c)).toEqual(shapesFor(c));
	}
});

test("the root entry exports the public surface and nothing else", async () => {
	const names = Object.keys(await import("../src/index.js")).sort();
	expect(names).toEqual(
		[
			"GUITAR",
			"shapeFor",
			"shapeFrom",
			"shapeOf",
			"shapeText",
			"shapesFor",
			"soundsChord",
			"sounding",
		].sort(),
	);
});
