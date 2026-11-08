/** The performance's types (spec section 2). */
import type { Credits, Key, Meter } from "barmark";

export type MidiLossCode =
	| "open-repeat" // `x ...` played once
	| "mode" // a church mode written as its parent major's signature
	| "tempo-assumed" // the chart has no tempo; `options.tempo` used
	| "tempo-range" // a tempo MIDI can't hold, clamped
	| "channels-shared" // more than 15 pitched tracks
	| "swing-compound" // swing in 6/8, 9/8 or 12/8 not applied
	| "ticks-rounded"; // a rhythm finer than 32,640 ticks a quarter, rounded
export type MidiLoss = { code: MidiLossCode; message: string; bar?: number };

/** A time or length in quarter notes, exact, from the first bar's downbeat. */
export type Quarters = { n: number; d: number };
export type PerformedNote = { pitch: number; at: Quarters; length: Quarters; velocity: number };
export type PerformedTrack = {
	name: string;
	/** The part's label and line name; null in a chart with no parts or a bare line. */
	part: string | null;
	line: string | null;
	/** "harmony": a melodic instrument's chord symbols, sounded on piano (3.3). */
	role: "line" | "harmony";
	/** General MIDI program, 1–128. */
	program: number;
	notes: PerformedNote[];
	pedal: { at: Quarters; down: boolean }[];
	lyrics: { at: Quarters; verse: number; text: string }[];
	words: { at: Quarters; text: string }[];
};
export type Performance = {
	title: string | null;
	credits: Credits;
	/** One per played bar: its index, onset and meter. */
	bars: { index: number; at: Quarters; meter: Meter }[];
	/** Quarter notes a minute, from `at` on; the first is at 0. */
	tempos: { at: Quarters; qpm: number }[];
	keys: { at: Quarters; key: Key }[];
	markers: { at: Quarters; text: string }[];
	tracks: PerformedTrack[];
	end: Quarters;
	losses: MidiLoss[];
};
