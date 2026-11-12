/**
 * Many parts: each is projected over the chart once, so the parse grows
 * with the parts times the lines, never faster (a Vercel review: 600
 * one-bar parts, 19 KB, took 9 s; each stream scanned every system line
 * for every line it projected).
 */
import { describe, expect, test } from "bun:test";
import { growth, TIMING_TIMEOUT } from "../../../../test-support/growth.js";
import { parseChart } from "../../src/chart/parse.js";

/** `n` declared parts, each writing one bar, in one system. */
const parts = (n: number) =>
	[
		...Array.from({ length: n }, (_, i) => `part: P${i} = Piano`),
		...Array.from({ length: n }, (_, i) => `P${i} | C |`),
	].join("\n");

/**
 * How much longer `large` parses than `small`, `balance` times its size
 * (`growth`): the small side runs that often a run, so both last as long.
 */
const parseGrowth = (small: string, large: string, balance: number) =>
	growth(
		() => parseChart(small),
		() => parseChart(large),
		{ balance },
	);

test(
	"four times the parts, at most 32 times as long: quadratic is 16, cubic 64",
	() => {
		expect(parseChart(parts(600)).bars[0]?.parts).toHaveLength(600);
		expect(parseGrowth(parts(150), parts(600), 4)).toBeLessThan(32);
	},
	TIMING_TIMEOUT,
);

/** `n` parts in one system with `n` verses under it. */
const sungParts = (n: number) =>
	[
		...Array.from({ length: n }, (_, i) => `part: P${i} = Piano`),
		...Array.from({ length: n }, (_, i) => `P${i} | C |`),
		...Array.from({ length: n }, (_, v) => `lyrics ${v + 1}: | la |`),
	].join("\n");

test(
	"many parts with many verses: five times both, under 25 times as long (quadratic), not 125",
	() => {
		expect(parseChart(sungParts(750)).bars[0]?.lyrics).toHaveLength(750);
		expect(parseGrowth(sungParts(150), sungParts(750), 5)).toBeLessThan(25);
	},
	TIMING_TIMEOUT,
);

/** `n` parts, all resting while the first writes `lines` one-bar systems. */
const resting = (n: number, lines: number) =>
	[
		...Array.from({ length: n }, (_, i) => `part: P${i} = Piano`),
		...Array.from({ length: lines }, () => "P0 | C |"),
	].join("\n");
/** `n` parts and `lines` tutti lines, which every part plays. */
const tutti = (n: number, lines: number) =>
	[
		...Array.from({ length: n }, (_, i) => `part: P${i} = Piano`),
		...Array(lines).fill("| C |"),
	].join("\n");

// Each part may play only its share of the bars, so it reads only its share of the lines: five times
// the parts and five times the lines cost about five times as long, not their product (25; 16 to 20
// measured before the fix).
for (const [shape, chart] of [
	["parts resting through one part's systems", resting],
	["parts playing many tutti lines", tutti],
] as const)
	test(
		`${shape}: five times both, under 10 times as long`,
		() => {
			// Each side takes a few hundred milliseconds already, so the runs need no balancing.
			expect(parseGrowth(chart(400, 400), chart(2000, 2000), 1)).toBeLessThan(10);
		},
		TIMING_TIMEOUT,
	);

test("a part past its share of the lines stops, and says so", () => {
	// 1,000 parts may each play 10 bars, so each reads 100 lines; these 150 text lines come first.
	const chart = `${Array.from({ length: 1000 }, (_, i) => `part: P${i} = Piano`).join("\n")}\n${"words\n".repeat(150)}| C |`;
	expect(
		parseChart(chart)
			.diagnostics.filter((d) => d.message.startsWith("expansion stopped"))
			.map((d) => d.message),
	).toEqual(["expansion stopped after 0 bars: each of 1000 parts reads at most 100 lines"]);
});

test("a part whose play ended at Fine reports no stop for the lines it did not read", () => {
	// 1,000 parts read at most 100 lines each; play ends at Fine, before the words past them.
	const chart = [
		...Array.from({ length: 1000 }, (_, i) => `part: P${i} = Piano`),
		"| C | Fine |",
		"| D | D.C. al Fine |",
		...Array(150).fill("words"),
	].join("\n");
	const p = parseChart(chart);
	expect(p.diagnostics.map((d) => d.message)).toEqual([]);
	expect(p.bars.map((b) => b.slots.length)).toEqual([1, 1, 1]);
});

/** `n` parts declared, `P0` to `P{n-1}`, with `= instrument`. */
const declared = (n: number, instrument = "Piano") =>
	Array.from({ length: n }, (_, i) => `part: P${i} = ${instrument}`);
/** One system of `n` parts, each line `bars`. */
const system = (n: number, bars = "| C |", name = "") =>
	Array.from({ length: n }, (_, i) => `P${i}${name} ${bars}`);

/**
 * The worst shapes found by review, each many parts times something else:
 * the parse must grow with the source and the bars played, never with
 * their product. Eight times the parts (and what they multiply), and a
 * generous bound: linear is eight times as long (up to 9 measured), a
 * product sixty-four (40 to 46 measured before the fix, 2026-11-09).
 */
const shapes: [string, (n: number) => string][] = [
	["every part sings", (n) => [...declared(n), ...system(n, "| {C4}:la |")].join("\n")],
	["every part is a voice", (n) => [...declared(n, "Voice"), ...system(n)].join("\n")],
	[
		"parts in four systems",
		(n) => [...declared(n), ...system(n), ...system(n), ...system(n), ...system(n)].join("\n"),
	],
	[
		"parts with two lines, in two systems",
		(n) =>
			[
				...declared(n, "Piano, lines: RH LH"),
				...system(n, "| C |", ".RH"),
				...system(n, "| C |", ".LH"),
			].join("\n"),
	],
	[
		"parts under rows, replayed",
		(n) =>
			[
				"## A",
				...declared(n),
				...system(n),
				...Array.from({ length: n }, (_, v) => `lyrics ${v + 1}: | la |`),
				...Array(n).fill("## A"),
			].join("\n"),
	],
	[
		"parts replayed, each replay with its own row",
		(n) =>
			["## A", ...declared(n), ...system(n), ...Array(n).fill("## A\nlyrics: | la |")].join("\n"),
	],
	[
		"parts through sections of %",
		(n) =>
			[
				...declared(n),
				...Array.from({ length: 8 }, (_, s) =>
					[`## S${s}`, ...system(n, "| C | % | % |")].join("\n"),
				),
			].join("\n"),
	],
	[
		"parts and many text lines",
		(n) => [...declared(n), ...Array(2 * n).fill("words here"), ...system(n)].join("\n"),
	],
];

describe("many parts times anything parses in time linear in the source", () => {
	for (const [shape, chart] of shapes)
		test(
			`${shape}: eight times as big, under twenty times as long`,
			() => {
				expect(parseGrowth(chart(200), chart(1600), 8)).toBeLessThan(20);
			},
			TIMING_TIMEOUT,
		);
});
