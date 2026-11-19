import { describe, expect, test } from "bun:test";
import type { Meter } from "barmark";
import { growth, TIMING_TIMEOUT } from "../../../test-support/growth.js";
import type { Attack } from "../src/import/attacks.js";
import { type Grid, gridOf as gridFromFile } from "../src/import/grid.js";
import { beatsOfGrid, divisionsFor, pointTick, quantize } from "../src/import/quantize.js";
import { createReport } from "../src/import/report.js";
import type { Smf, SmfEvent } from "../src/smf/types.js";

const PPQ = 480;

/** A grid of `count` bars of one meter. */
function gridOf(count: number, meter: Meter = { n: 4, d: 4 }, ppq = PPQ): Grid {
	const length = (meter.n * 4 * ppq) / meter.d;
	const bars = Array.from({ length: count }, (_, i) => ({ start: i * length, meter }));
	return { ppq, bars, end: count * length, pickup: false };
}

const attacksAt = (...ticks: number[]): Attack[] =>
	ticks.map((tick, i) => ({ tick, end: tick + 10, pitches: [48 + i] }));

/** Each struck point as [beat, point, the ticks of its attacks]. */
const points = (attacks: Attack[], grid: Grid) =>
	quantize(attacks, grid).struck.map((s) => [s.beat, s.point, s.attacks.map((a) => a.tick)]);

describe("beatsOfGrid", () => {
	test("4/4 gives four beats of 480", () => {
		expect(beatsOfGrid(gridOf(1))).toEqual(
			[0, 480, 960, 1440].map((start) => ({
				bar: 0,
				start,
				at: start,
				length: 480,
				dotted: false,
			})),
		);
	});
	test("6/8 gives two dotted beats of 720", () => {
		expect(beatsOfGrid(gridOf(1, { n: 6, d: 8 }))).toEqual([
			{ bar: 0, start: 0, at: 0, length: 720, dotted: true },
			{ bar: 0, start: 720, at: 720, length: 720, dotted: true },
		]);
	});
	test("3/8 gives three beats of 240", () => {
		const beats = beatsOfGrid(gridOf(2, { n: 3, d: 8 }));
		expect(beats.map((b) => [b.bar, b.start, b.length, b.dotted])).toEqual([
			[0, 0, 240, false],
			[0, 240, 240, false],
			[0, 480, 240, false],
			[1, 720, 240, false],
			[1, 960, 240, false],
			[1, 1200, 240, false],
		]);
	});
	test("7/16 gives seven beats of 120", () => {
		const beats = beatsOfGrid(gridOf(1, { n: 7, d: 16 }));
		expect(beats.map((b) => b.length)).toEqual(Array(7).fill(120));
		expect(beats.map((b) => b.start)).toEqual([0, 120, 240, 360, 480, 600, 720]);
	});
});

describe("divisionsFor", () => {
	test("a quarter and a dotted quarter take all five", () => {
		expect(divisionsFor(480, 480)).toEqual([1, 2, 3, 4, 6]);
		expect(divisionsFor(720, 480)).toEqual([1, 2, 3, 4, 6]);
	});
	test("an eighth takes 1 to 4, a sixteenth 1 or 2, a 32nd only 1", () => {
		expect(divisionsFor(240, 480)).toEqual([1, 2, 3, 4]);
		expect(divisionsFor(120, 480)).toEqual([1, 2]);
		expect(divisionsFor(60, 480)).toEqual([1]);
	});
	test("always at least one part", () => {
		expect(divisionsFor(1, 480)).toEqual([1]);
	});
});

