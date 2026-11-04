/**
 * Slashes are written one per beat, so a program that ends its slash style
 * early (Dorico ends it after the last measure with a direction or
 * attributes) still shows beat slashes, not a whole-note slash.
 */
import { describe, expect, test } from "bun:test";
import { all, measures, notes, xmlOf } from "./helpers.js";

const types = (measure: string) => notes(measure).map((n) => /<type>(\w+)<\/type>/.exec(n)?.[1]);
const dotted = (measure: string) => notes(measure).map((n) => n.includes("<dot/>"));
const tied = (measure: string) =>
	notes(measure).map((n) =>
		[
			n.includes('<tie type="stop"/>') ? "stop" : "",
			n.includes('<tie type="start"/>') ? "start" : "",
		]
			.filter(Boolean)
			.join("+"),
	);
/** What sits between the notes: a harmony before a note, or nothing. */
const harmonyBefore = (measure: string) =>
	measure
		.split(/<note>/)
		.slice(0, -1)
		.map((before) => before.includes("</harmony>"));

describe("beat slashes", () => {
	test("a bar of one chord in 4/4 is four quarter slashes, untied, under one harmony", () => {
		const [m = ""] = measures(xmlOf("| C |"));
		expect(types(m)).toEqual(["quarter", "quarter", "quarter", "quarter"]);
		expect(notes(m).every((n) => n.includes("<notehead>slash</notehead>"))).toBe(true);
		expect(tied(m)).toEqual(["", "", "", ""]);
		expect(harmonyBefore(m)).toEqual([true, false, false, false]);
	});
	test("two chords in 4/4 are two slashes each, each harmony before its first", () => {
		const [m = ""] = measures(xmlOf("| C D |"));
		expect(types(m)).toEqual(["quarter", "quarter", "quarter", "quarter"]);
		expect(harmonyBefore(m)).toEqual([true, false, true, false]);
	});
	test("a hold and N.C. are beat slashes too", () => {
		const [m = ""] = measures(xmlOf("| C / N.C. / |"));
		expect(types(m)).toEqual(["quarter", "quarter", "quarter", "quarter"]);
	});
	test("6/8 counts dotted quarters", () => {
		const [m = ""] = measures(xmlOf("time: 6/8\n\n| C |"));
		expect(types(m)).toEqual(["quarter", "quarter"]);
		expect(dotted(m)).toEqual([true, true]);
	});
	test("2/2 counts halves, 7/8 eighths", () => {
		expect(types(measures(xmlOf("time: 2/2\n\n| C |"))[0] ?? "")).toEqual(["half", "half"]);
		expect(types(measures(xmlOf("time: 7/8\n\n| C |"))[0] ?? "")).toHaveLength(7);
	});
	test("a beat of a 4/16 bar is a sixteenth, so divisions can write it", () => {
		const [m = ""] = measures(xmlOf("time: 4/16\n\n| C |"));
		expect(types(m)).toEqual(["16th", "16th", "16th", "16th"]);
	});
	test("a push is cut at the beats it crosses, and still ties over the bar line", () => {
		const [one = "", two = ""] = measures(xmlOf("| C | <D |"));
		expect(types(one)).toEqual(["quarter", "quarter", "quarter", "eighth", "eighth"]);
		expect(tied(one)).toEqual(["", "", "", "", "start"]);
		expect(harmonyBefore(one)).toEqual([true, false, false, false, true]);
		expect(types(two)).toEqual(["quarter", "quarter", "quarter", "quarter"]);
		expect(tied(two)).toEqual(["stop", "", "", ""]);
	});
	test("a slot off the beat grid keeps its own value", () => {
		const [m = ""] = measures(xmlOf("| C D E |"));
		expect(types(m)).toEqual(["half", "half", "half"]);
		expect(all(m, "actual-notes")).toEqual(["3", "3", "3"]);
	});
	test("note sets and rests are not cut", () => {
		expect(types(measures(xmlOf("| {C E G} |"))[0] ?? "")).toEqual(["whole", "whole", "whole"]);
		expect(types(measures(xmlOf("| -- |"))[0] ?? "")).toEqual(["whole"]);
	});
});
