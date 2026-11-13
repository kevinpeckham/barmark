/**
 * The tracker's grid, `gridFromBeats`: a beat tracker's beats and
 * downbeats read as a bar grid, in the order of the app's `trackerBarGrid`
 * (design §4.2).
 */
import type { BarGrid } from "@barmark/sync";
import { pickupWarning } from "../grid/place.js";
import { isRefusal } from "../input.js";
import { type ListenOptions, resolveOptions, type Settings } from "../options.js";
import { type ListenWarning, type Ok, ok, type Refused, refusal, refused } from "../result.js";
import { joinHalfBars, median, steadyShare } from "./bars.js";
import { declaredWarnings } from "./declared.js";
import { type CheckedBeats, readBeats } from "./input.js";
import { type BeatsLabel, type BeatsMeter, beatsLabel } from "./label.js";
import { firstAtLeast, snapDownbeats } from "./snap.js";

/** A tracker's reading, in seconds from the recording's start. */
export type BeatsInput = {
	beats: number[];
	/** The first beat of each bar. */
	downbeats: number[];
	/** The recording's length: the closing bar ends here. */
	duration: number;
	/** What the song is set to, if anything: compared, never obeyed. Either part may be missing. */
	declared?: { meter?: string; tempo?: number } | null;
};

/** How the tracker's reading was labelled and checked. */
export type BeatsReading = {
	/** 60 / the median beat interval, a whole bpm: the tracker's beat. */
	beatTempo: number;
	/** The tempo in grammar 2.1's beat: `beatTempo`, or a third of it in 6/8. */
	tempo: number;
	/** The modal count of beats in a bar, the smallest on a tie. */
	beatsPerBar: number;
	/** How many bars, as read, held each count. */
	counts: Record<number, number>;
	/** Bar lines removed by joining half bars. */
	joined: number;
	/** The share of the joined bars that hold `beatsPerBar` beats. */
	steadyShare: number;
	/** The median bar of the joined grid, in seconds. */
	barSeconds: number;
};

/** A grid read from a tracker's beats. */
export type TrackedGrid = {
	/** Bar one's start … the end; never includes the pickup. */
	grid: BarGrid;
	pickup: { start: number; beats: number } | null;
	meter: BeatsMeter;
	reading: BeatsReading;
};

export type BeatsGridResult = Ok<TrackedGrid> | Refused<{ reading: Partial<BeatsReading> | null }>;

/** The label, its parts all present. */
type Labelled = {
	beatTempo: number;
	tempo: number;
	beatsPerBar: number;
	meter: BeatsMeter;
	counts: Record<number, number>;
};

/** The label when every part is there, else null. */
function complete(label: BeatsLabel): Labelled | null {
	const { beatTempo, tempo, beatsPerBar, meter, counts } = label;
	if (beatTempo === null || tempo === null || beatsPerBar === null || meter === null) return null;
	return { beatTempo, tempo, beatsPerBar, meter, counts };
}

/** `too-few-bars`: `lines` bar lines and `beats` beats are not a song's bars. */
function tooFew(
	lines: number,
	beats: number,
	reading: Partial<BeatsReading> | null,
	warnings: ListenWarning[] = [],
): BeatsGridResult {
	const bars = Math.max(0, lines - 1);
	const message = `The tracker found ${bars} ${bars === 1 ? "bar" : "bars"} and ${beats} ${beats === 1 ? "beat" : "beats"}, too few to read the song's bars.`;
	return refused([refusal("too-few-bars", message, { bars, beats })], warnings, { reading });
}

/** The steady share, under the least: `bars-unsteady`. */
function unsteady(
	share: number,
	reading: Partial<BeatsReading>,
	warnings: ListenWarning[],
): BeatsGridResult {
	const percent = Math.round(share * 100);
	const message = `Only ${percent}% of the tracker's bars hold the usual ${reading.beatsPerBar} beats, too few to read them as the song's bars.`;
	const detail = { share, beatsPerBar: reading.beatsPerBar as number };
	return refused([refusal("bars-unsteady", message, detail)], warnings, { reading });
}

/** The bar lines closed: to `duration` when at least `TRACKER_MIN_CLOSING_SHARE` of a bar is left, else as they are. */
function closed(starts: number[], duration: number, barSeconds: number, s: Settings): number[] {
	const last = starts.at(-1) as number;
	const closes = duration - last >= s.TRACKER_MIN_CLOSING_SHARE * barSeconds;
	return closes ? [...starts, duration] : starts;
}

/** The first `MAX_GRID_BARS` bars of a longer grid, with the warning. */
function capped(lines: number[], s: Settings): { lines: number[]; warnings: ListenWarning[] } {
	if (lines.length - 1 <= s.MAX_GRID_BARS) return { lines, warnings: [] };
	const warning: ListenWarning = {
		code: "grid-truncated",
		message: `The grid stops at ${s.MAX_GRID_BARS} bars, before the recording's end.`,
		detail: { bars: s.MAX_GRID_BARS },
	};
	return { lines: lines.slice(0, s.MAX_GRID_BARS + 1), warnings: [warning] };
}

