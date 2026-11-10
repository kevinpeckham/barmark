import { chromaFrameCount, chromaWindow } from "../../src/features/chroma.js";
import { FEATURES_VERSION, type Features } from "../../src/features/index.js";

const RATE = 22050;

/**
 * A valid features record for synthetic tests: 22,050 Hz unless given,
 * `hopSec` and `fps` from the rate, a zero chroma and onset of the
 * duration's length unless given, sound from 0 to the duration at the
 * default floor and window. `partial` is laid over it.
 */
export function featuresOf(partial: Partial<Features> & { duration: number }): Features {
	const sampleRate = partial.sampleRate ?? RATE;
	const length = Math.round(partial.duration * sampleRate);
	const frames = partial.chroma
		? partial.chroma.length / 12
		: (partial.frames ?? chromaFrameCount(length, sampleRate));
	const factor = Math.max(1, Math.floor(sampleRate / RATE));
	const onsetFrames = Math.max(0, Math.floor((Math.floor(length / factor) - 2048) / 256) + 1);
	return {
		format: "barmark-listen-features",
		version: FEATURES_VERSION,
		sampleRate,
		chroma: new Float32Array(frames * 12),
		frames,
		hopSec: chromaWindow(sampleRate) / 2 / sampleRate,
		onset: new Float32Array(onsetFrames),
		fps: sampleRate / factor / 256,
		firstSound: 0,
		lastSound: partial.duration,
		sound: { floor: 0.02, windowSec: 0.05 },
		...partial,
	};
}