describe("quantize: a division for each beat", () => {
	test("quarters on the beat are one part each", () => {
		const q = quantize(attacksAt(0, 480, 960, 1440), gridOf(1));
		expect(q.parts).toEqual([1, 1, 1, 1]);
		expect(q.rounded).toEqual([]);
		expect(q.joined).toBe(0);
		expect(q.struck.map((s) => [s.beat, s.point])).toEqual([
			[0, 0],
			[1, 0],
			[2, 0],
			[3, 0],
		]);
	});
	test("eighths, a triplet, sixteenths, a sextuplet", () => {
		expect(quantize(attacksAt(0, 240), gridOf(1)).parts[0]).toBe(2);
		expect(quantize(attacksAt(0, 160, 320), gridOf(1)).parts[0]).toBe(3);
		expect(quantize(attacksAt(0, 120, 360), gridOf(1)).parts[0]).toBe(4);
		const six = quantize(attacksAt(0, 80, 400), gridOf(1));
		expect(six.parts[0]).toBe(6);
		expect(six.struck.map((s) => s.point)).toEqual([0, 1, 5]);
	});
	test("one attack at 240 only is point 1 of 2", () => {
		const q = quantize(attacksAt(240), gridOf(1));
		expect(q.parts).toEqual([2, 1, 1, 1]);
		expect(points(attacksAt(240), gridOf(1))).toEqual([[0, 1, [240]]]);
	});
	test("a beat with no attack has one part", () => {
		expect(quantize([], gridOf(1)).parts).toEqual([1, 1, 1, 1]);
	});
	test("every input attack is in a struck point, input order kept", () => {
		const attacks = attacksAt(0, 50, 240, 430, 480);
		const q = quantize(attacks, gridOf(1));
		expect(q.struck.flatMap((s) => s.attacks)).toEqual(attacks);
	});
});

describe("quantize: the tolerance", () => {
	test("15 late is beat 1's start; 16 late fits nothing and is rounded", () => {
		const late = quantize(attacksAt(495), gridOf(1));
		expect(points(attacksAt(495), gridOf(1))).toEqual([[1, 0, [495]]]);
		expect(late.rounded).toEqual([]);
		const later = quantize(attacksAt(496), gridOf(1));
		expect(later.struck.map((s) => [s.beat, s.point])).toEqual([[1, 0]]);
		expect(later.parts[1]).toBe(1);
		expect(later.rounded).toEqual([0]);
	});
	test("15 early is beat 1's start and beat 0 does not see it", () => {
		const q = quantize(attacksAt(465), gridOf(1));
		expect(points(attacksAt(465), gridOf(1))).toEqual([[1, 0, [465]]]);
		expect(q.parts[0]).toBe(1);
		expect(q.rounded).toEqual([]);
	});
	test("16 early is beat 0's, rounded to its end, and lands on beat 1's start", () => {
		const q = quantize(attacksAt(464), gridOf(1));
		expect(points(attacksAt(464), gridOf(1))).toEqual([[1, 0, [464]]]);
		expect(q.parts[0]).toBe(1);
		expect(q.rounded).toEqual([0]);
	});
	test("15 before a bar line is the next bar's first attack", () => {
		const grid = gridOf(3);
		const q = quantize(attacksAt(1905), grid);
		expect(points(attacksAt(1905), grid)).toEqual([[4, 0, [1905]]]);
		expect(q.beats[4]?.bar).toBe(1);
		expect(q.rounded).toEqual([]);
	});
});

