/**
 * The chromagram, ported from the app's `audio/chartAlignment.ts`
 * (`chromaWindow`, `chromagram`, and the flattening of
 * `recordingFeatures`), each frame's arithmetic in the app's order (Hann
 * multiply, `fft`, the bins summed into a `Float32Array(12)` with
 * `Math.hypot`, then the norm), so its frames are the app's bit for bit.
 * The window, the hop and the 55 to 2,200 Hz band are fixed, not options
 * (design 5.3): a change to what this computes bumps `FEATURES_VERSION`.
 *
 * Like every kernel here, it assumes a finite, validated rate and length
 * (`new Float32Array` throws a RangeError on a rate of 0 or Infinity, or an
 * infinite length); the stage entry points guard them and refuse instead.
 */
import { fft } from "./fft.js";

/** The bench's chroma window, 4,096 samples at 22,050 Hz (about 0.186 s); the hop is half of it. */
const BENCH_RATE = 22050;
const BENCH_WINDOW = 4096;
const LOW_HZ = 55;
const HIGH_HZ = 2200;

/** A chromagram: `frames` frames of 12 pitch-class energies, C first, flattened. */
export type Chromagram = { chroma: Float32Array; frames: number; hopSec: number };

/**
 * The window at a rate: the bench's length in seconds, rounded to the
 * nearest power of two (in octaves). The app's `chromaWindow`.
 */
export function chromaWindow(sampleRate: number): number {
	return 2 ** Math.round(Math.log2((BENCH_WINDOW * sampleRate) / BENCH_RATE));
}

/**
 * The frames `chromagram` makes of `length` samples at `sampleRate`, by
 * arithmetic alone (design 10): `length < win ? 0 : floor((length − win) / hop) + 1`.
 */
export function chromaFrameCount(length: number, sampleRate: number): number {
	const win = chromaWindow(sampleRate);
	const hop = win / 2;
	return length < win ? 0 : Math.floor((length - win) / hop) + 1;
}

/** What every frame at one rate shares: the window, the band and each bin's pitch class. */
type Kernel = {
	win: number;
	hann: Float32Array;
	re: Float32Array;
	im: Float32Array;
	minBin: number;
	maxBin: number;
	pcOf: Int8Array;
};

function kernelAt(sampleRate: number): Kernel {
	const win = chromaWindow(sampleRate);
	const hann = new Float32Array(win);
	for (let i = 0; i < win; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / win);
	const minBin = Math.max(1, Math.floor((LOW_HZ * win) / sampleRate));
	const maxBin = Math.min(win / 2 - 1, Math.ceil((HIGH_HZ * win) / sampleRate));
	const pcOf = new Int8Array(maxBin + 1);
	for (let bin = minBin; bin <= maxBin; bin++) {
		const midi = 69 + 12 * Math.log2((bin * sampleRate) / win / 440);
		pcOf[bin] = ((Math.round(midi) % 12) + 12) % 12;
	}
	const [re, im] = [new Float32Array(win), new Float32Array(win)];
	return { win, hann, re, im, minBin, maxBin, pcOf };
}

/** One frame of `win` samples from `samples[0]`, as the app's `chromagram` computes it. */
function chromaFrame(k: Kernel, samples: Float32Array): Float32Array {
	const { win, hann, re, im, minBin, maxBin, pcOf } = k;
	for (let i = 0; i < win; i++) {
		re[i] = (samples[i] as number) * (hann[i] as number);
		im[i] = 0;
	}
	fft(re, im);
	const chroma = new Float32Array(12);
	for (let bin = minBin; bin <= maxBin; bin++) {
		const pc = pcOf[bin] as number;
		chroma[pc] = (chroma[pc] as number) + Math.hypot(re[bin] as number, im[bin] as number);
	}
	const norm = Math.hypot(...chroma);
	if (norm > 1e-9) for (let c = 0; c < 12; c++) chroma[c] = (chroma[c] as number) / norm;
	return chroma;
}

/** Feeds samples to a chromagram as they arrive (`chromaStream`). */
export type ChromaStream = {
	/** The next samples, in order. Samples past the stream's declared length are ignored. */
	push(chunk: Float32Array): void;
	/**
	 * The chromagram of every sample pushed. A stream that ends early, short
	 * of its declared length, is trimmed to the frames its samples filled.
	 */
	finish(): Chromagram;
};

/**
 * The frames of `chromagram`, computed as the samples arrive: `length`
 * samples in all at `sampleRate`, flattened 12 a frame into a buffer of
 * `chromaFrameCount(length, sampleRate) × 12`. It keeps only the last
 * window of samples, so a long render need never exist whole (design 10).
 */
export function chromaStream(sampleRate: number, length: number): ChromaStream {
	const kernel = kernelAt(sampleRate);
	const { win } = kernel;
	const hop = win / 2;
	const capacity = chromaFrameCount(length, sampleRate);
	const chroma = new Float32Array(capacity * 12);
	const window = new Float32Array(win);
	let filled = 0;
	let frames = 0;
	return {
		push(chunk) {
			for (let at = 0; at < chunk.length && frames < capacity; ) {
				const take = Math.min(win - filled, chunk.length - at);
				window.set(chunk.subarray(at, at + take), filled);
				filled += take;
				at += take;
				if (filled < win) continue;
				chroma.set(chromaFrame(kernel, window), frames * 12);
				frames++;
				window.copyWithin(0, hop, win);
				filled = hop;
			}
		},
		finish() {
			const out = frames === capacity ? chroma : chroma.slice(0, frames * 12);
			return { chroma: out, frames, hopSec: hop / sampleRate };
		},
	};
}

/**
 * Twelve pitch-class energies per frame (the bench's `chromagram`): a Hann
 * window of about 0.19 s, hop half that, spectrum magnitudes from 55 to
 * 2,200 Hz folded to the nearest pitch class, each frame L2-normalized (a
 * silent frame stays zero), flattened 12 a frame. The window is the
 * bench's in seconds at any rate, so a render and a recording at the same
 * rate share `hopSec`. The app's `chromagram`, flattened as its
 * `recordingFeatures` does.
 */
export function chromagram(samples: Float32Array, sampleRate: number): Chromagram {
	const stream = chromaStream(sampleRate, samples.length);
	stream.push(samples);
	return stream.finish();
}
