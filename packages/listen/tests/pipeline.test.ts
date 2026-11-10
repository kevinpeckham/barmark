/**
 * `chartFromRecording` (design §6.4): synthetic songs rendered whole,
 * read, gridded and built; the pickups (§7, Review Focus 4); the
 * truncated grid (Review Focus 5); the declared grid when the bars cannot
 * be placed; the app's `server/chartBuild.test.ts` cases that still apply;
 * and every bad input a named refusal, never a throw.
 */
import { afterAll, describe, expect, spyOn, test } from "bun:test";
import * as sync from "@barmark/sync";
import { checkTimingMap } from "@barmark/sync";
import { parseChart } from "barmark";
import { type Features, recordingFeatures } from "../src/features/index.js";
import {
	chartFromRecording,
	declaredGrid,
	type RecordingChart,
	type Unplaced,
} from "../src/pipeline.js";
import { featuresOf } from "./helpers/features.js";
import { type SynthSpec, synthSong } from "./helpers/synthetic.js";

const reasons = (r: { ok: boolean; refusals?: { reason: string }[] }) =>
	r.ok ? [] : (r.refusals ?? []).map((x) => x.reason);
const codes = (r: { warnings: { code: string }[] }) => r.warnings.map((w) => w.code);

/** The song's features, read once. */
function featuresFor(spec: SynthSpec): Features {
	const song = synthSong(spec);
	const f = recordingFeatures(song.samples, song.sampleRate);
	if (!f.ok) throw new Error(`refused: ${f.refusals[0]?.reason}`);
	return f.value;
}

/** The value of an ok result, or a failure naming the reasons. */
function okValue(r: ReturnType<typeof chartFromRecording>): RecordingChart {
	if (!r.ok) throw new Error(`refused: ${reasons(r).join(", ")}`);
	return r.value;
}

