import { describe, expect, test } from "bun:test";
import {
	chromaFrameCount,
	chromagram,
	chromaStream,
	chromaWindow,
} from "../src/features/chroma.js";
import { concat, silence, sine } from "./helpers/audio.js";
import { seeded } from "./helpers/seeded.js";

const RATE = 22050;
const RATES = [16000, 22050, 44100, 48000] as const;

/** The loudest pitch class of frame `f`. */
const peakOf = (chroma: Float32Array, f: number) => {
	const frame = [...chroma.subarray(f * 12, f * 12 + 12)];
	return frame.indexOf(Math.max(...frame));
};

describe("chromagram", () => {
	test("a pure A4 sine peaks at pitch class 9", () => {
		const { chroma, frames, hopSec } = chromagram(sine(440, 1, RATE), RATE);
		expect(hopSec).toBeCloseTo(2048 / RATE, 6);
		expect(chroma.length).toBe(frames * 12);
		expect(frames).toBeGreaterThan(0);
		for (let f = 0; f < frames; f++) expect(peakOf(chroma, f)).toBe(9);
	});

	test("the window is the bench's in seconds at other rates, a power of two", () => {
		expect(chromagram(new Float32Array(48000), 48000).hopSec).toBeCloseTo(4096 / 48000, 6);
		expect(chromagram(new Float32Array(44100), 44100).hopSec).toBeCloseTo(4096 / 44100, 6);
		expect(chromaWindow(22050)).toBe(4096);
		expect(chromaWindow(16000)).toBe(4096);
		expect(chromaWindow(44100)).toBe(8192);
		expect(chromaWindow(48000)).toBe(8192);
	});

	test("a sine at each of C3 to B3 peaks at its pitch class, at 16 to 48 kHz", () => {
		for (const rate of RATES)
			for (let pc = 0; pc < 12; pc++) {
				const hz = 440 * 2 ** ((48 + pc - 69) / 12);
				const { chroma, frames } = chromagram(sine(hz, 1, rate, 0.5), rate);
				expect(frames).toBeGreaterThan(0);
				for (let f = 0; f < frames; f++) expect(peakOf(chroma, f)).toBe(pc);
			}
	});

	test("a silent frame stays all zero", () => {
		const { chroma, frames } = chromagram(concat(silence(1, RATE), sine(440, 1, RATE)), RATE);
		expect(frames).toBeGreaterThan(4);
		expect([...chroma.subarray(0, 12)]).toEqual(new Array(12).fill(0));
		expect(chroma.subarray((frames - 1) * 12).some((v) => v > 0)).toBe(true);
	});
});

describe("chromaFrameCount", () => {
	// 200 chromagrams of up to 200,000 samples: a few seconds.
	test("equals chromagram's frames for 200 seeded lengths and rates", { timeout: 30_000 }, () => {
		const rand = seeded(11);
		for (let trial = 0; trial < 200; trial++) {
			const length = Math.floor(rand() * 200_001);
			const rate = RATES[Math.floor(rand() * RATES.length)] as number;
			expect(chromaFrameCount(length, rate)).toBe(
				chromagram(new Float32Array(length), rate).frames,
			);
		}
	});

	test("the edges: nothing below a window, one at a window, two at a window and a hop", () => {
		const win = chromaWindow(RATE);
		expect(chromaFrameCount(0, RATE)).toBe(0);
		expect(chromaFrameCount(win - 1, RATE)).toBe(0);
		expect(chromaFrameCount(win, RATE)).toBe(1);
		expect(chromaFrameCount(win + win / 2 - 1, RATE)).toBe(1);
		expect(chromaFrameCount(win + win / 2, RATE)).toBe(2);
	});
});

describe("chromaStream", () => {
	test("fed in seeded chunks of 1 to 9,000 samples, it gives chromagram's chroma bit for bit", () => {
		const rand = seeded(5);
		for (const rate of RATES) {
			const noise = Float32Array.from({ length: 3 * rate }, () => 0.1 * (rand() * 2 - 1));
			const samples = concat(
				sine(196, 2, rate, 0.4),
				noise,
				silence(0.5, rate),
				sine(330, 1.3, rate),
			);
			const whole = chromagram(samples, rate);
			const stream = chromaStream(rate, samples.length);
			for (let at = 0; at < samples.length; ) {
				const size = 1 + Math.floor(rand() * 9000);
				stream.push(samples.subarray(at, at + size));
				at += size;
			}
			const streamed = stream.finish();
			expect(streamed.frames).toBe(whole.frames);
			expect(streamed.hopSec).toBe(whole.hopSec);
			expect(streamed.chroma).toEqual(whole.chroma);
		}
	});

	test("a stream shorter than a window gives no frames", () => {
		const stream = chromaStream(RATE, 100);
		stream.push(new Float32Array(100));
		const { chroma, frames } = stream.finish();
		expect(frames).toBe(0);
		expect(chroma.length).toBe(0);
	});
});
