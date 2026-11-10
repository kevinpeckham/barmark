import { describe, expect, test } from "bun:test";
import { parseChart } from "../../src/index.js";
import { barText } from "./fixtures.js";

/** The best of three parses of `text`, after one to warm up. */
function timed(text: string): number {
	parseChart(text);
	let ms = Number.POSITIVE_INFINITY;
	for (let run = 0; run < 3; run++) {
		const start = performance.now();
		parseChart(text);
		ms = Math.min(ms, performance.now() - start);
	}
	return ms;
}

describe("long whitespace runs parse in linear time", () => {
	/** `lines` lines, each with a run of `spaces` spaces where `make` puts it. */
	const chart = (make: (run: string) => string, lines: number, spaces: number) =>
		Array(lines)
			.fill(make(" ".repeat(spaces)))
			.join("\n");
	// Four times the run: linear is four times as long, a scan that backtracks over the run sixteen.
	// Each small side takes at least 5 ms; a heading is cheap to read, so it takes more lines.
	for (const [where, make, lines] of [
		["after the last pipe", (run: string) => `| D | A${run}B`, 20],
		["in a heading", (run: string) => `## V${run}B\n| D |`, 100],
		["inside a cell", (run: string) => `| D${run}A |`, 20],
	] as const)
		test(where, () => {
			const small = timed(chart(make, lines, 2000));
			const large = timed(chart(make, lines, 8000));
			expect(large / small).toBeLessThan(8);
		});
	test("repeat tails still read", () => {
		expect(parseChart("| D | x 2 ").bars).toHaveLength(2);
		expect(parseChart("## V   x3\n| D |").bars).toHaveLength(3);
		expect(parseChart("## Box2\n| D |").sections[0]?.name).toBe("Box2");
	});
});

describe("a section whose bar lines all fail stays a definition", () => {
	test("it plays nothing rather than replaying an earlier section", () => {
		const r = parseChart(
			"## Verse\n| D | A |\n## Chorus\n| G |\n## Verse\n| E :| A |\n## Outro\n| C |",
		);
		expect(r.bars.map(barText)).toEqual(["D", "A", "G", "C"]);
		expect(r.sections.map((s) => s.replayOf)).toEqual([null, null, null, null]);
		expect(r.diagnostics.map((d) => d.line)).toEqual([6]);
	});
	test("no spurious replay error", () => {
		const r = parseChart("## Verse\n| D :| A |\n## Chorus\n| G |");
		expect(r.diagnostics.map((d) => d.line)).toEqual([2]);
	});
	test("the dropped line is kept as written", () => {
		expect(parseChart("| D :| A |").lines).toEqual([
			{ kind: "invalid", line: 1, text: "| D :| A |", written: 2 },
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

describe("many quoted words in one cell parse in linear time", () => {
	const cell = (n: number) => `| C ${Array.from({ length: n }, (_, i) => `"w${i}"`).join(" ")} |`;
	// Best of three after a warm-up; the small size is big enough that timer noise doesn't set the ratio.
	test("ten times the words, nowhere near a hundred times as long", () => {
		const ratio = timed(cell(40_000)) / timed(cell(4000));
		expect(ratio).toBeLessThan(25);
	}, 30_000);
	test("the words still read, each before its slot", () => {
		expect(parseChart('| "a" C "b" G |').bars[0]?.words).toEqual([
			{ text: "a", at: 0 },
			{ text: "b", at: 1 },
		]);
	});
});
