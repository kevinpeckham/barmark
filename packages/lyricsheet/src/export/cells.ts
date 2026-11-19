/**
 * A grid bar's cells (spec 4.3, the grid column): one per beat of the
 * bar's own meter, as `beatsOf` counts beats. So a 4/4 bar has four cells,
 * a `[2/4]` bar or a pickup of two beats two, and 6/8, 9/8 and 12/8, whose
 * beat is the dotted quarter in barmark's reading, two, three and four:
 * each cell then holds three eighths.
 *
 * A slot or group member that attacks on a beat is that beat's cell; ones
 * that attack between beats share their beat's cell with `~`, in time
 * order (`C~G`), after a `.` when nothing attacks on the beat itself
 * (`.~G`). A beat on which nothing attacks is `.` (a hold `/` in barmark).
 * A name that attacks again in its bar is `/` (ChordPro: play here), when
 * it is a cell's only attack: the reference's PDF writer dies on a `/`
 * inside a `~` cell (measured 2026-11-19), so there the name is written
 * again. What a slot writes, and its losses, is the lyric lines' rule,
 * with `N.C.` as a cell of its own and a note set's notes joined by commas,
 * since a space ends a cell (a no-break space does too).
 */
import { beatsOf, type PlayedBar } from "barmark";
import { type LineState, membersAt, slotText } from "./lyrics.js";
import type { Out } from "./types.js";

/** A slot's text as a grid cell writes it: `N.C.` bare; a note set's notes joined by commas. */
function cellText(text: string): string {
	if (text === "*N.C.") return "N.C.";
	return text.startsWith("*") ? text.replace(/ /g, ",") : text;
}

/** An attack: when it falls, in beats from the bar's start, and what it writes. */
type Attack = { beat: number; text: string };

/** Every slot's attack in the bar, in time order; holds and a repeated N.C. or stop attack nothing. */
function attacksOf(bar: PlayedBar, beats: number, out: Out): Attack[] {
	const each = beats / Math.max(1, bar.slots.length);
	const st: LineState = { last: null };
	return bar.slots.flatMap((slot, k) =>
		membersAt(slot, k * each, each).flatMap((m) => {
			const text = slotText(m.slot, st, bar, out);
			return text === null ? [] : [{ beat: m.at, text: cellText(text) }];
		}),
	);
}

/** Which beat a time in beats falls in, robust to the float sums of thirds. */
const beatOf = (beat: number) => Math.floor(beat + 1e-9);

/** One beat's cell, given its attacks and the attack before them in the bar. */
function cellOf(k: number, here: Attack[], before: Attack | undefined): string {
	const [first] = here;
	if (!first) return ".";
	const texts = here.map((a) => a.text);
	if (first.beat > k + 1e-9) return [".", ...texts].join("~");
	const again = here.length === 1 && !first.text.startsWith("*") && first.text !== "N.C.";
	return again && before?.text === first.text ? "/" : texts.join("~");
}

/** A bar's cells, or `%` and its other beats held when the chart wrote `%` there. */
export function barCells(bar: PlayedBar, simile: boolean, out: Out): string[] {
	const beats = beatsOf(bar.meter);
	if (simile) return ["%", ...Array.from({ length: beats - 1 }, () => ".")];
	const attacks = attacksOf(bar, beats, out);
	const cells: string[] = [];
	let i = 0;
	for (let k = 0; k < beats; k++) {
		const from = i;
		while (i < attacks.length && beatOf(attacks[i]?.beat ?? 0) <= k) i++;
		cells.push(cellOf(k, attacks.slice(from, i), attacks[from - 1]));
	}
	return cells;
}
