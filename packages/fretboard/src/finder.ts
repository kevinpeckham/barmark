import { shapeFrom, shapeText } from "./shape.js";
import { type Want, withinLimits } from "./sounds.js";
import { GUITAR, type Shape } from "./types.js";

const MUTED = -1;
const STRINGS = GUITAR.strings;
const WINDOW = 4;
const LAST_BASE = 12;

/** A fingering found, and what it costs. */
type Found = { frets: number[]; cost: number };

/** The search for one `Want`: its tones as bit masks, and what it has found. */
type Search = {
	want: Want;
	allowed: number;
	required: number;
	optional: number;
	found: Map<string, Found>;
};

const bit = (pitchClass: number): number => 1 << (((pitchClass % 12) + 12) % 12);
const maskOf = (tones: Iterable<number>): number => [...tones].reduce((m, p) => m | bit(p), 0);
const count = (mask: number): number => {
	let n = 0;
	for (let m = mask; m !== 0; m &= m - 1) n++;
	return n;
};

/** What a fingering costs, lower is better (spec §2.3). */
function costOf(s: Search, frets: readonly number[], sounded: number): number {
	const fretted = frets.filter((f) => f > 0);
	const lowest = fretted.length === 0 ? 0 : Math.min(...fretted);
	const span = fretted.length === 0 ? 0 : Math.max(...fretted) - lowest;
	const strings = frets.filter((f) => f >= 0).length;
	const top = frets.findLastIndex((f) => f >= 0);
	const topNote = ((STRINGS[top] ?? 0) + (frets[top] ?? 0)) % 12;
	const left = count(s.optional & ~sounded);
	return lowest + 0.8 * (6 - strings) + 1.5 * left + span - (topNote === s.want.root ? 0.3 : 0);
}

/** The pitch class of the lowest note a fingering sounds. */
function bassOf(frets: readonly number[]): number {
	let low = Number.POSITIVE_INFINITY;
	frets.forEach((f, i) => {
		if (f >= 0) low = Math.min(low, (STRINGS[i] ?? 0) + f);
	});
	return low % 12;
}

/** Keep a finished fingering when its lowest note is the bass and it holds the hand's limits. */
function finish(s: Search, frets: readonly number[], sounded: number): void {
	if (bassOf(frets) !== s.want.bass) return;
	const key = frets.join(",");
	if (s.found.has(key)) return;
	const shape = { frets: [...frets], base: 1 };
	if (!withinLimits(shape, s.want.minStrings)) return;
	s.found.set(key, { frets: shape.frets, cost: costOf(s, frets, sounded) });
}

/** The frets string `i` may take in this window: open and fretted notes the chord wants. */
function choices(s: Search, i: number, base: number): number[] {
	const open = STRINGS[i] ?? 0;
	const out: number[] = [];
	if (s.allowed & bit(open)) out.push(0);
	for (let f = base; f < base + WINDOW; f++) if (s.allowed & bit(open + f)) out.push(f);
	return out;
}

/** Whether a voicing may begin on this note: it is the bass, or a higher string can still sound lower. */
function mayStartBass(s: Search, i: number, note: number): boolean {
	return note % 12 === s.want.bass || (STRINGS[i + 1] ?? Number.POSITIVE_INFINITY) < note;
}

/** Fill string `i` and above. `played` strings so far; `ended` once a string is muted after the voicing began. */
function walk(
	s: Search,
	frets: number[],
	i: number,
	base: number,
	sounded: number,
	played: number,
	ended: boolean,
): void {
	if (i === STRINGS.length) {
		if (played >= s.want.minStrings && (s.required & ~sounded) === 0) finish(s, frets, sounded);
		return;
	}
	if (count(s.required & ~sounded) > STRINGS.length - i) return;
	if (!ended) play(s, frets, i, base, sounded, played);
	if (!ended || played === 0) {
		frets[i] = MUTED;
		walk(s, frets, i + 1, base, sounded, played, played > 0);
	}
}

/** Sound string `i` at each fret it may take, and go on. */
function play(
	s: Search,
	frets: number[],
	i: number,
	base: number,
	sounded: number,
	played: number,
): void {
	const open = STRINGS[i] ?? 0;
	for (const f of choices(s, i, base)) {
		if (played === 0 && !mayStartBass(s, i, open + f)) continue;
		frets[i] = f;
		walk(s, frets, i + 1, base, sounded | bit(open + f), played + 1, false);
	}
}

/** Every fingering in every window, best first. */
function search(want: Want): Found[] {
	const required = maskOf(want.required);
	const optional = maskOf(want.optional) & ~required;
	const s: Search = { want, allowed: required | optional, required, optional, found: new Map() };
	if (required === 0 || (s.allowed & bit(want.bass)) === 0) return [];
	for (let base = 1; base <= LAST_BASE; base++)
		walk(s, new Array<number>(STRINGS.length).fill(MUTED), 0, base, 0, 0, false);
	return [...s.found.values()]
		.map((f) => ({ ...f, text: shapeText({ frets: f.frets, base: 1 }) }))
		.sort((a, b) => a.cost - b.cost || (a.text < b.text ? -1 : a.text > b.text ? 1 : 0));
}

const sortedList = (tones: ReadonlySet<number>): string =>
	[...tones].sort((a, b) => a - b).join(".");

/** The cache key: the tones and bass, so two chords with the same wanted tones share an entry. */
function keyOf(want: Want): string {
	return [
		sortedList(want.required),
		sortedList(want.optional),
		want.bass,
		want.root,
		want.minStrings,
		want.shell ? 1 : 0,
	].join("|");
}

/** A copy of a shape, so no caller holds the cache's arrays. */
const copy = (shape: Shape): Shape =>
	shape.barre
		? { frets: [...shape.frets], base: shape.base, barre: { ...shape.barre } }
		: { frets: [...shape.frets], base: shape.base };

const shared = new Map<string, Shape[]>();

/** Standard-tuning fingerings for the wanted tones, best first, at most `limit` (10). Memoised by the tones and bass in `cache` (the module's own by default). */
export function findShapes(want: Want, limit = 10, cache: Map<string, Shape[]> = shared): Shape[] {
	const key = keyOf(want);
	let all = cache.get(key);
	if (!all) {
		all = search(want).map((f) => shapeFrom(f.frets));
		cache.set(key, all);
	}
	return all.slice(0, Math.max(0, limit)).map(copy);
}
