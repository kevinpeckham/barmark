/**
 * The 65 Hz sine-kick fixture (design §11.2, Kevin's decision; Study 32's
 * first run failed on it), synthesized here so no audio is checked in:
 * 22,050 Hz PCM at 120 bpm in 4/4, the first downbeat at 1.0 s, 16 bars
 * unless given. A 65 Hz sine kick on beats 1 and 3, pads `C | F | G | C`
 * repeating, and with `hits` a 3 ms seeded white-noise burst on beats 2
 * and 4.
 */
import type { ListenChordRuns } from "../../src/grid/beats.js";
import { seeded } from "./seeded.js";
import { runsOf } from "./songs.js";

const RATE = 22050;
const BEAT = 60 / 120;
const BEATS_PER_BAR = 4;
const PERIOD = BEAT * BEATS_PER_BAR;
const FIRST_DOWNBEAT = 1;

/** The kick: 65 Hz, a 5 ms linear attack, then 60 ms of exponential decay to −60 dB. Its peak gain is not the brief's: 0.7, so kick and pads together stay under full scale. */
const KICK = { hz: 65, attack: 0.005, decay: 0.06, gain: 0.7 };
/** A pad's chord tones (MIDI notes) per bar, and each sine's gain. */
const PADS = [
	{ label: "C", notes: [60, 64, 67] },
	{ label: "F", notes: [65, 69, 72] },
	{ label: "G", notes: [67, 71, 74] },
	{ label: "C", notes: [60, 64, 67] },
];
const PAD_GAIN = 0.1;
/** The pads cross-fade over 10 ms at each bar line, so a change is no click. Not the brief's. */
const FADE = 0.01;
/** A hit: 3 ms of seeded white noise. Its peak gain is not the brief's: 0.5. */
const HIT = { seconds: 0.003, gain: 0.5, seed: 65 };

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** The fixture's PCM, its rate and its true downbeats. */
export type KickSong = { samples: Float32Array; sampleRate: 22050; downbeats: number[] };

function addKick(out: Float32Array, at: number) {
	const length = Math.round((KICK.attack + KICK.decay) * RATE);
	const from = Math.round(at * RATE);
	for (let i = 0; i < length && from + i < out.length; i++) {
		const t = i / RATE;
		const env =
			t < KICK.attack ? t / KICK.attack : 10 ** ((-60 / 20) * ((t - KICK.attack) / KICK.decay));
		out[from + i] =
			(out[from + i] as number) + KICK.gain * env * Math.sin(2 * Math.PI * KICK.hz * t);
	}
}

function addHit(out: Float32Array, at: number, rand: () => number) {
	const from = Math.round(at * RATE);
	const length = Math.round(HIT.seconds * RATE);
	for (let i = 0; i < length && from + i < out.length; i++)
		out[from + i] = (out[from + i] as number) + HIT.gain * (2 * rand() - 1);
}

/** The pad for the bar from `start`: its chord's sines in phase with time, faded in and out across the bar lines. */
function addPad(out: Float32Array, start: number, notes: number[]) {
	const end = start + PERIOD;
	const from = Math.max(0, Math.round((start - FADE / 2) * RATE));
	const to = Math.min(out.length, Math.round((end + FADE / 2) * RATE));
	for (let i = from; i < to; i++) {
		const t = i / RATE;
		const env = Math.min(1, (t - start) / FADE + 0.5, (end - t) / FADE + 0.5);
		let sum = 0;
		for (const n of notes) sum += Math.sin(2 * Math.PI * hz(n) * t);
		out[i] = (out[i] as number) + PAD_GAIN * Math.max(0, env) * sum;
	}
}

/** The fixture, ending at the last bar's end; `pads: false` (not the brief's) leaves the pads out, for test (a). */
export function kickSong(opts: { hits?: boolean; bars?: number; pads?: boolean } = {}): KickSong {
	const bars = opts.bars ?? 16;
	const downbeats = Array.from({ length: bars }, (_, i) => FIRST_DOWNBEAT + i * PERIOD);
	const samples = new Float32Array(Math.round((FIRST_DOWNBEAT + bars * PERIOD) * RATE));
	const rand = seeded(HIT.seed);
	downbeats.forEach((bar, i) => {
		if (opts.pads ?? true)
			addPad(samples, bar, (PADS[i % PADS.length] as { notes: number[] }).notes);
		addKick(samples, bar);
		addKick(samples, bar + 2 * BEAT);
		if (opts.hits) {
			addHit(samples, bar + BEAT, rand);
			addHit(samples, bar + 3 * BEAT, rand);
		}
	});
	return { samples, sampleRate: RATE, downbeats };
}

/** The kicks' times: beats 1 and 3 of every bar. */
export const kicksOf = (song: KickSong) => song.downbeats.flatMap((d) => [d, d + 2 * BEAT]);

/** The pads' chords as the model's frame runs: a run for each change, `C | C` across bars one run. */
export function kickChords(song: KickSong): ListenChordRuns {
	const duration = song.samples.length / song.sampleRate;
	const changes: number[] = [];
	const labels: string[] = [];
	song.downbeats.forEach((d, i) => {
		const label = (PADS[i % PADS.length] as { label: string }).label;
		if (labels.at(-1) === label) return;
		changes.push(d);
		labels.push(label);
	});
	return runsOf(changes, duration, labels);
}
