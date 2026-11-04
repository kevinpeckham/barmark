/** Note values follow the meter: none hides the middle of a 4/4 bar, nor a beat after an off-beat start. */
import { describe, expect, test } from "bun:test";
import { type Frac, frac, meterValues } from "../src/rhythm.js";
import { measures, notes, xmlOf } from "./helpers.js";

const meter = (n: number, d: number) => ({ n, d });
const shown = (start: Frac, length: Frac, m = meter(4, 4), rest = false) =>
	meterValues(start, length, m, rest).map((v) => `${v.type}${".".repeat(v.dots)}`);
const written = (measure: string) =>
	notes(measure).map((n) => {
		const type = /<type>(\w+)<\/type>/.exec(n)?.[1];
		return `${n.includes("<rest") ? "r" : ""}${type}${n.includes("<dot/>") ? "." : ""}`;
	});

describe("meterValues", () => {
	test("4/4: a value from beat 1 that fills whole beats is one value", () => {
		expect(shown(frac(0), frac(3))).toEqual(["half."]);
		expect(shown(frac(0), frac(2))).toEqual(["half"]);
		expect(shown(frac(0), frac(4))).toEqual(["whole"]);
	});
	test("4/4: anything else is cut at the middle of the bar", () => {
		expect(shown(frac(1), frac(2))).toEqual(["quarter", "quarter"]);
		expect(shown(frac(0), frac(7, 2))).toEqual(["half", "quarter."]);
	});
	test("4/4: a rest never crosses the middle", () => {
		expect(shown(frac(1), frac(3), meter(4, 4), true)).toEqual(["quarter", "half"]);
		expect(shown(frac(0), frac(3), meter(4, 4), true)).toEqual(["half", "quarter"]);
	});
	test("3/4: a value off the beat is cut at the next beat", () => {
		expect(shown(frac(1, 2), frac(2), meter(3, 4))).toEqual(["eighth", "quarter."]);
		expect(shown(frac(0), frac(3), meter(3, 4))).toEqual(["half."]);
	});
	test("6/8 beats in dotted quarters", () => {
		expect(shown(frac(0), frac(3, 2), meter(6, 8))).toEqual(["quarter."]);
		expect(shown(frac(1), frac(1), meter(6, 8))).toEqual(["eighth", "eighth"]);
	});
	test("a tuplet's value is not cut", () => {
		expect(shown(frac(4, 3), frac(4, 3))).toEqual(["half"]);
	});
});

describe("the export", () => {
	test("a note set across the middle is written in two tied values", () => {
		const [m = ""] = measures(xmlOf("| {C4} {D4} / {E4} |"));
		expect(written(m)).toEqual(["quarter", "quarter", "quarter", "quarter"]);
		expect(notes(m)[1]).toContain('<tie type="start"/>');
		expect(notes(m)[2]).toContain('<tie type="stop"/>');
	});
	test("a rest from beat 2 to the end is a quarter and a half", () => {
		const [m = ""] = measures(xmlOf("| {C4} -- / / |"));
		expect(written(m)).toEqual(["quarter", "rquarter", "rhalf"]);
	});
});
