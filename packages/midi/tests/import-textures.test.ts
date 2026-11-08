/**
 * Import's chords from textures export never writes (Task 12 fix round 3):
 * hand-built notes, written as a Standard MIDI File and imported. Each
 * plays `| C | F | G | C |` (or a ii-V-I) and must come back as written.
 */
import { describe, expect, test } from "bun:test";
import type { Note } from "../src/import/notes.js";
import { importMidi } from "../src/index.js";
import { type SmfEvent, TIME } from "../src/smf/types.js";
import { writeSmf } from "../src/smf/write.js";

const Q = 480;
const E = 240;
const [C2, D2, E2, F2, G2, A2, B2] = [36, 38, 40, 41, 43, 45, 47];
const [C3, D3, E3, F3, G3, A3, B3] = [48, 50, 52, 53, 55, 57, 59];
const [C4, D4, E4, F4, G4, A4, B4] = [60, 62, 64, 65, 67, 69, 71];
const [C5, D5] = [72, 74];

/** A note on track 1 (the chords) or 2 (a bass track). */
const n = (pitch: number, start: number, end: number, track = 1): Note => ({
	track,
	channel: track - 1,
	pitch,
	start,
	end,
});
const ch = (pitches: number[], start: number, end: number) => pitches.map((p) => n(p, start, end));
const bs = (pitch: number, start: number, end: number) => n(pitch, start, end, 2);

/** The notes as a file in `meter`, imported: its bar lines, joined. */
function bars(notes: Note[], meter: [number, number] = [4, 4]): string {
	const tracks: SmfEvent[][] = [
		[
			{
				tick: 0,
				kind: "meta",
				type: TIME,
				data: Uint8Array.from([meter[0], Math.log2(meter[1]), 24, 8]),
			},
		],
	];
	for (const t of [...new Set(notes.map((x) => x.track))].sort()) {
		const events: SmfEvent[] = notes
			.filter((x) => x.track === t)
			.flatMap((x): SmfEvent[] => [
				{ tick: x.start, kind: "on", channel: x.channel, pitch: x.pitch, velocity: 90 },
				{ tick: x.end, kind: "off", channel: x.channel, pitch: x.pitch, velocity: 0 },
			])
			.sort((a, b) => a.tick - b.tick || (a.kind === "off" ? -1 : 1));
		tracks.push(events);
	}
	return importMidi(writeSmf({ format: 1, ppq: 480, tracks }))
		.text.split("\n")
		.filter((l) => l.startsWith("|"))
		.join(" ")
		.replaceAll(" | |", " |");
}

/** `| C | F | G | C |`: each bar's root (bass register) and triad (chord register). */
const CFGC: [number, number[]][] = [
	[C2, [C4, E4, G4]],
	[F2, [F3, A3, C4]],
	[G2, [G3, B3, D4]],
	[C2, [C4, E4, G4]],
];
/** Each bar of `CFGC` played by `bar(root, triad, start)`, `length` ticks apart. */
const play = (length: number, bar: (root: number, triad: number[], at: number) => Note[]) =>
	CFGC.flatMap(([root, triad], i) => bar(root, triad, i * length));

