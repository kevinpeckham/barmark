/** Import's scale (Review Focus 6): linear time, and the 500,000-note bound. */
import { expect, test } from "bun:test";
import { importMidi } from "../src/index.js";
import { type Event, smf } from "./helpers/smf.js";

// The ratio is of best-of-three timings; the timeout only keeps a loaded machine from cutting a run short.
const TIMEOUT = 180_000;
const PPQ = 480;

/** Eight chords of five notes: a bass and four above. */
const CHORDS = [
	[36, 60, 64, 67, 72],
	[41, 60, 65, 69, 72],
	[43, 62, 67, 71, 74],
	[45, 60, 64, 69, 72],
	[38, 62, 65, 69, 72],
	[40, 64, 67, 71, 76],
	[46, 62, 65, 70, 74],
	[40, 62, 64, 68, 71],
];

/** `bars` bars of `meter`, `perBar` even chords a bar, cycling through `sounds`. */
function file(
	bars: number,
	meter: [number, number],
	perBar: number,
	sounds: number[][],
	more: Event[][] = [],
) {
	const length = (4 * PPQ * meter[0]) / meter[1] / perBar;
	const notes: Event[] = [];
	for (let k = 0; k < bars * perBar; k++) {
		const pitches = sounds[k % sounds.length] as number[];
		for (const p of pitches) notes.push({ dt: 0, on: [0, p, 80] });
		for (const [i, p] of pitches.entries()) notes.push({ dt: i === 0 ? length : 0, off: [0, p] });
	}
	const conductor: Event[] = [
		{ dt: 0, tempo: 120 },
		{ dt: 0, time: meter },
	];
	return smf({ format: 1, ppq: PPQ, running: true, tracks: [conductor, notes, ...more] });
}

/** Ten-note sounds, every one different (a bass and two to nine pitch classes above): the hostile file of spec 5.5. */
function differentSounds(count: number): number[][] {
	const out: number[][] = [];
	for (let mask = 1; mask < 4096 && out.length < count; mask++) {
		const pcs = [...Array(12).keys()].filter((pc) => mask & (1 << pc));
		if (pcs.length < 2 || pcs.length > 9) continue;
		for (let bass = 0; bass < 12 && out.length < count; bass++) {
			if (pcs.includes(bass)) continue;
			const upper = pcs.map((pc) => 60 + pc);
			while (upper.length < 9) upper.push((upper[upper.length - pcs.length] as number) + 12);
			out.push([24 + bass, ...upper]);
		}
	}
	return out;
}

/** The best of three imports of `bytes`, after one small one to warm up. */
function timed(bytes: Uint8Array): number {
	importMidi(file(4, [4, 4], 4, CHORDS));
	let ms = Number.POSITIVE_INFINITY;
	for (let run = 0; run < 3; run++) {
		const start = performance.now();
		const r = importMidi(bytes);
		ms = Math.min(ms, performance.now() - start);
		expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
	}
	return ms;
}

test(
	"900 bars and 18,000 notes, then 9,000 bars and 180,000 notes, import in linear time",
	() => {
		const small = timed(file(900, [4, 4], 4, CHORDS));
		const large = timed(file(9000, [4, 4], 4, CHORDS));
		// Ten times the notes and bars, at most twenty times as long.
		expect(large / small).toBeLessThan(20);
	},
	TIMEOUT,
);

test(
	"500,000 notes of different sounds import, past the 20,000 names as ?",
	() => {
		// 10,000 bars of 5/4, five ten-note chords a bar (500,000 notes, the bound), each a sound not heard before
		const bytes = file(10_000, [5, 4], 5, differentSounds(50_000));
		const start = performance.now();
		const r = importMidi(bytes);
		const ms = performance.now() - start;
		expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
		expect(r.diagnostics.map((d) => d.code)).toContain("chord-unnamed");
		expect(r.text).toContain("?");
		// measured at 15 s on the VM (Task 13b report); the bound only catches a blow-up
		expect(ms).toBeLessThan(90_000);
	},
	TIMEOUT,
);

test(
	"500,001 notes is too-large",
	() => {
		// 10,000 bars of five-note chords on eighths, 500,000 notes, and one more on a track of its own
		const one: Event[] = [
			{ dt: 0, on: [1, 48, 80] },
			{ dt: PPQ, off: [1, 48] },
		];
		const r = importMidi(file(10_000, [5, 4], 10, CHORDS, [one]));
		expect(r.text).toBe("");
		expect(r.diagnostics.map((d) => [d.code, d.message])).toEqual([
			["too-large", "the file has more than 500,000 notes, the most import reads"],
		]);
	},
	TIMEOUT,
);
