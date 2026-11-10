/**
 * The 65 Hz sine-kick fixture (design §11.2, Kevin's decision): Study 32's
 * first run failed on a pure 65 Hz sine kick, weak in the spectral flux,
 * so its "correct bases" sat on beat 2. Three tests: what the envelope
 * reads of the kick, bar one with hits on 2 and 4, and kick and pads
 * alone recorded exactly as the grid reads them.
 */
import { describe, expect, test } from "bun:test";
import { type Features, recordingFeatures } from "../src/features/index.js";
import { detrend } from "../src/features/onset.js";
import { findGrid } from "../src/grid/grid.js";
import { DEFAULTS } from "../src/options.js";
import { type KickSong, kickChords, kickSong, kicksOf } from "./helpers/kick.js";

const declared = { meter: "4/4", tempo: 120 };

function featuresOf(song: KickSong): Features {
	const f = recordingFeatures(song.samples, song.sampleRate);
	if (!f.ok) throw new Error(f.refusals.map((p) => p.message).join(" "));
	return f.value;
}

/** The detrended envelope's mean within ±2 frames of each time less the lead, and its mean over every other frame. */
function meansAt(f: Features, times: number[]): { at: number; elsewhere: number } {
	const x = detrend(f.onset, f.fps);
	const near = new Set<number>();
	for (const t of times) {
		const centre = Math.round((t - DEFAULTS.ONSET_ENVELOPE_LEAD_SEC) * f.fps);
		for (let d = -2; d <= 2; d++) near.add(centre + d);
	}
	let [at, nAt, elsewhere, nElsewhere] = [0, 0, 0, 0];
	x.forEach((v, i) => {
		if (near.has(i)) [at, nAt] = [at + v, nAt + 1];
		else [elsewhere, nElsewhere] = [elsewhere + v, nElsewhere + 1];
	});
	return { at: at / nAt, elsewhere: elsewhere / nElsewhere };
}

const gridOf = (song: KickSong) =>
	findGrid({ features: featuresOf(song), chords: kickChords(song), declared });

/** True when the grid is decided with bar one more than 0.03 s from every true downbeat. */
function decidedOffTruth(r: ReturnType<typeof gridOf>, song: KickSong): boolean {
	if (!r.ok) return false;
	const first = r.value.grid.bars[0] as number;
	return song.downbeats.every((d) => Math.abs(first - d) > 0.03);
}

describe("the 65 Hz sine kick (design §11.2)", () => {
	test("the envelope sees the lone kick; a 3 ms hit reads about eleven times it", () => {
		// The brief expected the kick-only song's detrended mean at the kicks
		// to be under 1.5 × its mean elsewhere. The port reads otherwise: alone
		// over silence the kick reads 66.8 against 0.026 elsewhere (×2,581;
		// under the pads 61.1 against 0.10, ×595), since every bin of silence
		// rises with its attack. The weakness Study 32 met is relative: in the
		// song with hits on 2 and 4, a hit's frames read 542 and a kick's 48.9
		// (×11.1), so the comb's phase lands on a backbeat (test (b)).
		const lone = kickSong({ pads: false });
		const alone = meansAt(featuresOf(lone), kicksOf(lone));
		expect(alone.at / alone.elsewhere).toBeGreaterThan(1000);

		const song = kickSong({ hits: true });
		const f = featuresOf(song);
		const hits = song.downbeats.flatMap((d) => [d + 0.5, d + 1.5]);
		expect(meansAt(f, hits).at / meansAt(f, kicksOf(song)).at).toBeGreaterThan(8);
	});

	test("with hits on 2 and 4, bar one lands within 0.03 s", () => {
		const song = kickSong({ hits: true });
		const r = gridOf(song);
		if (!r.ok) throw new Error(r.refusals.map((p) => p.reason).join(" "));
		const first = r.value.grid.bars[0] as number;
		// With a pickup, bars[0] is still bar one: the grid never includes the pickup.
		expect(Math.abs(first - 1.0)).toBeLessThanOrEqual(0.03);
		// Observed: the comb's phase sits on beat 2 (anchor 1.49, Study 32's
		// symptom) and the vote moves bar one three beats on, to 0.9899.
		expect(r.value.reading.lattice.anchor).toBeCloseTo(1.49, 9);
		expect(r.value.reading.cls).toBe(3);
		expect(first).toBeCloseTo(0.9899, 9);
		expect(r.value.pickup).toBeNull();
	});

	test("kick and pads alone are recorded exactly", () => {
		const song = kickSong();
		const r = gridOf(song);
		expect(decidedOffTruth(r, song)).toBe(false);
		// Observed: a decided grid on the truth, the comb's phase on beat 1 and every witness on class 0.
		if (!r.ok) throw new Error(r.refusals.map((p) => p.reason).join(" "));
		expect(r.value.reading.cls).toBe(0);
		expect(r.value.reading.decided).toBe(true);
		expect(r.value.reading.scores).toEqual([3, 0, 2, 0]);
		expect(r.value.grid.bars[0]).toBeCloseTo(1.0, 9);
		expect(r.value.pickup).toBeNull();
		expect(r.warnings).toEqual([]);
	});
});
