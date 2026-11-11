/**
 * A chord per beat from the chord model's runs, ported from the app's
 * `utils/chordminiBarChords.ts` (stem-bench Study 17's registered read),
 * arithmetic in the app's order.
 */
import type { ChordRun, ChordRuns } from "@barmark/sync";
import { harteToBarmark, parseChord } from "barmark";

/** The chord runs listen reads: sync's `ChordRuns`, and ChordMini's total frame count when the runs are in frames. */
export type ListenChordRuns = ChordRuns & { frames?: number };

/** A run of beats (or bars) with one chord. The app's `BarChordSegment`. */
export type BeatSegment = {
	/** 1-based beat (or bar) the chord starts on. */
	bar: number;
	bars: number;
	/** Seconds. */
	start: number;
	chord: string;
	/** The share of the run's frames that voted for its chord, 0..1. */
	confidence: number;
};

/** The chord model's frame (2048 / 22050 s): the runs given in seconds are voted on it (Ruling 2). */
const SECONDS_RUN_FRAME = 2048 / 22050;

/** The label most of the frames `lo..hi` carry and its share of them; no frames: "N.C." at 0. */
function vote(labelAt: string[], lo: number, hi: number): { chord: string; confidence: number } {
	const counts = new Map<string, number>();
	for (let f = lo; f < hi; f++)
		counts.set(labelAt[f] as string, (counts.get(labelAt[f] as string) ?? 0) + 1);
	let chord = "N.C.";
	let votes = 0;
	for (const [label, n] of counts) {
		if (n > votes) {
			chord = label;
			votes = n;
		}
	}
	return { chord, confidence: hi > lo ? votes / (hi - lo) : 0 };
}

/** A barmark symbol in barmark's canonical spelling when it parses (`A-` reads `Am`), else as written. */
function canonical(symbol: string): string {
	const read = parseChord(symbol);
	return read.ok ? read.value.canonical : symbol;
}

/**
 * A run's chord: spelled from its Harte label when it has one, else its
 * barmark symbol (canonical, new: the app keeps it as written); neither,
 * or a label barmark cannot read, is "?".
 */
const chordOf = (r: ChordRun) =>
	r.label !== undefined
		? (harteToBarmark(r.label) ?? "?")
		: r.symbol !== undefined
			? canonical(r.symbol)
			: "?";

/**
 * The frames the beats read, `from` (0 or the lowest a beat before 0:00
 * reads) up to `to`: labels outside them are never counted, so none need
 * be kept. Non-finite starts read nothing and are left out.
 */
function framesRead(starts: number[], frameSec: number): { from: number; to: number } {
	let from = 0;
	let to = 0;
	for (let b = 0; b < starts.length - 1; b++) {
		const lo = Math.round((starts[b] as number) / frameSec);
		const hi = Math.max(lo + 1, Math.round((starts[b + 1] as number) / frameSec));
		if (lo < from) from = lo;
		if (Number.isFinite(hi) && hi > to) to = hi;
	}
	return { from, to };
}

/** The largest run end in frames, at least 0 (a loop: a spread of many runs overflows the stack). */
function lastEnd(runs: ChordRun[], toFrame: (t: number) => number): number {
	let last = 0;
	for (const r of runs) last = Math.max(last, toFrame(r.end));
	return last;
}

/**
 * A chord per beat (or bar, the app's use) from the chord model's frames:
 * each takes the chord most of its frames carry, the frames being those
 * from `round(start / frameSec)` up to the next start's, at least one, cut
 * at the last frame. One past the last frame has no chord ("N.C."). A
 * label is spelled by barmark's `harteToBarmark` (N is "N.C.", X and
 * anything it cannot read "?"); a run without a label reads its barmark
 * `symbol`. Consecutive beats with one chord merge into a segment. Runs in
 * frames (`frameSec` given) end at `frames` when given, else at the last
 * run's end; runs in seconds are voted on the chord model's frame
 * (2048 / 22050 s). A run listed later overwrites an earlier one on the
 * frames they share. The app's `chordminiBarChords`.
 *
 * New, not the app's: a run whose `start` or `end` is not finite is
 * skipped (the app allocates no frames for a NaN end and throws on an
 * infinite one). And, changing no vote, a run's frames are written only
 * where some beat reads them, so a huge `end`, `frames` or negative `start`
 * allocates and walks nothing it does not read. It never throws on runs;
 * `starts` are finite and increasing, as `latticeBeats` gives them.
 */
export function beatChords(chords: ListenChordRuns, starts: number[]): BeatSegment[] {
	const { frameSec = SECONDS_RUN_FRAME } = chords;
	const runs = chords.runs.filter((r) => Number.isFinite(r.start) && Number.isFinite(r.end));
	const toFrame = (t: number) => (chords.frameSec === undefined ? Math.round(t / frameSec) : t);
	const read = framesRead(starts, frameSec);
	const frames = chords.frames ?? lastEnd(runs, toFrame);
	const kept = Math.min(frames, read.to);
	const labelAt = Array.from({ length: kept }, () => "N.C.");
	for (const r of runs) {
		const chord = chordOf(r);
		for (let f = Math.max(read.from, toFrame(r.start)); f < Math.min(toFrame(r.end), kept); f++)
			labelAt[f] = chord;
	}
	const out: BeatSegment[] = [];
	for (let b = 0; b < starts.length - 1; b++) {
		const lo = Math.round((starts[b] as number) / frameSec);
		const hi = Math.min(frames, Math.max(lo + 1, Math.round((starts[b + 1] as number) / frameSec)));
		const { chord, confidence } = vote(labelAt, lo, hi);
		const previous = out[out.length - 1];
		if (previous && previous.chord === chord) {
			previous.confidence =
				(previous.confidence * previous.bars + confidence) / (previous.bars + 1);
			previous.bars += 1;
		} else out.push({ bar: b + 1, bars: 1, start: starts[b] as number, chord, confidence });
	}
	return out;
}
