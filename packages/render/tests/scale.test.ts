/** Long charts: nothing in the layout may grow faster than the chart. */
import { expect, test } from "bun:test";
import { growth, TIMING_TIMEOUT } from "../../../test-support/growth.js";
import { layoutChart } from "../src/index.js";

/** How much longer `large`, ten times `small`, takes to lay out: alternated, balanced best-of-three runs (`growth`). */
const layoutGrowth = (small: string, large: string) =>
	growth(
		() => layoutChart(small),
		() => layoutChart(large),
		{ balance: 10 },
	);

const lines = (count: number) => "| D | G |\n".repeat(count);

test(
	"a long chart with no parts lays out in linear time: each line doesn't read every bar",
	() => {
		// The ratio catches a quadratic path; ten times the lines may cost at most 20 times as long.
		expect(layoutGrowth(lines(200), lines(2000))).toBeLessThan(20);
	},
	TIMING_TIMEOUT,
);

/** A lead sheet with a guitar: a voice line with syllables, a guitar line and a verse 2 row, `count` systems of them. */
const systems = (count: number) =>
	`part: V = Voice, instrument: voice\npart: G = Guitar\n${"V | {C4}:la {D4}:li | {E4}:lo |\nG | C | G |\nlyrics 2: | ha he | ho |\n---\n".repeat(count)}`;

test(
	"a long chart of parts and lyric rows lays out in linear time: each line finds its own bars",
	() => {
		expect(layoutGrowth(systems(200), systems(2000))).toBeLessThan(20);
	},
	TIMING_TIMEOUT,
);

/** Ten times the written slots or syllables and ten times the plays: linear is ten times as long, the product a hundred. */
const played = {
	"a lyric row's syllables": (n: number) => `| C | x${n}\nlyrics: | ${"la ".repeat(n)}|\n`,
	"a melody's syllables": (n: number) => `| ${"{C4}:la ".repeat(n)}| x${n}\n`,
	"slots with the pedal": (n: number) => `| +C ${"C ".repeat(n - 2)}*C | x${n}\n`,
};

for (const [shape, chart] of Object.entries(played))
	test(
		`one bar of many ${shape} played many times lays out in time linear in the two, not their product`,
		() => {
			expect(layoutGrowth(chart(500), chart(5000))).toBeLessThan(20);
		},
		TIMING_TIMEOUT,
	);
