/**
 * The chart as audio, badly but in time: each played bar's pads as
 * sustained chords (design §6.3, §10). Ported from the app's
 * `audio/chartAlignment.ts` (`midiHz`, `addPad`, `renderChartPads`), the
 * arithmetic in the app's order. The bars come from `chartPadBars`, which
 * has already read each bar's seconds (the app's `chartBarSeconds`) and
 * slots (the app's `slotsOf`).
 *
 * `renderWhole` is the app's render, one `Float32Array` of the chart's
 * whole length. `renderChartPads` streams it instead (§10): each sample is
 * the same float32 sum, pad by pad in bar and slot order and tone by tone,
 * and each tone's phasor runs from its pad's start across the chunks, so
 * the chunks are the whole render bit for bit, in O(chunk) memory.
 */
import type { PadBar, Pitches } from "./bars.js";

/** The streamed render's chunk, in samples. */
const CHUNK = 65_536;

const midiHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** A pad's tones as MIDI notes: the root two octaves under middle C, the chord's tones above it (the app's `addPad`). */
const tonesOf = (chord: Pitches) => [
	36 + chord.root,
	...chord.tones.map((pc) => 60 + chord.root + ((pc - chord.root + 12) % 12)),
];

/** The render's length in samples: the bars' seconds summed from 0 in bar order, times the rate, rounded up (the app's). */
export function renderLength(bars: PadBar[], sampleRate: number): number {
	return Math.ceil(bars.reduce((a, b) => a + b.seconds, 0) * sampleRate);
}

/**
 * One chord as a sustained pad, each tone a sine and a soft octave: the
 * app's `addPad`. Its arithmetic is the app's; only the destructuring
 * swaps (`[c, s] = [..., ...]`, about eight times slower here) are plain
 * assignments, each right-hand side still computed from the old values.
 */
function addPad(
	out: Float32Array,
	sampleRate: number,
	startSec: number,
	durSec: number,
	chord: Pitches,
): void {
	const from = Math.max(0, Math.floor(startSec * sampleRate));
	const to = Math.min(out.length, Math.floor((startSec + durSec) * sampleRate));
	const attack = Math.max(1, 0.02 * sampleRate);
	for (const midi of tonesOf(chord)) {
		// A rotating phasor instead of a sine per sample: the same wave, a fraction of the cost.
		const w = (2 * Math.PI * midiHz(midi)) / sampleRate;
		const dc = Math.cos(w);
		const ds = Math.sin(w);
		let c = Math.cos(w * from);
		let s = Math.sin(w * from);
		for (let i = from; i < to; i++) {
			const n = i - from;
			const env = (n < attack ? n / attack : 1) * 0.25;
			out[i] = (out[i] as number) + (s + 0.5 * s * c) * env;
			const next = c * dc - s * ds;
			s = s * dc + c * ds;
			c = next;
		}
	}
}

/** Each sounding slot of the chart, in bar and slot order, where it starts and how long it lasts; and the bar starts. */
function slotsOf(bars: PadBar[]): {
	slots: { start: number; seconds: number; chord: Pitches }[];
	barStarts: number[];
} {
	const slots: { start: number; seconds: number; chord: Pitches }[] = [];
	const barStarts: number[] = [];
	let at = 0;
	for (const bar of bars) {
		barStarts.push(at);
		const slot = bar.seconds / bar.pads.length;
		for (const [k, chord] of bar.pads.entries())
			if (chord) slots.push({ start: at + k * slot, seconds: slot, chord });
		at += bar.seconds;
	}
	barStarts.push(at);
	return { slots, barStarts };
}

/**
 * The app's `renderChartPads`, whole: each bar's pads at its seconds, two
 * or more splitting the bar evenly, then peak-normalized. `barStarts` has
 * `bars.length + 1` entries, the last the render's end. Kept for the
 * streamed render's equality test and as §10's fallback.
 */
export function renderWhole(
	bars: PadBar[],
	sampleRate: number,
): { samples: Float32Array; barStarts: number[] } {
	const samples = new Float32Array(renderLength(bars, sampleRate));
	const { slots, barStarts } = slotsOf(bars);
	for (const { start, seconds, chord } of slots) addPad(samples, sampleRate, start, seconds, chord);
	let peak = 0;
	for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i] as number));
	if (peak > 0) for (let i = 0; i < samples.length; i++) samples[i] = (samples[i] as number) / peak;
	return { samples, barStarts };
}

