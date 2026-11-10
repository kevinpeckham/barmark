/**
 * The onset envelope, ported from the app's `audio/chartAlignment.ts`
 * (`onsetRate`) and `audio/analysis.ts` (`splitMagnitudes`, `fluxOver`,
 * `onsetEnvelope`, `detrend`), arithmetic in the app's order so its
 * results are the app's bit for bit. The window, the hop, the decimation
 * and the half-second detrend are fixed, not options (design 5.3): a
 * change to what this computes bumps `FEATURES_VERSION`.
 *
 * It assumes a finite, validated rate and length; the stage entry points
 * guard them and refuse instead.
 */
import { fft } from "./fft.js";

/** The bench's rate, 22,050 Hz: Study 26c read its onset envelopes there. */
const BENCH_RATE = 22050;
/** The onset window, 2,048 samples. */
const FRAME = 2048;
/** 256 samples a frame: fine enough for the comb to land within a fraction of a bpm. */
const HOP = 256;

/**
 * The recording at about the bench's rate for its onsets: every `factor`
 * samples averaged, `factor` the whole number of times 22,050 Hz goes into
 * the rate (2 at 44.1 and 48 kHz, 1 below, which returns the input as it
 * is). The app's `onsetRate`.
 */
export function onsetRate(
	recording: Float32Array,
	sampleRate: number,
): { samples: Float32Array; rate: number } {
	const factor = Math.max(1, Math.floor(sampleRate / BENCH_RATE));
	if (factor === 1) return { samples: recording, rate: sampleRate };
	const samples = new Float32Array(Math.floor(recording.length / factor));
	for (let i = 0; i < samples.length; i++) {
		let sum = 0;
		for (let k = 0; k < factor; k++) sum += recording[i * factor + k] as number;
		samples[i] = sum / factor;
	}
	return { samples, rate: sampleRate / factor };
}

/**
 * The log magnitudes (`log1p(5·|X|)`) of two real frames' spectra from one
 * complex FFT: frame A went in as `re`, frame B as `im`, so the transform Z
 * splits as A[k] = (Z[k] + conj(Z[N−k])) / 2 and B[k] = (Z[k] − conj(Z[N−k])) / 2i.
 * Bins 0 to N/2 − 1 into `a` and `b`. The app's `splitMagnitudes`.
 */
function splitMagnitudes(re: Float32Array, im: Float32Array, a: Float32Array, b: Float32Array) {
	const n = re.length;
	for (let k = 0; k < a.length; k++) {
		const j = (n - k) % n;
		const [ar, ai] = [(re[k] as number) + (re[j] as number), (im[k] as number) - (im[j] as number)];
		const [br, bi] = [(im[k] as number) + (im[j] as number), (re[k] as number) - (re[j] as number)];
		a[k] = Math.log1p(5 * Math.sqrt(ar * ar + ai * ai));
		b[k] = Math.log1p(5 * Math.sqrt(br * br + bi * bi));
	}
}

/** The summed rise of each bin over the frame before (spectral flux). The app's `fluxOver`. */
function fluxOver(magnitude: Float32Array, previous: Float32Array): number {
	let flux = 0;
	for (let k = 0; k < magnitude.length; k++) {
		const rise = (magnitude[k] as number) - (previous[k] as number);
		if (rise > 0) flux += rise;
	}
	return flux;
}

/** A Hann window of `size` samples. */
function hann(size: number): Float32Array {
	const window = new Float32Array(size);
	for (let i = 0; i < size; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size);
	return window;
}

/**
 * Onset strength per frame of a mono signal, however long (spectral flux:
 * the summed rise of each bin's log magnitude over the frame before, a
 * 2048-sample Hann window every 256 samples), with its frames per second.
 * The frames are real, so they go through the FFT two at a time, one as
 * the real part and one as the imaginary (`splitMagnitudes`); a last odd
 * frame goes alone, with a zero partner. Fewer samples than a window give
 * no frames. The app's `onsetEnvelope`.
 */
export function onsetEnvelope(
	mono: Float32Array,
	sampleRate: number,
): { onset: Float32Array; fps: number } {
	const frames = Math.max(0, Math.floor((mono.length - FRAME) / HOP) + 1);
	const onset = new Float32Array(frames);
	const window = hann(FRAME);
	const re = new Float32Array(FRAME);
	const im = new Float32Array(FRAME);
	const bins = FRAME / 2;
	let previous = new Float32Array(bins);
	let first = new Float32Array(bins);
	let second = new Float32Array(bins);
	for (let t = 0; t < frames; t += 2) {
		const [a, b] = [t * HOP, (t + 1) * HOP];
		const paired = t + 1 < frames;
		for (let i = 0; i < FRAME; i++) {
			re[i] = (mono[a + i] as number) * (window[i] as number);
			im[i] = paired ? (mono[b + i] as number) * (window[i] as number) : 0;
		}
		fft(re, im);
		splitMagnitudes(re, im, first, second);
		onset[t] = fluxOver(first, previous);
		if (paired) onset[t + 1] = fluxOver(second, first);
		[previous, first, second] = paired ? [second, first, previous] : [first, previous, second];
	}
	return { onset, fps: sampleRate / HOP };
}

/**
 * Removes the slow trend from an onset envelope (a half-second running
 * mean) and rectifies it. The app's `detrend`.
 */
export function detrend(onset: Float32Array, fps: number): Float32Array {
	const out = new Float32Array(onset.length);
	const span = Math.max(1, Math.round(fps * 0.5));
	let sum = 0;
	for (let i = 0; i < onset.length; i++) {
		sum += onset[i] as number;
		if (i >= span) sum -= onset[i - span] as number;
		const mean = sum / Math.min(i + 1, span);
		out[i] = Math.max(0, (onset[i] as number) - mean);
	}
	return out;
}
