import { describe, expect, test } from "bun:test";
import { audibleSpan } from "../src/features/sound.js";

const RATE = 22050;
const [FLOOR, WINDOW] = [0.02, 0.05];

describe("audibleSpan", () => {
	test("a silence-padded tone gives the tone's bounds within one window", () => {
		const samples = new Float32Array(5 * RATE);
		for (let i = 1.3 * RATE; i < 3.7 * RATE; i++)
			samples[i] = 0.5 * Math.sin((2 * Math.PI * 220 * i) / RATE);
		const { first, last } = audibleSpan(samples, RATE, FLOOR, WINDOW);
		expect(Math.abs(first - 1.3)).toBeLessThanOrEqual(0.05);
		expect(Math.abs(last - 3.7)).toBeLessThanOrEqual(0.05);
	});

	test("noise under the floor is not sound; silence gives 0 and the length", () => {
		const samples = Float32Array.from({ length: 2 * RATE }, (_, i) => (i % 2 ? 0.001 : -0.001));
		for (let i = 0.5 * RATE; i < RATE; i++)
			samples[i] = 0.5 * Math.sin((2 * Math.PI * 220 * i) / RATE);
		const span = audibleSpan(samples, RATE, FLOOR, WINDOW);
		expect(Math.abs(span.first - 0.5)).toBeLessThanOrEqual(0.05);
		expect(Math.abs(span.last - 1)).toBeLessThanOrEqual(0.05);
		expect(audibleSpan(new Float32Array(RATE), RATE, FLOOR, WINDOW)).toEqual({ first: 0, last: 1 });
	});
});
