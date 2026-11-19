import { describe, expect, test } from "bun:test";
import type { Meter } from "barmark";
import { growth, TIMING_TIMEOUT } from "../../../test-support/growth.js";
import type { Attack } from "../src/import/attacks.js";
import { statesOf } from "../src/import/ends.js";
import { type Grid, gridOf as gridFromFile } from "../src/import/grid.js";
import { quantize } from "../src/import/quantize.js";
import { createReport } from "../src/import/report.js";
import type { Smf, SmfEvent } from "../src/smf/types.js";

const PPQ = 480;

/** A grid of bars of the given meters, in order. */
function gridOfMeters(meters: Meter[], ppq = PPQ): Grid {
	const bars: Grid["bars"] = [];
	let start = 0;
	for (const meter of meters) {
		bars.push({ start, meter });
		start += (meter.n * 4 * ppq) / meter.d;
	}
	return { ppq, bars, end: start, pickup: false };
}

/** A grid of `count` bars of one meter. */
const gridOf = (count: number, meter: Meter = { n: 4, d: 4 }): Grid =>
	gridOfMeters(Array(count).fill(meter));

/** Notes as [tick, end]. */
const notes = (...spans: [number, number][]): Attack[] =>
	spans.map(([tick, end], i) => ({ tick, end, pitches: [48 + i] }));

/**
 * The states as text: `A` an attack, `h` a hold, `R` a rest's first point
 * and `r` the rest of it; a beat's points joined by `_`, beats by a space,
 * bars by ` | `.
 */
function read(attacks: Attack[], grid: Grid): string {
	const q = quantize(attacks, grid);
	const states = statesOf(q, grid);
	const bars: string[][] = grid.bars.map(() => []);
	states.forEach((points, b) => {
		const text = points
			.map((s) => (s.kind === "attack" ? "A" : s.kind === "hold" ? "h" : s.first ? "R" : "r"))
			.join("_");
		bars[q.beats[b]?.bar ?? 0]?.push(text);
	});
	return bars.map((beats) => beats.join(" ")).join(" | ");
}

describe("statesOf: holds and rests", () => {
	test("a whole note", () => {
		expect(read(notes([0, 1920]), gridOf(1))).toBe("A h h h");
	});
	test("four quarters each 470 long", () => {
		expect(read(notes([0, 470], [480, 950], [960, 1430], [1440, 1910]), gridOf(1))).toBe("A A A A");
	});
	test("a quarter 200 long, then two beats of silence: a rest, first on its first point", () => {
		expect(read(notes([0, 200], [1440, 1920]), gridOf(1))).toBe("A R r A");
	});
	test("the spec's case: an eighth, then attacks on beats 3 and 4: the end ties and goes later", () => {
		expect(read(notes([0, 240], [960, 1440], [1440, 1920]), gridOf(1))).toBe("A R A A");
	});
	test("a note 300 long is past the beat's midpoint: one beat of silence is a rest", () => {
		expect(read(notes([0, 300], [960, 1700]), gridOf(1))).toBe("A R A h");
	});
	test("a note 100 long ends at least one point after its attack: no silence before beat 2", () => {
		expect(read(notes([0, 100], [480, 1920]), gridOf(1))).toBe("A A h h");
	});
	test("sixteenths at points 0 and 1, the second 120 long: a rest from a point the attacks made", () => {
		expect(read(notes([0, 120], [120, 240], [960, 1920]), gridOf(1))).toBe("A_A_R_r r A h");
	});
	test("a tie between two points the attacks made goes to the later", () => {
		// The second sixteenth ends at 300, halfway between points 2 and 3:
		// the end is point 3 (360), and the rest starts there.
		expect(read(notes([0, 120], [120, 300], [840, 1920]), gridOf(1))).toBe("A_A_h_R r_r_r_A h h");
	});
	test("legato: a note ending 30 after the next attack stops at it", () => {
		expect(read(notes([0, 510], [480, 1920]), gridOf(1))).toBe("A A h h");
		const q = quantize(notes([0, 510], [480, 1920]), gridOf(1));
		expect(statesOf(q, gridOf(1))[1]?.[0]?.kind).toBe("attack");
	});
});