describe("bass on the downbeat, the chord after it", () => {
	const waltz = (track: number) => (root: number, triad: number[], at: number) => [
		n(root, at, at + Q, track),
		...ch(triad, at + Q, at + 2 * Q),
		...ch(triad, at + 2 * Q, at + 3 * Q),
	];

	test("waltz, boom-chick-chick: bass track and one track", () => {
		expect(bars(play(3 * Q, waltz(2)), [3, 4])).toBe("| C | F | G | C |");
		expect(bars(play(3 * Q, waltz(1)), [3, 4])).toBe("| C | F | G | C |");
	});

	test("waltz with the last chick ringing past the bar line (up to a 16th)", () => {
		const legato = (track: number) => (root: number, triad: number[], at: number) => [
			n(root, at, at + Q, track),
			...ch(triad, at + Q, at + 2 * Q),
			...ch(triad, at + 2 * Q, at + 3 * Q + 110),
		];
		expect(bars(play(3 * Q, legato(2)), [3, 4])).toBe("| C | F | G | C |");
		expect(bars(play(3 * Q, legato(1)), [3, 4])).toBe("| C | F | G | C |");
	});

	test("boom-chick 4/4: root, chord, fifth, chord; bass track and one track", () => {
		const boom = (track: number) => (root: number, triad: number[], at: number) => [
			n(root, at, at + Q, track),
			...ch(triad, at + Q, at + 2 * Q),
			n(root + 7, at + 2 * Q, at + 3 * Q, track),
			...ch(triad, at + 3 * Q, at + 4 * Q),
		];
		expect(bars(play(4 * Q, boom(2)))).toBe("| C | F | G | C |");
		expect(bars(play(4 * Q, boom(1)))).toBe("| C | F | G | C |");
	});

	test("ballad: the bass a whole note, the chord on the and of 1; bass track and one track", () => {
		const ballad = (track: number) => (root: number, triad: number[], at: number) => [
			n(root, at, at + 4 * Q, track),
			...ch(triad, at + E, at + 4 * Q),
		];
		expect(bars(play(4 * Q, ballad(2)))).toBe("| C | F | G | C |");
		expect(bars(play(4 * Q, ballad(1)))).toBe("| C | F | G | C |");
	});

	test("reggae skank: chords on the off-beat eighths only, over a whole-note bass", () => {
		const skank = (root: number, triad: number[], at: number) => [
			bs(root, at, at + 4 * Q),
			...[0, 1, 2, 3].flatMap((k) => ch(triad, at + k * Q + E, at + k * Q + E + 120)),
		];
		expect(bars(play(4 * Q, skank))).toBe("| C | F | G | C |");
		// the same chord two bars over the bass's root, then its fifth: the slash from the bar line
		const same = [...skank(C2, [C4, E4, G4], 0), ...skank(G2, [C4, E4, G4], 4 * Q)];
		expect(bars(same)).toBe("| C | C/G |");
	});

	test("stride: root on 1, chord on 2, fifth on 3, chord on 4, one track", () => {
		const stride = (root: number, triad: number[], at: number) => [
			n(root, at, at + Q),
			...ch(
				triad.map((p) => (p >= C4 ? p - 12 : p)),
				at + Q,
				at + 2 * Q,
			),
			n(root + 7, at + 2 * Q, at + 3 * Q),
			...ch(
				triad.map((p) => (p >= C4 ? p - 12 : p)),
				at + 3 * Q,
				at + 4 * Q,
			),
		];
		expect(bars(play(4 * Q, stride))).toBe("| C | F | G | C |");
	});

	test("jazz: off-beat stabs on the and of 1 and 3 over a walking bass, ii-V-I", () => {
		const walk = [D2, F2, A2, C3, G2, B2, D3, F3, C2, E2, G2, A2, C2, E2, G2, A2];
		const shapes = [
			[F4, A4, C5],
			[F4, B4, D5],
			[E4, G4, B4],
			[E4, G4, B4],
		];
		const notes = [
			...walk.map((p, i) => bs(p, i * Q, (i + 1) * Q)),
			...shapes.flatMap((s, b) => [
				...ch(s, b * 4 * Q + E, b * 4 * Q + Q),
				...ch(s, b * 4 * Q + 2 * Q + E, b * 4 * Q + 3 * Q),
			]),
		];
		expect(bars(notes)).toBe("| Dm7 | G7 | Cmaj7 | / |");
	});
});

