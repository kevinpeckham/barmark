/**
 * Which bars of a chord part's first line are a melody rather than comping
 * (the import design's call 12). A bar's attacks read as voicings where
 * they land on a chord change or a slash beat (Kevin, 2026-11-06); an
 * attack off both is a melody's only when it moves, its pitches differing
 * from the voicing sounding, and isn't a push into the next change
 * (Claude's calls, for Kevin to confirm). A re-strike, as in a Charleston,
 * stabs or eighth-note comping, is comping.
 */
import { beatLength, cmp, div, frac, minus, plus } from "../rhythm.js";
import type { Bar } from "./cells.js";
import type { Attack } from "./read.js";

/** An attack's pitches as one key, in any order. */
const keyOf = (a: Attack) =>
	a.pitches
		.map((p) => `${p.name}${p.octave}`)
		.sort()
		.join(" ");

const PUSHES = [frac(1, 2), frac(1, 4)];

/** An attack an eighth or sixteenth before a chord change in its bar, holding into it; or tied over the bar line into a chord on the next downbeat. */
function pushes(a: Attack, bar: Bar, next: Bar | undefined): boolean {
	const end = plus(a.at, a.length);
	const into = bar.chords.some((c) => {
		const early = PUSHES.some((p) => cmp(minus(c.at, a.at), p) === 0);
		const reaches = cmp(end, c.at);
		return early && (reaches > 0 || (reaches === 0 && a.tieOut));
	});
	if (into) return true;
	const tiedOver = a.tieOut && cmp(end, bar.length) === 0;
	return tiedOver && (next?.chords.some((c) => cmp(c.at, frac(0)) === 0) ?? false);
}

/** Whether an attack starts on a chord change or on a beat, where a slash would. */
function onChangeOrBeat(a: Attack, bar: Bar): boolean {
	return bar.chords.some((c) => cmp(c.at, a.at) === 0) || div(a.at, beatLength(bar.meter)).d === 1;
}

/** Whether a note attack is a melody's: off the changes and beats, moving from the voicing sounding, and not a push. */
function isMelodyAttack(
	a: Attack,
	bar: Bar,
	next: Bar | undefined,
	sounding: string | null,
): boolean {
	const moves = sounding !== null && sounding !== keyOf(a);
	return moves && !onChangeOrBeat(a, bar) && !pushes(a, bar, next);
}

/** Whether an attack starts new notes (not a tie's continuation). */
const startsNotes = (a: Attack) => a.kind === "notes" && !a.tieIn && a.pitches.length > 0;

/**
 * Whether a bar's attacks make it a melody's. `sounding` carries the
 * voicing across bars; a chord change clears it, so the first attack under
 * a new chord sets the voicing rather than moving from one.
 */
function melodyBar(line: Attack[], bar: Bar, next: Bar | undefined, sounding: Sounding): boolean {
	const changes = [...bar.chords].sort((x, y) => cmp(x.at, y.at));
	let melody = false;
	for (const a of line.filter(startsNotes)) {
		if (changes.some((c) => cmp(c.at, a.at) <= 0)) sounding.key = null;
		changes.splice(0, changes.filter((c) => cmp(c.at, a.at) <= 0).length);
		melody ||= isMelodyAttack(a, bar, next, sounding.key);
		sounding.key = keyOf(a);
	}
	if (changes.length > 0) sounding.key = null;
	return melody;
}

type Sounding = { key: string | null };

/** The indices of the bars where a line's notes are a melody's. */
export function melodyBars(line: Attack[][], bars: Bar[]): number[] {
	const sounding: Sounding = { key: null };
	const out: number[] = [];
	bars.forEach((bar, i) => {
		if (melodyBar(line[i] ?? [], bar, bars[i + 1], sounding)) out.push(i);
	});
	return out;
}
