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

/** The divisions a quarter or a dotted quarter may take, an eighth, and a half note (spec 4.2). */
const DIVISIONS = [1, 2, 3, 4, 6];
const EIGHTHS = [1, 2, 3, 4];
const HALVES = [1, 2, 3, 4, 6, 8];
/** Meters with their beat in quarters and the divisions a beat may take; no x/16 (see `strictly`). */
const METERS = [
	{ time: "4/4", beats: 4, quarters: 1, divs: DIVISIONS },
	{ time: "3/4", beats: 3, quarters: 1, divs: DIVISIONS },
	{ time: "2/4", beats: 2, quarters: 1, divs: DIVISIONS },
	{ time: "6/8", beats: 2, quarters: 1.5, divs: DIVISIONS },
	{ time: "9/8", beats: 3, quarters: 1.5, divs: DIVISIONS },
	{ time: "12/8", beats: 4, quarters: 1.5, divs: DIVISIONS },
	{ time: "3/8", beats: 3, quarters: 0.5, divs: EIGHTHS },
	{ time: "5/8", beats: 5, quarters: 0.5, divs: EIGHTHS },
	{ time: "7/8", beats: 7, quarters: 0.5, divs: EIGHTHS },
	{ time: "2/2", beats: 2, quarters: 2, divs: HALVES },
	{ time: "3/2", beats: 3, quarters: 2, divs: HALVES },
];
type Meter = (typeof METERS)[number];
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

/** What a point is after `prev`: a rest follows a note or a rest; the first point is a rest now and then. */
function kindAfter(r: Rand, prev: Point | undefined, restHold: number): Point["kind"] {
	const x = r();
	if (prev === undefined) return x < 0.3 ? "R" : "N";
	if (prev.kind === "R") return x < restHold ? "R" : "N";
	return x < 0.5 ? "N" : x < 0.8 ? "H" : "R";
}

/** The points of bar `bar`, each beat on a division a beat may take, or all rest (a bar of rest). */
function barPoints(r: Rand, bar: number, meter: Meter, restHold: number, out: Point[]): Point[] {
	const silent = bar > 0 && r() < 0.1;
	const bars: Point[] = [];
	for (let beat = bar * meter.beats; beat < (bar + 1) * meter.beats; beat++) {
		const d = silent ? 1 : pick(r, meter.divs);
		for (let k = 0; k < d; k++) {
			const prev = bars[bars.length - 1] ?? out[out.length - 1];
			const kind = silent ? "R" : kindAfter(r, prev, restHold);
			bars.push({ beat, k, d, kind, pitches: kind === "N" ? noteSet(r, 0.06) : [] });
		}
	}
	return bars;
}

/** A bar like the one before it, three times in ten, so the import has `%`; or a bar of rest, one in ten (not the first bar); else each beat on a division a beat may take. */
function points(r: Rand, bars: number, meter: Meter, restHold: number): Point[] {
	const out: Point[] = [];
	for (let bar = 0; bar < bars; bar++) {
		const before = out.filter((p) => p.beat >= (bar - 1) * meter.beats);
		const again = bar > 0 && r() < 0.3 && before[0]?.kind === "N";
		const made = again
			? before.map((p) => ({ ...p, beat: p.beat + meter.beats, pitches: [...p.pitches] }))
			: barPoints(r, bar, meter, restHold, out);
		out.push(...made);
	}
	return out;
}

/** The smallest of a meter's divisions with a point at every offset `k / d` given. */
function minimal(offsets: [number, number][], meter: Meter): number {
	return meter.divs.find((v) => offsets.every(([k, d]) => (k * v) % d === 0)) as number;
}

