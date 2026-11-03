import { describe, expect, test } from "bun:test";
import { all, measures, xmlOf } from "./helpers.js";

/**
 * A measure as a sequence: `G` for a harmony (its kind text), and a note's
 * or rest's length in quarters with `~` for a tie into it and `~` after for
 * a tie out of it (`r` marks a rest).
 */
function sequence(xml: string): string[][] {
	const divisions = Number(all(xml, "divisions")[0]);
	return measures(xml).map((m) =>
		[
			...m.matchAll(
				/<harmony>[\s\S]*?<kind text="([^"]*)">[^<]*<\/kind>[\s\S]*?<\/harmony>|<note>[\s\S]*?<\/note>/g,
			),
		].map((x) => {
			if (x[1] !== undefined) return x[1] || "maj";
			const n = x[0];
			const q = Number(/<duration>(\d+)<\/duration>/.exec(n)?.[1]) / divisions;
			const into = n.includes('<tie type="stop"/>') ? "~" : "";
			const out = n.includes('<tie type="start"/>') ? "~" : "";
			return `${into}${n.includes("<rest") ? "r" : ""}${q}${out}`;
		}),
	);
}

describe("pushes", () => {
	test("a push starts its slot an eighth early, tied from the slot before", () => {
		expect(sequence(xmlOf("| C <G |"))).toEqual([["maj", "1.5", "maj", "0.5~", "~2"]]);
	});
	test("a push across a bar line", () => {
		expect(sequence(xmlOf("| C | <G |"))).toEqual([["maj", "3.5", "maj", "0.5~"], ["~4"]]);
	});
	test("<< is a sixteenth", () => {
		const xml = xmlOf("| C <<G |");
		expect(sequence(xml)).toEqual([["maj", "1.75", "maj", "0.25~", "~2"]]);
		expect(xml).toContain("<type>quarter</type><dot/><dot/>");
	});
	test("a pushed N.C. moves its harmony; a pushed silence is an early rest", () => {
		expect(sequence(xmlOf("| C <N.C. |"))).toEqual([["maj", "1.5", "N.C.", "0.5~", "~2"]]);
		expect(sequence(xmlOf("| C <-- |"))).toEqual([["maj", "1.5", "r0.5", "r2"]]);
	});
	test("a pushed accent sounds on the early note", () => {
		const [m] = measures(xmlOf("| C <>G |"));
		const notes = m?.match(/<note>[\s\S]*?<\/note>/g) ?? [];
		expect(notes.map((n) => n.includes("<accent/>"))).toEqual([false, true, false]);
	});
});
