import type { Performance } from "../../src/perform/types.js";

/** A track's notes as `[pitch, at, length, velocity]`, times as numbers, sorted by `at` then pitch. */
export function notesOf(p: Performance, track = 0): [number, number, number, number][] {
	return (p.tracks[track]?.notes ?? [])
		.map((n): [number, number, number, number] => [
			n.pitch,
			n.at.n / n.at.d,
			n.length.n / n.length.d,
			n.velocity,
		])
		.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}
