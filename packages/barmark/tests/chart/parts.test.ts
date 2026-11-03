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

const TWO = "part: Gtr = Guitar\npart: Pno = Piano\n";
const barsLines = (text: string) => parseChart(text).lines.filter((l) => l.kind === "bars");

describe("labelled bar lines (grammar 7.4)", () => {
	test("a declared label then a bar line is that part's line", () => {
		const [l] = barsLines(`${TWO}Gtr | G | C |`);
		expect(l?.kind === "bars" && l.part).toBe("Gtr");
		expect(l?.kind === "bars" && l.cells).toHaveLength(2);
	});
	test("labels match in any case and keep the declared spelling", () => {
		const [l] = barsLines(`${TWO}gtr |: G :|`);
		expect(l?.kind === "bars" && l.part).toBe("Gtr");
		expect(l?.kind === "bars" && l.opens).toBe(true);
	});
	test("an ending can be labelled", () => {
		const p = parseChart(`${TWO}Pno |: G :|\nPno |1 C :|\nPno |2 D |`);
		const ends = p.lines.filter((l) => l.kind === "bars").map((l) => l.kind === "bars" && l.ending);
		expect(ends).toEqual([null, [1], [2]]);
	});
	test("a space goes between the label and the pipe", () => {
		const d = diags(`${TWO}Gtr| G |`);
		expect(d.map((x) => x.message).join()).toContain("a space goes between the label and |");
		expect(d.find((x) => x.message.includes("a space"))?.suggestion).toBe("Gtr | G |");
	});
	test("in a single-part chart a labelled line is an unlabelled one", () => {
		const p = parseChart("part: Gtr = Guitar\nGtr | G |");
		const [l] = p.lines.filter((x) => x.kind === "bars");
		expect(l && "part" in l).toBe(false);
		expect(p.diagnostics).toEqual([]);
		expect(p.bars).toHaveLength(1);
	});
	test.each([
		["multi-part", TWO],
		["single-part", "part: Gtr = Guitar\n"],
		["partless", ""],
	])("an undeclared label before a bar line is text, with a warning (%s)", (_, head) => {
		const p = parseChart(`${head}Bass | E | A |`);
		expect(p.lines.at(-1)?.kind).toBe("text");
		const w = p.diagnostics.find((d) => d.severity === "warning");
		expect(w?.message).toContain("Bass is not a part of this chart");
	});
	test("lyrics with pipes stay quiet text", () => {
		const p = parseChart("| G |\nOh | yeah | baby");
		expect(p.lines.at(-1)?.kind).toBe("text");
		expect(p.diagnostics).toEqual([]);
	});
});
