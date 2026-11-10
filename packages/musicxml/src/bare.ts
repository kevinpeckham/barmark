/**
 * A part's bare line beside its named lines (barmark's grammar 7.6): one
 * that writes no notes of its own is chord symbols and words over the first
 * named line, not a voice of slashes.
 */
import type { WrittenInterval } from "barmark";
import { wordsXml } from "./directions.js";
import type { SoundEvent } from "./events.js";
import { slotHarmonyXml } from "./harmony.js";
import { soundOf } from "./notes.js";
import { cmp, type Frac, minus, plus, ZERO } from "./rhythm.js";

/** Something written at a point in the bar: a chord symbol or words. */
export type Marked = { at: Frac; xml: string };

/** Whether a line's events write notes of their own (note sets, voicings), not just chords and slashes. */
export const writesNotes = (events: SoundEvent[]) =>
	events.some((e) => soundOf(e).kind === "notes");

/** A bare line's words and chord symbols, each where it falls in the bar. */
export function marksOf(events: SoundEvent[], written: WrittenInterval): Marked[] {
	let at: Frac = ZERO;
	return events.flatMap((e) => {
		const start = at;
		at = plus(at, e.length);
		const xml = [
			...e.words.map(wordsXml),
			e.slot.kind === "unknown" ? wordsXml("?") : "",
			e.harmony ? slotHarmonyXml(e.slot, written) : "",
		].join("");
		return xml ? [{ at: start, xml }] : [];
	});
}

/** A chord symbol or direction moved `by` divisions past where it is written (MusicXML's `offset`). */
function offsetXml(xml: string, by: number): string {
	if (by === 0) return xml;
	const offset = `<offset>${by}</offset>`;
	return xml
		.replaceAll("</harmony>", `${offset}</harmony>`)
		.replaceAll("</direction-type></direction>", `</direction-type>${offset}</direction>`);
}

/**
 * The marks written before each of a line's events: those that fall within
 * it, each offset from its start. The last event takes any left over. Each
 * mark finds its event by a binary search: a bar may hold thousands.
 */
export function marksBefore(
	starts: Frac[],
	marks: Marked[],
	toDivisions: (f: Frac) => number,
): string[] {
	const within: Marked[][] = starts.map(() => []);
	for (const m of marks) {
		const i = startOf(starts, m.at);
		if (i >= 0) within[i]?.push(m);
	}
	return starts.map((start, i) =>
		(within[i] ?? []).map((m) => offsetXml(m.xml, toDivisions(minus(m.at, start)))).join(""),
	);
}

/** The last of the (ascending) starts at or before `at`, by a binary search; -1 if none is. */
function startOf(starts: Frac[], at: Frac): number {
	let lo = 0;
	let hi = starts.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (cmp(starts[mid] as Frac, at) <= 0) lo = mid + 1;
		else hi = mid;
	}
	return lo - 1;
}

/** Marks written before a whole-bar rest: each offset from the bar's start. */
export const marksAtStart = (marks: Marked[], toDivisions: (f: Frac) => number) =>
	marks.map((m) => offsetXml(m.xml, toDivisions(m.at))).join("");
