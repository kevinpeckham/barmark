/** The note line's round trip (spec 9): a generated chart of one note line, exported and imported, sounds the same attacks, and where every rest is a beat or longer, the same lengths. */
import { describe, expect, test } from "bun:test";
import { parseChart } from "barmark";
import { mulberry32 } from "../../sync/tests/helpers/fuzz.js";
import { exportMidi, importMidi } from "../src/index.js";
import { perform } from "../src/perform/index.js";
import { notesOf } from "./helpers/notes.js";

type Rand = () => number;
const int = (r: Rand, n: number) => Math.floor(r() * n);
const pick = <T>(r: Rand, xs: T[]): T => xs[int(r, xs.length)] as T;

/** The divisions a quarter or a dotted quarter may take (spec 4.2). */
const DIVISIONS = [1, 2, 3, 4, 6];
const METERS = [
	{ time: "4/4", beats: 4, quarters: 1 },
	{ time: "3/4", beats: 3, quarters: 1 },
	{ time: "6/8", beats: 2, quarters: 1.5 },
];
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
/** A pitch's name, C4 being MIDI 60. */
const nameOf = (midi: number) => `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;

type Point = {
	beat: number;
	k: number;
	d: number;
	kind: "N" | "H" | "R";
	pitches: number[];
};

/** A note set of one to three pitches, a double stop rarely. */
function noteSet(r: Rand, double: number): number[] {
	const size = r() < double ? 2 + int(r, 2) : 1;
	const set = new Set<number>();
	while (set.size < size) set.add(28 + int(r, 49));
	return [...set];
}

/** What a point is after `prev`: a rest follows a note or a rest, the first point is an attack. */
function kindAfter(r: Rand, prev: Point | undefined, restHold: number): Point["kind"] {
	const x = r();
	if (prev === undefined) return "N";
	if (prev.kind === "R") return x < restHold ? "R" : "N";
	return x < 0.5 ? "N" : x < 0.8 ? "H" : "R";
}

/** The points of `beats` beats, each on a division a beat may take: the first an attack, then a note, a hold or a rest. */
function points(r: Rand, beats: number, restHold: number): Point[] {
	const out: Point[] = [];
	for (let beat = 0; beat < beats; beat++) {
		const d = pick(r, DIVISIONS);
		for (let k = 0; k < d; k++) {
			const kind = kindAfter(r, out[out.length - 1], restHold);
			out.push({ beat, k, d, kind, pitches: kind === "N" ? noteSet(r, 0.06) : [] });
		}
	}
	return out;
}

/** The smallest division of `DIVISIONS` with a point at every offset `k / d` given. */
function minimal(offsets: [number, number][]): number {
	return DIVISIONS.find((v) => offsets.every(([k, d]) => (k * v) % d === 0)) as number;
}

/** Whether a rest at `p` starts where the spec reads it: on a beat, or on a point the beat's attacks make. */
function startsOnPoint(ps: Point[], p: Point): boolean {
	const attacks = ps.filter((q) => q.beat === p.beat && q.kind === "N");
	const v = minimal(attacks.map((q): [number, number] => [q.k, q.d]));
	return p.k === 0 || (p.k * v) % p.d === 0;
}

/** The index of the last point of the rest run starting at `i`. */
function runEnd(ps: Point[], i: number): number {
	let j = i;
	while (ps[j + 1]?.kind === "R") j++;
	return j;
}

/**
 * Makes every rest one the spec reads as a rest (section 5): a rest that
 * starts off a beat and off the points the beat's attacks make, or that
 * runs less than a beat to the next attack (or has none after it: a file
 * ends with its last note), becomes a hold.
 */
function strictly(ps: Point[], beatQuarters: number): void {
	const at = (p: Point) => (p.beat + p.k / p.d) * beatQuarters;
	for (let i = 0; i < ps.length; i++) {
		const p = ps[i] as Point;
		if (p.kind !== "R" || ps[i - 1]?.kind === "R") continue;
		const j = runEnd(ps, i);
		const next = ps[j + 1];
		const long = next !== undefined && at(next) - at(p) >= beatQuarters;
		if (!long || !startsOnPoint(ps, p)) for (const q of ps.slice(i, j + 1)) q.kind = "H";
	}
}

function demoteDoubleStops(ps: Point[]): void {
	const attacks = ps.filter((p) => p.kind === "N");
	let doubles = attacks.filter((p) => p.pitches.length > 1);
	for (const p of doubles) {
		if (doubles.length * 10 <= attacks.length) break;
		p.pitches = p.pitches.slice(0, 1);
		doubles = attacks.filter((q) => q.pitches.length > 1);
	}
}

/** The chart's text: `bars` bars of one meter, a beat a slot, a beat's parts joined by `_`. */
function chartText(ps: Point[], meter: (typeof METERS)[number]): string {
	const cell = (p: Point) =>
		p.kind === "N" ? `{${p.pitches.map(nameOf).join(" ")}}` : p.kind === "H" ? "/" : "--";
	const beats = ps[ps.length - 1]?.beat ?? 0;
	let text = `key: C, time: ${meter.time}, tempo: 120\n`;
	for (let b = 0; b <= beats; b += meter.beats) {
		const slots: string[] = [];
		for (let beat = b; beat < b + meter.beats; beat++)
			slots.push(
				ps
					.filter((p) => p.beat === beat)
					.map(cell)
					.join("_"),
			);
		text += `| ${slots.join(" ")} |\n`;
	}
	return text;
}

/** A generated chart of one note line: its meter, bars, text. `strict` keeps every rest a beat or longer on the points the spec reads. */
function generated(seed: number, strict: boolean): string {
	const r = mulberry32(seed);
	const meter = pick(r, METERS);
	const ps = points(r, meter.beats * (2 + int(r, 10)), strict ? 0.65 : 0.5);
	if (strict) strictly(ps, meter.quarters);
	demoteDoubleStops(ps);
	return chartText(ps, meter);
}

const sounded = (text: string) => notesOf(perform(parseChart(text)));

/** Round trips seeds 1..`count`: the failures, and how many charts ran as a line. */
function roundTrips(strict: boolean, count: number) {
	const failed: string[] = [];
	let ran = 0;
	for (let seed = 1; seed <= count; seed++) {
		const text = generated(seed, strict);
		const out = exportMidi(text);
		if (!out.ok) {
			failed.push(`seed ${seed}: export failed\n${text}`);
			continue;
		}
		const back = importMidi(out.bytes);
		const codes = back.diagnostics.map((d) => d.code);
		const want = sounded(text);
		// a chart of one rest or one note is no line to a test that wants attacks; skip none, but count the line readings
		if (codes.includes("notes-line")) ran++;
		else if (want.length > 0) failed.push(`seed ${seed}: not read as a line: ${codes}\n${text}`);
		if (codes.includes("notes-fallback")) failed.push(`seed ${seed}: fell back\n${text}`);
		const got = sounded(back.text);
		const [a, b] = strict
			? [want, got]
			: [want.map((n) => [n[0], n[1]]), got.map((n) => [n[0], n[1]])];
		if (JSON.stringify(a) !== JSON.stringify(b))
			failed.push(`seed ${seed}:\n${text}\n--- came back as\n${back.text}`);
	}
	return { failed, ran };
}

const TIMEOUT = 120_000;

describe("the note line round trip", () => {
	test(
		"strict: every rest a beat or longer, on the points the attacks make: same attacks and lengths (seeds 1-400)",
		() => {
			const { failed, ran } = roundTrips(true, 400);
			expect(ran).toBeGreaterThanOrEqual(200);
			expect(failed.slice(0, 3)).toEqual([]);
		},
		TIMEOUT,
	);

	test(
		"loose: rests of any length and place: same attacks (seeds 1-400)",
		() => {
			const { failed, ran } = roundTrips(false, 400);
			expect(ran).toBeGreaterThanOrEqual(200);
			expect(failed.slice(0, 3)).toEqual([]);
		},
		TIMEOUT,
	);
});

test("the strict generator's 400 charts have rests, double stops and each meter", () => {
	const charts = Array.from({ length: 400 }, (_, i) => generated(i + 1, true));
	const has = (re: RegExp) => charts.filter((t) => re.test(t)).length;
	expect(has(/--/)).toBeGreaterThan(200);
	expect(has(/\{[^} ]+ [^}]+\}/)).toBeGreaterThan(100);
	for (const time of ["4/4", "3/4", "6/8"])
		expect(has(new RegExp(`time: ${time}`))).toBeGreaterThan(80);
});
