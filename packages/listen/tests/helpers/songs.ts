/**
 * The synthetic songs of the app's `chartlessGrid.test.ts`, ported as they
 * are: a song's truth (`Song`), the onset envelope a real one would read,
 * the chord model's runs and section-shaped chroma.
 */
import type { ListenChordRuns } from "../../src/grid/beats.js";
import { DEFAULTS } from "../../src/options.js";
import { seeded } from "./seeded.js";

export const FPS = 100;
const FRAME_SEC = 0.0929;
export const HOP_SEC = 0.1;

/** A song's truth: its tempo, beats to the bar, where its first downbeat is and how many bars it plays. */
export type Song = { bpm: number; beatsPerBar: number; downbeat: number; bars: number };

const beatOf = (s: Song) => 60 / s.bpm;
export const periodOf = (s: Song) => beatOf(s) * s.beatsPerBar;
/** The recording ends a little before the next bar would start, so the grid is the song's bars. */
export const durationOf = (s: Song) => s.downbeat + s.bars * periodOf(s) - 0.2;
/** The true bar starts. */
const truthOf = (s: Song) => Array.from({ length: s.bars }, (_, i) => s.downbeat + i * periodOf(s));

/**
 * The onset envelope a real one would read (100 fps): a hit on every beat,
 * `gainOf(beatInBar)` strong, stamped `ONSET_ENVELOPE_LEAD_SEC` early as the
 * envelope stamps them, smeared over ±0.12 s, over low noise.
 */
export function onsetOf(s: Song, gainOf: (beatInBar: number) => number): Float32Array {
	const onset = new Float32Array(Math.round(durationOf(s) * FPS));
	const rand = seeded(3);
	for (let f = 0; f < onset.length; f++) onset[f] = 0.04 * rand();
	for (let b = 0; b < s.bars * s.beatsPerBar; b++) {
		const at = Math.round((s.downbeat + b * beatOf(s) - DEFAULTS.ONSET_ENVELOPE_LEAD_SEC) * FPS);
		for (let k = -12; k <= 12; k++) {
			const f = at + k;
			if (f >= 0 && f < onset.length)
				onset[f] = (onset[f] as number) + gainOf(b % s.beatsPerBar) * 0.75 ** Math.abs(k);
		}
	}
	return onset;
}

/** Backbeats louder than the downbeats: the comb's bar phase lands on beat 2 or 4. */
export const backbeat = (b: number) => (b % 2 === 1 ? 1 : 0.45);

const CHORDS = ["C", "F", "G", "A:min"];

/**
 * The model's frames: a chord from each of `changes` (seconds, in order) to
 * the next, cycling through four, no chord before the first.
 */
function runsOf(changes: number[], duration: number): ListenChordRuns {
	const frames = Math.ceil(duration / FRAME_SEC);
	const at = (t: number) => Math.min(frames, Math.round(t / FRAME_SEC));
	const runs = changes.map((t, i) => {
		const label = CHORDS[i % CHORDS.length] as string;
		return { start: at(t), end: at(changes[i + 1] ?? duration), label };
	});
	return { frameSec: FRAME_SEC, frames, runs };
}

/** A chord change on every true downbeat. */
export const onDownbeats = (s: Song) => runsOf(truthOf(s), durationOf(s));

/** Chroma (flattened, 12 a frame) whose profile alternates every `barsPerSection` bars. */
export function sectionsOf(s: Song, barsPerSection: number): Float32Array {
	const frames = Math.ceil(durationOf(s) / HOP_SEC);
	const a = [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0];
	const b = [0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0];
	const chroma = new Float32Array(frames * 12);
	for (let f = 0; f < frames; f++) {
		const bar = Math.floor((f * HOP_SEC - s.downbeat) / periodOf(s));
		chroma.set(Math.floor(bar / barsPerSection) % 2 ? b : a, f * 12);
	}
	return chroma;
}

/** The song that starts on its first downbeat at 0:00. */
export const FROM_ZERO: Song = { bpm: 117, beatsPerBar: 4, downbeat: 0, bars: 40 };