/** The beats before bar one: a pickup when few enough and bar one is a usual bar, else the `beats-before-bar-one` warning. */
function leading(
	beats: readonly number[],
	starts: readonly number[],
	beatsPerBar: number,
	s: Settings,
): { pickup: TrackedGrid["pickup"]; warnings: ListenWarning[] } {
	const before = firstAtLeast(beats, starts[0] as number);
	if (before < 1) return { pickup: null, warnings: [] };
	const start = beats[0] as number;
	const inBarOne = firstAtLeast(beats, starts[1] as number) - before;
	if (before <= s.PICKUP_MAX_BAR_FRACTION * beatsPerBar && inBarOne === beatsPerBar) {
		const pickup = { start, beats: before };
		return { pickup, warnings: [pickupWarning(pickup)] };
	}
	const count = `${before} ${before === 1 ? "beat" : "beats"}`;
	const warning: ListenWarning = {
		code: "beats-before-bar-one",
		message: `${count} before bar one, from ${start.toFixed(2)} s, are too many for a pickup and are left out.`,
		detail: { beats: before, start },
	};
	return { pickup: null, warnings: [warning] };
}

/** Steps 3 to 9 on the snapped downbeats and a complete label. */
function gridOfLabel(
	c: CheckedBeats,
	downbeats: number[],
	label: Labelled,
	s: Settings,
): BeatsGridResult {
	const { beatTempo, tempo, beatsPerBar, counts } = label;
	const starts = joinHalfBars(c.beats, downbeats, beatsPerBar);
	const joined = downbeats.length - starts.length;
	const warnings: ListenWarning[] = [];
	if (joined > 0) {
		const message = `${joined} half-bar ${joined === 1 ? "line was" : "lines were"} joined into whole bars.`;
		warnings.push({ code: "bars-joined", message, detail: { lines: joined } });
	}
	const sofar = { beatTempo, tempo, beatsPerBar, counts, joined };
	if (starts.length < s.TRACKER_MIN_BARS + 1)
		return tooFew(starts.length, c.beats.length, sofar, warnings);
	const share = steadyShare(c.beats, starts, beatsPerBar);
	if (share < s.TRACKER_MIN_STEADY_SHARE)
		return unsteady(share, { ...sofar, steadyShare: share }, warnings);
	const barSeconds = median(starts.slice(1).map((t, i) => t - (starts[i] as number)));
	const cut = capped(closed(starts, c.duration, barSeconds, s), s);
	const reading: BeatsReading = { ...sofar, steadyShare: share, barSeconds };
	const lead = leading(c.beats, starts, beatsPerBar, s);
	const value = { grid: { bars: cut.lines }, pickup: lead.pickup, meter: label.meter, reading };
	const told = declaredWarnings(c.declared, label.meter, barSeconds);
	return ok(value, [...warnings, ...cut.warnings, ...lead.warnings, ...told]);
}

/** Steps 1 to 9 on a checked input. */
function gridOf(c: CheckedBeats, s: Settings): BeatsGridResult {
	const downbeats = snapDownbeats(c.beats, c.downbeats);
	if (c.beats.length < 2 || downbeats.length < s.TRACKER_MIN_BARS + 1)
		return tooFew(downbeats.length, c.beats.length, null);
	const label = complete(beatsLabel(c.beats, downbeats));
	if (!label) return tooFew(downbeats.length, c.beats.length, null);
	return gridOfLabel(c, downbeats, label, s);
}

/**
 * A beat tracker's beats and downbeats (seconds) as a bar grid, in the
 * order of the app's `trackerBarGrid`: each downbeat snapped to its
 * nearest beat, the tempo and meter labelled from the modal beats per bar
 * (stem-bench Study 41), adjacent half bars joined (Study 44), the steady
 * share checked (`TRACKER_MIN_STEADY_SHARE`) and a closing bar to
 * `duration` when at least `TRACKER_MIN_CLOSING_SHARE` of a bar is left.
 *
 * It refuses, never throws: options (`invalid-option`), the input
 * (`invalid-input`, `detail.field`, and `detail.index` for an element),
 * too few bars (`too-few-bars`) and bars that do not settle on one count
 * of beats (`bars-unsteady`); the last two carry the reading so far beside
 * the refusal, the others `reading: null`. New, not the app's: the
 * refusals, `bars-joined` (the app joins silently) and `grid-truncated`
 * when `MAX_GRID_BARS` cut the grid (the app has no cap).
 */
export function gridFromBeats(input: BeatsInput, options?: ListenOptions): BeatsGridResult {
	const resolved = resolveOptions(options, "listen");
	if (!resolved.ok) return { ...resolved, reading: null };
	return beatsGridWith(input, resolved.value.settings);
}

/** `gridFromBeats` on options already resolved (the pipeline's): the input checked, then the grid. */
export function beatsGridWith(input: unknown, s: Settings): BeatsGridResult {
	const checked = readBeats(input);
	if (isRefusal(checked)) return refused([checked], [], { reading: null });
	return gridOf(checked, s);
}
