import type { Detections } from "../../src/build/types.js";

/** A small seeded generator (mulberry32): the same seed gives the same numbers, 0 up to but not including 1. */
export function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

type Rand = () => number;
const int = (r: Rand, n: number) => Math.floor(r() * n);
const pick = <T>(r: Rand, xs: readonly T[]): T => xs[int(r, xs.length)] as T;
/** One time in four is something that is not a sound time. */
const BAD_TIMES = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -3, "7", null];

const LABELS = [
	"C:maj",
	"A:min7",
	"G:maj/3",
	"F#:sus4",
	"Bb:dim7",
	"C:maj(*3)",
	"N",
	"X",
	"zzz",
	"",
];
const SYMBOLS = ["C", "Am7", "N.C.", "{C E G}", "?", "H9", "Dm/F", "|", "%"];
const METERS = ["4/4", "3/4", "6/8", "9/8", "12/8", "7/8", "5/4", "2/2", "garbage", "0/4", 7, null];
const KEYS = ["D major", "F♯ minor", "Bm", "C", "Gb major", "nonsense", "", 5, null];
const TEMPOS = [120, 60, 0, 5000, -4, Number.NaN, "fast", null, 90.5, 999];
const NAMES = [
	"Verse",
	"Chorus",
	"",
	"## x",
	"a | b",
	"Bridge 2",
	"  ",
	"Intro\nOutro",
	"x".repeat(200),
];
const TITLES = ["Song", "", "A | B", "line\nbreak", "# hash", "  spaced  ", 4];

/** Fisher-Yates, driven by `r`. */
function shuffle<T>(r: Rand, xs: T[]) {
	for (let i = xs.length - 1; i > 0; i--) {
		const j = int(r, i + 1);
		[xs[i], xs[j]] = [xs[j] as T, xs[i] as T];
	}
}

/** Bar starts: sorted most of the time, with duplicates, gaps, NaN and shuffles mixed in. */
function gridOf(r: Rand): number[] {
	const count = int(r, 16);
	const step = 0.4 + r() * 3;
	const bars: number[] = [];
	let t = r() * 5;
	for (let i = 0; i < count; i++) {
		bars.push(t);
		t += r() < 0.1 ? 0 : step * (r() < 0.1 ? 0.0004 : 0.8 + r() * 0.4);
	}
	if (r() < 0.15) bars[int(r, bars.length)] = pick(r, BAD_TIMES) as number;
	if (r() < 0.15) bars.reverse();
	if (r() < 0.1) shuffle(r, bars);
	return bars;
}

type Run = {
	start: unknown;
	end: unknown;
	label?: unknown;
	symbol?: unknown;
	confidence?: unknown;
};

function runOf(r: Rand, lo: number, span: number, unit: number): Run {
	const start = (lo - span * 0.1 + r() * span * 1.2) / unit;
	const run: Run = {
		start: r() < 0.04 ? pick(r, BAD_TIMES) : start,
		end: r() < 0.04 ? pick(r, BAD_TIMES) : start + r() * (span / 4 / unit) * (r() < 0.1 ? -1 : 1),
	};
	const form = r();
	if (form < 0.55) run.label = pick(r, LABELS);
	else if (form < 0.9) run.symbol = pick(r, SYMBOLS);
	else if (form < 0.95) {
		run.label = pick(r, LABELS);
		run.symbol = pick(r, SYMBOLS);
	}
	if (r() < 0.2) run.confidence = pick(r, [0.5, 2, -1, Number.NaN, "x"]);
	return run;
}

/** The same two chords in every bar of the grid, so that bars repeat and `%` is in play. */
function patternRuns(bars: number[]): { runs: Run[] } {
	const sorted = bars.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
	const runs = sorted.slice(0, -1).flatMap((start, i) => {
		const end = sorted[i + 1] as number;
		const mid = (start + end) / 2;
		return [
			{ start, end: mid, label: "C:maj" },
			{ start: mid, end, label: "G:maj" },
		];
	});
	return { runs };
}

function runsOf(r: Rand, lo: number, hi: number): { runs: Run[]; frameSec?: number } {
	const frameSec = r() < 0.3 ? 0.0232 : undefined;
	const span = Math.max(hi - lo, 1);
	const runs = Array.from({ length: int(r, 40) }, () => runOf(r, lo, span, frameSec ?? 1));
	return frameSec === undefined ? { runs } : { runs, frameSec };
}

/** A value from the pool, now and then wrapped with a confidence. */
const maybeWrapped = (r: Rand, pool: readonly unknown[]) =>
	r() < 0.2 ? { value: pick(r, pool), confidence: r() } : pick(r, pool);

/** Title, meter, key and tempo, each present most of the time. */
function directivesOf(r: Rand): Record<string, unknown> {
	const d: Record<string, unknown> = {};
	if (r() < 0.8) d.meter = maybeWrapped(r, METERS);
	if (r() < 0.6) d.key = maybeWrapped(r, KEYS);
	if (r() < 0.6) d.tempo = maybeWrapped(r, TEMPOS);
	if (r() < 0.3) d.title = pick(r, TITLES);
	return d;
}

/** Sections, changes, a pickup and a recording, at times in or near the grid. */
function marksOf(r: Rand, lo: number, hi: number): Record<string, unknown> {
	const time = () => (r() < 0.2 ? hi : r() < 0.05 ? pick(r, BAD_TIMES) : lo + r() * (hi - lo));
	const confident = () => (r() < 0.3 ? { confidence: r() } : {});
	const d: Record<string, unknown> = {};
	if (r() < 0.5)
		d.sections = Array.from({ length: int(r, 5) }, () => ({
			name: pick(r, NAMES),
			start: time(),
			...confident(),
		}));
	if (r() < 0.5) {
		const kinds = ["key", "meter", "tempo", "mode"];
		d.changes = Array.from({ length: int(r, 5) }, () => {
			const kind = pick(r, kinds);
			const pool = kind === "key" ? KEYS : kind === "tempo" ? TEMPOS : METERS;
			return { kind, start: time(), value: pick(r, pool), ...confident() };
		});
	}
	if (r() < 0.3) d.pickup = { start: r() < 0.7 ? lo - r() * 3 : time() };
	if (r() < 0.2) d.recording = { id: "r", duration: pick(r, [hi + 1, Number.NaN, -1]) };
	return d;
}

/** A malformed or odd `Detections`, the same for the same generator. Only the builder's contract (never throw) is assumed. */
export function fuzzDetections(r: Rand): Detections {
	const bars = gridOf(r);
	const finite = bars.filter((x) => Number.isFinite(x));
	const lo = finite.length ? Math.min(...finite) : 0;
	const hi = finite.length ? Math.max(...finite) : 10;
	const d: Record<string, unknown> = {
		grid: { bars },
		chords: r() < 0.3 ? patternRuns(bars) : runsOf(r, lo, hi),
	};
	if (r() < 0.05) d.grid = pick(r, [null, {}, { bars: "x" }, { bars: [1] }]);
	if (r() < 0.05) d.chords = pick(r, [null, {}, { runs: "x" }]);
	return { ...d, ...directivesOf(r), ...marksOf(r, lo, hi) } as unknown as Detections;
}
