/**
 * Beams: eighths and shorter beam within a beat, and in 4/4 a half bar of
 * plain eighths beams as one. A rest, a quarter or longer, and a beat line
 * break a beam.
 */
import type { Meter } from "barmark";
import { barLength, beatLength, type Frac, halved, type NoteValue } from "./rhythm.js";

export type Beam = "begin" | "continue" | "end" | "forward hook" | "backward hook";

/** A written value where it starts in its bar; `rest` for anything a beam can't reach (a stemless slash too). */
export type Beamed = { start: Frac; v: NoteValue; rest: boolean };

const LEVELS: Record<string, number> = { eighth: 1, "16th": 2, "32nd": 3, "64th": 4, "128th": 5 };
const levelOf = (b: Beamed | undefined) => (!b || b.rest ? 0 : (LEVELS[b.v.type] ?? 0));
const plainEighth = (b: Beamed) =>
	!b.rest && b.v.type === "eighth" && b.v.dots === 0 && !b.v.tuplet;

/** Each value's beam group: its beat, or its half bar in 4/4 when the half is all plain eighths. */
function groups(values: Beamed[], meter: Meter): string[] {
	const beat = beatLength(meter);
	const beats = values.map((b) => Math.floor((b.start.n * beat.d) / (b.start.d * beat.n)));
	const bar = barLength(meter);
	const perHalf = halved(meter) ? (bar.n * beat.d) / (2 * bar.d * beat.n) : 0;
	if (perHalf < 2) return beats.map((b) => `beat ${b}`);
	const halfOf = (b: number) => Math.floor(b / perHalf);
	const eighths = (half: number) => {
		const inHalf = values.filter((_, i) => halfOf(beats[i] ?? 0) === half);
		return inHalf.length === perHalf * 2 && inHalf.every(plainEighth);
	};
	return beats.map((b) => (eighths(halfOf(b)) ? `half ${halfOf(b)}` : `beat ${b}`));
}

/** Runs of two or more beamable values in one group, as indexes. */
function runs(values: Beamed[], keys: string[]): number[][] {
	const out: number[][] = [];
	let run: number[] = [];
	values.forEach((b, i) => {
		const first = run[0];
		if (levelOf(b) > 0 && first !== undefined && keys[first] === keys[i]) run.push(i);
		else {
			out.push(run);
			run = levelOf(b) > 0 ? [i] : [];
		}
	});
	out.push(run);
	return out.filter((r) => r.length > 1);
}

/** One level of a run's beams: begin, continue, end; a value alone on its level hooks to its neighbour. */
function level(run: number[], depth: number, values: Beamed[], out: Beam[][]): void {
	const at = (k: number) => levelOf(values[run[k] ?? -1]) >= depth;
	run.forEach((i, k) => {
		if (!at(k)) return;
		const prev = at(k - 1);
		const next = at(k + 1);
		const beam = prev && next ? "continue" : prev ? "end" : next ? "begin" : null;
		out[i]?.push(beam ?? (k === 0 ? "forward hook" : "backward hook"));
	});
}

/** Each value's beams, one per level from the eighth's down; none for a value that isn't beamed. */
export function beamsOf(values: Beamed[], meter: Meter): Beam[][] {
	const out: Beam[][] = values.map(() => []);
	for (const run of runs(values, groups(values, meter))) {
		const deepest = Math.max(...run.map((i) => levelOf(values[i])));
		for (let depth = 1; depth <= deepest; depth++) level(run, depth, values, out);
	}
	return out;
}
