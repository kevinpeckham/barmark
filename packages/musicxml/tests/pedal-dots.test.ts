/** Pedal marks and dotted figures (barmark's grammar 2.9 and 2.2). */
import { describe, expect, test } from "bun:test";
import { measures, notes, xmlOf } from "./helpers.js";

/** A measure's pedal directions and notes in order: "start@2", "stop", or the note's step. */
const sequence = (measure: string) =>
	[...measure.matchAll(/<direction[ >][\s\S]*?<\/direction>|<note>[\s\S]*?<\/note>/g)]
		.map(([x]) => {
			const pedal = /<pedal type="(\w+)"/.exec(x)?.[1];
			if (pedal)
				return `${pedal}${/<staff>(\d)<\/staff>/.exec(x) ? `@${/<staff>(\d)<\/staff>/.exec(x)?.[1]}` : ""}`;
			return x.startsWith("<note>") ? (/<step>(\w)<\/step>/.exec(x)?.[1] ?? "rest") : null;
		})
		.filter(Boolean);

describe("pedal marks", () => {
	test("pedal start and stop", () => {
		const xml = xmlOf("| +{G3 B3 D4} / / / | *{C4 E4} |\n");
		const [first, second] = measures(xml);
		expect(sequence(first ?? "")[0]).toBe("start");
		expect(first).toContain('<pedal type="start" sign="yes"/>');
		expect(first).toContain('<sound damper-pedal="yes"/>');
		expect(sequence(second ?? "")[0]).toBe("stop");
		expect(second).toContain('<sound damper-pedal="no"/>');
	});
	test("on a keyboard, under the lower staff", () => {
		const xml = xmlOf("part: Pno = Piano, instrument: piano\n| +G{B3 D4 G4} / / / | *C |\n");
		// Once, though the voicing reaches both staves.
		expect(sequence(measures(xml)[0] ?? "").filter((x) => x?.startsWith("st"))).toEqual([
			"start@2",
		]);
		expect(sequence(measures(xml)[1] ?? "").filter((x) => x?.startsWith("st"))).toEqual(["stop@2"]);
	});
	test("pedal change: a stop then a start at the same place", () => {
		const s = sequence(measures(xmlOf("| +{G3} / +{C4} / | *{D4} |\n"))[0] ?? "");
		expect(s).toEqual(["start", "G", "stop", "start", "C"]);
	});
	test("pedal lifts at a tacet bar", () => {
		const xml = xmlOf(
			"part: Pno = Piano\npart: Bs = Bass\nPno | +{G3} | {C4} |\nBs | {G1} | {C2} |\nBs | {D2} |\n",
		);
		// "Piano" is a keyboard: two staves, the stop under the lower.
		expect(sequence(measures(xml)[2] ?? "")).toEqual(["stop@2", "rest", "rest"]);
	});
	test("the pedal stays down through a bar only the LH plays", () => {
		const xml = xmlOf(
			"part: Pno = Piano, instrument: piano\n## A\nPno.RH | +C{C4 E4 G4} |\nPno.LH | {C3} |\n## B\nPno.LH | {F2} |\n## C\nPno.RH | *G{G4} |\nPno.LH | {G2} |\n",
		);
		expect(measures(xml).map((m) => sequence(m).filter((x) => x?.startsWith("st")))).toEqual([
			["start@2"],
			[],
			["stop@2"],
		]);
	});
	test("pedal lifts at the end", () => {
		const s = sequence(measures(xmlOf("| +{G3} / / / | {C4} |\n"))[1] ?? "");
		expect(s).toEqual(["C", "stop"]);
	});
	test("no pedal, no directions", () => {
		expect(xmlOf("| {G3} | {C4} |\n")).not.toContain("<pedal");
	});
});

describe("dotted figures", () => {
	test("a dotted eighth and a sixteenth, beamed, no tuplet", () => {
		const [c, d] = notes(measures(xmlOf("| {C4}._{D4} {E4} {F4} {G4} |\n"))[0] ?? "");
		expect(c).toContain("<type>eighth</type>");
		expect(c).toContain("<dot/>");
		expect(d).toContain("<type>16th</type>");
		expect(c).toContain('<beam number="1">begin</beam>');
		expect(d).toContain('<beam number="1">end</beam>');
		expect(c).not.toContain("time-modification");
		expect(d).not.toContain("time-modification");
	});
	test("a scotch snap", () => {
		const [c, d] = notes(measures(xmlOf("| {C4}_{D4}. {E4} {F4} {G4} |\n"))[0] ?? "");
		expect(c).toContain("<type>16th</type>");
		expect(d).toContain("<dot/>");
	});
});
