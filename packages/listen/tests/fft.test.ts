import { describe, expect, test } from "bun:test";
import { fft } from "../src/features/fft.js";
import { seeded } from "./helpers/seeded.js";

/** The DFT by its definition, in doubles. */
function naiveDft(re: Float32Array, im: Float32Array): [number[], number[]] {
	const n = re.length;
	const outRe: number[] = [];
	const outIm: number[] = [];
	for (let k = 0; k < n; k++) {
		let sr = 0;
		let si = 0;
		for (let t = 0; t < n; t++) {
			const angle = (-2 * Math.PI * k * t) / n;
			sr += (re[t] as number) * Math.cos(angle) - (im[t] as number) * Math.sin(angle);
			si += (re[t] as number) * Math.sin(angle) + (im[t] as number) * Math.cos(angle);
		}
		outRe.push(sr);
		outIm.push(si);
	}
	return [outRe, outIm];
}

describe("fft", () => {
	test("matches a naive DFT on 20 seeded inputs of 2 to 1,024 points, within 1e-4 × n", () => {
		const rand = seeded(7);
		for (let trial = 0; trial < 20; trial++) {
			const n = 2 ** (1 + Math.floor(rand() * 10));
			const re = Float32Array.from({ length: n }, () => rand() * 2 - 1);
			const im = Float32Array.from({ length: n }, () => rand() * 2 - 1);
			const [wantRe, wantIm] = naiveDft(re, im);
			fft(re, im);
			for (let k = 0; k < n; k++) {
				expect(Math.abs((re[k] as number) - (wantRe[k] as number))).toBeLessThanOrEqual(1e-4 * n);
				expect(Math.abs((im[k] as number) - (wantIm[k] as number))).toBeLessThanOrEqual(1e-4 * n);
			}
		}
	});

	test("covers every size from 2 to 1,024", () => {
		for (let n = 2; n <= 1024; n *= 2) {
			const re = new Float32Array(n);
			const im = new Float32Array(n);
			re[1] = 1;
			const [wantRe, wantIm] = naiveDft(re, im);
			fft(re, im);
			for (let k = 0; k < n; k++) {
				expect(Math.abs((re[k] as number) - (wantRe[k] as number))).toBeLessThanOrEqual(1e-4 * n);
				expect(Math.abs((im[k] as number) - (wantIm[k] as number))).toBeLessThanOrEqual(1e-4 * n);
			}
		}
	});
});
