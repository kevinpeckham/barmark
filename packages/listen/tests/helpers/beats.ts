/**
 * Beat readings for the tracker tests, from the app's test helpers
 * (`trackerBarGrid.test.ts`'s `reading`, `beatThisGrid.test.ts`'s `grid`).
 */

/**
 * A reading with one bar per entry of `counts` (that many beats a bar, a
 * beat every `beat` seconds), each downbeat among the beats, a last
 * downbeat where the last bar ends, and `tail` seconds of audio after it.
 */
export function reading(
	counts: number[],
	tail = 0,
	beat = 0.5,
): { beats: number[]; downbeats: number[]; duration: number } {
	const beats: number[] = [];
	const downbeats: number[] = [];
	let t = 0;
	for (const n of counts) {
		downbeats.push(t);
		for (let k = 0; k < n; k++) beats.push(t + k * beat);
		t += n * beat;
	}
	downbeats.push(t);
	beats.push(t);
	return { beats, downbeats, duration: t + tail };
}

/** `bars` bars of `perBar` beats at `bpm`, with a final downbeat closing the last bar. */
export function evenBeats(
	bpm: number,
	perBar: number,
	bars: number,
): { beats: number[]; downbeats: number[] } {
	const beats = Array.from({ length: perBar * bars + 1 }, (_, i) => (i * 60) / bpm);
	const downbeats = beats.filter((_, i) => i % perBar === 0);
	return { beats, downbeats };
}

/** A reading with `n` beats, `beat` apart, before its first downbeat: every time and the duration shifted later by `n × beat`. */
export function lead(
	r: { beats: number[]; downbeats: number[]; duration: number },
	n: number,
	beat = 0.5,
): { beats: number[]; downbeats: number[]; duration: number } {
	const shift = n * beat;
	const before = Array.from({ length: n }, (_, i) => i * beat);
	return {
		beats: [...before, ...r.beats.map((t) => t + shift)],
		downbeats: r.downbeats.map((t) => t + shift),
		duration: r.duration + shift,
	};
}
