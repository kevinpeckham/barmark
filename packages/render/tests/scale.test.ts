/** Long charts: nothing in the layout may grow faster than the chart. */
import { expect, test } from "bun:test";
import { growth, TIMING_TIMEOUT } from "../../../test-support/growth.js";
import { layoutChart } from "../src/index.js";

/**
 * The limit of every test here: ten times the input may cost at most 20 times as long. Linear
 * measures about 10 and a quadratic path about 100, so 20 tells them apart with room on both sides.
 */
const LINEAR = 20;

/**
 * How much longer `large`, ten times `small`, takes: alternated, balanced best-of-three runs,
 * measured again when it comes out at the limit (`growth`'s `under`), since the "melody off"
 * test once read 20.04 on a busy machine where it measures 7 to 15 alone.
 */
const tenfold = (small: () => unknown, large: () => unknown) =>
	growth(small, large, { balance: 10, under: LINEAR });

const layoutGrowth = (small: string, large: string) =>
	tenfold(
		() => layoutChart(small),
		() => layoutChart(large),
	);

const lines = (count: number) => "| D | G |\n".repeat(count);

test(
	"a long chart with no parts lays out in linear time: each line doesn't read every bar",
	() => {
		expect(layoutGrowth(lines(200), lines(2000))).toBeLessThan(LINEAR);
	},
	TIMING_TIMEOUT,
);

/** A lead sheet with a guitar: a voice line with syllables, a guitar line and a verse 2 row, `count` systems of them. */
const systems = (count: number) =>
	`part: V = Voice, instrument: voice\npart: G = Guitar\n${"V | {C4}:la {D4}:li | {E4}:lo |\nG | C | G |\nlyrics 2: | ha he | ho |\n---\n".repeat(count)}`;

test(
	"a long chart of parts and lyric rows lays out in linear time: each line finds its own bars",
	() => {
		expect(layoutGrowth(systems(200), systems(2000))).toBeLessThan(LINEAR);
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
			expect(layoutGrowth(chart(500), chart(5000))).toBeLessThan(LINEAR);
		},
		TIMING_TIMEOUT,
	);

/** A lead-sheet section of one long melody bar, replayed `n` times; with the melody off each replay draws one chord bar. */
const replayed = (n: number) =>
	`part: V = Voice, instrument: voice\ntime: 4/4\n\n## A\nV | C |\nV.Mel | ${"{C4} ".repeat(n)}|\n\n${"## A\n\n".repeat(n)}`;

test(
	"melody off: a long melody replayed many times is read once, not once a replay",
	() => {
		const off = (text: string) => () => layoutChart(text, { melody: false });
		expect(tenfold(off(replayed(200)), off(replayed(2000)))).toBeLessThan(LINEAR);
	},
	TIMING_TIMEOUT,
);

/** One chord bar over a melody bar of `n` melismas (`la_/`): with the melody off, the words draw by beat, held places dropped. */
const melismas = (n: number) =>
	`part: V = Voice, instrument: voice\ntime: 4/4\n\nV | C |\nV.Mel | ${"{C4}_{C4} ".repeat(n)}|\nlyrics 1: | ${"la_/ ".repeat(n)}|\n`;

test(
	"melody off: a long row of melismas under a left-out melody lays out in linear time",
	() => {
		const off = (text: string) => () => layoutChart(text, { melody: false });
		expect(tenfold(off(melismas(100)), off(melismas(1000)))).toBeLessThan(LINEAR);
	},
	TIMING_TIMEOUT,
);
