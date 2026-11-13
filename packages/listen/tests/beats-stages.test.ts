/**
 * The tracker's stages ported from the app: the snap (`beatThisDownbeats`),
 * the label (`beatThisGrid`) and the bars (`trackerBarGrid`'s helpers).
 */
import { describe, expect, test } from "bun:test";
import { barBeats, joinHalfBars, steadyShare } from "../src/beats/bars.js";
import { beatsLabel } from "../src/beats/label.js";
import { snapDownbeats } from "../src/beats/snap.js";
import { evenBeats, reading } from "./helpers/beats.js";

describe("snapDownbeats", () => {
	test("each downbeat moves to its nearest beat", () => {
		expect(snapDownbeats([0, 0.5, 1, 1.5, 2], [0.02, 1.48])).toEqual([0, 1.5]);
	});
	test("two downbeats on one beat collapse, and the result is sorted", () => {
		expect(snapDownbeats([0, 0.5, 1, 1.5, 2], [1.9, 1.02, 0.98])).toEqual([1, 2]);
	});
	test("a tie goes to the first beat", () => {
		expect(snapDownbeats([1, 2], [1.5])).toEqual([1]);
	});
	test("no beats: downbeats unchanged", () => {
		expect(snapDownbeats([], [0.3, 2.1])).toEqual([0.3, 2.1]);
	});
	test("before the first beat and after the last", () => {
		expect(snapDownbeats([1, 2, 3], [-5, 9])).toEqual([1, 3]);
	});
});

describe("beatsLabel", () => {
	test("the worked example: 143 bpm, 6 a bar is 6/8 at 48 dotted quarters", () => {
		const { beats, downbeats } = evenBeats(143, 6, 8);
		expect(beatsLabel(beats, downbeats)).toEqual({
			beatTempo: 143,
			beatsPerBar: 6,
			meter: "6/8",
			tempo: 48,
			counts: { 6: 8 },
		});
	});
	test("3 a bar is 3/4 at the beat tempo", () => {
		const { beats, downbeats } = evenBeats(90, 3, 6);
		const g = beatsLabel(beats, downbeats);
		expect([g.meter, g.beatTempo, g.tempo, g.beatsPerBar]).toEqual(["3/4", 90, 90, 3]);
	});
	test("4 a bar is 4/4", () => {
		const { beats, downbeats } = evenBeats(120, 4, 4);
		expect(beatsLabel(beats, downbeats)).toMatchObject({
			meter: "4/4",
			beatTempo: 120,
			tempo: 120,
		});
	});
	test("2 a bar (or any other count) reads as 4/4", () => {
		const { beats, downbeats } = evenBeats(100, 2, 5);
		expect(beatsLabel(beats, downbeats)).toMatchObject({
			beatsPerBar: 2,
			meter: "4/4",
			tempo: 100,
		});
		const five = evenBeats(100, 5, 5);
		expect(beatsLabel(five.beats, five.downbeats)).toMatchObject({
			beatsPerBar: 5,
			meter: "4/4",
		});
	});
	test("a tie between counts takes the smaller", () => {
		// Bars of 4, 3, 4, 3: two each, so 3.
		const beats = Array.from({ length: 15 }, (_, i) => i * 0.5);
		const downbeats = [0, 2, 3.5, 5.5, 7];
		const g = beatsLabel(beats, downbeats);
		expect(g.counts).toEqual({ 3: 2, 4: 2 });
		expect(g.beatsPerBar).toBe(3);
		expect(g.meter).toBe("3/4");
	});
	test("tempo from the median interval, robust to one odd gap", () => {
		// Intervals 0.5, 0.5, 0.5, 2: median 0.5 → 120 bpm.
		expect(beatsLabel([0, 0.5, 1, 1.5, 3.5], []).beatTempo).toBe(120);
		// An even count averages the middle two: 0.5 and 0.6 → 0.55 → 109.09 → 109.
		expect(beatsLabel([0, 0.5, 1.1, 1.6, 2.2], []).beatTempo).toBe(109);
	});
	test("too few beats or downbeats gives nulls", () => {
		expect(beatsLabel([1], [1])).toEqual({
			beatTempo: null,
			beatsPerBar: null,
			meter: null,
			tempo: null,
			counts: {},
		});
		expect(beatsLabel([0, 0.5, 1], [0])).toMatchObject({
			beatTempo: 120,
			meter: null,
			tempo: 120,
		});
	});
	test("a bar counts the beats strictly between its downbeats, plus one", () => {
		// Downbeats 0.25 and 1.25 are not beats: beats 0.5, 1 lie between, so 3.
		expect(beatsLabel([0, 0.5, 1, 1.5], [0.25, 1.25]).counts).toEqual({ 3: 1 });
	});
});

describe("bars", () => {
	test("joinHalfBars: pairs only, and never for an odd usual count", () => {
		const a = reading([2, 2, 2, 4, 4, 4, 4, 4]);
		expect(joinHalfBars(a.beats, a.downbeats, 4)).toEqual([0, 2, 3, 5, 7, 9, 11, 13]);
		const b = reading([3, 3, 3, 3, 3, 3, 1, 1]);
		expect(joinHalfBars(b.beats, b.downbeats, 3)).toEqual(b.downbeats);
	});

	test("joinHalfBars joins two adjacent half bars into one", () => {
		const r = reading([2, 2, 4, 4, 4, 4]);
		expect(joinHalfBars(r.beats, r.downbeats, 4)).toEqual([0, 2, 4, 6, 8, 10]);
		const six = reading([6, 6, 3, 3, 6, 6]);
		expect(joinHalfBars(six.beats, six.downbeats, 6)).toEqual([0, 3, 6, 9, 12, 15]);
	});

	test("steadyShare: the share of bars holding the usual count", () => {
		const r = reading([3, 3, 3, 2, 4, 5, 2, 4, 5]);
		expect(steadyShare(r.beats, r.downbeats, 3)).toBeCloseTo(3 / 9, 12);
	});

	test("barBeats counts each bar's beats, the bar line's own beat included", () => {
		const r = reading([4, 2, 5]);
		expect(barBeats(r.beats, r.downbeats)).toEqual([4, 2, 5]);
	});

	test("barBeats counts a line that is not a beat from the next beat on", () => {
		expect(barBeats([0, 0.5, 1, 1.5], [0.25, 1.25])).toEqual([2]);
	});
});
