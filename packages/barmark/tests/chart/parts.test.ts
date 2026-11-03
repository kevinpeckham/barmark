import { describe, expect, test } from "bun:test";
import { parseChart } from "../../src/chart/parse.js";

const diags = (text: string) =>
	parseChart(text).diagnostics.map((d) => ({
		line: d.line,
		message: d.message,
		suggestion: d.suggestion,
	}));

describe("several parts (grammar 7.4)", () => {
	test("each part: line declares a part, in score order", () => {
		const p = parseChart("part: Gtr = Guitar\npart: Pno = Piano\n| G |");
		expect(p.parts).toEqual([
			{ label: "Gtr", name: "Guitar" },
			{ label: "Pno", name: "Piano" },
		]);
		expect(p.part).toBeNull();
		expect(p.diagnostics).toEqual([]);
	});
	test("one part: part is that part", () => {
		const p = parseChart("part: Gtr = Guitar\n| G |");
		expect(p.parts).toHaveLength(1);
		expect(p.part).toEqual(p.parts[0] ?? null);
	});
	test("no part: parts is empty", () => {
		expect(parseChart("| G |").parts).toEqual([]);
	});
	test("in a multi-part chart every part needs a label", () => {
		const d = diags("part: Gtr = Guitar\npart: Piano\n| G |");
		expect(d).toHaveLength(1);
		expect(d[0]?.line).toBe(2);
		expect(d[0]?.message).toContain("a chart with several parts labels each one");
		expect(d[0]?.suggestion).toBe("part: Label = Piano");
	});
	test("two parts may not share a label, in any case", () => {
		const d = diags("part: Gtr = A\npart: gtr = B\n| G |");
		expect(d).toHaveLength(1);
		expect(d[0]?.line).toBe(2);
		expect(d[0]?.message).toContain("two parts share the label Gtr");
	});
	test("two parts may share a name", () => {
		expect(parseChart("part: Gtr1 = Guitar\npart: Gtr2 = Guitar\n| G |").diagnostics).toEqual([]);
	});
	test.each(["2nd", "|x", "#x", "@x"])("a label can't start with %s's first character", (label) => {
		const d = diags(`part: ${label} = A\n| G |`);
		expect(d.map((x) => x.message).join()).toContain("a part label can't start with");
	});
	test("several parts are supported", () => {
		const d = diags("part: Gtr = Guitar\npart: Pno = Piano\npart: Bs = Bass\n| G |");
		expect(d.map((x) => x.message).join()).not.toContain("not supported");
	});
});
