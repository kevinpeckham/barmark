/**
 * The chartless grid, ported from the app's `audio/chartlessGrid.ts`
 * (stem-bench Studies 28 to 31c): the comb's lattice near the declared
 * bar, then bar one at the song's own start when it has one, else the
 * three witnesses' vote, then bar one placed (design §6.2 and §7).
 */
import type { BarGrid, ChordRun } from "@barmark/sync";
import { beatsOf, type Meter, parseMeter } from "barmark";
import type { CombFit } from "../comb/comb.js";
import { type Features, readFeatures } from "../features/features.js";
import { type ListenOptions, resolveOptions, type Settings } from "../options.js";
import { type Ok, ok, type Refusal, type Refused, refusal, refused } from "../result.js";
import type { ListenChordRuns } from "./beats.js";
import { gridLattice, type Lattice, mod } from "./lattice.js";
import { type Placement, placeAtStart, placeBarOne } from "./place.js";
import { sectionWitness } from "./sections.js";
import { downbeatVote } from "./vote.js";
import { harmonicRhythmWitness, timeZeroWitness, type Witness } from "./witnesses.js";

/** What the caller declares: tempo in grammar 2.1's beat, as sync's `Detections.tempo`. */
export type Declared = { meter: string; tempo: number };

/** What `findGrid` reads. */
export type GridInput = {
	features: Features;
	/** Null: the harmonic witness abstains. */
	chords: ListenChordRuns | null;
	declared: Declared;
	/** The song's own start of bar one, when a person set it: the vote is skipped. */
	startAt?: number | null;
	/**
	 * Whether the recording starts on a bar line (a DAW export). Default true, the app's behavior.
	 * False sets the time-zero witness's weight to 0: a phone capture or a cut does not.
	 */
	startsOnBarLine?: boolean;
};

/** How the grid was read: the comb, its lattice, the witnesses and the vote. */
export type GridReading = {
	comb: { period: number; phase: number; score: number };
	lattice: { anchor: number; beat: number; period: number; beatsPerBar: number };
	/** [] when byStart. */
	witnesses: Witness[];
	/** Per beat class; [] when byStart. */
	scores: number[];
	cls: number;
	decided: boolean;
	byStart: boolean;
};

/** A placed grid. */
export type PlacedGrid = {
	/** Bar one's start … the end; never includes the pickup. */
	grid: BarGrid;
	/** `beats` is nominal, for display: the builder re-derives the pickup's length from `start`. */
	pickup: { start: number; beats: number } | null;
	reading: GridReading;
};

type GridResult = Ok<PlacedGrid> | Refused<{ reading: GridReading | null }>;

/** The input, checked. */
type Checked = {
	features: Features;
	chords: ListenChordRuns | null;
	meter: Meter;
	tempo: number;
	startAt: number | null;
	startsOnBarLine: boolean;
};

const invalid = (field: string, message: string): Refusal =>
	refusal("invalid-input", message, { field });

const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** The declared meter and tempo, or why they cannot be read. */
function readDeclared(declared: unknown): { meter: Meter; tempo: number } | Refusal {
	if (typeof declared !== "object" || declared === null)
		return invalid("declared", "The declared meter and tempo must be an object.");
	const { meter: text, tempo } = declared as Record<string, unknown>;
	const meter = typeof text === "string" ? parseMeter(text) : null;
	if (!meter) return invalid("declared.meter", "The declared meter must read as a meter, as 4/4.");
	if (!(isNumber(tempo) && tempo >= 1 && tempo <= 999))
		return invalid("declared.tempo", "The declared tempo must be a number from 1 to 999.");
	return { meter, tempo };
}

/** `startAt` (null when not given), or why it cannot be read. */
function readStart(startAt: unknown): { startAt: number | null } | Refusal {
	if (startAt === undefined || startAt === null) return { startAt: null };
	if (isNumber(startAt) && startAt >= 0) return { startAt };
	return invalid("startAt", "The start of bar one must be a time in seconds from 0.");
}

