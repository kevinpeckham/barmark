/**
 * Many parts: each is projected over the chart once, so the parse grows
 * with the parts times the lines, never faster (a Vercel review: 600
 * one-bar parts, 19 KB, took 9 s; each stream scanned every system line
 * for every line it projected).
 */
import { expect, test } from "bun:test";
import { parseChart } from "../../src/chart/parse.js";

/** `n` declared parts, each writing one bar, in one system. */
const parts = (n: number) =>
	[
		...Array.from({ length: n }, (_, i) => `part: P${i} = Piano`),
		...Array.from({ length: n }, (_, i) => `P${i} | C |`),
	].join("\n");

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

test("four times the parts, at most 32 times as long: quadratic is 16, cubic 64", () => {
	const small = timed(parts(150));
	const large = timed(parts(600));
	expect(parseChart(parts(600)).bars[0]?.parts).toHaveLength(600);
	expect(large / small).toBeLessThan(32);
}, 120_000);

/** `n` parts in one system with `n` verses under it. */
const sungParts = (n: number) =>
	[
		...Array.from({ length: n }, (_, i) => `part: P${i} = Piano`),
		...Array.from({ length: n }, (_, i) => `P${i} | C |`),
		...Array.from({ length: n }, (_, v) => `lyrics ${v + 1}: | la |`),
	].join("\n");

test("many parts with many verses: five times both, under 25 times as long (quadratic), not 125", () => {
	const small = timed(sungParts(150));
	const large = timed(sungParts(750));
	expect(parseChart(sungParts(750)).bars[0]?.lyrics).toHaveLength(750);
	expect(large / small).toBeLessThan(25);
}, 120_000);