describe("statesOf: bar lines and the chart's ends", () => {
	test("a note ringing over a bar line for two bars", () => {
		expect(read(notes([0, 3840]), gridOf(2))).toBe("A h h h | h h h h");
	});
	test("a note ending at the bar line, then a bar of silence", () => {
		expect(read(notes([0, 1920]), gridOf(2))).toBe("A h h h | R r r r");
	});
	test("the last note 100 long with three beats left rests to the end", () => {
		expect(read(notes([0, 100]), gridOf(1))).toBe("A R r r");
	});
	test("the last note ending with half a beat left is held to the end", () => {
		expect(read(notes([0, 1440], [1440, 1560], [1560, 1660]), gridOf(1))).toBe("A h h A_A_h_h");
	});
	test("a note-off past the grid's end is the grid's end", () => {
		expect(read(notes([0, 100_000]), gridOf(1))).toBe("A h h h");
	});
	test("the first attack on beat 3: rests before it, first on the chart's first point", () => {
		expect(read(notes([960, 1920]), gridOf(1))).toBe("R r A h");
	});
	test("no attacks: everything is rest", () => {
		expect(read([], gridOf(2))).toBe("R r r r | r r r r");
	});
	test("an empty grid has no states", () => {
		const grid: Grid = { ppq: PPQ, bars: [], end: 0, pickup: false };
		expect(statesOf(quantize([], grid), grid)).toEqual([]);
	});
	test("the attack state carries its struck point", () => {
		const attacks = notes([0, 1920]);
		const q = quantize(attacks, gridOf(1));
		const first = statesOf(q, gridOf(1))[0]?.[0];
		expect(first).toEqual({ kind: "attack", struck: { beat: 0, point: 0, attacks } });
	});
});

describe("statesOf: the beat a silence is measured by", () => {
	test("6/8: 480 of silence is under a 720 beat, so the note is held", () => {
		expect(read(notes([0, 240], [1200, 1440]), gridOf(1, { n: 6, d: 8 }))).toBe("A h_h_A");
	});
	test("4/4 to 3/8: 240 of silence after the last 4/4 beat is under its 480, so held", () => {
		const grid = gridOfMeters([
			{ n: 4, d: 4 },
			{ n: 3, d: 8 },
		]);
		expect(read(notes([1440, 1500], [2160, 2640]), grid)).toBe("R r r A | h A h");
	});
	test("the same silence measured by a 3/8 beat is a rest", () => {
		const grid = gridOfMeters([
			{ n: 3, d: 8 },
			{ n: 3, d: 8 },
		]);
		expect(read(notes([0, 10], [480, 1440]), grid)).toBe("A R A | h h h");
	});
});

/** A time signature event. */
const time = (tick: number, n: number, d: number): SmfEvent => ({
	tick,
	kind: "meta",
	type: 0x58,
	data: new Uint8Array([n, Math.log2(d), 24, 8]),
});

/** A real grid: `first` (4/4) from 0, `meter` from `tick`, up to the bar holding `last`. */
const cut = (
	tick: number,
	meter: [number, number],
	last: number,
	first: [number, number] = [4, 4],
): Grid => {
	const smf: Smf = { format: 1, ppq: PPQ, tracks: [[time(0, ...first), time(tick, ...meter)]] };
	return gridFromFile(smf, last, createReport());
};

describe("statesOf: a beat's two clocks", () => {
	/** Bars 0: 4/4, 1920: 5/16 (a 650-tick span written 600), 2570: 3/4. */
	const gap = (): Grid => cut(2570, [3, 4], 4000);
	/** The same, a bar longer: 4010: 3/4. */
	const longer = (): Grid => cut(2570, [3, 4], 4500);

	test("a note-off in the gap past the 5/16 bar's meter is that bar's last beat's end", () => {
		// The note-off at 2560 is in beat 8 by the file's ticks (2400 to 2570),
		// and rounds to its end: the downbeat at 2570 (2520 on the chart).
		// The next attack, 2810, is beat 9's point 1 of 2 (2760 on the
		// chart): 240 of silence, at least beat 8's 120, is a rest.
		expect(read(notes([0, 1920], [2400, 2560], [2810, 4010]), gap())).toBe(
			"A h h h | R r r r A | R_A h h",
		);
	});
	test("a rest runs across the cut to the next bar's downbeat", () => {
		// The note-off at 1930 rounds to beat 4's end (2040). The next attack
		// at 2570 is 2520 on the chart: 480 of silence on the chart's clock.
		const grid = gap();
		const q = quantize(notes([1920, 1930], [2570, 4010]), grid);
		const states = statesOf(q, grid);
		expect(states.slice(4, 10).map((b) => b.map((s) => s.kind))).toEqual([
			["attack"],
			["rest"],
			["rest"],
			["rest"],
			["rest"],
			["attack"],
		]);
	});
	test("a note-off's point is measured from its beat's start in the file", () => {
		// The note-off at 3265 is 215 into beat 10 (3050 in the file, 3000 on
		// the chart): before the midpoint, so the end is beat 10's start. The
		// next attack (beat 12, 3960 on the chart) is 960 later: a rest from
		// beat 10. Measured from 3000 it would be past the midpoint.
		const grid = longer();
		const q = quantize(notes([2570, 3265], [4010, 5450]), grid);
		const kinds = statesOf(q, grid)
			.slice(9, 13)
			.map((b) => b.map((s) => (s.kind === "rest" && s.first ? "R" : s.kind[0])).join("_"));
		expect(kinds).toEqual(["a", "R", "r", "a"]);
	});
});