/** `startsOnBarLine` (true when not given), or why it cannot be read. */
function readBarLine(given: unknown): { startsOnBarLine: boolean } | Refusal {
	if (given === undefined) return { startsOnBarLine: true };
	if (typeof given === "boolean") return { startsOnBarLine: given };
	return invalid("startsOnBarLine", "startsOnBarLine must be true or false.");
}

const isRefusal = (v: object): v is Refusal => "reason" in v;

/** A run's own fields, copied; null when it is not an object or its label or symbol is not a string. */
function readRun(run: unknown): ChordRun | null {
	if (typeof run !== "object" || run === null) return null;
	const { start, end, label, symbol } = run as Record<string, unknown>;
	if (label !== undefined && typeof label !== "string") return null;
	if (symbol !== undefined && typeof symbol !== "string") return null;
	// A start or end that is not a finite number is kept as it is: the beats skip it (`beatChords`).
	const copy: ChordRun = { start: start as number, end: end as number };
	if (label !== undefined) copy.label = label;
	if (symbol !== undefined) copy.symbol = symbol;
	return copy;
}

/** `frameSec` and `frames` when given, or why one cannot be read. */
function readFrames(frameSec: unknown, frames: unknown) {
	if (frameSec !== undefined && !(isNumber(frameSec) && frameSec > 0))
		return invalid("chords.frameSec", "The chords' frameSec must be a number of seconds above 0.");
	if (frames !== undefined && !(Number.isInteger(frames) && (frames as number) >= 0))
		return invalid("chords.frames", "The chords' frame count must be a whole number from 0.");
	return {
		...(frameSec === undefined ? {} : { frameSec: frameSec as number }),
		...(frames === undefined ? {} : { frames: frames as number }),
	};
}

/** The chords read once into a copy of their own (null: none), or why they cannot be read. */
function readChordsOnce(chords: unknown): { chords: ListenChordRuns | null } | Refusal {
	if (chords === null) return { chords: null };
	if (typeof chords !== "object")
		return invalid("chords", "The chords must be an object with a runs list, or null.");
	const { runs, frameSec, frames } = chords as Record<string, unknown>;
	if (!Array.isArray(runs)) return invalid("chords.runs", "The chords' runs must be a list.");
	const counts = readFrames(frameSec, frames);
	if (isRefusal(counts)) return counts;
	const copy: ChordRun[] = [];
	for (let i = 0; i < runs.length; i++) {
		const run = readRun(runs[i]);
		if (!run)
			return refusal(
				"invalid-input",
				`Chord run ${i} is not a run with a string label or symbol.`,
				{
					field: "chords.runs",
					index: i,
				},
			);
		copy.push(run);
	}
	return { chords: { runs: copy, ...counts } };
}

/**
 * The chords, read once into a copy (a getter that changes its answer
 * cannot change the vote); a read that throws (a getter, a Proxy) is
 * invalid input, as `readFeatures` refuses a record that throws.
 */
function readChords(chords: unknown): { chords: ListenChordRuns | null } | Refusal {
	try {
		return readChordsOnce(chords);
	} catch {
		return invalid("chords", "The chords could not be read.");
	}
}

/** The input checked in the design's order (§6.2), the first problem refused. */
function readInput(input: unknown): Ok<Checked> | Refused {
	if (typeof input !== "object" || input === null)
		return refused([invalid("input", "The grid's input must be an object.")]);
	const given = input as Record<string, unknown>;
	const features = readFeatures(given.features);
	if (!features.ok) return features;
	const declared = readDeclared(given.declared);
	if (isRefusal(declared)) return refused([declared]);
	const start = readStart(given.startAt);
	if (isRefusal(start)) return refused([start]);
	const chords = readChords(given.chords);
	if (isRefusal(chords)) return refused([chords]);
	const barLine = readBarLine(given.startsOnBarLine);
	if (isRefusal(barLine)) return refused([barLine]);
	return ok({ features: features.value, ...declared, ...start, ...chords, ...barLine });
}

