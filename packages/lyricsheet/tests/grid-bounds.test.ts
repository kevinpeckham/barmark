import { describe, expect, test } from "bun:test";
import { parseChart } from "barmark";
import { exportLyricsheet } from "../src/index.js";

/** The fastest of three runs, in milliseconds. */
function best(run: () => unknown): number {
	let ms = Number.POSITIVE_INFINITY;
	for (let i = 0; i < 3; i++) {
		const start = performance.now();
		run();
		ms = Math.min(ms, performance.now() - start);
	}
	return ms;
}

/** Text for a jump that reaches a section the parser plays once, whatever its counts say. */
const afterJump = (coda: string) => `## A\n| C | To Coda | D | D.C. al Coda |\n## Coda\n${coda}`;

/**
 * The export parses the chart and then writes it; a grid never builds more
 * than the bars the parse played, so the export takes a small multiple of
 * `parseChart`'s own time. The bound is that multiple, 5, plus 100 ms for
 * the export's fixed cost (absolute, not a ratio of two sizes: these charts
 * are small, and an unbounded expansion of their counts takes seconds, or
 * runs out of memory).
 */
const BOUND = (parseMs: number) => 5 * parseMs + 100;

const charts: [string, string][] = [
	["a count of 999,999,999 after a jump", afterJump("| Coda | F | x 999999999\n")],
	["a count of 30,000,000 after a jump", afterJump("| Coda | F | x 30000000\n")],
	[
		"a repeat x 2000 of lines x 2000 after a jump",
		afterJump("| Coda | F |\n|: G | x 2000\n| A :| x 2000\n"),
	],
	[
		"a repeat played 4,000 times, sung on every other pass",
		`## V\n|: C :| x4000\n${Array.from({ length: 2000 }, (_, i) => `lyrics ${2 * i + 1}: | a |\n`).join("")}`,
	],
];

describe("a grid builds no more than what plays", () => {
	for (const [name, chart] of charts)
		test(`${name}: exports without throwing, within ${"5 × parseChart + 100 ms"}`, () => {
			const parseMs = best(() => parseChart(chart));
			let r: ReturnType<typeof exportLyricsheet> | undefined;
			const exportMs = best(() => {
				r = exportLyricsheet(chart);
			});
			expect(r?.ok).toBe(true);
			expect(exportMs).toBeLessThan(BOUND(parseMs));
		}, 60_000);
});

describe("one long line", () => {
	/** One bar line of `n` bars, all but the first `%`: each `%` asks whether the chart wrote it. */
	const line = (n: number) =>
		`## A\n|${Array.from({ length: n }, (_, i) => (i ? " % " : " C G ")).join("|")}|\n`;
	test("1,000 to 8,000 bars on one line: export time near proportional, and a small multiple of the parse's", () => {
		exportLyricsheet(line(500));
		const [short, long] = [line(1000), line(8000)];
		const ratio =
			best(() => exportLyricsheet(long)) /
			Math.max(
				best(() => exportLyricsheet(short)),
				1,
			);
		// Linear is 8; filtering the line's cells for every `%` measured 20 to 22.
		expect(ratio).toBeLessThan(14);
		// Measured 1.1 to 1.3 times the parse; the quadratic one 4.6 to 5.3.
		expect(best(() => exportLyricsheet(long))).toBeLessThan(3 * best(() => parseChart(long)));
	}, 60_000);
});
