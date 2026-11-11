/**
 * The `tempo-drift` warning (Stem Shovel issue #17, Study 34b): `findGrid`,
 * and so `chartFromRecording`, says how far the comb's settled bar is from
 * the declared one, `period / declaredBar − 1`, signed. A warning, never a
 * refusal, with no threshold here: the host decides (the app holds a draft
 * above 4 %). Emitted whenever the ratio is not zero within floating-point
 * error; the comb scans its period in steps of 0.02 %, so a song at its
 * own tempo usually shows a drift of that size.
 */
import { describe, expect, test } from "bun:test";
import { type Features, recordingFeatures } from "../src/features/index.js";
import { tempoDrift } from "../src/grid/drift.js";
import { findGrid } from "../src/grid/grid.js";
import { chartFromRecording } from "../src/pipeline.js";
import type { ListenWarning } from "../src/result.js";
import { type SynthSpec, synthSong } from "./helpers/synthetic.js";

const songAt = (tempo: number, extra: Partial<SynthSpec> = {}) => {
	const song = synthSong({ meter: "4/4", tempo, bars: 16, downbeat: 1, seed: 3, ...extra });
	const read = recordingFeatures(song.samples, song.sampleRate);
	if (!read.ok) throw new Error("features refused");
	return { song, features: read.value as Features };
};
const drift = (warnings: ListenWarning[]) => warnings.filter((w) => w.code === "tempo-drift");
const DECLARED = { meter: "4/4", tempo: 120 };

describe("tempo-drift", () => {
	test("a song faster than declared: a negative ratio, its period and the declared bar", () => {
		const { song, features } = songAt(126);
		const g = findGrid({ features, chords: song.chords, declared: DECLARED });
		if (!g.ok) throw new Error("refused");
		const [w] = drift(g.warnings);
		const period = g.value.reading.lattice.period;
		expect(w?.detail).toEqual({ ratio: period / 2 - 1, period, declaredBar: 2 });
		expect(w?.detail?.ratio as number).toBeLessThan(0);
		expect(Math.abs((w?.detail?.ratio as number) - (120 / 126 - 1))).toBeLessThan(0.002);
		expect(w?.message).toMatch(/^The bars run 4\.\d\d % shorter than the declared tempo's/);
	});

	test("a song slower than declared: a positive ratio", () => {
		const { song, features } = songAt(114);
		const g = findGrid({ features, chords: song.chords, declared: DECLARED });
		const [w] = drift(g.warnings);
		expect(w?.detail?.ratio as number).toBeGreaterThan(0.04);
		expect(w?.message).toMatch(/longer than the declared tempo's/);
	});

	test("a song at its own tempo: the comb's scan step, a drift well under 0.1 %", () => {
		const { song, features } = songAt(120);
		const g = findGrid({ features, chords: song.chords, declared: DECLARED });
		const ws = drift(g.warnings);
		expect(ws).toHaveLength(1);
		for (const w of ws) expect(Math.abs(w.detail?.ratio as number)).toBeLessThan(0.001);
	});

	test("the rule: no warning when the ratio is zero within floating-point error", () => {
		expect(tempoDrift(2, 2)).toBeNull();
		expect(tempoDrift(2 + 2 ** -51, 2)).toBeNull();
		expect(tempoDrift(4 / 3, 4 / 3)).toBeNull();
		expect(tempoDrift(2.0004, 2)?.detail).toEqual({
			ratio: 2.0004 / 2 - 1,
			period: 2.0004,
			declaredBar: 2,
		});
	});

	test("a refusal carries it too (downbeat-undecided), and the pipeline passes it on", () => {
		const { song, features } = songAt(126, { downbeat: 0.25, harmony: "flat" });
		const g = findGrid({ features, chords: song.chords, declared: DECLARED });
		expect(g.ok).toBe(false);
		expect(drift(g.warnings)).toHaveLength(1);
		const built = chartFromRecording({
			features,
			chords: song.chords,
			declared: DECLARED,
			onUnplaced: "declared",
		});
		expect(drift(built.warnings)).toEqual(drift(g.warnings));
		const placed = songAt(126);
		const r = chartFromRecording({
			features: placed.features,
			chords: placed.song.chords,
			declared: DECLARED,
		});
		expect(r.ok).toBe(true);
		expect(drift(r.warnings)).toHaveLength(1);
	});
});
