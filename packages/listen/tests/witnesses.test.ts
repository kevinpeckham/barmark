/** The lattice, the three witnesses and the vote: the `downbeatVote` and section-witness tests of the app's `chartlessGrid.test.ts`, ported, and more. */
import { describe, expect, test } from "bun:test";
import { gridLattice, type Lattice, latticeBeats } from "../src/grid/lattice.js";
import {
	beatChroma,
	checkerboardNovelty,
	noveltyPeaks,
	sectionWitness,
} from "../src/grid/sections.js";
import { downbeatVote } from "../src/grid/vote.js";
import {
	harmonicRhythmWitness,
	histogramVote,
	timeZeroWitness,
	type Witness,
} from "../src/grid/witnesses.js";
import { DEFAULTS, resolveOptions, type Settings } from "../src/options.js";
import { seeded } from "./helpers/seeded.js";
import {
	backbeat,
	durationOf,
	FPS,
	FROM_ZERO,
	HOP_SEC,
	onDownbeats,
	onsetOf,
	periodOf,
	type Song,
	sectionsOf,
} from "./helpers/songs.js";

const s = DEFAULTS;

/** `options` merged over the defaults, as a stage receives them. */
function settings(options: Record<string, unknown>): Settings {
	const r = resolveOptions(options, "listen");
	if (!r.ok) throw new Error(r.refusals.map((p) => p.message).join(" "));
	return r.value.settings;
}

/** The lattice, failing the test on a refusal. */
function latticeOf(onset: Float32Array, bar: number, beatsPerBar: number): Lattice {
	const r = gridLattice(onset, FPS, bar, beatsPerBar, s);
	if (!r.ok) throw new Error(r.refusals.map((p) => p.message).join(" "));
	return r.value.lattice;
}

/** The beat class of the true downbeat on the lattice (the app's `trueClass`, the declared bar 1 % long). */
function trueClass(song: Song) {
	const lattice = latticeOf(onsetOf(song, backbeat), periodOf(song) * 1.01, song.beatsPerBar);
	const k = Math.round((song.downbeat - lattice.anchor) / lattice.beat);
	return (((k % song.beatsPerBar) + song.beatsPerBar) % song.beatsPerBar) as number;
}

const witness = (name: Witness["name"], cls: number | null, ratio = 2): Witness => ({
	name,
	cls,
	weight: s.DOWNBEAT_WEIGHTS[name],
	detail: { ratio },
});

describe("gridLattice (the app's chartlessLattice)", () => {
	test("the comb's lattice, its phase moved by the envelope's lead", () => {
		const onset = onsetOf(FROM_ZERO, backbeat);
		const r = gridLattice(onset, FPS, periodOf(FROM_ZERO) * 1.01, 4, s);
		if (!r.ok) throw new Error("refused");
		const { lattice, comb } = r.value;
		expect(lattice.anchor).toBe(comb.phase + s.ONSET_ENVELOPE_LEAD_SEC);
		expect(lattice.period).toBe(comb.period);
		expect(lattice.beat).toBe(comb.period / 4);
		expect(Math.abs(lattice.period - periodOf(FROM_ZERO)) / periodOf(FROM_ZERO)).toBeLessThan(
			0.001,
		);
	});

	test("refuses, never throws or hangs, on a bar, fps or beats per bar the comb cannot take", () => {
		const onset = onsetOf(FROM_ZERO, backbeat);
		const bar = periodOf(FROM_ZERO);
		const cases: [number, number, number, string][] = [
			[FPS, bar, 0, "beatsPerBar"],
			[FPS, bar, -1, "beatsPerBar"],
			[FPS, bar, 2.5, "beatsPerBar"],
			[FPS, bar, Number.NaN, "beatsPerBar"],
			[FPS, Number.NaN, 4, "declaredBar"],
			[FPS, Number.POSITIVE_INFINITY, 4, "declaredBar"],
			[FPS, 0, 4, "declaredBar"],
			[FPS, -2, 4, "declaredBar"],
			[0, bar, 4, "fps"],
			[Number.NaN, bar, 4, "fps"],
			[Number.POSITIVE_INFINITY, bar, 4, "fps"],
		];
		for (const [fps, declaredBar, beatsPerBar, field] of cases) {
			const r = gridLattice(onset, fps, declaredBar, beatsPerBar, s);
			expect(r).toMatchObject({
				ok: false,
				refusals: [{ reason: "invalid-input", detail: { field } }],
			});
		}
	});

	test("a flat envelope is no-period", () => {
		for (const onset of [
			new Float32Array(0),
			new Float32Array(500),
			new Float32Array(500).fill(0.3),
		])
			expect(gridLattice(onset, FPS, 2, 4, s)).toMatchObject({
				ok: false,
				refusals: [{ reason: "no-period" }],
			});
	});

	test("the lattice's beats from time zero, with the end", () => {
		const { first, starts } = latticeBeats(
			{ anchor: 0.75, beat: 0.5, period: 2, beatsPerBar: 4 },
			3,
		);
		expect(first).toBe(-1);
		expect(starts).toEqual([0.25, 0.75, 1.25, 1.75, 2.25, 2.75, 3]);
	});
});

