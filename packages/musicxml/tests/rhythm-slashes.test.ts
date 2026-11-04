/** A bar with an attack off the beat, or a triplet, shows its rhythm: stemmed slashes in values that show the meter. */
import { describe, expect, test } from "bun:test";
import { all, measures, notes, xmlOf } from "./helpers.js";

const types = (m: string) =>
	notes(m).map((n) => `${/<type>(\w+)<\/type>/.exec(n)?.[1]}${n.includes("<dot/>") ? "." : ""}`);
const stemless = (m: string) => notes(m).filter((n) => n.includes("<stem>none</stem>")).length;
const slashStarts = (m: string) => (m.match(/<slash type="start"/g) ?? []).length;

describe("rhythm slashes", () => {
	test("a chord with its holds is one sound, written in the meter's values", () => {
		const [m = ""] = measures(xmlOf("| D / / /_G |"));
		expect(types(m)).toEqual(["half", "quarter.", "eighth"]);
		expect(notes(m)[0]).toContain('<tie type="start"/>');
		expect(notes(m)[1]).toContain('<tie type="stop"/>');
		expect(notes(m).every((n) => n.includes("<notehead>slash</notehead>"))).toBe(true);
		expect(stemless(m)).toBe(0);
		expect(all(m, "root-step")).toEqual(["D", "G"]);
		expect(slashStarts(m)).toBe(0);
	});
	test("a bar a push reaches into is rhythmic; the bar it lands in is not", () => {
		const [one = "", two = ""] = measures(xmlOf("| C | <D |"));
		expect(types(one)).toEqual(["half", "quarter.", "eighth"]);
		expect(stemless(one)).toBe(0);
		expect(stemless(two)).toBe(4);
	});
	test("a bar of triplets is rhythmic", () => {
		const [m = ""] = measures(xmlOf("| C D E |"));
		expect(stemless(m)).toBe(0);
		expect(notes(m)).toHaveLength(3);
		expect(m).toContain("<actual-notes>3</actual-notes>");
	});
	test("a beat bar keeps stemless slashes under slash style", () => {
		const [m = ""] = measures(xmlOf("| C D |"));
		expect(types(m)).toEqual(["quarter", "quarter", "quarter", "quarter"]);
		expect(stemless(m)).toBe(4);
		expect(slashStarts(m)).toBe(1);
	});
	test("slash style stops for a rhythmic bar and starts again after it", () => {
		const [one = "", two = "", three = ""] = measures(xmlOf("| C | D / / /_G | C |"));
		expect(slashStarts(one)).toBe(1);
		expect(two).toContain('<slash type="stop"/>');
		expect(slashStarts(three)).toBe(1);
	});
	test("an unknown chord and a no-chord in a rhythmic bar keep their marks", () => {
		const [m = ""] = measures(xmlOf("| ? <N.C. |"));
		expect(stemless(m)).toBe(0);
		expect(all(m, "words")).toContain("?");
		expect((m.match(/<harmony/g) ?? []).length).toBe(1);
		expect(m).toContain("<kind");
	});
});
