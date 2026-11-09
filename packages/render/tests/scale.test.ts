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
	// The ratio catches a quadratic path; ten times the lines may cost at most 20 times as long.
	expect(timed(lines(2000)) / timed(lines(200))).toBeLessThan(20);
}, 30_000);

/** A lead sheet with a guitar: a voice line with syllables, a guitar line and a verse 2 row, `count` systems of them. */
const systems = (count: number) =>
	`part: V = Voice, instrument: voice\npart: G = Guitar\n${"V | {C4}:la {D4}:li | {E4}:lo |\nG | C | G |\nlyrics 2: | ha he | ho |\n---\n".repeat(count)}`;

test("a long chart of parts and lyric rows lays out in linear time: each line finds its own bars", () => {
	expect(timed(systems(2000)) / timed(systems(200))).toBeLessThan(20);
}, 60_000);

/** Ten times the written slots or syllables and ten times the plays: linear is ten times as long, the product a hundred. */
const played = {
	"a lyric row's syllables": (n: number) => `| C | x${n}\nlyrics: | ${"la ".repeat(n)}|\n`,
	"a melody's syllables": (n: number) => `| ${"{C4}:la ".repeat(n)}| x${n}\n`,
	"slots with the pedal": (n: number) => `| +C ${"C ".repeat(n - 2)}*C | x${n}\n`,
};

for (const [shape, chart] of Object.entries(played))
	test(`one bar of many ${shape} played many times lays out in time linear in the two, not their product`, () => {
		expect(timed(chart(5000)) / timed(chart(500))).toBeLessThan(20);
	}, 60_000);
