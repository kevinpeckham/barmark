import { describe, expect, test } from "bun:test";
import { parseChart } from "../../src/index.js";
import { barText } from "./fixtures.js";

const fast = (text: string) => {
	const start = performance.now();
	parseChart(text);
	return performance.now() - start;
};

describe("long whitespace runs parse in linear time", () => {
	const run = " ".repeat(100_000);
	test("after the last pipe", () => expect(fast(`| D | A${run}B`)).toBeLessThan(100));
	test("in a heading", () => expect(fast(`## V${run}B\n| D |`)).toBeLessThan(100));
	test("inside a cell", () => expect(fast(`| D${run}A |`)).toBeLessThan(100));
	test("repeat tails still read", () => {
		expect(parseChart("| D | x 2 ").bars).toHaveLength(2);
		expect(parseChart("## V   x3\n| D |").bars).toHaveLength(3);
		expect(parseChart("## Box2\n| D |").sections[0]?.name).toBe("Box2");
	});
});

describe("a section whose bar lines all fail stays a definition", () => {
	test("it plays nothing rather than replaying an earlier section", () => {
		const r = parseChart(
			"## Verse\n| D | A |\n## Chorus\n| G |\n## Verse\n| E | Hm |\n## Outro\n| C |",
		);
		expect(r.bars.map(barText)).toEqual(["D", "A", "G", "C"]);
		expect(r.sections.map((s) => s.replayOf)).toEqual([null, null, null, null]);
		expect(r.diagnostics.map((d) => d.line)).toEqual([6]);
	});
	test("no spurious replay error", () => {
		const r = parseChart("## Verse\n| D | Hm |\n## Chorus\n| G |");
		expect(r.diagnostics.map((d) => d.line)).toEqual([2]);
	});
	test("the dropped line is kept as written", () => {
		expect(parseChart("| D | Hm |").lines).toEqual([
			{ kind: "invalid", line: 1, text: "| D | Hm |" },
		]);
	});
});

describe("-> must end a heading", () => {
	test("-> before a repeat is an error", () => {
		const r = parseChart("## Chorus -> x2\n| G |");
		expect(r.diagnostics.map((d) => [d.line, d.severity])).toEqual([[1, "error"]]);
	});
});

describe("% repeats the previous bar exactly", () => {
	test("including a one-bar meter", () => {
		expect(parseChart("| [2/4] G | % | D |").bars.map((b) => b.meter.n)).toEqual([2, 2, 4]);
	});
	test("a chain of % keeps it", () => {
		expect(parseChart("| [3/4] G | % | % |").bars.map((b) => b.meter.n)).toEqual([3, 3, 3]);
	});
});
