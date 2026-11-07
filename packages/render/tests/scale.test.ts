/** Long charts: nothing in the layout may grow faster than the chart. */
import { expect, test } from "bun:test";
import { layoutChart } from "../src/index.js";

/** The best of two runs, after a warm-up, so a busy machine's pause isn't counted. */
function timed(text: string): number {
	layoutChart("| C |");
	let ms = Number.POSITIVE_INFINITY;
	for (let run = 0; run < 2; run++) {
		const start = performance.now();
		layoutChart(text);
		ms = Math.min(ms, performance.now() - start);
	}
	return ms;
}

const lines = (count: number) => "| D | G |\n".repeat(count);

test("a long chart with no parts lays out in linear time: each line doesn't read every bar", () => {
	// The ratio catches a quadratic path; ten times the lines may cost at most 25 times as long.
	expect(timed(lines(2000)) / timed(lines(200))).toBeLessThan(25);
}, 30_000);
