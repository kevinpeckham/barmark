/**
 * Clefs by bars (the notation design, section 3): a part is bass when most
 * of its bars sit below middle C, and a run of bars on the other side
 * changes clef for the run: two bars or more, or one that would need more
 * than three ledger lines.
 */
import type { MeasureEvents } from "./events.js";
import { belowMiddleC, type Pitch, soundOf } from "./notes.js";

/** Treble, bass, or treble an octave down (a guitar's). */
export type Clef = "G" | "F" | "G8vb";
type ByBars = "G" | "F";

const STEPS = "CDEFGAB";
const diatonic = (p: Pitch) => p.octave * 7 + STEPS.indexOf(p.step);
/** Each clef's bottom and top staff lines, in diatonic steps from C0. */
const STAFF: Record<ByBars, [number, number]> = { G: [30, 38], F: [18, 26] };

/** How many ledger lines a note needs on a clef's staff. */
function ledgers(p: Pitch, clef: ByBars): number {
	const [bottom, top] = STAFF[clef];
	const d = diatonic(p);
	return Math.max(0, Math.floor((bottom - d) / 2), Math.floor((d - top) / 2));
}

/** A bar's notes, and the side it sits on: by most of its notes; a bar of slashes is treble; rests alone don't vote. */
function vote(bar: MeasureEvents): { notes: Pitch[]; clef: ByBars | null } {
	const sounds = bar.events.map(soundOf);
	const notes = sounds.flatMap((s) => (s.kind === "notes" ? s.pitches : []));
	if (notes.length === 0)
		return { notes, clef: sounds.some((s) => s.kind === "slash") ? "G" : null };
	return { notes, clef: notes.filter(belowMiddleC).length > notes.length / 2 ? "F" : "G" };
}

/** Each measure's clef. */
export function clefPlan(bars: MeasureEvents[]): Clef[] {
	const votes = bars.map(vote);
	const count = (c: ByBars) => votes.filter((v) => v.clef === c).length;
	const part: ByBars = count("F") > count("G") ? "F" : "G";
	const other: ByBars = part === "G" ? "F" : "G";
	const clefs = bars.map((): Clef => part);
	const change = (run: number[]) => {
		const far = run.some((i) => votes[i]?.notes.some((p) => ledgers(p, part) > 3));
		if (run.length >= 2 || far) for (const i of run) clefs[i] = other;
	};
	let run: number[] = [];
	votes.forEach((v, i) => {
		if (v.notes.length > 0 && v.clef === other) run.push(i);
		else {
			change(run);
			run = [];
		}
	});
	change(run);
	return clefs;
}
