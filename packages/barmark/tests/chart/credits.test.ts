/** Credit lines (grammar 7.5): composer, lyricist, arranger and copyright. */
import { describe, expect, test } from "bun:test";
import { parseChart } from "../../src/index.js";

const none = { composer: [], lyricist: [], arranger: [], copyright: [] };

describe("credit lines", () => {
	test("a composer line is a credit", () => {
		const p = parseChart("# T\ncomposer: Kevin Peckham\n| G |");
		expect(p.credits).toEqual({ ...none, composer: ["Kevin Peckham"] });
		expect(p.diagnostics).toEqual([]);
		expect(p.lines[1]).toEqual({
			kind: "credit",
			line: 2,
			role: "composer",
			text: "Kevin Peckham",
		});
	});
	test("any case, and repeated lines are entries in written order", () => {
		expect(parseChart("COMPOSER: A\ncomposer: B\n| G |").credits.composer).toEqual(["A", "B"]);
	});
	test("each role", () => {
		const p = parseChart("lyricist: L\narranger: Ar\ncopyright: C\n| G |");
		expect(p.credits).toEqual({ ...none, lyricist: ["L"], arranger: ["Ar"], copyright: ["C"] });
	});
	test("a credit after the bars is allowed and takes no time", () => {
		const p = parseChart("| G |\ncopyright: © 2026 K\ncopyright: All rights reserved.");
		expect(p.credits.copyright).toEqual(["© 2026 K", "All rights reserved."]);
		expect(p.diagnostics).toEqual([]);
		expect(p.bars).toHaveLength(1);
	});
	test("the value runs to the end of the line, space runs collapsed", () => {
		expect(parseChart("composer:   Lennon,   McCartney  \n| G |").credits.composer).toEqual([
			"Lennon, McCartney",
		]);
	});
	test("an empty credit is an error and stays text", () => {
		const p = parseChart("composer:\n| G |");
		expect(p.credits).toEqual(none);
		expect(p.lines[0]?.kind).toBe("text");
		expect(p.diagnostics).toMatchObject([
			{ line: 1, severity: "error", message: "composer: needs a value" },
		]);
	});
	test("a directive after the value is part of the credit, with a warning", () => {
		const p = parseChart("composer: A, key: G\n| G |");
		expect(p.credits.composer).toEqual(["A, key: G"]);
		expect(p.diagnostics).toMatchObject([
			{
				line: 1,
				severity: "warning",
				message: "a credit runs to the end of the line; put key: on its own line",
			},
		]);
	});
	test.each([
		["author", "composer"],
		["writer", "composer"],
		["music", "composer"],
		["Words", "lyricist"],
		["lyrics", "lyricist"],
		["arr", "arranger"],
		["arranged", "arranger"],
		["rights", "copyright"],
		["©", "copyright"],
	])("%s: is a near miss for %s:", (word, role) => {
		const p = parseChart(`${word}: X\n| G |`);
		expect(p.credits).toEqual(none);
		expect(p.diagnostics).toMatchObject([
			{
				line: 1,
				severity: "warning",
				message: `not a credit; did you mean ${role}:?`,
				suggestion: `${role}: X`,
			},
		]);
	});
	test("prose about the credits stays text, quietly", () => {
		const p = parseChart("Words and music by Kevin\n| G |");
		expect(p.lines[0]?.kind).toBe("text");
		expect(p.diagnostics).toEqual([]);
	});
	test("a credit between a system's lines ends the system as text does", () => {
		const p = parseChart("part: G = Gtr\npart: P = Pno\nG | C |\ncomposer: A\nP | D |");
		expect(p.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
		expect(p.credits.composer).toEqual(["A"]);
		const systems = p.lines.flatMap((l) => (l.kind === "bars" ? [l.system] : []));
		expect(new Set(systems).size).toBe(2);
	});
	test("a chart without credits has empty lists", () => {
		expect(parseChart("| G |").credits).toEqual(none);
	});
});
