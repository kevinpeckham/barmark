/**
 * `chartFromBeats` (spec §6): a tracker's beats and the chord runs to a
 * chart, its map and its confidence in one call; the marks passed as
 * given; and every bad input a named refusal, never a throw.
 */
import { describe, expect, test } from "bun:test";
import { checkTimingMap } from "@barmark/sync";
import { parseChart } from "barmark";
import { chartFromBeats } from "../src/beats/pipeline.js";
import { lead, reading } from "./helpers/beats.js";

/** One symbol run a bar: `bars` are the bar lines, one more than `symbols`. */
const runsOn = (bars: number[], symbols: string[]) => ({
	runs: symbols.map((symbol, i) => ({
		start: bars[i] as number,
		end: bars[i + 1] as number,
		symbol,
	})),
});

const FOUR = reading([4, 4, 4, 4]);
const FOUR_RUNS = runsOn([0, 2, 4, 6, 8], ["C", "F", "G", "C"]);
const reasons = (r: { ok: boolean; refusals?: { reason: string }[] }) =>
	r.ok ? [] : (r.refusals ?? []).map((x) => x.reason);

describe("a chart on the tracker's bars", () => {
	test("with the label's meter and the tempo the builder derives from the bars", () => {
		const tail = reading([4, 4, 4, 4], 0.4);
		const out = chartFromBeats({ ...tail, chords: FOUR_RUNS, title: "Four Bars" });
		if (!out.ok) throw new Error(`refused: ${reasons(out)}`);
		expect(out.value.chart).toContain("# Four Bars");
		expect(out.value.chart).toContain("time: 4/4, tempo: 120");
		expect(out.value.chart).toContain("| C | F | G | C |");
		expect(out.value.timing.bars.map((b) => b.start)).toEqual([0, 2, 4, 6]);
		expect(out.value.grid.grid.bars.at(-1)).toBe(8);
		expect(out.value.timing.end).toBe(8);
		expect(out.value.timing.recording?.duration).toBe(8.4);
		expect(out.value.grid.meter).toBe("4/4");
		expect(parseChart(out.value.chart).diagnostics.filter((d) => d.severity === "error")).toEqual(
			[],
		);
		expect(checkTimingMap(out.value.timing, { text: out.value.chart }).diagnostics).toEqual([]);
	});

	test("6/8 by the count: the chart's tempo is in dotted quarters", () => {
		const r = reading([6, 6, 6, 6], 0, 0.25);
		const out = chartFromBeats({
			...r,
			chords: runsOn([0, 1.5, 3, 4.5, 6], ["Am", "Dm", "E", "Am"]),
		});
		if (!out.ok) throw new Error(`refused: ${reasons(out)}`);
		expect(out.value.chart).toContain("time: 6/8, tempo: 80");
		expect(out.value.chart).toContain("| Am | Dm | E | Am |");
	});

	test("a pickup is bar 0 on the chart and the map's first entry", () => {
		const led = lead(FOUR, 1);
		const out = chartFromBeats({
			...led,
			chords: { runs: [{ start: 0, end: led.duration, symbol: "G" }] },
		});
		if (!out.ok) throw new Error(`refused: ${reasons(out)}`);
		expect(out.value.grid.pickup).toEqual({ start: 0, beats: 1 });
		expect(out.value.chart).toContain("[1/4]");
		expect(out.value.timing.bars[0]).toEqual({ bar: 1, start: 0 });
		expect(out.value.timing.bars[1]).toEqual({ bar: 2, start: 0.5 });
		expect(out.value.diagnostics.map((d) => d.code)).not.toContain("pickup-ignored");
		expect(out.warnings.map((w) => w.code)).toContain("pickup");
	});

	test("the warnings are the grid's", () => {
		const out = chartFromBeats({ ...FOUR, chords: FOUR_RUNS, declared: { meter: "3/4" } });
		if (!out.ok) throw new Error(`refused: ${reasons(out)}`);
		expect(out.warnings.map((w) => w.code)).toEqual(["meter-differs"]);
	});

	test("the marks reach the builder as given", () => {
		const out = chartFromBeats({
			...FOUR,
			chords: FOUR_RUNS,
			key: "C",
			sections: [{ name: "Verse", start: 0 }],
			changes: [{ kind: "key", start: 4, value: "G" }],
		});
		if (!out.ok) throw new Error(`refused: ${reasons(out)}`);
		expect(out.value.chart).toContain("## Verse");
		expect(out.value.chart).toContain("key: C, time: 4/4");
		expect(out.value.chart).toContain("key: G");
	});

	test("recording.id reaches the map", () => {
		const out = chartFromBeats({ ...FOUR, chords: FOUR_RUNS, recording: { id: "mix-1" } });
		if (!out.ok) throw new Error(`refused: ${reasons(out)}`);
		expect(out.value.timing.recording?.id).toBe("mix-1");
	});

	test("a mark getter that throws is invalid-input with the reading and the grid's warnings", () => {
		const input = { ...FOUR, chords: FOUR_RUNS, declared: { meter: "4/4", tempo: 121 } };
		Object.defineProperty(input, "title", {
			get(): never {
				throw new Error("boom");
			},
			enumerable: true,
		});
		const out = chartFromBeats(input);
		expect(out.ok).toBe(false);
		if (out.ok) return;
		expect(out.refusals[0]?.reason).toBe("invalid-input");
		expect(out.refusals[0]?.message).toBe("The builder could not read the detections.");
		expect(out.reading?.beatsPerBar).toBe(4);
		expect(out.warnings.map((w) => w.code)).toContain("tempo-drift");
	});

	test("chords the builder cannot read (a getter that throws on runs) are invalid-input", () => {
		const out = chartFromBeats({
			...FOUR,
			chords: {
				get runs(): never {
					throw new Error("boom");
				},
			},
		});
		expect(out.ok).toBe(false);
		if (out.ok) return;
		expect(out.refusals[0]?.message).toBe("The builder could not read the detections.");
		expect(out.reading?.beatsPerBar).toBe(4);
	});

	test("the duration is read once: a getter that answers 8, then 999, gives 8", () => {
		let reads = 0;
		const input = {
			beats: FOUR.beats,
			downbeats: FOUR.downbeats,
			chords: FOUR_RUNS,
			get duration() {
				reads += 1;
				return reads === 1 ? 8 : 999;
			},
		};
		const out = chartFromBeats(input);
		if (!out.ok) throw new Error(`refused: ${reasons(out)}`);
		expect(out.value.timing.recording?.duration).toBe(8);
	});
});

