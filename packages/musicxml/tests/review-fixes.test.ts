import { describe, expect, test } from "bun:test";
import { exportMusicXml } from "../src/index.js";
import { measures, xmlOf } from "./helpers.js";
import { expected, play } from "./play.js";
import { validate } from "./schema.js";

const plays = (text: string) => {
	const xml = xmlOf(text);
	expect(play(xml)).toEqual(expected(text));
	return xml;
};

describe("a repeated section holding repeats", () => {
	test("with a D.S. through it, the chart is written out in play order", () => {
		plays(
			"## Verse\n| Segno | G | C |\n## Chorus x2\n|: D | G :|\n| C | To Coda |\n## Bridge\n| E | D.S. al Coda |\n## Coda\n| Coda | G |",
		);
		plays(
			"## A x2\n|: Segno | C :|\n| D | To Coda |\n## B\n| E | D.S. al Coda |\n## Coda\n| Coda | F |",
		);
		plays("## A x2\n|: C :|\n| D | Fine |\n## B\n| E | D.C. al Fine |");
		plays("| Segno | G |\n## A x2\n|: C :|\n| D |\n## B\n| E | D.S. |");
	});
	test("keeps its text lines, rehearsal marks and fermatas", () => {
		const xml = plays(
			"## Chorus x2\nla la la\n|: C | D :|\n### note here\n| @X | E | ... |\n## Out\n| G |",
		);
		expect(xml).toContain("<words>la la la</words>");
		expect(xml).toContain("note here</words>");
		expect(xml.match(/<rehearsal>X<\/rehearsal>/g)?.length).toBeGreaterThan(0);
		expect(xml).toContain("<fermata/>");
	});
	test("a replay keeps its rehearsal marks and fermatas", () => {
		const xml = plays("## A\n| @X | C | ... |\n## B\n| E |\n## A");
		expect(xml.match(/<rehearsal>X<\/rehearsal>/g)).toHaveLength(2);
		expect(xml.match(/<fermata\/>/g)).toHaveLength(2);
	});
});

describe("pushes the giver can't simply shorten", () => {
	test("after a group whose last member is just the push's length, the push stays on the beat, marked", () => {
		// Taking the whole member would drop its written chord.
		for (const text of ["| C_D_E_F_G_A_B_C | <D |", "| C_D_E_F_G_A_B_C <<D |"]) {
			const xml = plays(text);
			expect(xml).toContain("<words>push</words>");
			expect(xml.match(/<harmony>/g)).toHaveLength(9);
		}
	});
	test("after a tacet bar, the push comes early out of the rest (grammar 7.4)", () => {
		const text = "part: Gtr = Guitar\npart: Pno = Piano\n| C | D |\nGtr | E |\n| <F |";
		const xml = xmlOf(text, "Pno");
		// The piano's upper staff: its lower staff rests, hidden, below.
		const ms = measures(xml).map((m) => m.split("<backup>")[0] ?? "");
		expect(ms[2]).not.toContain('<rest measure="yes"/>');
		expect(ms[2]).toMatch(/<rest\/>[\s\S]*<harmony>[\s\S]*<tie type="start"\/>/);
		expect(ms[3]).toContain('<tie type="stop"/>');
	});
});

describe("files that must still be MusicXML", () => {
	test("a chart with no bars exports nothing, and says so", () => {
		for (const text of ["", "# Title", "time: 6/8\ntempo: 120", "just words"]) {
			const r = exportMusicXml(text);
			expect(r.ok).toBe(false);
			expect(r.diagnostics.map((d) => d.message)).toContain("the chart has no bars to export");
		}
	});
	test("characters XML can't hold are left out", () => {
		const r = exportMusicXml("# A\u0001B\n| C |\nline\u000bbreak￿");
		if (!r.ok) throw new Error("not ok");
		expect(validate(r.xml)).toEqual([]);
		expect(r.xml).toContain("<work-title>AB</work-title>");
	});
});
