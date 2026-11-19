import { describe, expect, test } from "bun:test";
import { type Meter, parseChart } from "barmark";
import { growth, TIMING_TIMEOUT } from "../../../test-support/growth.js";
import { barTexts, noteSet, withSimile } from "../src/import/cells.js";
import { type State, statesOf } from "../src/import/ends.js";
import type { Grid } from "../src/import/grid.js";
import type { Named } from "../src/import/pitch.js";
import { type Quantized, quantize, type Struck } from "../src/import/quantize.js";

const PPQ = 480;
const MIDI: Record<string, number> = {
	E1: 28,
	A1: 33,
	G2: 43,
	C3: 48,
	D3: 50,
	E3: 52,
	F3: 53,
	F4: 65,
	A4: 69,
};

/** A grid of `count` bars of one meter. */
function gridOf(count: number, meter: Meter = { n: 4, d: 4 }): Grid {
	const bars: Grid["bars"] = [];
	const length = (meter.n * 4 * PPQ) / meter.d;
	for (let i = 0; i < count; i++) bars.push({ start: i * length, meter });
	return { ppq: PPQ, bars, end: count * length, pickup: false };
}

/** Notes as [tick, end, name]. */
type Note = [number, number, string];
const attacksOf = (notes: Note[]): Named[] =>
	notes.map(([tick, end, name]) => ({
		tick,
		end,
		pitches: [MIDI[name] as number],
		names: [name],
	}));

/** The bars' texts of notes on a grid, checked against the real parser. */
function texts(notes: Note[], grid: Grid): string[] {
	const attacks = attacksOf(notes);
	const q = quantize(attacks, grid);
	const out = barTexts(statesOf(q, grid), q);
	const meter = grid.bars[0]?.meter as Meter;
	const chart = `time: ${meter.n}/${meter.d}\n\n| ${out.join(" | ")} |\n`;
	const errors = parseChart(chart).diagnostics.filter((d) => d.severity === "error");
	expect(errors).toEqual([]);
	return out;
}

/** One bar of 4/4 from notes. */
const bar = (...notes: Note[]): string => texts(notes, gridOf(1))[0] as string;

describe("noteSet", () => {
	const struck = (attack: Named[]): Struck<Named> => ({ beat: 0, point: 0, attacks: attack });
	test("one pitch", () => {
		expect(noteSet(struck(attacksOf([[0, 1, "C3"]])))).toBe("{C3}");
	});
	test("a double stop, low to high", () => {
		const a: Named = { tick: 0, end: 1, pitches: [69, 53, 65], names: ["A4", "F3", "F4"] };
		expect(noteSet(struck([a]))).toBe("{F3 F4 A4}");
	});
	test("two joined attacks of one pitch give it once", () => {
		expect(
			noteSet(
				struck(
					attacksOf([
						[0, 1, "C3"],
						[3, 4, "C3"],
					]),
				),
			),
		).toBe("{C3}");
	});
});

describe("barTexts: slots", () => {
	test("a whole note", () => expect(bar([0, 1920, "E1"])).toBe("{E1}"));
	test("two halves", () => expect(bar([0, 960, "A1"], [960, 1920, "A1"])).toBe("{A1} {A1}"));
	test("four quarters", () =>
		expect(bar([0, 480, "E1"], [480, 960, "E1"], [960, 1440, "E1"], [1440, 1920, "E1"])).toBe(
			"{E1} {E1} {E1} {E1}",
		));
	test("A h A h", () => expect(bar([0, 960, "A1"], [960, 1920, "A1"])).toBe("{A1} {A1}"));
	test("A h h A is four slots", () =>
		expect(bar([0, 1440, "A1"], [1440, 1920, "A1"])).toBe("{A1} / / {A1}"));
	test("a bar of rest", () => expect(texts([[1920, 2400, "C3"]], gridOf(2))[0]).toBe("--"));
	test("A h r r", () => expect(bar([0, 960, "C3"])).toBe("{C3} --"));
	test("A r r r", () => expect(bar([0, 480, "C3"])).toBe("{C3} -- -- --"));
	test("h h h h", () => expect(texts([[0, 3840, "C3"]], gridOf(2))[1]).toBe("/"));
	test("r r A h", () => expect(bar([960, 1920, "C3"])).toBe("-- {C3}"));
});

describe("barTexts: meters", () => {
	test("3/4: A h h is one slot", () =>
		expect(texts([[0, 1440, "C3"]], gridOf(1, { n: 3, d: 4 }))).toEqual(["{C3}"]));
	test("3/4: A A h is three slots", () =>
		expect(
			texts(
				[
					[0, 480, "C3"],
					[480, 1440, "D3"],
				],
				gridOf(1, { n: 3, d: 4 }),
			),
		).toEqual(["{C3} {D3} /"]));
	test("6/8: A h is one slot", () =>
		expect(texts([[0, 1440, "C3"]], gridOf(1, { n: 6, d: 8 }))).toEqual(["{C3}"]));
	test("5/4: one slot", () =>
		expect(texts([[0, 2400, "C3"]], gridOf(1, { n: 5, d: 4 }))).toEqual(["{C3}"]));
	test("5/4: five slots", () =>
		expect(
			texts(
				[
					[0, 480, "C3"],
					[480, 960, "D3"],
					[960, 1440, "E3"],
					[1440, 1920, "C3"],
					[1920, 2400, "D3"],
				],
				gridOf(1, { n: 5, d: 4 }),
			),
		).toEqual(["{C3} {D3} {E3} {C3} {D3}"]));
});