/** The chart parses without errors and the map checks clean against it, an entry per played bar. */
function expectSound(v: RecordingChart) {
	const parse = parseChart(v.chart);
	expect(parse.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
	expect(checkTimingMap(v.timing, { text: v.chart }).diagnostics).toEqual([]);
	expect(v.timing.bars.length).toBe(parse.bars.length);
	expect(v.timing.recording?.duration).toBe(v.features.duration);
	return parse;
}

const SONG: SynthSpec = { meter: "4/4", tempo: 120, bars: 16, downbeat: 1, seed: 1 };
const song = synthSong(SONG);
const DECLARED = { meter: "4/4", tempo: 120 };
const fromSamples = chartFromRecording({
	samples: song.samples,
	sampleRate: song.sampleRate,
	chords: song.chords,
	declared: DECLARED,
	recording: { id: "mix-1" },
});

describe("chartFromRecording on a synthetic song", () => {
	test("4/4 at 120, 16 bars, bar one at 1.0 s: a chart, a map that checks, the features", () => {
		const v = okValue(fromSamples);
		const parse = expectSound(v);
		expect(parse.bars.length).toBe(16);
		expect(v.grid).not.toBeNull();
		expect(Math.abs((v.grid?.grid.bars[0] as number) - 1)).toBeLessThan(0.03);
		expect(v.reading).toBe(v.grid?.reading ?? null);
		expect(v.features.format).toBe("barmark-listen-features");
		expect(v.features.duration).toBe(song.samples.length / song.sampleRate);
		expect(v.timing.recording).toEqual({ id: "mix-1", duration: v.features.duration });
		expect(v.confidence.bars).toHaveLength(16);
		expect(v.chart).toContain("time: 4/4");
		expect(v.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
	});

	test("the same song from its features gives the same result; both given is invalid-input", () => {
		const v = okValue(fromSamples);
		const again = chartFromRecording({
			features: v.features,
			chords: song.chords,
			declared: DECLARED,
			recording: { id: "mix-1" },
		});
		expect(again).toEqual(fromSamples);
		const both = chartFromRecording({
			samples: song.samples,
			sampleRate: song.sampleRate,
			features: v.features,
			chords: song.chords,
			declared: DECLARED,
		});
		expect(both.ok).toBe(false);
		if (both.ok) return;
		expect(both.refusals[0]).toMatchObject({
			reason: "invalid-input",
			detail: { field: "features" },
		});
		expect(both.features).toBeNull();
		expect(both.reading).toBeNull();
	});

	test("a pickup of one beat: the chart opens | [1/4], bar 0, the map's first entry at the pickup", () => {
		const spec = { ...SONG, downbeat: 2, pickupBeats: 1 };
		const s = synthSong(spec);
		const r = chartFromRecording({ ...s, declared: DECLARED });
		const v = okValue(r);
		const parse = expectSound(v);
		expect(v.chart).toMatch(/^\| \[1\/4\] /m);
		expect(parse.pickup).toBe(true);
		expect(v.grid?.pickup?.beats).toBe(1);
		const start = v.grid?.pickup?.start as number;
		expect(Math.abs(start - 1.5)).toBeLessThan(0.03);
		expect(v.timing.bars[0]).toEqual({ bar: 1, start });
		expect(codes(r)).toContain("pickup");
	});

	test("6/8 at tempo 40 with a one-eighth pickup writes [1/8]", () => {
		const s = synthSong({
			meter: "6/8",
			tempo: 40,
			bars: 12,
			downbeat: 3,
			pickupBeats: 1,
			seed: 1,
		});
		const v = okValue(chartFromRecording({ ...s, declared: { meter: "6/8", tempo: 40 } }));
		const parse = expectSound(v);
		expect(v.chart).toMatch(/^\| \[1\/8\] /m);
		expect(parse.pickup).toBe(true);
		expect(v.chart).toContain("time: 6/8");
	});

	test("flat harmony and a mid-bar start: downbeat-undecided with the reading; declared builds on the declared grid", () => {
		const s = synthSong({ ...SONG, downbeat: 0.25, harmony: "flat" });
		const input = { ...s, declared: DECLARED };
		const r = chartFromRecording(input);
		expect(reasons(r)).toEqual(["downbeat-undecided"]);
		if (r.ok) return;
		expect(r.reading?.decided).toBe(false);
		expect(r.features).not.toBeNull();
		const d = chartFromRecording({ ...input, onUnplaced: "declared" });
		const v = okValue(d);
		expectSound(v);
		expect(v.grid).toBeNull();
		expect(v.reading).toEqual(r.reading);
		const warning = d.warnings.find((w) => w.code === "bar-one-unplaced");
		const reason: Unplaced = "downbeat-undecided";
		expect(warning?.detail).toEqual({ reason });
		// The declared grid: bar one at 0:00, 2 s bars, to the end.
		expect(v.timing.bars[0]).toEqual({ bar: 1, start: 0 });
		expect(v.timing.bars[1]?.start).toBe(2);
		expect(v.timing.end).toBe(v.features.duration);
	});

	test("startAt sets bar one on the declared grid", () => {
		const s = synthSong({ ...SONG, downbeat: 0.25, harmony: "flat" });
		const r = chartFromRecording({
			...s,
			declared: DECLARED,
			onUnplaced: "declared",
			startAt: 0.25,
		});
		// startAt places by the song's own start: no vote, so the grid is placed.
		const v = okValue(r);
		expect(v.grid?.reading.byStart).toBe(true);
		expect(Math.abs((v.grid?.grid.bars[0] as number) - 0.25)).toBeLessThan(0.03);
	});

	test("Review Focus 4: a pickup clamped at zero round-trips through the builder", () => {
		// Bar one at 0.4 s: the pickup's beat is at -0.1 s, before the recording, and starts at 0.
		const s = synthSong({ ...SONG, downbeat: 0.4, pickupBeats: 1 });
		const r = chartFromRecording({ ...s, declared: DECLARED, startAt: 0.4 });
		const v = okValue(r);
		expect(v.grid?.pickup?.start).toBe(0);
		const parse = expectSound(v);
		const ignored = v.diagnostics.some((d) => d.code === "pickup-ignored");
		expect(parse.pickup).toBe(!ignored);
		if (!ignored) expect(v.timing.bars[0]).toEqual({ bar: 1, start: 0 });
	});

	test("Review Focus 5: a truncated grid builds a chart that checks", () => {
		const s = synthSong({ ...SONG, bars: 20, downbeat: 0, seed: 4 });
		const r = chartFromRecording({ ...s, declared: DECLARED }, { MAX_GRID_BARS: 8 });
		const v = okValue(r);
		expect(codes(r)).toContain("grid-truncated");
		const parse = expectSound(v);
		expect(parse.bars.length).toBe(8);
		expect(v.diagnostics.map((d) => d.code)).toContain("outside-bars");
		// With a pickup: the eight bars and the pickup before them.
		const p = synthSong({ ...SONG, bars: 20, downbeat: 2, pickupBeats: 1, seed: 4 });
		const rp = chartFromRecording({ ...p, declared: DECLARED }, { MAX_GRID_BARS: 8 });
		const vp = okValue(rp);
		expect(codes(rp)).toContain("grid-truncated");
		expect(expectSound(vp).bars.length).toBe(9);
		expect(vp.diagnostics.map((d) => d.code)).toContain("outside-bars");
	});

	test("build options reach the builder: simile false writes no %", () => {
		// C on beats 1–2 and G on 3–4 of every bar: each bar after the first repeats it.
		const runs = Array.from({ length: 32 }, (_, i) => ({
			start: i,
			end: i + 1,
			label: i % 2 ? "G" : "C",
		}));
		const input = { features: flat0(), chords: { runs }, declared: DECLARED };
		const simile = okValue(chartFromRecording(input));
		expect(simile.chart).toContain("%");
		const plain = okValue(chartFromRecording(input, { build: { simile: false } }));
		expect(plain.chart).not.toContain("%");
		expect(plain.chart).toContain("| C G | C G |");
		expectSound(plain);
	});

	test("the feature options reach the features; the grid options the grid", () => {
		const fromPcm = {
			samples: song.samples,
			sampleRate: song.sampleRate,
			chords: song.chords,
			declared: DECLARED,
		};
		const loud = chartFromRecording(fromPcm, { ALIGNMENT_SOUND_FLOOR: 0.5 });
		expect(loud.ok ? loud.value.features.sound.floor : null).toBe(0.5);
		const r = chartFromRecording(input0(), { DOWNBEAT_MIN_SCORE: 100 });
		expect(reasons(r)).toEqual(["downbeat-undecided"]);
	});
});

let flat: Features | null = null;
/** A flat song from 0:00, read once: time zero alone places its bars, whatever chords are given. */
function flat0(): Features {
	flat ??= featuresFor({ ...SONG, downbeat: 0, harmony: "flat" });
	return flat;
}

/** The 4/4 song's input, from its features. */
function input0() {
	return { features: okValue(fromSamples).features, chords: song.chords, declared: DECLARED };
}

describe("ported from the app's server/chartBuild.test.ts", () => {
	test("the chord model's stored runs (Harte labels in frames) are used as they are", () => {
		const features = flat0();
		const half = Math.round(features.duration / 0.5 / 2);
		const chords = {
			frameSec: 0.5,
			frames: half * 2,
			runs: [
				{ start: 0, end: half, label: "C:min" },
				{ start: half, end: half * 2, label: "C:hdim7" },
			],
		};
		const v = okValue(chartFromRecording({ features, chords, declared: DECLARED }));
		expect(v.chart).toContain("Cm");
		expect(v.chart).toContain("Cm7(b5)");
		expect(v.chart).not.toMatch(/\| (F|G|Am|Dm|Em|Bb|D) /);
	});

	test("an unusable grid cannot follow a placed grid; if the builder errs anyway, invalid-input with its message", () => {
		const spy = spyOn(sync, "chartFromDetections").mockImplementationOnce(() => ({
			chart: "",
			timing: null,
			confidence: null,
			diagnostics: [
				{ severity: "error", code: "grid-unusable", message: "The grid has no usable bars." },
			],
		}));
		const r = chartFromRecording(input0());
		expect(spy).toHaveBeenCalledTimes(1);
		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(r.refusals).toEqual([
			{
				reason: "invalid-input",
				message: "The grid has no usable bars.",
				detail: { field: "grid", code: "grid-unusable" },
			},
		]);
		expect(r.reading).not.toBeNull();
		expect(r.features).not.toBeNull();
	});

	test("a declared grid of zero bars (startAt past the end) is the original refusal plus nothing-fits", () => {
		const silent = featuresOf({ duration: 20 });
		const r = chartFromRecording({
			features: silent,
			chords: song.chords,
			declared: DECLARED,
			startAt: 25,
			onUnplaced: "declared",
		});
		expect(reasons(r)).toEqual(["no-period", "nothing-fits"]);
		if (r.ok) return;
		expect(r.reading).toBeNull();
		expect(r.features).toBe(silent);
	});
});

afterAll(() => {
	// spyOn on the namespace is restored so later files see the real builder.
	(sync.chartFromDetections as unknown as { mockRestore?: () => void }).mockRestore?.();
});

describe("declaredGrid", () => {
	test("is barStartsFrom: bars every bar from the start, the end, truncated at max", () => {
		expect(declaredGrid(0, 2, 7, 2000)).toEqual({ bars: [0, 2, 4, 6, 7], truncated: false });
		expect(declaredGrid(1, 2, 20, 3)).toEqual({ bars: [1, 3, 5, 7], truncated: true });
		expect(declaredGrid(25, 2, 20, 2000)).toBeNull();
	});
});

describe("chartFromRecording never throws: each bad input is its named refusal", () => {
	const good = input0();
	const first = (input: unknown, options?: unknown) => {
		// biome-ignore lint/suspicious/noExplicitAny: feeding junk on purpose.
		const out = chartFromRecording(input as any, options as any);
		if (out.ok) throw new Error("built");
		expect(out.refusals.length).toBeGreaterThan(0);
		return out.refusals[0];
	};

	test("no samples and no features, junk samples, a junk rate, junk features", () => {
		const { features: _, ...none } = good;
		expect(first(none)).toMatchObject({ reason: "invalid-input", detail: { field: "samples" } });
		expect(first({ ...none, samples: [1, 2, 3], sampleRate: 22050 })).toMatchObject({
			reason: "invalid-input",
			detail: { field: "samples" },
		});
		expect(first({ ...none, samples: song.samples, sampleRate: 5 })).toMatchObject({
			reason: "invalid-input",
			detail: { field: "sampleRate" },
		});
		expect(first({ ...good, features: { junk: true } })?.reason).toBe("features-invalid");
		expect(first({ ...good, sampleRate: 22050 })).toMatchObject({
			reason: "invalid-input",
			detail: { field: "features" },
		});
	});

	test("chords null, declared {}, onUnplaced maybe, junk startAt and recording, junk input", () => {
		expect(first({ ...good, chords: null })).toMatchObject({
			reason: "invalid-input",
			detail: { field: "chords" },
		});
		expect(first({ ...good, chords: { runs: 5 } })).toMatchObject({
			detail: { field: "chords.runs" },
		});
		expect(first({ ...good, declared: {} })).toMatchObject({
			reason: "invalid-input",
			detail: { field: "declared.meter" },
		});
		expect(first({ ...good, onUnplaced: "maybe" })).toMatchObject({
			reason: "invalid-input",
			detail: { field: "onUnplaced" },
		});
		expect(first({ ...good, startAt: -1 })).toMatchObject({ detail: { field: "startAt" } });
		expect(first({ ...good, recording: { id: 5 } })).toMatchObject({
			detail: { field: "recording.id" },
		});
		for (const input of [null, 5, "song"])
			expect(first(input)).toMatchObject({ reason: "invalid-input", detail: { field: "input" } });
	});

	test("options: build 5 and an unknown key are each refused, together listed", () => {
		expect(first(good, { build: 5 })).toMatchObject({
			reason: "invalid-option",
			detail: { option: "build" },
		});
		expect(first(good, { NOPE: 1 })).toMatchObject({
			reason: "invalid-option",
			detail: { option: "NOPE" },
		});
		// biome-ignore lint/suspicious/noExplicitAny: feeding junk on purpose.
		const both = chartFromRecording(good, { build: 5, NOPE: 1 } as any);
		expect(reasons(both)).toEqual(["invalid-option", "invalid-option"]);
		expect(first(good, 5)?.reason).toBe("invalid-option");
	});

	test("a sound option that disagrees with the features given is refused, not ignored", () => {
		expect(first(good, { ALIGNMENT_SOUND_FLOOR: 0.5 })).toMatchObject({
			reason: "invalid-option",
			detail: { option: "ALIGNMENT_SOUND_FLOOR" },
		});
		expect(chartFromRecording(good, { ALIGNMENT_SOUND_FLOOR: 0.02 }).ok).toBe(true);
	});

	test("an input whose reads throw is invalid-input", () => {
		const hostile = new Proxy(
			{},
			{
				get() {
					throw new Error("no");
				},
			},
		);
		expect(first(hostile)?.reason).toBe("invalid-input");
		const throwingTitle = {
			...good,
			get title(): string {
				throw new Error("no");
			},
		};
		expect(first(throwingTitle)?.reason).toBe("invalid-input");
	});
});
