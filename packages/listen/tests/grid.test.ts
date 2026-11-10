/** `findGrid`: the rest of the app's `chartlessGrid.test.ts`, ported onto features records, and more. */
import { describe, expect, test } from "bun:test";
import type { Features } from "../src/features/index.js";
import type { ListenChordRuns } from "../src/grid/beats.js";
import { findGrid, type GridInput, type PlacedGrid } from "../src/grid/grid.js";
import { placeBarOne } from "../src/grid/place.js";
import { DEFAULTS } from "../src/options.js";
import {
	beatOf,
	durationOf,
	FROM_ZERO,
	onDownbeats,
	periodOf,
	runsOf,
	type Song,
	songFeatures,
	truthOf,
} from "./helpers/songs.js";

const s = DEFAULTS;

/** The app's `inputOf`: the song's features, its chords on the downbeats and the detector's rounded tempo (the declared bar 1 % long). */
function inputOf(song: Song, over: Partial<GridInput> = {}): GridInput {
	return {
		features: songFeatures(song),
		chords: onDownbeats(song),
		declared: {
			meter: `${song.beatsPerBar}/4`,
			tempo: (song.beatsPerBar * 60) / (periodOf(song) * 1.01),
		},
		...over,
	};
}

/** The placed grid, failing the test on a refusal. */
function placed(input: GridInput, options?: Record<string, unknown>): PlacedGrid {
	const r = findGrid(input, options);
	if (!r.ok) throw new Error(`refused: ${r.refusals.map((p) => p.reason).join(", ")}`);
	return r.value;
}

/** Every placed bar start within `tol` of the nearest true bar start. */
function expectOnTruth(bars: number[], song: Song, tol = 0.03) {
	const truth = truthOf(song);
	for (const t of bars.slice(0, -1)) {
		const nearest = Math.min(...truth.map((x) => Math.abs(x - t)));
		expect(nearest).toBeLessThanOrEqual(tol);
	}
}

/** The beat class of the true downbeat on the grid's lattice. */
function trueClass(song: Song, value: PlacedGrid): number {
	const { anchor, beat } = value.reading.lattice;
	const k = Math.round((song.downbeat - anchor) / beat);
	return ((k % song.beatsPerBar) + song.beatsPerBar) % song.beatsPerBar;
}

