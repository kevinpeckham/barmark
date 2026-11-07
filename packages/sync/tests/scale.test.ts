import { expect, test } from "bun:test";
import { chartFromDetections } from "../src/build/build.js";

const LABELS = ["C:maj", "G:maj", "A:min", "F:maj"];

/** `bars` bars of 2 s with `frames` frame-based runs spread over them. */
function detections(bars: number, frames: number) {
	const frameSec = (bars * 2) / frames;
	return {
		grid: { bars: Array.from({ length: bars + 1 }, (_, i) => i * 2) },
		meter: "4/4",
		chords: {
			frameSec,
			runs: Array.from({ length: frames }, (_, i) => ({
				start: i,
				end: i + 1,
				label: LABELS[Math.floor(i / 7) % LABELS.length] as string,
			})),
		},
	};
}

/** The best of three runs, after a warm-up, so a busy machine's pause isn't counted. */
function timed(bars: number, frames: number): number {
	Bun.gc(true);
	const d = detections(bars, frames);
	chartFromDetections(detections(4, 40));
	let ms = Number.POSITIVE_INFINITY;
	for (let run = 0; run < 3; run++) {
		const start = performance.now();
		chartFromDetections(d);
		ms = Math.min(ms, performance.now() - start);
	}
	return ms;
}

test("the build is linear", () => {
	// Ten times the bars and runs may cost at most 20 times as long; a quadratic path costs 100.
	expect(timed(1000, 50_000) / timed(100, 5000)).toBeLessThan(20);
}, 30_000);
