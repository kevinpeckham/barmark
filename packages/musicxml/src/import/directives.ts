/**
 * The key, meter, tempo and feel in force at each measure, and the
 * directive lines (grammar 7, 7.2) that say where they change, in any
 * order of the measures: written order, or played order when written out.
 */
import type { Key, Meter } from "barmark";
import { beatLength } from "../rhythm.js";
import type { TempoMarks } from "./marks.js";

/** What the score says at one measure, from whichever part says it. */
export type Settings = {
	key: Key | null;
	time: Meter | null;
	tempo: TempoMarks;
	feel: string | null;
};

/** What is in force at a measure. */
export type State = {
	key: Key | null;
	time: Meter;
	/** The steady tempo, in the meter's beats a minute. */
	tempo: number | null;
	/** The gradual change in force (`rit. to 90`), and the measure it began at. */
	change: { text: string; from: number } | null;
	feel: string;
};

const DEFAULT_TIME: Meter = { n: 4, d: 4 };

/** Quarter notes a minute as the meter's beats a minute (grammar 7: 6/8 counts dotted quarters), or null out of range. */
function beatsPerMinute(quarters: number, time: Meter): number | null {
	const beat = beatLength(time);
	const bpm = Number(((quarters * beat.d) / beat.n).toFixed(2));
	return bpm >= 1 && bpm <= 999 ? bpm : null;
}

const START: State = { key: null, time: DEFAULT_TIME, tempo: null, change: null, feel: "straight" };

const startsTempo = (t: TempoMarks) => t.metronome !== null || t.change !== null || t.aTempo;

/** The score's settings, each measure's running meter, and the `<sound tempo>`s a change has claimed as its target. */
type Scan = { settings: Settings[]; times: Meter[]; claimed: Set<number> };

/** The tempo a change arrives at: the first `<sound tempo>` from where it starts, before the next tempo mark. Claims it. */
function target(scan: Scan, i: number): number | null {
	for (let j = i; j < scan.settings.length; j++) {
		const t = scan.settings[j]?.tempo as TempoMarks;
		if (j > i && startsTempo(t)) return null;
		if (t.sound !== null && t.metronome === null) {
			scan.claimed.add(j);
			return beatsPerMinute(t.sound, scan.times[j] ?? DEFAULT_TIME);
		}
	}
	return null;
}

type Tempo = Pick<State, "tempo" | "change">;

/** A gradual change starting at measure `i`: `rit.`, `accel.`, to the tempo its words or a later `<sound>` name. */
function changeAt(
	change: NonNullable<TempoMarks["change"]>,
	i: number,
	scan: Scan,
): State["change"] {
	const to = change.to ?? target(scan, i);
	return { text: `${change.kind}.${to === null ? "" : ` to ${to}`}`, from: i };
}

/** The tempo after measure `i`'s marks: a metronome, a change, `a tempo`, or a `<sound tempo>` no change claimed. */
function tempoAt(before: Tempo, i: number, scan: Scan): Tempo {
	const t = scan.settings[i]?.tempo as TempoMarks;
	const time = scan.times[i] ?? DEFAULT_TIME;
	if (t.metronome !== null) return { tempo: beatsPerMinute(t.metronome, time), change: null };
	if (t.change) return { tempo: before.tempo, change: changeAt(t.change, i, scan) };
	if (t.aTempo) return { tempo: before.tempo, change: null };
	if (t.sound === null || scan.claimed.has(i))
		return { tempo: before.tempo, change: before.change };
	return { tempo: beatsPerMinute(t.sound, time), change: null };
}

/** What is in force at each measure, in written order. */
export function statesOf(settings: Settings[]): State[] {
	const times: Meter[] = [];
	for (const [i, s] of settings.entries()) times.push(s.time ?? times[i - 1] ?? DEFAULT_TIME);
	const scan: Scan = { settings, times, claimed: new Set() };
	const out: State[] = [];
	settings.forEach((s, i) => {
		const before = out[i - 1] ?? START;
		out.push({
			key: s.key ?? before.key,
			time: times[i] ?? DEFAULT_TIME,
			...tempoAt(before, i, scan),
			feel: s.feel ?? before.feel,
		});
	});
	return out;
}

const sameKey = (a: Key | null, b: Key | null) => a?.tonic === b?.tonic && a?.mode === b?.mode;

function keyText(k: Key): string {
	if (k.mode === "major") return k.tonic;
	return k.mode === "minor" ? `${k.tonic}m` : `${k.tonic} ${k.mode}`;
}

/** The tempo directive's value where `now` follows `was`, or null when nothing changes. */
function tempoText(now: State, was: State): string | null {
	if (now.change) return now.change.from === was.change?.from ? null : now.change.text;
	if (now.tempo === null) return null;
	if (was.change) return now.tempo === was.tempo ? "a tempo" : String(now.tempo);
	return now.tempo === was.tempo ? null : String(now.tempo);
}

/** Each directive, in the order barmark prints them, and its value where it changes. */
const DIRECTIVES: [string, (now: State, was: State) => string | null][] = [
	["key", (now, was) => (now.key && !sameKey(now.key, was.key) ? keyText(now.key) : null)],
	[
		"time",
		(now, was) =>
			now.time.n === was.time.n && now.time.d === was.time.d ? null : `${now.time.n}/${now.time.d}`,
	],
	["tempo", tempoText],
	["feel", (now, was) => (now.feel === was.feel ? null : now.feel)],
];

/** The directive line where `now` follows `was`, or null when nothing changes. */
function directiveLine(now: State, was: State): string | null {
	const parts = DIRECTIVES.flatMap(([name, value]) => {
		const v = value(now, was);
		return v === null ? [] : [`${name}: ${v}`];
	});
	return parts.length > 0 ? parts.join(", ") : null;
}

/** Each measure's directive line, the measures taken in `order` (indexes into `states`); the first follows the chart's defaults. */
export function directiveLines(states: State[], order: number[]): (string | null)[] {
	return order.map((i, k) => {
		const was = k === 0 ? START : (states[order[k - 1] as number] ?? START);
		return directiveLine(states[i] as State, was);
	});
}