describe("quantize: rounded beats", () => {
	test("0 and 40 join at point 0", () => {
		const q = quantize(attacksAt(0, 40), gridOf(1));
		expect(points(attacksAt(0, 40), gridOf(1))).toEqual([[0, 0, [0, 40]]]);
		expect(q.joined).toBe(1);
		expect(q.parts[0]).toBe(1);
		expect(q.rounded).toEqual([0]);
	});
	test("50 alone is point 0 of 1", () => {
		const q = quantize(attacksAt(50), gridOf(1));
		expect(points(attacksAt(50), gridOf(1))).toEqual([[0, 0, [50]]]);
		expect(q.parts[0]).toBe(1);
		expect(q.rounded).toEqual([0]);
	});
	test("60, a tie between 0 and 120, goes to 0", () => {
		expect(points(attacksAt(60), gridOf(1))).toEqual([[0, 0, [60]]]);
	});
	test("430 alone is carried to beat 1's start", () => {
		const q = quantize(attacksAt(430), gridOf(1));
		expect(points(attacksAt(430), gridOf(1))).toEqual([[1, 0, [430]]]);
		expect(q.parts.slice(0, 2)).toEqual([1, 1]);
		expect(q.rounded).toEqual([0]);
		expect(q.joined).toBe(0);
	});
	test("430 carried onto an attack at 480 joins it", () => {
		const q = quantize(attacksAt(430, 480), gridOf(1));
		expect(points(attacksAt(430, 480), gridOf(1))).toEqual([[1, 0, [430, 480]]]);
		expect(q.joined).toBe(1);
		expect(q.rounded).toEqual([0]);
	});
	test("0, 50 and 240: 0 and 50 join, 240 is point 2 of 4, reduced to 1 of 2", () => {
		const q = quantize(attacksAt(0, 50, 240), gridOf(1));
		expect(points(attacksAt(0, 50, 240), gridOf(1))).toEqual([
			[0, 0, [0, 50]],
			[0, 1, [240]],
		]);
		expect(q.parts[0]).toBe(2);
		expect(q.joined).toBe(1);
		expect(q.rounded).toEqual([0]);
	});
	test("rounded bars are named once each, ascending", () => {
		const q = quantize(attacksAt(50, 530, 1970, 2450), gridOf(2));
		expect(q.rounded).toEqual([0, 1]);
	});
	test("6/8: 0, 240 and 500 round on 6 parts and reduce to 3", () => {
		const grid = gridOf(1, { n: 6, d: 8 });
		const q = quantize(attacksAt(0, 240, 500), grid);
		expect(q.parts[0]).toBe(3);
		expect(points(attacksAt(0, 240, 500), grid)).toEqual([
			[0, 0, [0]],
			[0, 1, [240]],
			[0, 2, [500]],
		]);
		expect(q.rounded).toEqual([0]);
	});
	test("3/8: 0 and 60 are 4 parts; 0 and 40 round on 4", () => {
		const grid = gridOf(1, { n: 3, d: 8 });
		const sixteenths = quantize(attacksAt(0, 60), grid);
		expect(sixteenths.parts[0]).toBe(4);
		expect(sixteenths.rounded).toEqual([]);
		const sextuplet = quantize(attacksAt(0, 40), grid);
		expect(sextuplet.parts[0]).toBe(4);
		expect(sextuplet.struck.map((s) => s.point)).toEqual([0, 1]);
		expect(sextuplet.rounded).toEqual([0]);
	});
	test("the grid's last beat has no end point: 30 before the end is its last point", () => {
		const q = quantize(attacksAt(1890), gridOf(1));
		expect(points(attacksAt(1890), gridOf(1))).toEqual([[3, 3, [1890]]]);
		expect(q.parts[3]).toBe(4);
		expect(q.rounded).toEqual([0]);
		expect(pointTick(q, 3, 3)).toBeLessThan(1920);
	});
});

describe("quantize: small divisions", () => {
	test("ppq 24: quarters on the beat", () => {
		const q = quantize(attacksAt(0, 24, 48, 72), gridOf(1, { n: 4, d: 4 }, 24));
		expect(q.parts).toEqual([1, 1, 1, 1]);
		expect(q.rounded).toEqual([]);
	});
	test("ppq 1: an attack on every tick is four beats of one attack", () => {
		const q = quantize(attacksAt(0, 1, 2, 3), gridOf(1, { n: 4, d: 4 }, 1));
		expect(q.parts).toEqual([1, 1, 1, 1]);
		expect(q.rounded).toEqual([]);
		expect(q.struck.map((s) => [s.beat, s.point, s.attacks.length])).toEqual([
			[0, 0, 1],
			[1, 0, 1],
			[2, 0, 1],
			[3, 0, 1],
		]);
	});
});

