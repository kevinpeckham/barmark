import { describe, expect, test } from "bun:test";
import { MORNING_SONG } from "../../barmark/tests/chart/morning-song.js";
import { all, measures, notes, xmlOf } from "./helpers.js";

describe("slot rhythm", () => {
	test("slots split the bar equally, as slash notes on B4, one per beat", () => {
		const [m] = measures(xmlOf("| C D |"));
		const ns = notes(m ?? "");
		expect(ns).toHaveLength(4);
		for (const n of ns) {
			expect(n).toContain("<type>quarter</type>");
			expect(n).toContain("<notehead>slash</notehead>");
			expect(n).toContain("<step>B</step><octave>4</octave>");
		}
	});
	test("a chord's hold is a slash note; a silence and its hold are one rest", () => {
		const ns = notes(measures(xmlOf("| C / -- / |"))[0] ?? "");
		expect(ns.map((n) => (n.includes("<rest") ? "rest" : "slash"))).toEqual([
			"slash",
			"slash",
			"rest",
		]);
		expect(ns.map((n) => /<type>(\w+)/.exec(n)?.[1])).toEqual(["quarter", "quarter", "half"]);
	});
	test("a group whose share isn't a power of two is a tuplet", () => {
		const ns = notes(measures(xmlOf("| C D_E_F |"))[0] ?? "");
		expect(ns).toHaveLength(4);
		const triplet = ns.slice(1);
		for (const n of triplet) {
			expect(n).toContain(
				"<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>",
			);
			expect(n).toContain("<type>quarter</type>");
		}
	});
	test("divisions make every duration whole", () => {
		for (const text of ["| C D E |", "| C D_E_F_G_A |", "time: 6/8\n| C D |"]) {
			const xml = xmlOf(text);
			expect(all(xml, "duration").every((d) => /^[1-9]\d*$/.test(d ?? ""))).toBe(true);
			const [divisions] = all(xml, "divisions");
			const total = all(measures(xml)[0] ?? "", "duration").reduce((s, d) => s + Number(d), 0);
			const meter = text.startsWith("time: 6/8") ? 3 : 4;
			expect(total).toBe(meter * Number(divisions));
		}
	});
});

describe("attributes", () => {
	test("key, time and clef on the first measure", () => {
		expect(xmlOf("key: Eb\n| C |")).toContain("<fifths>-3</fifths><mode>major</mode>");
		expect(xmlOf("key: D dorian\n| C |")).toContain("<fifths>0</fifths><mode>dorian</mode>");
		expect(xmlOf("key: F# minor\n| C |")).toContain("<fifths>3</fifths><mode>minor</mode>");
		expect(xmlOf("time: 6/8\n| C |")).toContain(
			"<time><beats>6</beats><beat-type>8</beat-type></time>",
		);
		const xml = xmlOf(MORNING_SONG);
		// Its guitar's clef is the instrument's: treble 8vb.
		expect(measures(xml, "P1")[0]).toContain(
			"<clef><sign>G</sign><line>2</line><clef-octave-change>-1</clef-octave-change></clef>",
		);
		expect(measures(xml, "P2")[0]).toContain(
			'<clef number="1"><sign>G</sign><line>2</line></clef>',
		);
	});
	test("slash notation is switched on", () => {
		expect(measures(xmlOf("| C |"))[0]).toContain(
			'<measure-style><slash type="start" use-stems="no"/></measure-style>',
		);
	});
	test("a tacet bar is a measure rest", () => {
		const piano = measures(xmlOf(MORNING_SONG), "P2");
		for (const m of piano.slice(8, 12)) expect(m).toContain('<rest measure="yes"/>');
		// Its upper staff: a bar of slashes, over a hidden rest on the lower.
		expect(piano[4]?.split("<backup>")[0]).not.toContain("<rest");
	});
	test("measure numbers run in sequence and show barmark's written numbers", () => {
		const ms = measures(xmlOf(MORNING_SONG));
		expect(ms.map((m) => /number="(\d+)"/.exec(m)?.[1])).toEqual(ms.map((_, i) => String(i + 1)));
		expect(ms.map((m) => /text="(\d+)"/.exec(m)?.[1])).toEqual(ms.map((_, i) => String(i + 1)));
	});
});
