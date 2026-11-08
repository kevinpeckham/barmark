/** The tempo map (spec 3.7): steady tempos in the meter's beat, rit. and accel. ramps, fermatas. */
import { beatsOf, type Meter } from "barmark";
import { add, type BarAt, barQuarters, cmp, mul, q, sub, toNumber, ZERO } from "./quarters.js";
import type { MidiLoss, Performance, Quarters } from "./types.js";

/** A played bar at its onset; `fermata` when a `...` follows it. */
export type TimedBar = BarAt & { fermata?: true };
type Tempo = Performance["tempos"][number];

/** One beat of a meter in quarters: a dotted quarter in 6/8, 9/8 and 12/8. */
const beatQuarters = (meter: Meter) => mul(barQuarters(meter), q(1, beatsOf(meter)));
const qpmOf = (bpm: number, meter: Meter) => bpm * toNumber(beatQuarters(meter));

/** Consecutive bars carrying the same rit. or accel. (one object, from barmark's parse) form a run; a steady bar is a run alone. */
function runsOf(bars: TimedBar[]): TimedBar[][] {
	const runs: TimedBar[][] = [];
	for (const timed of bars) {
		const run = runs.at(-1);
		const change = timed.bar.tempoChange;
		if (run && change && run[0]?.bar.tempoChange === change) run.push(timed);
		else runs.push([timed]);
	}
	return runs;
}

/** The beats of a bar, each at its onset. */
const beatsIn = ({ bar, at }: TimedBar): { at: Quarters; meter: Meter }[] =>
	Array.from({ length: beatsOf(bar.meter) }, (_, i) => ({
		at: add(at, mul(beatQuarters(bar.meter), q(i))),
		meter: bar.meter,
	}));

/**
 * A run's tempo points: a steady bar's at its downbeat; a ramp's a beat
 * over its first n − 1 bars, linear in beats a minute from the steady
 * tempo, then the target at the last bar's downbeat, held (spec 3.7).
 * With no target, rit. ends at 80% and accel. at 120%.
 */
function runTempos(run: TimedBar[], assumed: number): Tempo[] {
	const first = run[0] as TimedBar;
	const last = run.at(-1) as TimedBar;
	const change = first.bar.tempoChange;
	if (!change) return [{ at: first.at, qpm: qpmOf(first.bar.tempo ?? assumed, first.bar.meter) }];
	const from = change.from ?? assumed;
	const to = change.to ?? from * (change.kind === "rit" ? 0.8 : 1.2);
	const beats = run.slice(0, -1).flatMap(beatsIn);
	const ramp = beats.map(({ at, meter }, k) => ({
		at,
		qpm: qpmOf(from + ((to - from) * (k + 1)) / (beats.length + 1), meter),
	}));
	return [...ramp, { at: last.at, qpm: qpmOf(to, last.bar.meter) }];
}

/** The qpm in force at a point: the last tempo at or before it. */
function inForce(tempos: Tempo[], at: Quarters, assumed: number): number {
	let qpm = tempos[0]?.qpm ?? assumed;
	for (const t of tempos) if (cmp(t.at, at) <= 0) qpm = t.qpm;
	return qpm;
}

/**
 * A fermata's last beat at a third of the tempo in force there; the bar
 * after it has its own point, so the tempo returns there (spec 3.7).
 */
function withFermatas(tempos: Tempo[], bars: TimedBar[], assumed: number): Tempo[] {
	const out = [...tempos];
	for (const { bar, at, fermata } of bars) {
		if (!fermata) continue;
		const beat = sub(add(at, barQuarters(bar.meter)), beatQuarters(bar.meter));
		const held = { at: beat, qpm: inForce(tempos, beat, assumed) / 3 };
		const i = out.findIndex((t) => cmp(t.at, beat) >= 0);
		if (i === -1) out.push(held);
		else out.splice(i, cmp(out[i]?.at as Quarters, beat) === 0 ? 1 : 0, held);
	}
	return out;
}

/** The chart's tempo map: a point wherever the qpm differs from the one before; the first at 0. */
export function tempoMap(
	bars: TimedBar[],
	options: { tempo?: number },
): { tempos: Performance["tempos"]; losses: MidiLoss[] } {
	const assumed = options.tempo ?? 120;
	const points = withFermatas(
		runsOf(bars).flatMap((run) => runTempos(run, assumed)),
		bars,
		assumed,
	);
	const steady = points.filter((t, i) => i === 0 || t.qpm !== points[i - 1]?.qpm);
	const tempos = steady.length > 0 ? steady : [{ at: ZERO, qpm: assumed }];
	const unknown = bars.find(({ bar }) => bar.tempo === null);
	const losses: MidiLoss[] = unknown
		? [
				{
					code: "tempo-assumed",
					message: `the chart has no tempo here; it plays at ${assumed} beats a minute`,
					bar: unknown.bar.index,
				},
			]
		: [];
	return { tempos, losses };
}
