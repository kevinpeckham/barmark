import { describe, expect, test } from "bun:test";
import { parseChart, zipEvents } from "../../src/chart/parse.js";
import { printPart } from "../../src/chart/print.js";
import type { ChartDiagnostic, ChartEvent, PlayedBar } from "../../src/chart/types.js";

const H = "part: Gtr = Guitar\npart: Pno = Piano\npart: Bs = Bass\n\n";
const messages = (text: string) =>
	parseChart(text).diagnostics.map((d) => `${d.line}: ${d.message}`);

describe("a system's reference line is the one most of its lines agree with", () => {
	test("the one line that differs is the error, wherever it sits", () => {
		const text = `${H}Gtr | G | C | D |\nPno | Em | C |\nBs | E | C |\n`;
		expect(messages(text)).toEqual(["5: this system's lines have 2 bars (line 6); this one has 3"]);
		const lines = parseChart(text).lines.filter((l) => l.kind === "bars");
		expect(lines.map((l) => l.kind === "bars" && l.dropped === true)).toEqual([true, false, false]);
	});
	test("with no majority the first line stays the reference", () => {
		const text = "part: Gtr = Guitar\npart: Pno = Piano\n\nGtr | G | C | D |\nPno | Em | C |\n";
		expect(messages(text)).toEqual(["5: this system's lines have 3 bars (line 4); this one has 2"]);
	});
});

describe("the parts disagreeing on a bar's meter", () => {
	test("is reported on every line that plays it, with the meters", () => {
		const text = "part: Gtr = Guitar\npart: Pno = Piano\n\n| [3/4] D |\nGtr | % |\nPno | E |\n";
		expect(messages(text)).toEqual([
			"5: the parts disagree on this bar's meter (3/4, 4/4)",
			"6: the parts disagree on this bar's meter (3/4, 4/4)",
		]);
	});
});

describe("parts falling out of step", () => {
	const bar = (line: number): ChartEvent => ({
		kind: "bar",
		bar: { line, meter: { n: 4, d: 4 }, slots: [] } as unknown as PlayedBar,
	});
	test("is an error, not a silent fallback", () => {
		const found: ChartDiagnostic[] = [];
		zipEvents(
			[
				[bar(4), bar(5)],
				[bar(4), { kind: "fermata", line: 6 }],
			],
			(d) => found.push(d),
		);
		expect(found.map((d) => `${d.line}: ${d.message}`)).toEqual([
			"5: the parts fall out of step here; check that every line of this system writes the same marks",
		]);
	});
});

describe("printPart", () => {
	test("leaves out a part: line demoted for sharing a label", () => {
		const text = `${H}part: Gtr = Guitar 2\nGtr | D |\nPno | E |\nBs | F |\n`;
		const printed = printPart(text, "Pno") ?? "";
		expect(printed).not.toContain("Guitar 2");
		expect(parseChart(printed).parts).toHaveLength(1);
	});
});