describe("findGrid (the app's chartlessGrid)", () => {
	test("the comb lands on a backbeat; all three witnesses vote the true downbeat and bar one holds the first sound", () => {
		const input = inputOf(FROM_ZERO);
		const value = placed(input);
		const { lattice, comb } = value.reading;
		const cls = trueClass(FROM_ZERO, value);
		expect(Math.abs(lattice.period - periodOf(FROM_ZERO)) / periodOf(FROM_ZERO)).toBeLessThan(
			0.001,
		);
		expect(lattice.anchor).toBe(comb.phase + s.ONSET_ENVELOPE_LEAD_SEC);
		expect([1, 3]).toContain(cls);
		expect(value.reading).toMatchObject({ byStart: false, cls, decided: true });
		expect(value.reading.witnesses.map((w) => [w.name, w.cls])).toEqual([
			["timeZero", cls],
			["harmonicRhythm", cls],
			["sections", cls],
		]);
		expect(value.reading.scores).toHaveLength(4);
		const { bars } = value.grid;
		expect(bars[0]).toBeLessThanOrEqual(input.features.firstSound + 0.03);
		expect(bars[1]).toBeGreaterThan(input.features.firstSound);
		expect(bars).toHaveLength(FROM_ZERO.bars + 1);
		expect(bars.at(-1)).toBeCloseTo(durationOf(FROM_ZERO), 6);
		expect(value.pickup).toBeNull();
		expectOnTruth(bars, FROM_ZERO);
	});

	describe("a song that starts mid-bar", () => {
		const song: Song = { bpm: 117, beatsPerBar: 4, downbeat: 2.5 * (60 / 117), bars: 40 };
		const silent = songFeatures(song, { barsPerSection: 0 });

		test("time zero abstains; the chord changes decide on a clear margin", () => {
			const value = placed(inputOf(song, { features: silent }));
			const [zero, harmonic, sections] = value.reading.witnesses;
			expect(zero?.cls).toBeNull();
			expect(zero?.detail.distanceBeats).toBeGreaterThan(0.25);
			expect(harmonic?.cls).toBe(trueClass(song, value));
			expect(sections?.cls).toBeNull();
			expect(value.grid.bars[0]).toBeCloseTo(song.downbeat, 1);
			expectOnTruth(value.grid.bars, song);
		});

		test("a chord on every beat is a flat histogram: undecided, nothing placed, the reading kept", () => {
			const everyBeat = Array.from(
				{ length: song.bars * 4 },
				(_, b) => song.downbeat + b * beatOf(song),
			);
			const chords = runsOf(everyBeat, durationOf(song));
			const r = findGrid(inputOf(song, { features: silent, chords }));
			expect(r).toMatchObject({ ok: false, refusals: [{ reason: "downbeat-undecided" }] });
			if (r.ok) return;
			expect(r.reading?.witnesses.map((w) => w.name)).toEqual([
				"timeZero",
				"harmonicRhythm",
				"sections",
			]);
			expect(r.reading?.decided).toBe(false);
			expect(r.refusals[0]?.detail).toEqual(
				Object.fromEntries(r.reading?.scores.map((v, k) => [`class${k}`, v]) ?? []),
			);
		});

		test("the chord changes under 1.2 times the runner-up abstain (Study 32's rule): undecided", () => {
			// A change on every downbeat, and on beat 3 of all but four bars: 40 against 36.
			const changes = truthOf(song).flatMap((t, i) =>
				i % 10 === 9 ? [t] : [t, t + 2 * beatOf(song)],
			);
			const chords = runsOf(changes, durationOf(song));
			const r = findGrid(inputOf(song, { features: silent, chords }));
			expect(r).toMatchObject({ ok: false, refusals: [{ reason: "downbeat-undecided" }] });
			if (r.ok || !r.reading) throw new Error("no reading");
			const [zero, harmonic] = r.reading.witnesses;
			expect(zero?.cls).toBeNull();
			expect(harmonic?.cls).toBeNull();
			expect(harmonic?.detail.ratio).toBeGreaterThan(1);
			expect(harmonic?.detail.ratio).toBeLessThan(1.2);
		});
	});

	test("the song's own start wins: bar one at the lattice beat nearest it, whatever its class", () => {
		const backbeatAt = (truthOf(FROM_ZERO)[3] as number) + beatOf(FROM_ZERO);
		const value = placed(inputOf(FROM_ZERO, { startAt: backbeatAt + 0.1 }));
		const { reading, grid } = value;
		expect(reading.byStart).toBe(true);
		expect(reading.witnesses).toEqual([]);
		expect(reading.scores).toEqual([]);
		expect(reading.decided).toBe(true);
		const k = Math.round((backbeatAt + 0.1 - reading.lattice.anchor) / reading.lattice.beat);
		expect(reading.cls).toBe(((k % 4) + 4) % 4);
		expect(Math.abs((grid.bars[0] as number) - backbeatAt)).toBeLessThanOrEqual(0.03);
		expect((grid.bars[1] as number) - (grid.bars[0] as number)).toBeCloseTo(periodOf(FROM_ZERO), 2);
		// The sound began three bars and a beat before: sound-before-start, no pickup.
		expect(value.pickup).toBeNull();
		expect(placedWarnings(inputOf(FROM_ZERO, { startAt: backbeatAt + 0.1 }))).toContain(
			"sound-before-start",
		);
	});

	test("nothing to read is no-period with no reading; a start past the end is nothing-fits with the reading", () => {
		const input = inputOf(FROM_ZERO);
		const flat: Features = {
			...input.features,
			onset: new Float32Array(input.features.onset.length),
		};
		expect(findGrid({ ...input, features: flat })).toEqual({
			ok: false,
			refusals: [expect.objectContaining({ reason: "no-period" })],
			warnings: [],
			reading: null,
		});
		const past = findGrid({ ...input, startAt: input.features.duration + 10 });
		expect(past).toMatchObject({
			ok: false,
			refusals: [{ reason: "nothing-fits" }],
			reading: { byStart: true, witnesses: [] },
		});
	});

	test("a 3/4 song: the comb on beat 2, the vote back on the downbeat", () => {
		const song: Song = { bpm: 150, beatsPerBar: 3, downbeat: 0, bars: 60 };
		const features = songFeatures(song, { gainOf: (b) => (b === 1 ? 1 : 0.45) });
		const value = placed(inputOf(song, { features }));
		const cls = trueClass(song, value);
		expect(cls).toBe(2);
		expect(value.reading.lattice.beatsPerBar).toBe(3);
		expect(value.reading.cls).toBe(cls);
		expectOnTruth(value.grid.bars, song);
	});
});