/** One pad of the streamed render: its samples `[from, to)`, and each tone's step and phasor, carried across chunks. */
type Voice = {
	from: number;
	to: number;
	/** Per tone: `cos(w)`, `sin(w)`, then the phasor `c`, `s` at the next sample to render. */
	tones: Float64Array[];
};

/** The pads as voices, their phasors at their starts, from and to as `addPad` reckons them. */
function voicesOf(
	slots: { start: number; seconds: number; chord: Pitches }[],
	sampleRate: number,
	length: number,
): Voice[] {
	return slots.map(({ start, seconds, chord }) => {
		const from = Math.max(0, Math.floor(start * sampleRate));
		const to = Math.min(length, Math.floor((start + seconds) * sampleRate));
		const tones = tonesOf(chord).map((midi) => {
			const w = (2 * Math.PI * midiHz(midi)) / sampleRate;
			return Float64Array.of(Math.cos(w), Math.sin(w), Math.cos(w * from), Math.sin(w * from));
		});
		return { from, to, tones };
	});
}

/** One voice's samples within the chunk starting at `lo`, tone by tone, each phasor left where the chunk ends. */
function sound(out: Float32Array, lo: number, voice: Voice, attack: number): void {
	const begin = Math.max(voice.from, lo);
	const end = Math.min(voice.to, lo + out.length);
	for (let t = 0; t < voice.tones.length; t++) {
		const tone = voice.tones[t] as Float64Array;
		const dc = tone[0] as number;
		const ds = tone[1] as number;
		let c = tone[2] as number;
		let s = tone[3] as number;
		for (let i = begin; i < end; i++) {
			const n = i - voice.from;
			const env = (n < attack ? n / attack : 1) * 0.25;
			out[i - lo] = (out[i - lo] as number) + (s + 0.5 * s * c) * env;
			const next = c * dc - s * ds;
			s = s * dc + c * ds;
			c = next;
		}
		tone[2] = c;
		tone[3] = s;
	}
}

/** One pass of the render in chunks of `size`: each chunk zeroed, every voice sounding in it added in order, then `each`. */
function pass(
	bars: PadBar[],
	sampleRate: number,
	size: number,
	each: (chunk: Float32Array) => void,
): void {
	const length = renderLength(bars, sampleRate);
	const voices = voicesOf(slotsOf(bars).slots, sampleRate, length);
	const attack = Math.max(1, 0.02 * sampleRate);
	const buffer = new Float32Array(Math.min(size, length));
	let first = 0;
	for (let lo = 0; lo < length; lo += size) {
		const out = lo + size <= length ? buffer : buffer.subarray(0, length - lo);
		out.fill(0);
		while (first < voices.length && (voices[first] as Voice).to <= lo) first++;
		for (let v = first; v < voices.length; v++) {
			const voice = voices[v] as Voice;
			if (voice.from >= lo + out.length) break;
			if (voice.to > lo) sound(out, lo, voice, attack);
		}
		each(out);
	}
}

/**
 * The app's `renderChartPads`, streamed (design §10): pass 1 renders in
 * chunks to find the peak, pass 2 renders again and hands each chunk,
 * peak-normalized, to `sink`, in order. The chunk is reused: a sink that
 * keeps samples copies them. `chunk` (a whole number ≥ 1, default 65,536)
 * bounds every chunk's length; any other value takes the default. The
 * samples are `renderWhole`'s bit for bit; `barStarts` is its too.
 */
export function renderChartPads(
	bars: PadBar[],
	sampleRate: number,
	sink: (chunk: Float32Array) => void,
	chunk = CHUNK,
): { barStarts: number[] } {
	const size = Number.isInteger(chunk) && chunk >= 1 ? chunk : CHUNK;
	let peak = 0;
	pass(bars, sampleRate, size, (out) => {
		for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i] as number));
	});
	pass(bars, sampleRate, size, (out) => {
		if (peak > 0) for (let i = 0; i < out.length; i++) out[i] = (out[i] as number) / peak;
		sink(out);
	});
	return { barStarts: slotsOf(bars).barStarts };
}
