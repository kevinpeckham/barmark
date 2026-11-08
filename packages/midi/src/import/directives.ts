/**
 * Key, meter and tempo (spec 5.4), as sync's builder takes them: the
 * starting values and changes in nominal seconds (a quarter is half a
 * second, spec 5.3).
 *
 * - **Keys:** each key signature, any track, the last at one tick
 *   winning; the first is the starting key, the rest changes. A key whose
 *   scale (major; natural minor plus the raised 7th) covers under 60% of
 *   the harmony's sounding time while it is in force is left out
 *   (`key-doubtful`).
 * - **Meter:** each bar's; a change where it differs from the bar
 *   before's. A pickup's meter is not a change: sync writes its `[k/d]`.
 * - **Tempo:** a bar's is the qpm at its downbeat in grammar 2.1's beat
 *   of the meter the chart writes it in, to two decimals: its own, as a
 *   `time:` line (a bar cut short by a signature included), or, for a
 *   pickup written `[k/d]`, the bar after it. A ramp, changes in one direction on two or more
 *   consecutive downbeats with the tempo moving inside the bars between,
 *   writes its final tempo at its final bar (`tempo-ramp`); a tempo that
 *   moves inside a bar and is back by the next downbeat writes nothing
 *   (`tempo-in-bar`).
 */
import type { Change } from "@barmark/sync";
import { beatsOf, type Meter } from "barmark";
import { KEY, type Smf, TEMPO } from "../smf/types.js";
import { barAt, type Grid, type MetaAt, metaOf } from "./grid.js";
import { type Note, pitchClassPoints } from "./notes.js";
import type { Report } from "./report.js";

export type Directives = {
	key: string | null;
	/** The starting meter: the first bar's, or the bar after a pickup. */
	meter: string | null;
	tempo: number | null;
	changes: Change[];
	/** The key signatures kept (not doubtful), by tick: what spells the chords. */
	keys: KeyAt[];
};

/** The share of the harmony's sounding time a key's scale must cover. */
const KEY_FIT = 0.6;

const nominal = (grid: Grid, tick: number) => tick / grid.ppq / 2;
const meterText = (m: Meter) => `${m.n}/${m.d}`;

function metersOf(grid: Grid): Pick<Directives, "meter" | "changes"> {
	const first = grid.pickup ? 1 : 0;
	const changes: Change[] = [];
	for (const [i, bar] of grid.bars.entries()) {
		const before = grid.bars[i - 1]?.meter;
		if (i > first && before && meterText(bar.meter) !== meterText(before))
			changes.push({ kind: "meter", start: nominal(grid, bar.start), value: meterText(bar.meter) });
	}
	const start = grid.bars[first]?.meter;
	return { meter: start ? meterText(start) : null, changes };
}

// --- Tempo ---

type Qpm = { tick: number; qpm: number };

function temposOf(events: MetaAt[]): Qpm[] {
	return events.map(({ tick, data }) => {
		const [a = 0, b = 0, c = 0] = data;
		return { tick, qpm: 60_000_000 / (a * 65536 + b * 256 + c) };
	});
}

/** The index of the last tempo at or before `tick`, or -1 (binary search). */
function lastAt(tempos: Qpm[], tick: number): number {
	let lo = -1;
	let hi = tempos.length - 1;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if ((tempos[mid]?.tick ?? 0) <= tick) lo = mid;
		else hi = mid - 1;
	}
	return lo;
}

/** 120 qpm before the first tempo. */
const qpmAt = (tempos: Qpm[], tick: number) => tempos[lastAt(tempos, tick)]?.qpm ?? 120;
const round2 = (n: number) => Math.round(n * 100) / 100;
/** Beats a minute, counting the meter's beat. */
const bpm = (qpm: number, m: Meter) => round2((qpm * beatsOf(m) * m.d) / (4 * m.n));

type Span = { start: number; end: number; beat: Meter };

/**
 * Each bar's span, and the meter whose beat its tempo counts: the meter
 * the chart writes it in. A bar cut short by a signature becomes a
 * `time:` line in its own meter, which changes the tempo unit (grammar
 * 2.1), so it counts that meter's beat and plays at the file's speed; a
 * pickup, written `[k/d]`, keeps the unit of the `time:` in force
 * (grammar 2.4, Kevin's decision 2026-11-08), so it counts the beat of
 * the bar after it.
 */
function spans(grid: Grid): Span[] {
	return grid.bars.map((bar, i) => ({
		start: bar.start,
		end: grid.bars[i + 1]?.start ?? grid.end,
		beat: (grid.pickup && i === 0 ? grid.bars[1]?.meter : undefined) ?? bar.meter,
	}));
}

/** Whether the tempo moves inside a bar: an event after its downbeat, before the next, at another qpm. */
function moves(tempos: Qpm[], span: Span): boolean {
	const at = qpmAt(tempos, span.start);
	for (let i = lastAt(tempos, span.start) + 1; (tempos[i]?.tick ?? span.end) < span.end; i++)
		if (tempos[i]?.qpm !== at) return true;
	return false;
}

/** Whether the tempo moves inside a bar and is back by the next downbeat. */
const stretched = (tempos: Qpm[], span: Span, moving: boolean) =>
	moving && qpmAt(tempos, span.end) === qpmAt(tempos, span.start);

/**
 * The bars where the tempo changes. A ramp, changes in one direction on
 * consecutive downbeats with the tempo moving inside each bar between
 * them, is written as its final tempo; changes only at bar lines are
 * kept, each one (Claude's ruling, 2026-11-08).
 */
