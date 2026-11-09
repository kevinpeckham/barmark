/**
 * A played bar shares its written bar's data: a chart's parse costs its
 * written size plus its played bars, never their product (Vercel findings
 * 01M6V24KFCCKSRW0JSQ2FVE2NE, lyrics, and 01M6MJK1SBHEYJ9NK946Y0W7D1, pedal).
 */
import { describe, expect, test } from "bun:test";
import { parseChart } from "../../src/chart/parse.js";

// The ratio is of best-of-five timings; the timeout only keeps a loaded machine from cutting a run short.
const TIMEOUT = 60_000;

/** One bar of `n` slots, the pedal pressed on the first and lifted on the last, played `plays` times. */
const pedalled = (n: number, plays: number) =>
	`| +C ${Array(n - 2)
		.fill("C")
		.join(" ")} *C | x${plays}\n`;
/** One chord under a lyric row of `n` syllables, played `plays` times. */
const worded = (n: number, plays: number) =>
	`| C | x${plays}\nlyrics: | ${Array(n).fill("la").join(" ")} |\n`;
/** One bar of `n` notes, each with its syllable, played `plays` times. */
const melodic = (n: number, plays: number) =>
	`| ${Array(n).fill("{C4}:la").join(" ")} | x${plays}\n`;

/** The best of five parses of `text`, after one to warm up. */
function timed(text: string): number {
	parseChart(text);
	let ms = Number.POSITIVE_INFINITY;
	for (let run = 0; run < 5; run++) {
		const start = performance.now();
		parseChart(text);
		ms = Math.min(ms, performance.now() - start);
	}
	return ms;
}

describe("a played bar shares its written bar's data", () => {
	test("two plays of one bar share its slots and its words", () => {
		const [a, b] = parseChart('| +C /  *G "go" | x2\nlyrics: | la la la |\n').bars;
		expect(a?.slots).toBe(b?.slots as never);
		expect(a?.words).toBe(b?.words as never);
		expect(a?.lyrics?.[0]?.syllables).toBe(b?.lyrics?.[0]?.syllables as never);
	});
	test("two plays of a melody share its syllables", () => {
		const [a, b] = parseChart("| {C4}:la {D4}:di | x2\n").bars;
		expect(a?.lyrics?.[0]?.syllables).toHaveLength(2);
		expect(a?.lyrics?.[0]?.syllables).toBe(b?.lyrics?.[0]?.syllables as never);
	});
	test("plays of a part's lines share them", () => {
		const [a, b] = parseChart("part: P = Piano\nP.RH | {C4}:la {D4} | x2\nP.LH | C | x2\n").bars;
		expect(a?.lines?.[0]?.slots).toBe(b?.lines?.[0]?.slots as never);
		expect(a?.lines?.[1]?.slots).toBe(b?.lines?.[1]?.slots as never);
	});
});

describe("parse time grows with written size plus plays, not their product", () => {
	// Ten times the written and ten times the plays: linear is ten times as long, the product a hundred.
	// Each small side takes at least 5 ms, so a pause in one run can't swing the ratio.
	for (const [shape, chart, written, plays] of [
		["slots with the pedal", pedalled, 300, 300],
		["a lyric row's syllables", worded, 6000, 100],
		["a melody's syllables", melodic, 300, 300],
	] as const)
		test(
			shape,
			() => {
				const small = timed(chart(written, plays));
				const large = timed(chart(written * 10, plays * 10));
				expect(parseChart(chart(written * 10, plays * 10)).bars).toHaveLength(plays * 10);
				expect(large / small).toBeLessThan(30);
			},
			TIMEOUT,
		);
});