describe("statesOf: a silence of exactly one beat between triplet points", () => {
	test("ppq 1024: the first beat reads as every other beat does", () => {
		const grid = gridOfMeters([{ n: 4, d: 4 }], 1024);
		expect(read(notes([0, 341], [341, 469], [1707, 2048]), grid)).toBe("A_A_R r_r_A R r");
	});
	test("ppq 1024: the same figure a beat later", () => {
		const grid = gridOfMeters([{ n: 4, d: 4 }], 1024);
		expect(read(notes([1024, 1365], [1365, 1493], [2731, 3072]), grid)).toBe("R A_A_R r_r_A R");
	});
});

describe("statesOf: the silence and the chart's end are on the chart's clock", () => {
	test("a bar of 590 ticks written 5/16: 120 on the chart is a beat of rest (110 in the file)", () => {
		expect(read(notes([1920, 2400], [2510, 3950]), cut(2510, [3, 4], 4000))).toBe(
			"R r r r | A h h h R | A h h | R r r",
		);
	});
	test("a bar of 170 ticks written 1/16: 440 on the chart is held (490 in the file)", () => {
		expect(read(notes([0, 1920], [2410, 3530]), cut(2090, [3, 4], 3500))).toBe(
			"A h h h | h | h_h_A h h",
		);
	});
	test("the last note's silence runs to the chart's end on the chart's clock", () => {
		expect(read(notes([2510, 3470]), cut(2510, [3, 4], 3000))).toBe("R r r r | r r r r r | A h R");
	});
});

describe("statesOf: the beat a note-off falls in is found in the file", () => {
	test("after a bar of 10 ticks written 1/16, a note-off at 2250 is in the beat from 2170", () => {
		expect(read(notes([1930, 2250], [2410, 2770]), cut(1930, [7, 16], 2500))).toBe(
			"R r r r | r | A h h R A h h",
		);
	});
	test("a note-off exactly on a bar line cut short is the next bar's downbeat", () => {
		expect(read(notes([0, 1930], [2410, 3370]), cut(1930, [3, 4], 3000))).toBe(
			"A h h h | h | R A h",
		);
	});
});

describe("statesOf: the latest note-off of a point's attacks", () => {
	test("two attacks joined on one point, the first the longer", () => {
		expect(read(notes([0, 1920], [10, 200]), gridOf(1))).toBe("A h h h");
	});
	test("two attacks joined on one point, the second the longer", () => {
		expect(read(notes([0, 200], [10, 1920]), gridOf(1))).toBe("A h h h");
	});
});

describe("statesOf: the measuring beat is where the note ends, not where it was struck", () => {
	test("struck in 4/4, ending in 3/8: 240 of silence is a 3/8 beat, a rest", () => {
		const grid = gridOfMeters([
			{ n: 4, d: 4 },
			{ n: 3, d: 8 },
			{ n: 3, d: 8 },
		]);
		expect(read(notes([1440, 2160], [2400, 3360]), grid)).toBe("R r r A | h R A | h h h");
	});
});

describe("statesOf: a note-off at or past the grid's end is the chart's end", () => {
	test("a last bar cut short, written 1/16 over 10 ticks: the note rings through it", () => {
		expect(read(notes([1560, 1805]), cut(1690, [4, 4], 1685, [7, 16]))).toBe(
			"R r r r r r r | r r r r r r A | h",
		);
	});
});

/** `bars` bars of 4/4, two notes a bar, one long and one short. */
function load(bars: number): { attacks: Attack[]; grid: Grid } {
	const attacks = Array.from({ length: bars * 2 }, (_, i) => ({
		tick: i * 960 + (i % 3 === 0 ? 120 : 0),
		end: i * 960 + (i % 2 === 0 ? 900 : 100),
		pitches: [48],
	}));
	return { attacks, grid: gridOf(bars) };
}

describe("statesOf: scale", () => {
	test("100,000 bars and 200,000 attacks: a state for every point", () => {
		const { attacks, grid } = load(100_000);
		const q = quantize(attacks, grid);
		const states = statesOf(q, grid);
		expect(states.length).toBe(400_000);
		expect(states.every((points, b) => points.length === q.parts[b])).toBe(true);
		expect(states.flat().filter((s) => s.kind === "attack").length).toBe(200_000);
	});
	test(
		"four times the bars and attacks take about four times the time",
		() => {
			const small = load(25_000);
			const large = load(100_000);
			const qs = quantize(small.attacks, small.grid);
			const ql = quantize(large.attacks, large.grid);
			const ratio = growth(
				() => statesOf(qs, small.grid),
				() => statesOf(ql, large.grid),
				{ balance: 4 },
			);
			expect(ratio).toBeLessThan(8);
		},
		TIMING_TIMEOUT,
	);
});
