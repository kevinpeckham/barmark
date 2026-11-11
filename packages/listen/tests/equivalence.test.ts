/**
 * Equivalence with the app (design §11.2 item 4, §11.3): the package against
 * the goldens `scripts/listen-equivalence.ts` wrote from the app's own
 * modules (stem-shovel, the commit each golden records). Each seeded song
 * is rendered again with `synthSong` (no audio is checked in) and run
 * through the package as the app calls it: `declared` for the fit, the
 * chords with `frames`, `onUnplaced: "declared"`, the app's song-unit
 * tempo in grammar 2.1's beat. Values must match exactly; the only
 * differences allowed are the named adapters below, each its own test.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseChart } from "barmark";
import { alignChart } from "../src/align/align.js";
import { chartPadBars } from "../src/align/bars.js";
import { recordingFeatures } from "../src/features/index.js";
import { findGrid } from "../src/grid/grid.js";
import { DEFAULTS } from "../src/options.js";
import { chartFromRecording, type Unplaced } from "../src/pipeline.js";
import type { Refusal } from "../src/result.js";
import {
	alignedParts,
	alignmentSummary,
	diagnosticsAsApp,
	EQUIVALENCE_CASES,
	type EquivalenceCase,
	featuresSummary,
	fitReasonName,
	fromGoldenJson,
	type Golden,
	GRID_REASONS,
	grammarTempo,
	mapOf,
	pickupAsListen,
	songChart,
	songTitle,
	tempoChangeAsListen,
	timingAsListen,
	UNREADABLE_CHARTS,
	type UnreadableGolden,
} from "./helpers/equivalence.js";
import { fnv1a64Bytes } from "./helpers/hash.js";
import { synthSong } from "./helpers/synthetic.js";

const DIR = join(import.meta.dir, "fixtures", "equivalence");
const files = existsSync(DIR)
	? readdirSync(DIR)
			.filter((f) => /^case-.+\.json$/.test(f))
			.sort()
	: [];
const goldens = files.map((f) => fromGoldenJson(readFileSync(join(DIR, f), "utf8")) as Golden);
const UNREADABLE = join(DIR, "unreadable-charts.json");

const UNPLACED: ReadonlySet<string> = new Set<Unplaced>([
	"no-period",
	"downbeat-undecided",
	"nothing-fits",
]);
const reasons = (rs: Refusal[]): string[] => rs.map((x) => x.reason);

/** The package's run of one case, as the app is called. */
function runCase(c: EquivalenceCase) {
	const song = synthSong(c.spec);
	const chart = songChart(c.spec, song);
	const declared = { meter: c.spec.meter, tempo: grammarTempo(c.spec.meter, c.appTempo) };
	const read = recordingFeatures(song.samples, song.sampleRate);
	if (!read.ok) throw new Error(`features refused: ${reasons(read.refusals).join()}`);
	const features = read.value;
	const chords = song.chords;
	const grid = findGrid({ features, chords, declared });
	const aligned = alignChart({ chart, features, declared });
	const input = {
		features,
		chords,
		declared,
		title: songTitle(c.name),
		key: null,
		sections: [],
		changes: [],
	};
	const built = chartFromRecording({ ...input, onUnplaced: "declared" });
	const byDefault = chartFromRecording(input);
	return { song, chart, declared, features, grid, aligned, built, byDefault };
}
type Run = ReturnType<typeof runCase>;

const runs = new Map<string, Run>();
/** Each case is rendered and run once, on first use. */
function run(g: Golden): Run {
	const name = g.case.name;
	let r = runs.get(name);
	if (!r) {
		const c = EQUIVALENCE_CASES.find((x) => x.name === name);
		if (!c) throw new Error(`no case ${name}`);
		r = runCase(c);
		runs.set(name, r);
	}
	return r;
}

/** The alignment, placements and fit, whether the package kept the map or refused it. */
const partsOf = (r: Run) => alignedParts(r.aligned, r.declared);