describe("timeZeroWitness and histogramVote", () => {
	test("time zero votes the class of the beat it snaps to, else abstains", () => {
		const near = timeZeroWitness({ anchor: 0.55, beat: 0.5, period: 2, beatsPerBar: 4 }, s);
		expect(near).toMatchObject({ name: "timeZero", cls: 3, weight: 2 });
		expect(near.detail.distanceBeats).toBeCloseTo(0.1, 12);
		expect(
			timeZeroWitness({ anchor: 0.25, beat: 0.5, period: 2, beatsPerBar: 4 }, s).cls,
		).toBeNull();
	});

	test("a histogram votes its top class unless under the least count or tied", () => {
		expect(histogramVote([1, 5, 2, 0], 4)).toEqual({
			cls: 1,
			histogram: [1, 5, 2, 0],
			margin: 3,
			ratio: 2.5,
		});
		expect(histogramVote([1, 1, 0, 0], 4).cls).toBeNull();
		expect(histogramVote([3, 3, 1, 0], 4).cls).toBeNull();
		expect(histogramVote([4, 0, 0, 0], 4)).toMatchObject({
			cls: 0,
			ratio: Number.POSITIVE_INFINITY,
		});
	});

	test("the chord changes vote the downbeat; null chords abstain", () => {
		const lattice = latticeOf(onsetOf(FROM_ZERO, backbeat), periodOf(FROM_ZERO) * 1.01, 4);
		const duration = durationOf(FROM_ZERO);
		const harmonic = harmonicRhythmWitness(onDownbeats(FROM_ZERO), lattice, duration, s);
		expect(harmonic.cls).toBe(trueClass(FROM_ZERO));
		expect(harmonicRhythmWitness(null, lattice, duration, s)).toMatchObject({
			cls: null,
			weight: 2,
		});
	});
});

describe("downbeatVote", () => {
	test("the sections alone never decide; off the comb a move needs two over class 0", () => {
		expect(downbeatVote([witness("sections", 2)], 4, s).decided).toBe(false);
		expect(downbeatVote([witness("timeZero", 2), witness("sections", 0)], 4, s).decided).toBe(
			false,
		);
		expect(
			downbeatVote([witness("timeZero", 2), witness("harmonicRhythm", 2)], 4, s),
		).toMatchObject({
			cls: 2,
			decided: true,
		});
		expect(downbeatVote([witness("timeZero", 1), witness("harmonicRhythm", 3)], 4, s).decided).toBe(
			false,
		);
	});

	test("an abstaining witness carries no weight: time zero decides class 0 alone", () => {
		expect(
			downbeatVote([witness("timeZero", 0), witness("harmonicRhythm", null)], 4, s),
		).toMatchObject({ cls: 0, decided: true, scores: [2, 0, 0, 0] });
	});

	test("DOWNBEAT_MIN_SCORE: 3 leaves time zero alone undecided", () => {
		const alone = [witness("timeZero", 0), witness("harmonicRhythm", null)];
		expect(downbeatVote(alone, 4, settings({ DOWNBEAT_MIN_SCORE: 3 }))).toMatchObject({
			cls: 0,
			decided: false,
			scores: [2, 0, 0, 0],
		});
	});

	test("the same result for every order of the witnesses (24 seeded sets, 6 orders each)", () => {
		const rand = seeded(11);
		const names: Witness["name"][] = ["timeZero", "harmonicRhythm", "sections"];
		const orders = [
			[0, 1, 2],
			[0, 2, 1],
			[1, 0, 2],
			[1, 2, 0],
			[2, 0, 1],
			[2, 1, 0],
		];
		for (let set = 0; set < 24; set++) {
			const beatsPerBar = 2 + Math.floor(rand() * 4);
			const ws = names.map((name) => {
				const k = Math.floor(rand() * (beatsPerBar + 1));
				return witness(name, k === beatsPerBar ? null : k);
			});
			const first = downbeatVote(ws, beatsPerBar, s);
			for (const order of orders)
				expect(
					downbeatVote(
						order.map((i) => ws[i] as Witness),
						beatsPerBar,
						s,
					),
				).toEqual(first);
		}
	});
});

describe("the section witness", () => {
	test("beat chroma: each beat's frames summed and L2-normalized; a beat past the frames stays zero", () => {
		const chroma = new Float32Array(4 * 12);
		chroma.set([3, 0, 0, 0, 4], 0);
		chroma.set([0, 1], 24);
		chroma.set([0, 1], 36);
		const beats = beatChroma(chroma, 0.5, [0, 1, 2, 3]);
		expect(beats.map((b) => Array.from(b))).toEqual([
			[0.6, 0, 0, 0, 0.8, 0, 0, 0, 0, 0, 0, 0].map((x) => Math.fround(x)),
			[0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			Array(12).fill(0),
		]);
	});

	test("the checkerboard peaks where the chroma changes", () => {
		const a = Float32Array.from([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
		const b = Float32Array.from([0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0]);
		const beats = Array.from({ length: 64 }, (_, i) => (i < 32 ? a : b));
		const nov = checkerboardNovelty(beats, 8);
		const peak = nov.indexOf(Math.max(...nov.subarray(8, 56)));
		expect(peak).toBe(32);
		expect(noveltyPeaks(nov, 8)).toEqual([32]);
	});

	test("votes the class its section changes fall on", () => {
		const lattice = latticeOf(onsetOf(FROM_ZERO, backbeat), periodOf(FROM_ZERO), 4);
		const w = sectionWitness(sectionsOf(FROM_ZERO, 8), HOP_SEC, lattice, durationOf(FROM_ZERO), s);
		expect(w.cls).toBe(trueClass(FROM_ZERO));
		expect(w.detail.peaks).toBeGreaterThanOrEqual(2);
	});

	test("no chroma: no peaks, the witness abstains", () => {
		const lattice = latticeOf(onsetOf(FROM_ZERO, backbeat), periodOf(FROM_ZERO), 4);
		const w = sectionWitness(new Float32Array(0), HOP_SEC, lattice, durationOf(FROM_ZERO), s);
		expect(w).toMatchObject({ name: "sections", cls: null, weight: 1, detail: { peaks: 0 } });
	});
});
