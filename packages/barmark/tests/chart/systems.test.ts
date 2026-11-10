import { describe, expect, test } from "bun:test";
import { readDocument } from "../../src/chart/document.js";
import { parseChart } from "../../src/chart/parse.js";
import { structureOf } from "../../src/chart/systems.js";
import type { Line } from "../../src/chart/types.js";

const TWO = "part: Gtr = Guitar\npart: Pno = Piano\n";
type Labelled = Extract<Line, { kind: "bars" | "invalid" }>;
const labelled = (text: string) =>
	readDocument(text).lines.filter((l): l is Labelled => l.kind === "bars" || l.kind === "invalid");
const errors = (text: string) =>
	parseChart(text)
		.diagnostics.filter((d) => d.severity === "error")
		.map((d) => ({ line: d.line, message: d.message }));

describe("systems (grammar 7.4)", () => {
	test("a repeated label starts the next system; blank lines don't end one", () => {
		const ls = labelled(`${TWO}Gtr | G |\n\nPno | C |\nGtr | D |\nPno | E |`);
		expect(ls.map((l) => l.system)).toEqual([0, 0, 1, 1]);
	});
	test.each([
		["text", "words"],
		["a heading", "## B"],
		["a directive", "key: D"],
		["a tutti line", "| A |"],
	])("%s ends a system", (_, between) => {
		const ls = labelled(`${TWO}Gtr | G |\n${between}\nPno | C |`);
		const systems = ls.filter((l) => l.part).map((l) => l.system);
		expect(systems).toEqual([0, 1]);
	});
	test("a tutti line has no system", () => {
		expect(labelled(`${TWO}| G |`)[0]?.system).toBeUndefined();
	});
	test("lines of a system write the same number of bars", () => {
		const text = `${TWO}Gtr | G | C | G | D |\nPno | G | C | Em |`;
		const e = errors(text);
		expect(e).toHaveLength(1);
		expect(e[0]?.line).toBe(4);
		expect(e[0]?.message).toContain("this system's lines have 4 bars");
		expect(e[0]?.message).toContain("line 3");
		const pno = labelled(text)[1];
		expect(pno?.kind === "bars" && pno.dropped).toBe(true);
	});
	test.each([
		["|: G | C :|", "| G | C |", "the same repeat marks"],
		["| G | C | x2", "| G | C |", "the same repeat marks"],
		["| @B | G | C |", "| G | C |", "the same marks"],
		["| G | ... | C |", "| G | C |", "the same marks"],
		["| G | Segno | C |", "| G | C |", "the same marks"],
		["| [2/4] G | C |", "| G | C |", "the same marks"],
	])("structure is written on every line: %s against %s", (gtr, pno, message) => {
		const e = errors(`${TWO}Gtr ${gtr}\nPno ${pno}`);
		expect(e.map((x) => x.message).join()).toContain(message);
	});
	test("endings must match too", () => {
		const e = errors(
			`${TWO}Gtr |: G :|\nPno |: G :|\nGtr |1 C :|\nPno |2 C :|\nGtr |2 D |\nPno |2 D |`,
		);
		expect(e.map((x) => x.message).join()).toContain("the same repeat marks");
	});
	test("a line with an error is in its system but not checked", () => {
		const text = `${TWO}Gtr | G | C |\nPno | G | C_ |`;
		const ls = labelled(text);
		expect(ls.map((l) => [l.kind, l.system])).toEqual([
			["bars", 0],
			["invalid", 0],
		]);
		expect(errors(text)).toHaveLength(1);
	});
	test("structureOf reads the marks that shape the timeline", () => {
		const [l] = readDocument("|: [2/4] G | % | ... | @B | C | D.S. al Coda :| x2").lines;
		expect(l?.kind === "bars" && structureOf(l)).toBe("|: B[2/4] B ... @B B D.S. al Coda :| x2");
		const [m] = readDocument("| G | [3/4] C |").lines;
		expect(m?.kind === "bars" && structureOf(m)).toBe("| B B[3/4] |");
	});
});