describe("broken chords and strums", () => {
	test("Alberti bass under a held right-hand chord", () => {
		const alberti = (root: number, triad: number[], at: number) => {
			const [r, t, f] = [root + 12, (triad[0] as number) % 12, root + 19];
			const third = 48 + ((t - (root % 12) + 12) % 12 === 0 ? (triad[1] as number) % 12 : t);
			return [
				...[r, f, third, f, r, f, third, f].map((p, k) => n(p, at + k * E, at + (k + 1) * E)),
				...ch(
					triad.map((p) => (p < C4 ? p + 12 : p)),
					at,
					at + 4 * Q,
				),
			];
		};
		expect(bars(play(4 * Q, alberti))).toBe("| C | F | G | C |");
	});

	test("a strum, down down-up up-up down-up, open voicings with top-string up-strokes", () => {
		const shapes: [number[], number[]][] = [
			[
				[C3, E3, G3, C4, E4],
				[G3, C4, E4],
			],
			[
				[F2, C3, F3, A3, C4, F4],
				[A3, C4, F4],
			],
			[
				[G2, B2, D3, G3, B3, G4],
				[G3, B3, G4],
			],
			[
				[C3, E3, G3, C4, E4],
				[G3, C4, E4],
			],
		];
		const strum = ([full, top]: [number[], number[]], at: number) => [
			...ch(full, at, at + Q),
			...ch(full, at + Q, at + Q + E),
			...ch(top, at + Q + E, at + 2 * Q),
			...ch(top, at + 2 * Q, at + 2 * Q + E),
			...ch(top, at + 2 * Q + E, at + 3 * Q),
			...ch(full, at + 3 * Q, at + 3 * Q + E),
			...ch(top, at + 3 * Q + E, at + 4 * Q),
		];
		expect(bars(shapes.flatMap((s, i) => strum(s, i * 4 * Q)))).toBe("| C | F | G | C |");
	});
});

describe("doublings and rests", () => {
	test("a pitch class weighs its time once, however many octaves double it", () => {
		// LH octaves G2 G3 under RH B3 D4 G4: G, not {G}
		expect(bars([n(G2, 0, 4 * Q), n(G3, 0, 4 * Q), ...ch([B3, D4, G4], 0, 2 * Q)])).toBe("| G |");
	});

	test("while the voices rest, the bass walking alone starts no chord", () => {
		const walk = [C2, E2, G2, A2, D2, F2, A2, C3, G2, B2, D3, F3];
		const notes = [
			...walk.map((p, i) => bs(p, i * Q, (i + 1) * Q)),
			...ch([C4, E4, G4], 0, 4 * Q),
			...ch([G3, B3, D4], 8 * Q, 9 * Q),
		];
		expect(bars(notes)).toBe("| C | / | G |");
	});

	test("a bass with double stops is no bass line, but its notes are still the bass", () => {
		// C2 and G2 together on each beat 1, then E2 G2 A2: under a held E4 G4 B4, Cmaj7
		const line = (at: number) => [
			bs(C2, at, at + Q),
			bs(G2, at, at + Q),
			bs(E2, at + Q, at + 2 * Q),
			bs(G2, at + 2 * Q, at + 3 * Q),
			bs(A2, at + 3 * Q, at + 4 * Q),
		];
		expect(bars([...line(0), ...line(4 * Q), ...ch([E4, G4, B4], 0, 8 * Q)])).toBe("| Cmaj7 | / |");
	});

	test("one track: a note struck between stabs inside a close chord's span is no bass", () => {
		// C a bar, D4 alone on bar 2's downbeat, C struck again on beat 2: one C
		const stabs = [
			...ch([C4, E4, G4], 0, 4 * Q),
			n(D4, 4 * Q, 5 * Q),
			...ch([C4, E4, G4], 5 * Q, 6 * Q),
		];
		expect(bars(stabs)).toBe("| C | / N.C. |");
	});

	test("the voices' legato tail past the bar line, then the bass alone: no new chord", () => {
		const tail = [...ch([C4, E4, G4], 0, 4 * Q + 60), bs(C2, 0, 4 * Q), bs(F2, 4 * Q, 8 * Q)];
		expect(bars(tail)).toBe("| C | / |");
	});

	test("one chord comped over a held bass note: a thinner re-strike carries", () => {
		// LH C3 held; RH C E G on 1, E G B on 2 (B added: Cmaj7), E G on 3, E G B on 4
		const comp = [
			n(C3, 0, 4 * Q),
			...ch([C4, E4, G4], 0, 4 * Q),
			...ch([E4, G4, B4], Q, 2 * Q),
			...ch([E4, G4], 2 * Q, 3 * Q),
			...ch([E4, G4, B4], 3 * Q, 4 * Q),
		];
		expect(bars(comp)).toBe("| C Cmaj7 / / |");
	});
});