/** §7's adapter on a pickup case: the app's grid as the package gives it, `a` checked against the app's own starts. */
function pickupOf(g: Golden, r: Run) {
	if (!r.grid.ok || !r.grid.value.pickup) throw new Error(`${g.case.name}: no pickup`);
	const { reading, pickup } = r.grid.value;
	const app = g.grid.barStarts as number[];
	const slack = DEFAULTS.PLACEMENT_FIRST_SOUND_SLACK_BEATS;
	const out = pickupAsListen(
		app,
		reading.lattice,
		reading.cls,
		g.features.firstSound,
		slack,
		pickup.beats,
	);
	// `a` is the app's: its bar 1 is `a` clamped at 0:00, its bar 2 `a + period`.
	expect(app[0]).toBe(Math.max(0, out.a));
	expect(app[1]).toBe(out.a + (g.grid.period as number));
	return out;
}

const isPickup = (g: Golden) => {
	const grid = run(g).grid;
	return grid.ok && grid.value.pickup !== null;
};

test("the goldens: one per case, at least 14, from one app commit", () => {
	if (goldens.length < 14) throw new Error(`expected at least 14 goldens, found ${goldens.length}`);
	expect(goldens.map((g) => g.case.name).sort()).toEqual(
		EQUIVALENCE_CASES.map((c) => c.name).sort(),
	);
	const commits = new Set(goldens.map((g) => g.app.commit));
	expect(commits.size).toBe(1);
	expect([...commits][0]).toMatch(/^[0-9a-f]{40}$/);
	for (const g of goldens) {
		const c = EQUIVALENCE_CASES.find((x) => x.name === g.case.name);
		expect(g.case).toEqual({ ...(c as EquivalenceCase), chart: g.case.chart });
	}
});

test("the hash is FNV-1a 64 over the bytes", () => {
	expect(fnv1a64Bytes(new Uint8Array([]))).toBe("cbf29ce484222325");
	expect(fnv1a64Bytes(new Uint8Array([0x61]))).toBe("af63dc4c8601ec8c");
	// A view hashes its own bytes, not its buffer's.
	const buffer = new Uint8Array([0, 0x61, 0]);
	expect(fnv1a64Bytes(buffer.subarray(1, 2))).toBe("af63dc4c8601ec8c");
});

for (const g of goldens) {
	describe(`${g.case.name} (stem-shovel ${g.app.commit.slice(0, 8)})`, () => {
		test("the song's chart is the golden's", () => {
			expect(run(g).chart).toBe(g.case.chart);
		});

		test("features: the chromagram, the onset envelope and the audible span", () => {
			expect(featuresSummary(run(g).features)).toEqual(g.features);
		});

		test("the grid: the bar starts, the class, the vote and every witness", () => {
			const grid = run(g).grid;
			const witnesses = grid.ok ? grid.value.reading.witnesses : grid.reading?.witnesses;
			expect(witnesses).toEqual(g.grid.witnesses as never);
			if (!g.grid.ok) {
				expect(grid.ok).toBe(false);
				if (grid.ok) return;
				expect(reasons(grid.refusals)).toEqual([GRID_REASONS[g.grid.reason as string] as string]);
				expect(grid.reading?.cls).toBe(g.grid.cls);
				expect(grid.reading?.decided).toBe(g.grid.decided);
				return;
			}
			if (!grid.ok) throw new Error(`refused: ${reasons(grid.refusals)}`);
			const { reading, pickup } = grid.value;
			expect(reading.cls).toBe(g.grid.cls);
			expect(reading.decided).toBe(g.grid.decided);
			expect(reading.lattice.period).toBe(g.grid.period as number);
			if (pickup === null) {
				expect(grid.value.grid.bars).toEqual(g.grid.barStarts as number[]);
				expect(pickup).toBeNull();
				return;
			}
			const { bars, pickup: expected } = pickupOf(g, run(g));
			expect({ bars: grid.value.grid.bars, pickup }).toEqual({ bars, pickup: expected });
		});

		test("the alignment: bar starts, raw starts, repair, costs and sound", () => {
			expect(alignmentSummary(partsOf(run(g)).alignment)).toEqual(g.alignment);
		});

		test("the fit, its reasons by name", () => {
			const { fit, refusals } = partsOf(run(g));
			const { reasons: sentences, ...numbers } = g.fit;
			expect(fit).toEqual(numbers);
			expect(refusals).toEqual(sentences.map(fitReasonName));
		});

		test("the placements, tempo changes in grammar 2.1's beat", () => {
			const { alignment, placements } = partsOf(run(g));
			expect(alignment.ratio).toBe(g.placements.ratio);
			expect(alignment.samePiece).toBe(g.placements.samePiece);
			expect(placements).toEqual({
				sections: g.placements.sections,
				keyChanges: g.placements.keyChanges,
				tempoChanges: g.placements.tempoChanges.map((t) =>
					tempoChangeAsListen(t, g.case.spec.meter),
				),
			} as never);
		});

		test("the timing map: kept when the fit is, the same numbers either way", () => {
			const r = run(g);
			// The app makes the map, then keeps it only when the fit is ok (songCheck's #keepTiming);
			// the package refuses with the fit's reasons. Its map on the same bar starts is compared either way.
			expect(r.aligned.ok).toBe(g.fit.reasons.length === 0 && g.placements.samePiece);
			const map = mapOf(r.aligned, r.chart, r.features, partsOf(r).alignment.barStarts);
			// §11.3: the package's map is clamped to the recording (the adapter's own test below).
			expect(map).toEqual(timingAsListen(g.timing) as never);
		});

		test("the chart built on the placed or declared grid", () => {
			const built = run(g).built;
			if (!built.ok) throw new Error(`refused: ${reasons(built.refusals)}`);
			const v = built.value;
			expect(v.grid === null ? "declared" : "placed").toBe(g.build.on);
			if (v.grid?.pickup) {
				// §7: compared bar by bar from the written bar 1 on (the pickups adapter's own test checks the rest).
				expect(v.timing.bars.slice(1)).toEqual(g.build.timing.bars.slice(1));
				expect(v.confidence.bars.slice(1)).toEqual(g.build.confidence.bars.slice(1) as never);
				expect(v.timing.end).toBe(g.build.timing.end as number);
				return;
			}
			expect(
				v.chart,
				"the golden's chart is barmark's printing: after a barmark printing change, regenerate the goldens (bun scripts/listen-equivalence.ts <commit>)",
			).toBe(g.build.chart);
			expect(v.timing).toEqual({
				...g.build.timing,
				recording: { duration: v.features.duration },
			} as never);
			expect(v.confidence).toEqual(g.build.confidence as never);
			expect(diagnosticsAsApp(v.diagnostics)).toEqual(g.build.diagnostics);
		});
	});
}