describe("barTexts: groups", () => {
	test("eighths", () =>
		expect(bar([0, 240, "G2"], [240, 480, "G2"], [480, 1920, "C3"])).toBe("{G2}_{G2} {C3} / /"));
	test("A h A A in one beat", () =>
		expect(bar([0, 240, "C3"], [240, 360, "E3"], [360, 480, "D3"], [480, 1920, "C3"])).toBe(
			"{C3}_/_{E3}_{D3} {C3} / /",
		));
	test("a triplet", () =>
		expect(bar([0, 160, "C3"], [160, 320, "D3"], [320, 480, "E3"], [480, 1920, "C3"])).toBe(
			"{C3}_{D3}_{E3} {C3} / /",
		));
	test("a beat h A", () => expect(bar([0, 720, "G2"], [720, 1920, "C3"])).toBe("{G2} /_{C3} / /"));
	test("a beat A A then holds", () =>
		expect(bar([0, 480, "G2"], [240, 1920, "C3"])).toBe("{G2}_{C3} / / /"));
	test("a beat A A r r is not dotted", () =>
		expect(bar([0, 120, "C3"], [120, 240, "D3"], [960, 1920, "E3"])).toBe(
			"{C3}_{D3}_--_-- -- {E3} /",
		));
});

describe("barTexts: dotted figures", () => {
	test("A h h A", () =>
		expect(bar([0, 360, "C3"], [360, 480, "D3"], [480, 1920, "E3"])).toBe("{C3}._{D3} {E3} / /"));
	test("A A h h", () =>
		expect(bar([0, 120, "C3"], [120, 480, "D3"], [480, 1920, "E3"])).toBe("{C3}_{D3}. {E3} / /"));
	test("A h h r is not dotted", () => {
		// No reading of a file puts a rest inside a beat of four parts, so the states are made by hand.
		const struck: Struck<Named> = { beat: 0, point: 0, attacks: attacksOf([[0, 1, "C3"]]) };
		const states: State<Named>[][] = [
			[
				{ kind: "attack", struck },
				{ kind: "hold" },
				{ kind: "hold" },
				{ kind: "rest", first: true },
			],
		];
		const q = { beats: [{ bar: 0 }], parts: [4] } as Quantized<Named>;
		expect(barTexts(states, q)).toEqual(["{C3}_/_/_--"]);
	});
	test("six parts are never dotted", () =>
		expect(
			bar(
				[0, 80, "C3"],
				[80, 160, "D3"],
				[160, 240, "E3"],
				[240, 320, "C3"],
				[320, 400, "D3"],
				[400, 480, "E3"],
				[480, 1920, "C3"],
			),
		).toBe("{C3}_{D3}_{E3}_{C3}_{D3}_{E3} {C3} / /"));
});

describe("barTexts: the spec's two bars", () => {
	test("reading A", () => {
		const notes: Note[] = [
			[0, 480, "C3"],
			[480, 720, "C3"],
			[720, 1200, "C3"],
			[1200, 1440, "C3"],
			[1440, 1680, "C3"],
			[1680, 1920, "C3"],
			[1920, 2160, "G2"],
			[2160, 2400, "G2"],
			[2400, 2640, "C3"],
			[2640, 3120, "C3"],
			[3120, 3360, "C3"],
			[3360, 3600, "C3"],
			[3600, 3720, "E3"],
			[3720, 3840, "D3"],
		];
		expect(texts(notes, gridOf(2))).toEqual([
			"{C3} {C3}_{C3} /_{C3} {C3}_{C3}",
			"{G2}_{G2} {C3}_{C3} /_{C3} {C3}_/_{E3}_{D3}",
		]);
	});
});

describe("withSimile", () => {
	const yes = () => true;
	test("equal bars starting with a note", () =>
		expect(withSimile(["{C3} {D3}", "{C3} {D3}"], yes)).toEqual(["{C3} {D3}", "%"]));
	test("bars of rest stay", () => expect(withSimile(["--", "--"], yes)).toEqual(["--", "--"]));
	test("bars starting with a hold stay", () =>
		expect(withSimile(["/ {C3}", "/ {C3}"], yes)).toEqual(["/ {C3}", "/ {C3}"]));
	test("same false keeps the text", () =>
		expect(withSimile(["{C3}", "{C3}"], () => false)).toEqual(["{C3}", "{C3}"]));
	test("three equal bars give two", () =>
		expect(withSimile(["{C3}", "{C3}", "{C3}"], yes)).toEqual(["{C3}", "%", "%"]));
});

describe("barTexts: scale", () => {
	const load = (bars: number) => {
		const grid = gridOf(bars);
		const notes: Note[] = [];
		for (let i = 0; i < bars; i++) notes.push([i * 1920, i * 1920 + 960, "C3"]);
		const q = quantize(attacksOf(notes), grid);
		return { q, states: statesOf(q, grid) };
	};
	test("100,000 bars: a text each", () => {
		const { q, states } = load(100_000);
		expect(barTexts(states, q).length).toBe(100_000);
	});
	test(
		"twice the bars take about twice the time",
		() => {
			const small = load(50_000);
			const large = load(100_000);
			const ratio = growth(
				() => barTexts(small.states, small.q),
				() => barTexts(large.states, large.q),
				{ balance: 2 },
			);
			expect(ratio).toBeLessThan(3);
		},
		TIMING_TIMEOUT,
	);
});