/** Whether a rest at `p` starts where the spec reads it: on a beat, or on a point the beat's attacks make. */
function startsOnPoint(ps: Point[], p: Point, meter: Meter): boolean {
	const attacks = ps.filter((q) => q.beat === p.beat && q.kind === "N");
	const v = minimal(
		attacks.map((q): [number, number] => [q.k, q.d]),
		meter,
	);
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
 * runs less than a beat to the next attack, becomes a hold. A rest with no
 * attack after it runs to the end of the bar it starts in: a file carries
 * no bar after the one its last note ends in, so whole bars of rest after
 * that bar are not in it (the notes compared are unaffected). A rest
 * before the first attack is a rest as it stands (the line rests there).
 * No x/16 meter: a last bar whose only sound is one sixteenth of a held
 * note is not in the grid (`lastHeard`'s release allowance).
 */
function strictly(ps: Point[], meter: Meter): void {
	const at = (p: Point) => (p.beat + p.k / p.d) * meter.quarters;
	const bar = meter.beats * meter.quarters;
	for (let i = 1; i < ps.length; i++) {
		const p = ps[i] as Point;
		if (p.kind !== "R" || ps[i - 1]?.kind === "R") continue;
		const j = runEnd(ps, i);
		const next = ps[j + 1];
		const stop = next === undefined ? Math.ceil(at(p) / bar - 1e-9) * bar : at(next);
		const long = stop - at(p) >= meter.quarters - 1e-9;
		if (!long || !startsOnPoint(ps, p, meter)) for (const q of ps.slice(i, j + 1)) q.kind = "H";
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
function chartText(ps: Point[], meter: Meter): string {
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

/** A generated chart of one note line: its meter, points and text. `strict` keeps every rest to the class the spec reads (see `strictly`). */
function generated(seed: number, strict: boolean) {
	const r = mulberry32(seed);
	const meter = pick(r, METERS);
	const ps = points(r, 2 + int(r, 10), meter, strict ? 0.65 : 0.5);
	if (strict) strictly(ps, meter);
	demoteDoubleStops(ps);
	return { text: chartText(ps, meter), meter, ps };
}

const sounded = (text: string) => notesOf(perform(parseChart(text)));

/** The classes a chart is in, by its points and by what it imports to (the coverage test holds each reached). */
function classesOf(g: ReturnType<typeof generated>, back: string): string[] {
	const { text, meter, ps } = g;
	const on = (name: string, yes: boolean) => (yes ? [name] : []);
	const notes = ps.filter((p) => p.kind === "N");
	return [
		`meter ${meter.time}`,
		...on(
			"triplet beat",
			notes.some((p) => p.d === 3),
		),
		...on(
			"six-part beat",
			notes.some((p) => p.d === 6),
		),
		...on(
			"four-part beat",
			notes.some((p) => p.d === 4),
		),
		...on(
			"eight-part beat",
			notes.some((p) => p.d === 8),
		),
		...on("dotted figure", /\}\._\{|\}_\{[^}]+\}\./.test(back)),
		...on("rest inside a beat", /_--|--_/.test(text)),
		...on("whole bar of rest", /\| (-- ?)+\|/.test(text)),
		...on("hold over a bar line", /\| \//.test(text)),
		...on(
			"double stop",
			notes.some((p) => p.pitches.length > 1),
		),
		...on("% in the import", back.includes("%")),
		...on("leading rest", ps[0]?.kind === "R"),
		...on("trailing rest", ps[ps.length - 1]?.kind === "R"),
	];
}

/** One chart through the file and back: what went wrong with it (none: empty), whether it read as a line, and its classes. */
function oneRoundTrip(seed: number, strict: boolean) {
	const g = generated(seed, strict);
	const out = exportMidi(g.text);
	const want = sounded(g.text);
	// a chart with no attack has no file to read
	if (want.length === 0) return { problems: [], line: false, classes: [] };
	if (!out.ok) return { problems: [`export failed\n${g.text}`], line: false, classes: [] };
	const back = importMidi(out.bytes);
	const codes = back.diagnostics.map((d) => d.code);
	const problems: string[] = [];
	if (!codes.includes("notes-line")) problems.push(`not read as a line: ${codes}\n${g.text}`);
	if (codes.includes("notes-fallback")) problems.push(`fell back\n${g.text}`);
	const got = sounded(back.text);
	const [a, b] = strict
		? [want, got]
		: [want.map((n) => [n[0], n[1]]), got.map((n) => [n[0], n[1]])];
	if (JSON.stringify(a) !== JSON.stringify(b))
		problems.push(`${g.text}\n--- came back as\n${back.text}`);
	return { problems, line: codes.includes("notes-line"), classes: classesOf(g, back.text) };
}

/** Round trips seeds 1..`count`: the failures, how many charts ran as a line, and how many charts are in each class. */
function roundTrips(strict: boolean, count: number) {
	const failed: string[] = [];
	const classes = new Map<string, number>();
	let ran = 0;
	for (let seed = 1; seed <= count; seed++) {
		const one = oneRoundTrip(seed, strict);
		failed.push(...one.problems.map((p) => `seed ${seed}: ${p}`));
		if (one.line) ran++;
		for (const c of one.classes) classes.set(c, (classes.get(c) ?? 0) + 1);
	}
	return { failed, ran, classes };
}

const TIMEOUT = 120_000;
const SEEDS = 600;
const runs = { strict: roundTrips(true, SEEDS), loose: roundTrips(false, SEEDS) };

/** The least charts of each class a generator must reach in its seeds (set below what was counted). */
const FLOORS: Record<string, number> = {
	"triplet beat": 100,
	"six-part beat": 100,
	"four-part beat": 100,
	"eight-part beat": 20,
	"dotted figure": 5,
	"rest inside a beat": 20,
	"whole bar of rest": 5,
	"hold over a bar line": 50,
	"double stop": 100,
	"% in the import": 20,
	"leading rest": 20,
	"trailing rest": 5,
};

describe("the note line round trip", () => {
	for (const [name, strict] of [
		[
			"strict: rests a beat or longer on the points the attacks make: same attacks and lengths",
			true,
		],
		["loose: rests of any length and place: same attacks", false],
	] as const)
		test(
			`${name} (seeds 1-${SEEDS})`,
			() => {
				const { failed, ran, classes } = runs[strict ? "strict" : "loose"];
				if (process.env.CLASS_LOG) console.error(name, ran, JSON.stringify([...classes]));
				expect(ran).toBeGreaterThanOrEqual(400);
				expect(failed.slice(0, 3)).toEqual([]);
				for (const [c, floor] of Object.entries(FLOORS))
					expect({ c, reached: (classes.get(c) ?? 0) >= floor }).toEqual({ c, reached: true });
				for (const { time } of METERS)
					expect(classes.get(`meter ${time}`) ?? 0).toBeGreaterThan(15);
			},
			TIMEOUT,
		);
});
