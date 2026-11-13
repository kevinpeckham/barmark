/**
 * `chartFromBeats` (spec §6): a tracker's beats read as a grid
 * (`gridFromBeats`), then `@barmark/sync`'s builder on that grid, as one
 * call that refuses in plain words and never throws.
 */
import type { BuildOptions, Change, Detected, Detections } from "@barmark/sync";
import { type Built, buildChart, withMarks } from "../build.js";
import type { ListenChordRuns } from "../grid/beats.js";
import { invalid, isRefusal, readRecording } from "../input.js";
import { type ListenOptions, resolveOptions, type Settings } from "../options.js";
import { type Ok, ok, type Refusal, type Refused, refused } from "../result.js";
import { type BeatsInput, type BeatsReading, gridOf, type TrackedGrid } from "./grid.js";
import { readBeats } from "./input.js";

/** What `chartFromBeats` reads: a tracker's reading, the chords and the marks passed to the builder as given. */
export type BeatsChartInput = BeatsInput & {
	chords: ListenChordRuns;
	title?: string;
	key?: Detected<string> | null;
	sections?: { name: string; start: number; confidence?: number }[];
	changes?: Change[];
	recording?: { id?: string };
};

/** A tracker's chart, its map and confidence, the builder's diagnostics and the grid it stands on. */
export type BeatsChart = Built & { grid: TrackedGrid };

type BeatsChartResult = Ok<BeatsChart> | Refused<{ reading: Partial<BeatsReading> | null }>;

/** A refusal of the input, with no reading. */
const unread = (r: Refusal): BeatsChartResult => refused([r], [], { reading: null });

/** The chart from the input and the options: the beats read once, then the grid, then the builder on it. */
function chartOf(
	given: Record<string, unknown>,
	id: string | undefined,
	options: Settings,
	build: BuildOptions | undefined,
): BeatsChartResult {
	const checked = readBeats(given);
	if (isRefusal(checked)) return unread(checked);
	const grid = gridOf(checked, options);
	if (!grid.ok) return grid;
	const { value, warnings } = grid;
	const { duration } = checked;
	const detections = (): Detections => {
		const d: Detections = {
			grid: value.grid,
			chords: given.chords as ListenChordRuns,
			meter: value.meter,
			recording: id === undefined ? { duration } : { id, duration },
		};
		if (value.pickup) d.pickup = { start: value.pickup.start };
		return withMarks(d, given);
	};
	const built = buildChart(detections, build);
	if ("reason" in built) return { ...refused([built], warnings), reading: value.reading };
	return ok({ ...built, grid: value }, warnings);
}

/**
 * A chart, its timing map and its confidence record from a tracker's beats
 * and the chords (spec §6). In order: the options (`invalid-option`: those
 * of `gridFromBeats`, and `build`, an object passed to the builder); the
 * input is an object and `chords` an object (`invalid-input`,
 * `detail.field`), and `recording.id` a string; then `gridFromBeats`
 * (its refusals, with the reading so far).
 *
 * Then `chartFromDetections` with the grid, the pickup's start when there
 * is one, the chords, the label's meter, the title, key, sections and
 * changes as given, and `recording: { id, duration }`, the duration the
 * recording's length. No tempo: the builder derives it from the bars, and
 * that is the tempo to show (spec §4.3). A builder error is
 * `invalid-input` with the builder's message. There is no fallback: a
 * refused reading is a refusal, and a host with a declared tempo calls
 * `chartFromRecording`. The warnings are the grid's.
 */
export function chartFromBeats(
	input: BeatsChartInput,
	options?: ListenOptions & { build?: BuildOptions },
): BeatsChartResult {
	const resolved = resolveOptions(options, "beats");
	if (!resolved.ok) return { ...resolved, reading: null };
	const { settings, build } = resolved.value;
	try {
		if (typeof input !== "object" || input === null)
			return unread(invalid("input", "The input must be an object."));
		const given = input as unknown as Record<string, unknown>;
		const chords = given.chords;
		if (typeof chords !== "object" || chords === null)
			return unread(invalid("chords", "The chords must be an object with a runs list."));
		const recording = readRecording(given.recording);
		if (isRefusal(recording)) return unread(recording);
		return chartOf(given, recording.id, settings, build);
	} catch {
		return unread(invalid("input", "The input could not be read."));
	}
}