describe("the named adapters and exclusions (§11.3, §12.8), each asserted", () => {
	test("pickups (§7): the app's bar 1 becomes the pickup, bar starts shift by one bar", () => {
		const pickups = goldens.filter(isPickup);
		expect(pickups.map((g) => g.case.name).sort()).toEqual(["pickup-one-beat", "pickup-two-beats"]);
		for (const g of pickups) {
			const grid = run(g).grid;
			if (!grid.ok || !grid.value.pickup) throw new Error("no pickup");
			const app = g.grid.barStarts as number[];
			// The written bar 1 is the app's bar 2; the pickup starts j beats into the app's bar 1.
			const adapted = pickupOf(g, run(g));
			expect(grid.value.grid.bars).toEqual(app.slice(1));
			expect(grid.value.pickup).toEqual(adapted.pickup);
			expect(grid.value.pickup.beats).toBe(g.case.spec.pickupBeats as number);
			expect(grid.warnings.map((w) => w.code)).toContain("pickup");
			// The chart: the same played bars, the first a pickup ([k/4], bar 0) where the app wrote a whole bar.
			const built = run(g).built;
			if (!built.ok) throw new Error("refused");
			const parse = parseChart(built.value.chart);
			expect(parse.pickup).toBe(true);
			expect(parse.bars.length).toBe(g.build.timing.bars.length);
			expect(built.value.timing.bars[0]).toEqual({ bar: 1, start: grid.value.pickup.start });
			expect(g.build.timing.bars[0]).toEqual({ bar: 1, start: app[0] as number });
			expect(g.build.timing.bars.slice(1)).toEqual(built.value.timing.bars.slice(1));
		}
		// A lead-in longer than half a bar keeps the app's bar 1: no difference (§11.3).
		const leadIn = goldens.find((g) => g.case.name === "lead-in-three-beats");
		if (leadIn) expect(isPickup(leadIn)).toBe(false);
	});

	test("the aligned map is clamped to [0, duration] (§11.3): listen clamps the map, the app does not", () => {
		// The adapter itself: the starts and the end held to the recording, a bar left no length no map.
		const app = {
			format: "barmark-timing",
			recording: { duration: 10 },
			bars: [
				{ bar: 1, start: -0.004 },
				{ bar: 2, start: 5 },
			],
			end: 10.003,
		};
		expect(timingAsListen(app)).toEqual({
			...app,
			bars: [
				{ bar: 1, start: 0 },
				{ bar: 2, start: 5 },
			],
			end: 10,
		});
		// A bar the clamp leaves no length is dropped, at either edge (Kevin's decision, 0.1.1).
		expect(
			timingAsListen({
				...app,
				bars: [
					{ bar: 1, start: -1 },
					{ bar: 2, start: 0 },
				],
			}),
		).toEqual({ ...app, bars: [{ bar: 2, start: 0 }], end: 10 });
		expect(
			timingAsListen({
				...app,
				bars: [
					{ bar: 1, start: 0 },
					{ bar: 2, start: 10 },
				],
			}),
		).toEqual({ ...app, bars: [{ bar: 1, start: 0 }], end: 10 });
		// Nothing left: no map.
		expect(timingAsListen({ ...app, bars: [{ bar: 1, start: 11 }], end: 12 })).toBeNull();
		expect(timingAsListen(null)).toBeNull();
		let moved = 0;
		for (const g of goldens) {
			const app = g.timing as {
				recording: { duration: number };
				bars: { bar: number; start: number }[];
				end: number;
			};
			const r = run(g);
			const map = mapOf(r.aligned, r.chart, r.features, partsOf(r).alignment.barStarts);
			// The alignment keeps the app's unclamped starts; only the map is clamped.
			expect(partsOf(r).alignment.barStarts).toEqual(g.alignment.barStarts);
			expect(map).toEqual(timingAsListen(app) as never);
			if (map === null) continue;
			// No golden's map loses a bar: the clamp only trims the first start and the end.
			expect(map.bars.map((b) => b.bar)).toEqual(app.bars.map((b) => b.bar));
			expect(map.bars[0]?.start).toBeGreaterThanOrEqual(0);
			expect(map.end).toBeLessThanOrEqual(app.recording.duration);
			if ((app.bars[0]?.start ?? 0) < 0 || app.end > app.recording.duration) moved++;
		}
		// The app's maps run past the recording on these songs, so the adapter is exercised.
		expect(moved).toBeGreaterThan(0);
	});

	test("no-period: none in the set (the app voted on noise there)", () => {
		for (const g of goldens) {
			const { grid, aligned, built } = run(g);
			const all = [
				...(grid.ok ? [] : grid.refusals),
				...(aligned.ok ? [] : aligned.refusals),
				...(built.ok ? [] : built.refusals),
			];
			expect(reasons(all)).not.toContain("no-period");
		}
	});

	test("grid-truncated: none in the set (the app truncated silently)", () => {
		for (const g of goldens) {
			const { grid, built } = run(g);
			expect(grid.warnings.map((w) => w.code)).not.toContain("grid-truncated");
			expect(built.warnings.map((w) => w.code)).not.toContain("grid-truncated");
		}
	});

	test("tempoChanges[].bpm: the app's bottom-note unit in grammar 2.1's beat", () => {
		// The rule itself, on the set's meters.
		expect(tempoChangeAsListen({ at: 1, bpm: 120, hedged: false }, "6/8").bpm).toBe(40);
		expect(tempoChangeAsListen({ at: 1, bpm: 120, hedged: false }, "4/4").bpm).toBe(120);
		expect(tempoChangeAsListen({ at: 1, bpm: 90, hedged: true }, "3/4")).toEqual({
			at: 1,
			bpm: 90,
			hedged: true,
		});
		// Every song keeps one tempo, so neither side reports a change.
		for (const g of goldens) {
			expect(g.placements.tempoChanges).toEqual([]);
			expect(partsOf(run(g)).placements.tempoChanges).toEqual([]);
		}
	});

	test("reason names (§12.8): the app's grid refusals by the package's names", () => {
		expect(GRID_REASONS).toEqual({
			"no-input": "invalid-input",
			undecided: "downbeat-undecided",
			"no-fit": "nothing-fits",
		});
		for (const g of goldens.filter((x) => !x.grid.ok)) {
			const grid = run(g).grid;
			if (grid.ok) throw new Error(`${g.case.name}: placed where the app refused`);
			expect(reasons(grid.refusals)).toEqual([GRID_REASONS[g.grid.reason as string] as string]);
		}
	});

	test("recording.duration: the app's map ends at the grid's end, the package's at the recording's length", () => {
		for (const g of goldens) {
			const built = run(g).built;
			if (!built.ok) throw new Error("refused");
			expect(g.build.timing.recording.duration).toBe(g.build.grid.at(-1) as number);
			expect(built.value.timing.recording?.duration).toBe(run(g).features.duration);
			// They differ only on a grid cut short (grid-truncated, none in the set): every grid here
			// closes its last bar at the recording's end, so the two durations coincide.
			expect(g.build.grid.at(-1)).toBe(run(g).features.duration);
		}
	});

	test("the fit's reasons: the app's sentences by name", () => {
		expect(fitReasonName("bar 1 at 0:03 where the sound starts at 0:00")).toBe("bar-one-far");
		expect(fitReasonName("bars 2.4 s where the tempo says 2.00 s")).toBe("bar-length-off");
		expect(fitReasonName("the chart fits the recording little better than a wrong one would")).toBe(
			"weak-fit",
		);
		expect(
			fitReasonName(
				"the chart's bars do not line up with the recording through its middle; is this the right chart?",
			),
		).toBe("bars-off-middle");
		expect(fitReasonName("too few bars")).toBe("no-bars");
		expect(() => fitReasonName("something new")).toThrow();
	});

	test("an undecided grid builds on the declared grid, the app's barStartsFrom(0, bar, duration)", () => {
		const undecided = goldens.filter((g) => !g.grid.ok);
		for (const g of undecided) {
			expect(g.grid.reason).toBe("undecided");
			expect(g.build.on).toBe("declared");
			const built = run(g).built;
			if (!built.ok) throw new Error("refused");
			expect(built.value.grid).toBeNull();
			expect(built.warnings.map((w) => w.code)).toContain("bar-one-unplaced");
			expect(built.value.timing.bars.map((b) => b.start)).toEqual(g.build.grid.slice(0, -1));
		}
	});

	test("every refusal of the pipeline by default is an Unplaced reason, and its declared run builds", () => {
		for (const g of goldens) {
			const { byDefault, built } = run(g);
			expect(built.ok).toBe(true);
			if (byDefault.ok) {
				expect(byDefault as unknown).toEqual(built);
				continue;
			}
			expect(byDefault.refusals.length).toBeGreaterThan(0);
			for (const reason of reasons(byDefault.refusals)) expect(UNPLACED.has(reason)).toBe(true);
		}
	});

	test("compound-meter bar seconds come from the chart's own tempo (§11.3): 6/8 at 40 is 3.0 s, at 60 2.0 s", () => {
		for (const [name, seconds] of [
			["6-8-at-40", 3],
			["6-8-at-60", 2],
		] as const) {
			const g = goldens.find((x) => x.case.name === name);
			if (!g) throw new Error(`no golden ${name}`);
			// The app's declared bar is the song's 120 or 180 eighths; the package's, the chart's tempo: 40 or 60.
			expect(g.fit.declaredBar).toBe(seconds);
			expect(partsOf(run(g)).fit.declaredBar).toBe(seconds);
			const bars = chartPadBars(parseChart(run(g).chart), undefined);
			if (!bars.ok) throw new Error("no bars");
			expect(new Set(bars.bars.map((b) => b.seconds))).toEqual(new Set([seconds]));
		}
	});

	test("unreadable chords (§11.3): the app's barmark 0.22 drops the line, the package keeps its bars", () => {
		const golden = fromGoldenJson(readFileSync(UNREADABLE, "utf8")) as UnreadableGolden;
		expect(golden.charts.map((c) => c.chart)).toEqual(UNREADABLE_CHARTS);
		for (const { chart, appBars } of golden.charts) {
			const parse = parseChart(chart);
			const unknown = parse.bars.flatMap((b) => b.slots).filter((s) => s.kind === "unknown");
			expect(unknown.length).toBeGreaterThan(0);
			const ours = chartPadBars(parse, 120);
			const played = ours.ok ? ours.bars.length : 0;
			expect(played).toBe(parse.bars.length);
			// The app plays fewer bars: the line with the unreadable chord is gone.
			expect(appBars).toBeLessThan(played);
		}
	});
});
