import { describe, expect, test } from "bun:test";
import { fft } from "../src/features/fft.js";
import { detrend, onsetEnvelope, onsetFrameCount, onsetRate } from "../src/features/onset.js";
import { seeded } from "./helpers/seeded.js";

const RATE = 22050;
const [FRAME, HOP] = [2048, 256];

/**
 * The envelope one frame per FFT, each frame alone with a zero imaginary
 * part, as the app's was before the pairing. The paired split's magnitudes
 * are twice the frame's, so `log1p(5·|2X|)` there is `log1p(10·|X|)` here.
 */
function reference(mono: Float32Array): Float32Array {
	const frames = Math.max(0, Math.floor((mono.length - FRAME) / HOP) + 1);
	const out = new Float32Array(frames);
	let previous = new Float64Array(FRAME / 2);
	for (let t = 0; t < frames; t++) {
		const re = new Float32Array(FRAME);
		const im = new Float32Array(FRAME);
		for (let i = 0; i < FRAME; i++)
			re[i] = (mono[t * HOP + i] as number) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FRAME));
		fft(re, im);
		const magnitude = Float64Array.from({ length: FRAME / 2 }, (_, b) =>
			Math.log1p(10 * Math.hypot(re[b] as number, im[b] as number)),
		);
		let flux = 0;
		for (let b = 0; b < FRAME / 2; b++)
			flux += Math.max(0, (magnitude[b] as number) - (previous[b] as number));
		out[t] = flux;
		previous = magnitude;
	}
	return out;
}

/** Ten seconds of quiet seeded noise with a click every quarter second. */
function noiseWithClicks(): Float32Array {
	const rand = seeded(3);
	const signal = Float32Array.from({ length: 10 * RATE }, () => 0.05 * (rand() * 2 - 1));
	for (let at = 0; at < signal.length; at += Math.round(RATE / 4))
		for (let i = 0; i < 300 && at + i < signal.length; i++)
			signal[at + i] = (signal[at + i] as number) + (rand() * 2 - 1) * (1 - i / 300);
	return signal;
}

describe("onsetEnvelope", () => {
	test("two frames per FFT match one frame per FFT within 4e-6, odd and even frame counts", () => {
		const signal = noiseWithClicks();
		const odd = signal.subarray(0, FRAME + 2 * HOP * 420);
		const even = signal.subarray(0, odd.length + HOP);
		for (const [mono, count] of [
			[odd, 841],
			[even, 842],
			[signal, Math.floor((signal.length - FRAME) / HOP) + 1],
		] as const) {
			const want = reference(mono);
			const { onset } = onsetEnvelope(mono, RATE);
			expect(want.length).toBe(count);
			expect(onset.length).toBe(count);
			for (let t = 0; t < want.length; t++)
				expect(Math.abs((onset[t] as number) - (want[t] as number))).toBeLessThanOrEqual(
					4e-6 * Math.abs(want[t] as number),
				);
		}
	});

	test("an odd frame count ends with the lone frame", () => {
		const mono = noiseWithClicks().subarray(0, FRAME + 2 * HOP * 3);
		const { onset } = onsetEnvelope(mono, RATE);
		const want = reference(mono);
		expect(onset.length).toBe(7);
		expect(onset[6] as number).toBeGreaterThan(0);
		expect(Math.abs((onset[6] as number) - (want[6] as number))).toBeLessThanOrEqual(
			4e-6 * (want[6] as number),
		);
	});

	test("fewer samples than a frame give no frames, at the rate over 256", () => {
		for (const length of [0, 1, FRAME - 1]) {
			const { onset, fps } = onsetEnvelope(new Float32Array(length), RATE);
			expect(onset.length).toBe(0);
			expect(fps).toBe(RATE / 256);
		}
		expect(onsetEnvelope(new Float32Array(FRAME), RATE).onset.length).toBe(1);
	});
});

describe("onsetRate", () => {
	test("44.1 and 48 kHz are halved, each pair averaged", () => {
		for (const [rate, half] of [
			[44100, 22050],
			[48000, 24000],
		] as const) {
			const input = Float32Array.from([1, 3, -2, 4, 5]);
			const { samples, rate: out } = onsetRate(input, rate);
			expect(out).toBe(half);
			expect([...samples]).toEqual([2, 1]);
		}
	});

	test("22,050 and 16,000 Hz come back as they are", () => {
		for (const rate of [22050, 16000]) {
			const input = Float32Array.from([1, 2, 3]);
			const result = onsetRate(input, rate);
			expect(result.rate).toBe(rate);
			expect(result.samples).toBe(input);
		}
	});
});

describe("detrend", () => {
	test("a constant envelope detrends to zero, an empty one to empty", () => {
		const flat = detrend(new Float32Array(500).fill(3), 100);
		expect(flat.every((v) => v === 0)).toBe(true);
		expect(detrend(new Float32Array(0), 100).length).toBe(0);
	});

	test("a spike above the half-second mean stands out, rectified elsewhere", () => {
		const onset = new Float32Array(200);
		onset[100] = 50;
		const out = detrend(onset, 100);
		expect(out[100]).toBeCloseTo(50 - 50 / 50, 5);
		expect(out[101]).toBe(0);
	});
});

describe("onsetFrameCount", () => {
	test("equals the decimated envelope's frames for seeded lengths at 8 to 96 kHz", () => {
		const rand = seeded(3);
		for (const rate of [8000, 22050, 44100, 48000, 96000])
			for (let trial = 0; trial < 40; trial++) {
				const length = Math.floor(rand() * 20_000);
				const { samples, rate: r } = onsetRate(new Float32Array(length), rate);
				expect(onsetFrameCount(length, rate)).toBe(onsetEnvelope(samples, r).onset.length);
			}
	});
});