function tempoChanges(
	grid: Grid,
	downbeats: number[],
	moving: boolean[],
	report: Report,
): Change[] {
	const changes: Change[] = [];
	const direction = (i: number) => Math.sign((downbeats[i] ?? 0) - (downbeats[i - 1] ?? 0));
	/** The last downbeat of the ramp starting at change `i`: on while the direction holds and the bar before moves. */
	const rampEnd = (i: number) => {
		let last = i;
		while (last + 1 < downbeats.length && direction(last + 1) === direction(i) && moving[last])
			last++;
		return last;
	};
	for (let i = 1; i < downbeats.length; i++) {
		if (direction(i) === 0) continue;
		const last = rampEnd(i);
		if (last > i)
			report.add("tempo-ramp", "info", "a gradual tempo change is written as a step to its end", {
				bar: last + 1,
			});
		const start = nominal(grid, grid.bars[last]?.start ?? 0);
		changes.push({ kind: "tempo", start, value: downbeats[last] ?? 0 });
		i = last;
	}
	return changes;
}

function tempoOf(smf: Smf, grid: Grid, report: Report) {
	const tempos = temposOf(metaOf(smf, TEMPO));
	const bars = spans(grid);
	const moving = bars.map((span) => moves(tempos, span));
	for (const [i, span] of bars.entries())
		if (stretched(tempos, span, moving[i] ?? false))
			report.add(
				"tempo-in-bar",
				"info",
				"a tempo that changes inside a bar and is back by the next is left out",
				{ bar: i + 1 },
			);
	const downbeats = bars.map((span) => bpm(qpmAt(tempos, span.start), span.beat));
	return { tempo: downbeats[0] ?? null, changes: tempoChanges(grid, downbeats, moving, report) };
}

// --- Key ---

/** Tonics along the circle of fifths: the major key of `sf` is at `sf + 7`, the minor at `sf + 10`. */
const TONICS = "Cb Gb Db Ab Eb Bb F C G D A E B F# C# G# D# A#".split(" ");
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
/** Natural minor plus the raised 7th. */
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10, 11];

/** A key signature in force from `tick`: its name as `key:` writes it, and its scale's pitch classes. */
export type KeyAt = { tick: number; name: string; scale: Set<number> };

function keysOf(events: MetaAt[]): KeyAt[] {
	return events.map(({ tick, data }) => {
		const [byte = 0, mi = 0] = data;
		const sf = byte > 127 ? byte - 256 : byte;
		const tonic = (((sf * 7) % 12) + 12 + (mi === 1 ? 9 : 0)) % 12;
		const name = mi === 1 ? `${TONICS[sf + 10]}m` : (TONICS[sf + 7] as string);
		const scale = new Set((mi === 1 ? MINOR_SCALE : MAJOR_SCALE).map((s) => (tonic + s) % 12));
		return { tick, name, scale };
	});
}

/**
 * Each key's share of the harmony's sounding time in its scale, while it
 * is in force (the first from tick 0): one sweep over note starts and ends.
 */
function fits(keys: KeyAt[], harmony: Note[], end: number): number[] {
	const points = pitchClassPoints(harmony);
	const counts = new Array<number>(12).fill(0);
	const totals = keys.map(() => ({ in: 0, all: 0 }));
	let k = 0;
	let last = 0;
	const add = (to: number) => {
		const t = totals[k];
		const scale = keys[k]?.scale;
		for (let pc = 0; pc < 12 && t; pc++) {
			const time = (counts[pc] ?? 0) * (to - last);
			t.all += time;
			if (scale?.has(pc)) t.in += time;
		}
		last = to;
	};
	for (const p of [...points, { at: end, pc: 0, step: 0 }]) {
		for (let next = keys[k + 1]; next && next.tick <= p.at; next = keys[++k + 1]) add(next.tick);
		add(p.at);
		counts[p.pc] = (counts[p.pc] ?? 0) + p.step;
	}
	return totals.map((t) => (t.all === 0 ? 1 : t.in / t.all));
}

function keyOf(smf: Smf, grid: Grid, harmony: Note[], report: Report) {
	const keys = keysOf(metaOf(smf, KEY)).filter((k) => k.tick < grid.end);
	const shares = fits(keys, harmony, grid.end);
	const kept = keys.filter((k, i) => {
		if ((shares[i] ?? 1) >= KEY_FIT) return true;
		report.add("key-doubtful", "warning", "a key signature the notes don't fit is left out", {
			bar: barAt(grid, k.tick),
		});
		return false;
	});
	const changes: Change[] = [];
	for (const [i, k] of kept.entries())
		if (i > 0 && k.name !== kept[i - 1]?.name)
			changes.push({ kind: "key", start: nominal(grid, k.tick), value: k.name });
	return { key: kept[0]?.name ?? null, changes, kept };
}

/** The starting key, meter and tempo, and their changes by start. */
export function directivesOf(smf: Smf, grid: Grid, harmony: Note[], report: Report): Directives {
	const meters = metersOf(grid);
	const tempo = tempoOf(smf, grid, report);
	const key = keyOf(smf, grid, harmony, report);
	const changes = [...meters.changes, ...tempo.changes, ...key.changes].sort(
		(a, b) => a.start - b.start,
	);
	return { key: key.key, meter: meters.meter, tempo: tempo.tempo, changes, keys: key.kept };
}
