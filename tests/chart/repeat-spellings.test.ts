import { describe, expect, test } from "bun:test";
import { parseChart } from "../../src/index.js";

const passes = (text: string) => parseChart(text).bars.length;
const clean = (text: string) => parseChart(text).diagnostics;

describe("X and × are accepted for x", () => {
	for (const t of ["| D | X2", "| D | ×2", "| D | X 2", "| D | × 2"]) {
		test(`${t} repeats`, () => {
			expect(passes(t)).toBe(2);
			expect(clean(t)).toEqual([]);
		});
	}
	test("open repeats", () => {
		expect(parseChart("| D | X ...").events.map((e) => e.kind)).toEqual(["open"]);
		expect(parseChart("| D | × …").events.map((e) => e.kind)).toEqual(["open"]);
	});
	test("brackets", () => expect(passes("|: D :| ×3")).toBe(3));
	test("headings", () => {
		expect(passes("## C X2\n| G |")).toBe(2);
		expect(passes("## C\n| G |\n## C ×2 ->")).toBe(2);
	});
	test("a Roman-numeral heading is a name", () => {
		expect(parseChart("## X\n| G |").sections[0]?.name).toBe("X");
		expect(parseChart("## Part IX\n| G |").sections[0]?.name).toBe("Part IX");
	});
});

describe("other repeat spellings suggest x N", () => {
	for (const [t, token] of <[string, string][]>[
		["| D | 2x", "2x"],
		["| D | (x2)", "(x2)"],
		["| D | 2×", "2×"],
	]) {
		test(t, () => {
			const e = parseChart(t).diagnostics.filter((d) => d.severity === "error");
			expect(e.map((d) => [d.token, d.suggestion])).toEqual([[token, "x2"]]);
		});
	}
	test("on a heading", () => {
		const d = parseChart("## Chorus (x2)\n| G |").diagnostics;
		expect(d.map((x) => [x.severity, x.suggestion])).toEqual([["warning", "## Chorus x2"]]);
	});
});