describe("pointTick", () => {
	test("beat 1, point 3 of 4 is 840", () => {
		const q = quantize(attacksAt(480, 840), gridOf(1));
		expect(q.parts[1]).toBe(4);
		expect(pointTick(q, 1, 3)).toBe(840);
	});
});

/** `bars` bars of 4/4 and two attacks a bar, a third of them 50 late (rounded). */
function load(bars: number): { attacks: Attack[]; grid: Grid } {
	const ticks = Array.from({ length: bars * 2 }, (_, i) => i * 960 + (i % 3 === 0 ? 50 : 0));
	return { attacks: attacksAt(...ticks), grid: gridOf(bars) };
}

describe("quantize: scale", () => {
	test("100,000 bars and 200,000 attacks: every attack struck", () => {
		const { attacks, grid } = load(100_000);
		const q = quantize(attacks, grid);
		expect(q.struck.length).toBe(200_000);
		expect(q.beats.length).toBe(400_000);
	});
	test(
		"twice the bars and attacks take about twice the time",
		() => {
			const small = load(50_000);
			const large = load(100_000);
			const ratio = growth(
				() => quantize(small.attacks, small.grid),
				() => quantize(large.attacks, large.grid),
				{ balance: 2 },
			);
			expect(ratio).toBeLessThan(3);
		},
		TIMING_TIMEOUT,
	);
});

describe("a beat's two clocks: a cut bar", () => {
	const time = (tick: number, n: number, d: number): SmfEvent => ({
		tick,
		kind: "meta",
		type: 0x58,
		data: new Uint8Array([n, Math.log2(d), 24, 8]),
	});
	/** The real grid of a 4/4 file with a 3/4 signature at `cut`, long enough for `last`. */
	const cutGrid = (cut: number, last: number): Grid => {
		const smf: Smf = { format: 1, ppq: PPQ, tracks: [[time(0, 4, 4), time(cut, 3, 4)]] };
		return gridFromFile(smf, last, createReport());
	};
	/** Bars 0: 4/4, 1920: 5/16 (a 650-tick span written 600), 2570: 3/4. */
	const gap = () => cutGrid(2570, 4000);

	test("the grid is as the test reads it", () => {
		const grid = gap();
		expect(grid.bars.map((b) => [b.start, b.meter.n, b.meter.d])).toEqual([
			[0, 4, 4],
			[1920, 5, 16],
			[2570, 3, 4],
		]);
	});
	test("the 3/4 bar starts at 2570 in the file and 2520 on the chart's clock", () => {
		const beats = beatsOfGrid(gap());
		const cut = beats.filter((b) => b.bar === 1);
		expect(cut.map((b) => [b.start, b.at])).toEqual(
			[1920, 2040, 2160, 2280, 2400].map((t) => [t, t]),
		);
		const after = beats.find((b) => b.bar === 2);
		expect([after?.start, after?.at]).toEqual([2570, 2520]);
	});
	test("five sixteenth beats and the next downbeat, nothing rounded, measured on the chart's clock", () => {
		const grid = gap();
		const q = quantize(attacksAt(1920, 2040, 2160, 2280, 2400, 2570), grid);
		expect(q.struck.map((s) => [s.beat, s.point])).toEqual([
			[4, 0],
			[5, 0],
			[6, 0],
			[7, 0],
			[8, 0],
			[9, 0],
		]);
		expect(q.rounded).toEqual([]);
		const last = q.struck.at(-1);
		expect(last && pointTick(q, last.beat, last.point)).toBe(2520);
	});
	test("an attack in the gap past the 5/16 bar's meter is carried to the downbeat", () => {
		const q = quantize(attacksAt(2540), gap());
		expect(points(attacksAt(2540), gap())).toEqual([[9, 0, [2540]]]);
		expect(q.rounded).toEqual([1]);
		expect(pointTick(q, 9, 0)).toBe(2520);
	});
	test("a bar cut 50 ticks in and written 1/16: points still in time order", () => {
		const grid = cutGrid(1970, 2130);
		expect(grid.bars.map((b) => [b.start, b.meter.n, b.meter.d])).toEqual([
			[0, 4, 4],
			[1920, 1, 16],
			[1970, 3, 4],
		]);
		const attacks = attacksAt(1952, 2030);
		const q = quantize(attacks, grid);
		expect(q.struck.flatMap((s) => s.attacks)).toEqual(attacks);
		const ticks = q.struck.map((s) => pointTick(q, s.beat, s.point));
		for (let i = 1; i < ticks.length; i++)
			expect(ticks[i] as number).toBeGreaterThan(ticks[i - 1] as number);
	});
	test("where every bar is as long as its meter, each beat's two clocks agree", () => {
		for (const grid of [gridOf(3), gridOf(2, { n: 6, d: 8 }), gridOf(2, { n: 7, d: 16 }, 24)])
			for (const beat of beatsOfGrid(grid)) expect(beat.at).toBe(beat.start);
	});
});