/** The placement as the grid's answer, `nothing-fits` when there is none. */
function answer(placement: Placement | null, reading: GridReading): GridResult {
	if (!placement)
		return refused(
			[refusal("nothing-fits", "Bar one lands at or after the recording's end.")],
			[],
			{ reading },
		);
	const value = { grid: { bars: placement.bars }, pickup: placement.pickup, reading };
	return ok(value, placement.warnings);
}

/** The reading's comb and lattice, copied. */
function readingOf(comb: CombFit, lattice: Lattice) {
	const { period, phase, score } = comb;
	const { anchor, beat, beatsPerBar } = lattice;
	return {
		comb: { period, phase, score },
		lattice: { anchor, beat, period: lattice.period, beatsPerBar },
	};
}

/** The three witnesses, time zero's weight 0 when the recording may not start on a bar line. */
function witnessesOf(c: Checked, lattice: Lattice, s: Settings): Witness[] {
	const zero = timeZeroWitness(lattice, s);
	return [
		c.startsOnBarLine ? zero : { ...zero, weight: 0 },
		harmonicRhythmWitness(c.chords, lattice, c.features.duration, s),
		sectionWitness(c.features.chroma, c.features.hopSec, lattice, c.features.duration, s),
	];
}

/** The grid on a checked input. */
function gridOf(c: Checked, s: Settings): GridResult {
	const { features: f } = c;
	const beatsPerBar = c.meter.n;
	const read = gridLattice(f.onset, f.fps, (beatsOf(c.meter) * 60) / c.tempo, beatsPerBar, s);
	if (!read.ok) return { ...read, reading: null };
	const { lattice, comb } = read.value;
	const base = readingOf(comb, lattice);
	if (c.startAt !== null) {
		const k = Math.round((c.startAt - lattice.anchor) / lattice.beat);
		const cls = mod(k, beatsPerBar);
		const reading = { ...base, witnesses: [], scores: [], cls, decided: true, byStart: true };
		return answer(placeAtStart(lattice, c.startAt, f.firstSound, f.duration, s), reading);
	}
	const witnesses = witnessesOf(c, lattice, s);
	const { cls, decided, scores } = downbeatVote(witnesses, beatsPerBar, s);
	const reading = { ...base, witnesses, scores, cls, decided, byStart: false };
	if (!decided) {
		const detail = Object.fromEntries(scores.map((v, k) => [`class${k}`, v]));
		const message = "The witnesses did not agree on which beat is bar one.";
		return refused([refusal("downbeat-undecided", message, detail)], [], { reading });
	}
	return answer(placeBarOne(lattice, cls, f.firstSound, f.duration, s), reading);
}

/**
 * The chartless grid: the comb's lattice near the declared bar (its bar
 * `beatsOf(meter) × 60 / tempo` seconds, `beatsPerBar` the meter's
 * numerator), then bar one at the lattice beat nearest `startAt` when it
 * is given (`byStart`, no vote), else the three witnesses' vote and bar
 * one placed so that it holds the first sound (design §7), with a pickup
 * before it when the sound begins at most `PICKUP_MAX_BAR_FRACTION` of a
 * bar early. The app's `chartlessGrid`.
 *
 * It refuses, never throws: options (`invalid-option`), the features
 * (`features-invalid`, `features-version`), the input (`invalid-input`,
 * `detail.field`), a flat onset envelope (`no-period`), an undecided vote
 * (`downbeat-undecided`, `detail` the scores per class) and bar one at or
 * past the end (`nothing-fits`). The last two carry the reading beside
 * the refusal; the others `reading: null`. New, not the app's:
 * `no-period` (the app voted on noise), the pickup, `startsOnBarLine`,
 * and `grid-truncated` when `MAX_GRID_BARS` cut the grid (the app cut
 * silently).
 */
export function findGrid(input: GridInput, options?: ListenOptions): GridResult {
	const resolved = resolveOptions(options, "listen");
	if (!resolved.ok) return { ...resolved, reading: null };
	let checked: Ok<Checked> | Refused;
	try {
		checked = readInput(input);
	} catch {
		checked = refused([invalid("input", "The grid's input could not be read.")]);
	}
	if (!checked.ok) return { ...checked, reading: null };
	return gridOf(checked.value, resolved.value.settings);
}
