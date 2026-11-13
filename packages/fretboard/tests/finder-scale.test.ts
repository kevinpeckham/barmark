import { expect, test } from "bun:test";
import { findShapes } from "../src/finder.js";
import { vocabulary, wantNamed } from "./helpers/vocabulary.js";

const wants = vocabulary().map((v) => wantNamed(v.name));

function pass(cache: Map<string, ReturnType<typeof findShapes>>): number {
	const t = performance.now();
	for (const w of wants) findShapes(w, 10, cache);
	return performance.now() - t;
}

test("the finder over the whole vocabulary takes under 2,000 ms, and a warm pass a tenth of that", () => {
	const best = Math.min(...[0, 1, 2].map(() => pass(new Map())));
	expect(best).toBeLessThan(2000);
	const cache = new Map<string, ReturnType<typeof findShapes>>();
	const first = pass(cache);
	const warm = Math.min(...[0, 1, 2].map(() => pass(cache)));
	expect(warm).toBeLessThan(first / 10);
}, 60_000);