/** The warning codes of a placed grid. */
function placedWarnings(input: GridInput, options?: Record<string, unknown>): string[] {
	const r = findGrid(input, options);
	return r.warnings.map((w) => w.code);
}

describe("placeBarOne (the app's placeChartlessGrid)", () => {
	const lattice = { anchor: 0.75, beat: 0.5, period: 2, beatsPerBar: 4 };

	test("bar one is the class's lattice point whose bar holds the first sound", () => {
		expect(placeBarOne(lattice, 1, 5.3, 12, s)?.bars.slice(0, 2)).toEqual([5.25, 7.25]);
		// Within a quarter beat after the first sound, the bar starts there.
		expect(placeBarOne(lattice, 0, 4.7, 12, s)?.bars[0]).toBe(4.75);
	});

	test("a bar one before time zero is clamped to it; the end closes the grid", () => {
		const p = placeBarOne(lattice, 1, 0, 5, s);
		expect(p?.bars).toEqual([0, 1.25, 3.25, 5]);
		expect(p?.pickup).toBeNull();
		expect(p?.warnings.map((w) => w.code)).toEqual(["bar-one-clamped"]);
	});
});

describe("startsOnBarLine", () => {
	// Cut on beat 3: time zero snaps to a beat, which is not the downbeat.
	const song: Song = { bpm: 117, beatsPerBar: 4, downbeat: 2 * (60 / 117), bars: 40 };
	const alone = { features: songFeatures(song, { barsPerSection: 0 }), chords: null };

	test("false on a song where only time zero votes: its weight is 0 and the vote is undecided", () => {
		const yes = placed(inputOf(song, alone));
		expect(yes.reading.witnesses.map((w) => w.cls !== null)).toEqual([true, false, false]);
		const r = findGrid(inputOf(song, { ...alone, startsOnBarLine: false }));
		expect(r).toMatchObject({ ok: false, refusals: [{ reason: "downbeat-undecided" }] });
		if (r.ok) return;
		expect(r.reading?.witnesses[0]).toMatchObject({ name: "timeZero", weight: 0 });
		expect(r.reading?.scores).toEqual([0, 0, 0, 0]);
	});

	test("false where all three agree: still decided, on the same bars", () => {
		const both = placed(inputOf(FROM_ZERO));
		const off = placed(inputOf(FROM_ZERO, { startsOnBarLine: false }));
		expect(off.reading.decided).toBe(true);
		expect(off.reading.cls).toBe(both.reading.cls);
		expect(off.grid.bars).toEqual(both.grid.bars);
	});

	test("true is the default", () => {
		expect(placed(inputOf(FROM_ZERO, { startsOnBarLine: true }))).toEqual(
			placed(inputOf(FROM_ZERO)),
		);
	});
});

describe("grid-truncated", () => {
	test("MAX_GRID_BARS: 5 on a 30-bar song: five bars and their end, warned", () => {
		const song: Song = { ...FROM_ZERO, bars: 30 };
		const r = findGrid(inputOf(song), { MAX_GRID_BARS: 5 });
		if (!r.ok) throw new Error("refused");
		expect(r.value.grid.bars).toHaveLength(6);
		const period = r.value.reading.lattice.period;
		expect(r.value.grid.bars.at(-1)).toBeCloseTo((r.value.grid.bars[0] as number) + 5 * period, 9);
		expect(r.warnings).toEqual([
			expect.objectContaining({ code: "grid-truncated", detail: { bars: 5 } }),
		]);
	});

	test("no warning when the grid reaches the end", () => {
		expect(placedWarnings(inputOf(FROM_ZERO))).toEqual([]);
	});
});