describe("review: tests that kill the surviving mutants", () => {
	test("K1 a carried attack joins one exactly 15 from the start, and the beat is then fitted", () => {
		const q = quantize(attacksAt(430, 495, 640, 800), gridOf(1));
		expect(points(attacksAt(430, 495, 640, 800), gridOf(1))).toEqual([
			[1, 0, [430, 495]],
			[1, 1, [640]],
			[1, 2, [800]],
		]);
		expect(q.parts[1]).toBe(3);
		expect(q.joined).toBe(1);
		expect(q.rounded).toEqual([0]);
	});
	test("K2 a carried attack joins the next bar's first attack before that beat is fitted", () => {
		const grid = gridOf(2);
		const q = quantize(attacksAt(1870, 1920, 2080, 2240), grid);
		expect(points(attacksAt(1870, 1920, 2080, 2240), grid)).toEqual([
			[4, 0, [1870, 1920]],
			[4, 1, [2080]],
			[4, 2, [2240]],
		]);
		expect(q.parts[4]).toBe(3);
		expect(q.rounded).toEqual([0]);
	});
	test("K3 a carried attack does not join an attack further than the tolerance from the start", () => {
		const q = quantize(attacksAt(430, 720), gridOf(1));
		expect(points(attacksAt(430, 720), gridOf(1))).toEqual([
			[1, 0, [430]],
			[1, 1, [720]],
		]);
		expect(q.parts[1]).toBe(2);
		expect(q.joined).toBe(0);
	});
	test("K4 a sixteenth beat rounds on 2 parts, its finest", () => {
		const grid = gridOf(1, { n: 7, d: 16 });
		const q = quantize(attacksAt(40), grid);
		expect(points(attacksAt(40), grid)).toEqual([[0, 1, [40]]]);
		expect(q.parts[0]).toBe(2);
		expect(q.rounded).toEqual([0]);
	});
	test("K5 the last beat takes an attack within the tolerance of the grid's end, at its last point", () => {
		const q = quantize(attacksAt(1910), gridOf(1));
		expect(points(attacksAt(1910), gridOf(1))).toEqual([[3, 3, [1910]]]);
		expect(q.parts[3]).toBe(4);
		expect(q.rounded).toEqual([0]);
	});
	test("K6 two attacks within the tolerance of one point fit nothing: one struck, rounded", () => {
		const q = quantize(attacksAt(0, 10), gridOf(1));
		expect(points(attacksAt(0, 10), gridOf(1))).toEqual([[0, 0, [0, 10]]]);
		expect(q.joined).toBe(1);
		expect(q.rounded).toEqual([0]);
	});
	test("K7 three attacks on one point are two joined", () => {
		expect(quantize(attacksAt(0, 40, 50), gridOf(1)).joined).toBe(2);
	});
	test("K8 pointTick divides by the beat's own parts", () => {
		const q = quantize(attacksAt(0, 160, 320), gridOf(1));
		expect(pointTick(q, 0, 2)).toBe(320);
	});
});
