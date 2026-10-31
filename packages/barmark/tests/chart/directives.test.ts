import { describe, expect, test } from "bun:test";
import { beatsOf, parseDirectiveLine, parseMeter } from "../../src/chart/directives.js";
import type { Mode } from "../../src/chart/types.js";

describe("meters", () => {
	test("4/4 reads", () => expect(parseMeter("4/4")).toEqual({ n: 4, d: 4 }));
	for (const bad of ["4/3", "0/4", "33/4", "4", "4/4/4"]) {
		test(`${bad} is not a meter`, () => expect(parseMeter(bad)).toBeNull());
	}
	const beats: [string, number][] = [
		["4/4", 4],
		["6/8", 2],
		["12/8", 4],
		["9/8", 3],
		["7/8", 7],
		["3/4", 3],
	];
	for (const [m, b] of beats) {
		test(`${m} has ${b} beats`, () => {
			const meter = parseMeter(m);
			if (!meter) throw new Error(m);
			expect(beatsOf(meter)).toBe(b);
		});
	}
});

describe("directive lines", () => {
	test("all four on one line", () => {
		const r = parseDirectiveLine("key: D, time: 4/4, tempo: 145, feel: swing", 3);
		expect(r?.diagnostics).toEqual([]);
		expect(r?.set).toEqual({
			key: { tonic: "D", mode: "major" },
			time: { n: 4, d: 4 },
			tempo: 145,
			feel: "swing",
		});
	});
	const keys: [string, string, Mode][] = [
		["Bm", "B", "minor"],
		["F#m", "F#", "minor"],
		["B minor", "B", "minor"],
		["A Mixolydian", "A", "mixolydian"],
		["E♭", "Eb", "major"],
	];
	for (const [text, tonic, mode] of keys) {
		test(`key: ${text}`, () => {
			expect(parseDirectiveLine(`key: ${text}`, 1)?.set.key).toEqual({ tonic, mode });
		});
	}
	test("tempo accepts bpm", () =>
		expect(parseDirectiveLine("tempo: 145 bpm", 1)?.set.tempo).toBe(145));
	test("names are case-insensitive", () =>
		expect(parseDirectiveLine("TEMPO: 90", 1)?.set.tempo).toBe(90));
	test("swing 16 and case-insensitive feel", () => {
		expect(parseDirectiveLine("feel: Swing 16", 1)?.set.feel).toBe("swing 16");
		expect(parseDirectiveLine("feel: swing  16", 1)?.diagnostics).toHaveLength(1);
	});
	for (const bad of ["time: 4/3", "tempo: fast", "feel: lazy", "key: H", "key: D, bpm: 120"]) {
		test(`${bad} is an error on its line`, () => {
			const d = parseDirectiveLine(bad, 3)?.diagnostics ?? [];
			expect(d).toHaveLength(1);
			expect(d[0]?.line).toBe(3);
			expect(d[0]?.severity).toBe("error");
		});
	}
	test("prose is not a directive", () => expect(parseDirectiveLine("Keys are hard", 1)).toBeNull());
});