describe("findGrid never throws", () => {
	const input = inputOf(FROM_ZERO);
	const refusedAs = (r: ReturnType<typeof findGrid>) =>
		r.ok ? "ok" : r.refusals.map((p) => [p.reason, p.detail?.field ?? p.detail?.option]);

	test("each bad input is its named refusal, with no reading", () => {
		const cases: [unknown, unknown, [string, string][]][] = [
			[{ ...input, features: { junk: true } }, undefined, [["features-invalid", "format"]]],
			[{ ...input, features: null }, undefined, [["features-invalid", "record"]]],
			[
				{ ...input, declared: { meter: "x/4", tempo: 120 } },
				undefined,
				[["invalid-input", "declared.meter"]],
			],
			[
				{ ...input, declared: { meter: 44, tempo: 120 } },
				undefined,
				[["invalid-input", "declared.meter"]],
			],
			[{ ...input, declared: null }, undefined, [["invalid-input", "declared"]]],
			[
				{ ...input, declared: { meter: "4/4", tempo: 0 } },
				undefined,
				[["invalid-input", "declared.tempo"]],
			],
			[
				{ ...input, declared: { meter: "4/4", tempo: 1000 } },
				undefined,
				[["invalid-input", "declared.tempo"]],
			],
			[
				{ ...input, declared: { meter: "4/4", tempo: Number.NaN } },
				undefined,
				[["invalid-input", "declared.tempo"]],
			],
			[{ ...input, startAt: -1 }, undefined, [["invalid-input", "startAt"]]],
			[{ ...input, startAt: Number.POSITIVE_INFINITY }, undefined, [["invalid-input", "startAt"]]],
			[{ ...input, startAt: "1" }, undefined, [["invalid-input", "startAt"]]],
			[{ ...input, chords: { runs: 5 } }, undefined, [["invalid-input", "chords.runs"]]],
			[{ ...input, chords: 5 }, undefined, [["invalid-input", "chords"]]],
			[
				{ ...input, chords: { runs: [], frames: 1.5 } },
				undefined,
				[["invalid-input", "chords.frames"]],
			],
			[
				{ ...input, chords: { runs: [], frames: -1 } },
				undefined,
				[["invalid-input", "chords.frames"]],
			],
			[{ ...input, startsOnBarLine: "no" }, undefined, [["invalid-input", "startsOnBarLine"]]],
			[input, { ALIGNMENT_SOUND_FLOOR: 0.1 }, [["invalid-option", "ALIGNMENT_SOUND_FLOOR"]]],
			[input, { MAX_GRID_BARS: 0 }, [["invalid-option", "MAX_GRID_BARS"]]],
			[input, "x", [["invalid-option", ""]]],
			[null, undefined, [["invalid-input", "input"]]],
			[5, undefined, [["invalid-input", "input"]]],
		];
		for (const [given, options, want] of cases) {
			const r = findGrid(given as GridInput, options as Record<string, unknown>);
			expect(refusedAs(r)).toEqual(want);
			expect(r).toMatchObject({ ok: false, reading: null });
		}
	});

	test("chords that throw, a null run, a symbol or label not a string, a bad frameSec: invalid input, never a throw", () => {
		const run = { start: 0, end: 10, label: "C" };
		const throwing = {
			get runs(): never {
				throw new Error("boom");
			},
		};
		const throwingRun = {
			start: 0,
			get end(): never {
				throw new Error("boom");
			},
		};
		const chords: [unknown, string][] = [
			[throwing, "chords"],
			[{ runs: [run, null] }, "chords.runs"],
			[{ runs: [throwingRun] }, "chords"],
			[{ runs: [{ start: 0, end: 10, symbol: 5 }] }, "chords.runs"],
			[{ runs: [{ start: 0, end: 10, label: {} }] }, "chords.runs"],
			[{ runs: [run], frameSec: 0 }, "chords.frameSec"],
			[{ runs: [run], frameSec: -0.1 }, "chords.frameSec"],
			[{ runs: [run], frameSec: Number.NaN }, "chords.frameSec"],
			[{ runs: [run], frameSec: "0.1" }, "chords.frameSec"],
		];
		for (const [c, field] of chords) {
			const r = findGrid({ ...input, chords: c as ListenChordRuns });
			expect(refusedAs(r)).toEqual([["invalid-input", field]]);
		}
	});

	test("a bad run's index is in its detail", () => {
		const r = findGrid({
			...input,
			chords: { runs: [{ start: 0, end: 1, label: "C" }, null] } as unknown as ListenChordRuns,
		});
		expect(r).toMatchObject({
			ok: false,
			refusals: [{ detail: { field: "chords.runs", index: 1 } }],
		});
	});

	test("an input whose getter throws is invalid input", () => {
		const r = findGrid({
			...input,
			get declared(): never {
				throw new Error("boom");
			},
		});
		expect(refusedAs(r)).toEqual([["invalid-input", "input"]]);
	});

	test("chords are read once: a getter that changes its answer does not change the vote", () => {
		let reads = 0;
		const real = onDownbeats(FROM_ZERO);
		const fickle = {
			frameSec: real.frameSec,
			frames: real.frames,
			get runs() {
				reads++;
				return reads === 1 ? real.runs : [];
			},
		};
		const a = placed(inputOf(FROM_ZERO, { chords: fickle as ListenChordRuns }));
		expect(a.reading.witnesses[1]?.cls).not.toBeNull();
		expect(reads).toBe(1);
	});
});
