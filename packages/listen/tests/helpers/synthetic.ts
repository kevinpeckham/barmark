/**
 * A whole synthetic song, rendered to 22,050 Hz PCM for the pipeline's
 * tests (Tasks 14 and 16): pads of one chord a bar from a seeded
 * progression (one chord throughout for `flat`), a broadband click on
 * every beat (the meter's numerator beats: eighths in 6/8) with the
 * downbeats accented, and the chord model's runs in its frames
 * (`2048 / 22050` s) with the frame count. Sound before 0:00 (a pickup
 * that starts before the recording) is cut off.
 */
import { beatsOf, parseMeter } from "barmark";
import type { ListenChordRuns } from "../../src/grid/beats.js";
import { seeded } from "./seeded.js";

const RATE = 22050;
/** The chord model's frame. */
const FRAME_SEC = 2048 / RATE;

/** Harte labels and their pads' notes (MIDI). */
const CHORDS = [
	{ label: "C", notes: [60, 64, 67] },
	{ label: "F", notes: [65, 69, 72] },
	{ label: "G", notes: [67, 71, 74] },
	{ label: "A:min", notes: [69, 72, 76] },
	{ label: "D:min", notes: [62, 65, 69] },
	{ label: "E:min", notes: [64, 67, 71] },
	{ label: "Bb", notes: [70, 74, 77] },
	{ label: "D", notes: [62, 66, 69] },
];
const PAD_GAIN = 0.08;
/** The pads cross-fade over 10 ms at each change, so a change is no click. */
const FADE = 0.01;
/** A click: 4 ms of seeded white noise, decaying; the downbeat's twice the others'. */
const CLICK = { seconds: 0.004, gain: 0.3, accent: 2 };
/** The recording ends this long before the next bar would start, so the grid is the song's bars. */
const TAIL = 0.2;

export type SynthSpec = {
	meter: string;
	/** In grammar 2.1's beat (dotted quarters in 6/8). */
	tempo: number;
	bars: number;
	/** The first downbeat (bar one), in seconds. */
	downbeat: number;
	/** A pickup of this many of the meter's numerator beats before bar one. */
	pickupBeats?: number;
	harmony?: "changing" | "flat";
	seed: number;
};

export type SynthSong = {
	samples: Float32Array;
	sampleRate: 22050;
	chords: ListenChordRuns;
	/** The bar starts (bar one first, no end), where the pickup starts (null: none) and each bar's Harte label. */
	truth: { bars: number[]; pickup: number | null; labels: string[] };
};

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** A chord per bar: a seeded walk that never repeats the bar before's chord; the first chord throughout when flat. */
function progression(bars: number, flat: boolean, rand: () => number) {
	const out = [CHORDS[0] as (typeof CHORDS)[number]];
	for (let b = 1; b < bars; b++) {
		const before = out[b - 1] as (typeof CHORDS)[number];
		let next = before;
		while (!flat && next === before)
			next = CHORDS[Math.floor(rand() * CHORDS.length)] as typeof next;
		out.push(next);
	}
	return out;
}

/** The pad from `start` to `end`: its sines in phase with time, faded in and out. */
function addPad(out: Float32Array, start: number, end: number, notes: number[]) {
	const from = Math.max(0, Math.round(start * RATE));
	const to = Math.min(out.length, Math.round(end * RATE));
	for (let i = from; i < to; i++) {
		const t = i / RATE;
		const env = Math.min(1, (t - start) / FADE, (end - t) / FADE);
		let v = 0;
		for (const n of notes) v += Math.sin(2 * Math.PI * hz(n) * t);
		out[i] = (out[i] as number) + PAD_GAIN * Math.max(0, env) * v;
	}
}

function addClick(out: Float32Array, at: number, gain: number, rand: () => number) {
	const from = Math.round(at * RATE);
	const length = Math.round(CLICK.seconds * RATE);
	for (let i = 0; i < length; i++) {
		const noise = gain * (2 * rand() - 1) * (1 - i / length);
		if (from + i >= 0 && from + i < out.length) out[from + i] = (out[from + i] as number) + noise;
	}
}

/** The song's PCM, its chord runs in the model's frames and its truth. */
export function synthSong(spec: SynthSpec): SynthSong {
	const meter = parseMeter(spec.meter);
	if (!meter) throw new Error(`synthSong: no meter ${spec.meter}`);
	const period = (beatsOf(meter) * 60) / spec.tempo;
	const beat = period / meter.n;
	const pickupBeats = spec.pickupBeats ?? 0;
	const pickup = pickupBeats > 0 ? spec.downbeat - pickupBeats * beat : null;
	const duration = spec.downbeat + spec.bars * period - TAIL;
	const samples = new Float32Array(Math.round(duration * RATE));
	const rand = seeded(spec.seed);
	const chords = progression(spec.bars, spec.harmony === "flat", rand);
	const bars = Array.from({ length: spec.bars }, (_, i) => spec.downbeat + i * period);
	// The pickup plays the first bar's chord: one run from the pickup to bar two.
	const starts = bars.map((t, i) => (i === 0 && pickup !== null ? pickup : t));
	for (let b = 0; b < spec.bars; b++) {
		const end = Math.min(duration, (bars[b] as number) + period);
		addPad(samples, starts[b] as number, end, (chords[b] as { notes: number[] }).notes);
	}
	const first = -pickupBeats;
	for (let k = first; k < spec.bars * meter.n; k++) {
		const accent = ((k % meter.n) + meter.n) % meter.n === 0 ? CLICK.accent : 1;
		addClick(samples, spec.downbeat + k * beat, CLICK.gain * accent, rand);
	}
	const frames = Math.ceil(duration / FRAME_SEC);
	const at = (t: number) => Math.max(0, Math.min(frames, Math.round(t / FRAME_SEC)));
	const runs: { start: number; end: number; label: string }[] = [];
	for (let b = 0; b < spec.bars; b++) {
		const label = (chords[b] as { label: string }).label;
		const start = at(starts[b] as number);
		const end = at(b + 1 < spec.bars ? (bars[b + 1] as number) : duration);
		const last = runs.at(-1);
		if (last && last.label === label) last.end = end;
		else runs.push({ start, end, label });
	}
	return {
		samples,
		sampleRate: RATE,
		chords: { frameSec: FRAME_SEC, frames, runs },
		truth: { bars, pickup, labels: chords.map((c) => c.label) },
	};
}
