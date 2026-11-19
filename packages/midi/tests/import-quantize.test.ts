import { describe, expect, test } from "bun:test";
import type { Meter } from "barmark";
import type { Attack } from "../src/import/attacks.js";
import type { Grid } from "../src/import/grid.js";
import { beatsOfGrid, divisionsFor, pointTick, quantize } from "../src/import/quantize.js";

const PPQ = 480;

/** A grid of `count` bars of one meter. */
function gridOf(count: number, meter: Meter = { n: 4, d: 4 }, ppq = PPQ): Grid {
	const length = (meter.n * 4 * ppq) / meter.d;
	const bars = Array.from({ length: count }, (_, i) => ({ start: i * length, meter }));
	return { ppq, bars, end: count * length, pickup: false };
}

const at = (...ticks: number[]): Attack[] =>
	ticks.map((tick, i) => ({ tick, end: tick + 10, pitches: [48 + i] }));

/** Each struck point as [beat, point, the ticks of its attacks]. */
const points = (attacks: Attack[], grid: Grid) =>
	quantize(attacks, grid).struck.map((s) => [s.beat, s.point, s.attacks.map((a) => a.tick)]);

describe("beatsOfGrid", () => {
	test("4/4 gives four beats of 480", () => {
		expect(beatsOfGrid(gridOf(1))).toEqual(
			[0, 480, 960, 1440].map((start) => ({ bar: 0, start, length: 480, dotted: false })),
		);
	});
	test("6/8 gives two dotted beats of 720", () => {
		expect(beatsOfGrid(gridOf(1, { n: 6, d: 8 }))).toEqual([
			{ bar: 0, start: 0, length: 720, dotted: true },
			{ bar: 0, start: 720, length: 720, dotted: true },
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
		const q = quantize(at(0, 480, 960, 1440), gridOf(1));
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
		expect(quantize(at(0, 240), gridOf(1)).parts[0]).toBe(2);
		expect(quantize(at(0, 160, 320), gridOf(1)).parts[0]).toBe(3);
		expect(quantize(at(0, 120, 360), gridOf(1)).parts[0]).toBe(4);
		const six = quantize(at(0, 80, 400), gridOf(1));
		expect(six.parts[0]).toBe(6);
		expect(six.struck.map((s) => s.point)).toEqual([0, 1, 5]);
	});
	test("one attack at 240 only is point 1 of 2", () => {
		const q = quantize(at(240), gridOf(1));
		expect(q.parts).toEqual([2, 1, 1, 1]);
		expect(points(at(240), gridOf(1))).toEqual([[0, 1, [240]]]);
	});
	test("a beat with no attack has one part", () => {
		expect(quantize([], gridOf(1)).parts).toEqual([1, 1, 1, 1]);
	});
	test("every input attack is in a struck point, input order kept", () => {
		const attacks = at(0, 50, 240, 430, 480);
		const q = quantize(attacks, gridOf(1));
		expect(q.struck.flatMap((s) => s.attacks)).toEqual(attacks);
	});
});

describe("quantize: the tolerance", () => {
	test("15 late is beat 1's start; 16 late fits nothing and is rounded", () => {
		const late = quantize(at(495), gridOf(1));
		expect(points(at(495), gridOf(1))).toEqual([[1, 0, [495]]]);
		expect(late.rounded).toEqual([]);
		const later = quantize(at(496), gridOf(1));
		expect(later.struck.map((s) => [s.beat, s.point])).toEqual([[1, 0]]);
		expect(later.parts[1]).toBe(1);
		expect(later.rounded).toEqual([0]);
	});
	test("15 early is beat 1's start and beat 0 does not see it", () => {
		const q = quantize(at(465), gridOf(1));
		expect(points(at(465), gridOf(1))).toEqual([[1, 0, [465]]]);
		expect(q.parts[0]).toBe(1);
		expect(q.rounded).toEqual([]);
	});
	test("16 early is beat 0's, rounded to its end, and lands on beat 1's start", () => {
		const q = quantize(at(464), gridOf(1));
		expect(points(at(464), gridOf(1))).toEqual([[1, 0, [464]]]);
		expect(q.parts[0]).toBe(1);
		expect(q.rounded).toEqual([0]);
	});
	test("15 before a bar line is the next bar's first attack", () => {
		const grid = gridOf(3);
		const q = quantize(at(1905), grid);
		expect(points(at(1905), grid)).toEqual([[4, 0, [1905]]]);
		expect(q.beats[4]?.bar).toBe(1);
		expect(q.rounded).toEqual([]);
	});
});

describe("quantize: rounded beats", () => {
	test("0 and 40 join at point 0", () => {
		const q = quantize(at(0, 40), gridOf(1));
		expect(points(at(0, 40), gridOf(1))).toEqual([[0, 0, [0, 40]]]);
		expect(q.joined).toBe(1);
		expect(q.parts[0]).toBe(1);
		expect(q.rounded).toEqual([0]);
	});
	test("50 alone is point 0 of 1", () => {
		const q = quantize(at(50), gridOf(1));
		expect(points(at(50), gridOf(1))).toEqual([[0, 0, [50]]]);
		expect(q.parts[0]).toBe(1);
		expect(q.rounded).toEqual([0]);
	});
	test("60, a tie between 0 and 120, goes to 0", () => {
		expect(points(at(60), gridOf(1))).toEqual([[0, 0, [60]]]);
	});
	test("430 alone is carried to beat 1's start", () => {
		const q = quantize(at(430), gridOf(1));
		expect(points(at(430), gridOf(1))).toEqual([[1, 0, [430]]]);
		expect(q.parts.slice(0, 2)).toEqual([1, 1]);
		expect(q.rounded).toEqual([0]);
		expect(q.joined).toBe(0);
	});
	test("430 carried onto an attack at 480 joins it", () => {
		const q = quantize(at(430, 480), gridOf(1));
		expect(points(at(430, 480), gridOf(1))).toEqual([[1, 0, [430, 480]]]);
		expect(q.joined).toBe(1);
		expect(q.rounded).toEqual([0]);
	});
	test("0, 50 and 240: 0 and 50 join, 240 is point 2 of 4, reduced to 1 of 2", () => {
		const q = quantize(at(0, 50, 240), gridOf(1));
		expect(points(at(0, 50, 240), gridOf(1))).toEqual([
			[0, 0, [0, 50]],
			[0, 1, [240]],
		]);
		expect(q.parts[0]).toBe(2);
		expect(q.joined).toBe(1);
		expect(q.rounded).toEqual([0]);
	});
	test("rounded bars are named once each, ascending", () => {
		const q = quantize(at(50, 530, 1970, 2450), gridOf(2));
		expect(q.rounded).toEqual([0, 1]);
	});
	test("6/8: 0, 240 and 500 round on 6 parts and reduce to 3", () => {
		const grid = gridOf(1, { n: 6, d: 8 });
		const q = quantize(at(0, 240, 500), grid);
		expect(q.parts[0]).toBe(3);
		expect(points(at(0, 240, 500), grid)).toEqual([
			[0, 0, [0]],
			[0, 1, [240]],
			[0, 2, [500]],
		]);
		expect(q.rounded).toEqual([0]);
	});
	test("3/8: 0 and 60 are 4 parts; 0 and 40 round on 4", () => {
		const grid = gridOf(1, { n: 3, d: 8 });
		const sixteenths = quantize(at(0, 60), grid);
		expect(sixteenths.parts[0]).toBe(4);
		expect(sixteenths.rounded).toEqual([]);
		const sextuplet = quantize(at(0, 40), grid);
		expect(sextuplet.parts[0]).toBe(4);
		expect(sextuplet.struck.map((s) => s.point)).toEqual([0, 1]);
		expect(sextuplet.rounded).toEqual([0]);
	});
	test("the grid's last beat has no end point: 30 before the end is its last point", () => {
		const q = quantize(at(1890), gridOf(1));
		expect(points(at(1890), gridOf(1))).toEqual([[3, 3, [1890]]]);
		expect(q.parts[3]).toBe(4);
		expect(q.rounded).toEqual([0]);
		expect(pointTick(q, 3, 3)).toBeLessThan(1920);
	});
});

describe("quantize: small divisions", () => {
	test("ppq 24: quarters on the beat", () => {
		const q = quantize(at(0, 24, 48, 72), gridOf(1, { n: 4, d: 4 }, 24));
		expect(q.parts).toEqual([1, 1, 1, 1]);
		expect(q.rounded).toEqual([]);
	});
	test("ppq 1: an attack on every tick is four beats of one attack", () => {
		const q = quantize(at(0, 1, 2, 3), gridOf(1, { n: 4, d: 4 }, 1));
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
		const q = quantize(at(480, 840), gridOf(1));
		expect(q.parts[1]).toBe(4);
		expect(pointTick(q, 1, 3)).toBe(840);
	});
});

describe("quantize: scale", () => {
	test("100,000 bars and 200,000 attacks", () => {
		const grid = gridOf(100_000);
		const attacks = at(
			...Array.from({ length: 200_000 }, (_, i) => i * 960 + (i % 3 === 0 ? 50 : 0)),
		);
		const started = performance.now();
		const q = quantize(attacks, grid);
		expect(performance.now() - started).toBeLessThan(2000);
		expect(q.struck.length).toBe(200_000);
		expect(q.beats.length).toBe(400_000);
	});
});