describe("a refused reading", () => {
	test("refuses the chart, with the reading", () => {
		const out = chartFromBeats({ ...reading([3, 3, 3, 2, 4, 5, 2, 4, 5]), chords: { runs: [] } });
		expect(!out.ok && out.refusals[0]?.reason).toBe("bars-unsteady");
		expect(!out.ok && out.reading?.beatsPerBar).toBe(3);
		expect(!out.ok && out.reading?.counts).toEqual({ 2: 2, 3: 3, 4: 2, 5: 2 });
		expect(!out.ok && out.reading?.steadyShare).toBeCloseTo(3 / 9);
	});

	test("too few bars refuses; no reading yet, as the grid gives none", () => {
		const out = chartFromBeats({ ...reading([4, 4]), chords: { runs: [] } });
		expect(reasons(out)).toEqual(["too-few-bars"]);
		expect(!out.ok && out.reading).toBeNull();
	});
});

describe("every bad input is a refusal, never a throw", () => {
	const field = (out: { ok: boolean; refusals?: { detail?: Record<string, unknown> }[] }) =>
		out.ok ? null : out.refusals?.[0]?.detail?.field;

	test("chords must be an object", () => {
		for (const chords of [null, "x", undefined]) {
			const out = chartFromBeats({ ...FOUR, chords } as never);
			expect({ reasons: reasons(out), field: field(out) }).toEqual({
				reasons: ["invalid-input"],
				field: "chords",
			});
		}
	});

	test("the input must be an object", () => {
		for (const input of [null, 3, "x"]) {
			const out = chartFromBeats(input as never);
			expect(reasons(out)).toEqual(["invalid-input"]);
			expect(!out.ok && out.reading).toBeNull();
		}
	});

	test("recording.id must be a string", () => {
		const out = chartFromBeats({ ...FOUR, chords: FOUR_RUNS, recording: { id: 3 } } as never);
		expect({ reasons: reasons(out), field: field(out) }).toEqual({
			reasons: ["invalid-input"],
			field: "recording.id",
		});
	});

	test("the beats input is checked too", () => {
		const out = chartFromBeats({ ...FOUR, duration: 0, chords: FOUR_RUNS });
		expect({ reasons: reasons(out), field: field(out) }).toEqual({
			reasons: ["invalid-input"],
			field: "duration",
		});
	});

	test("a chords getter that throws is invalid-input", () => {
		const input = {
			...FOUR,
			get chords(): never {
				throw new Error("boom");
			},
		};
		expect(reasons(chartFromBeats(input as never))).toEqual(["invalid-input"]);
	});

	test("a sound option is invalid-option, as is a build that is not an object", () => {
		const sound = chartFromBeats({ ...FOUR, chords: FOUR_RUNS }, {
			ALIGNMENT_SOUND_FLOOR: 0.1,
		} as never);
		expect(reasons(sound)).toEqual(["invalid-option"]);
		const build = chartFromBeats({ ...FOUR, chords: FOUR_RUNS }, { build: 3 } as never);
		expect(reasons(build)).toEqual(["invalid-option"]);
	});

	test("the options are checked before the input", () => {
		const out = chartFromBeats(null as never, { TRACKER_MIN_BARS: 0 });
		expect(reasons(out)).toEqual(["invalid-option"]);
	});
});
