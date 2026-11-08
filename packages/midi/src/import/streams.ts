/**
 * Which notes carry the harmony (spec 5.2). A stream is the notes of one
 * track on one channel. Channel 10 is drums and never harmony. By
 * default a monophonic stream (two or more of its notes sounding together
 * for under 10% of its sounding time) is a melody, a lead line or
 * MuseScore's slash notes, and is left out, unless it is the lowest
 * stream, the one lowest at its 10th percentile pitch (ties: the lower
 * median, then file order), so one stray low note doesn't decide it:
 * then it is a bass line and stays. When no stream is
 * polyphonic, every stream is used. `options.tracks` names the harmony
 * tracks instead.
 */
import type { Note } from "./notes.js";
import { andList, type Report } from "./report.js";
import type { MidiImportOptions } from "./types.js";

/** Channel 10, as an index. */
const DRUMS = 9;
/** A stream is monophonic when two notes sound together for less than this share of its sounding time. */
const POLYPHONY = 0.1;
/** A stream's low is its pitch a tenth of the way up (1 / LOW_SHARE), not its lowest note. */
const LOW_SHARE = 10;
/** The most streams or tracks a diagnostic names before it counts the rest. */
const MAX_NAMED = 8;

type Stream = { track: number; channel: number; notes: Note[] };

function streamsOf(notes: Note[]): Stream[] {
	const streams = new Map<string, Stream>();
	for (const n of notes) {
		const key = `${n.track} ${n.channel}`;
		const stream = streams.get(key) ?? { track: n.track, channel: n.channel, notes: [] };
		stream.notes.push(n);
		streams.set(key, stream);
	}
	return [...streams.values()].sort((a, b) => a.track - b.track || a.channel - b.channel);
}

/** Whether two or more notes sound together for less than `POLYPHONY` of the time any sounds: one sweep over starts and ends. */
function isMonophonic(notes: Note[]): boolean {
	const points = notes.flatMap((n) => [
		{ at: n.start, step: 1 },
		{ at: n.end, step: -1 },
	]);
	points.sort((a, b) => a.at - b.at || a.step - b.step);
	let sounding = 0;
	let together = 0;
	let count = 0;
	let last = 0;
	for (const { at, step } of points) {
		if (count >= 1) sounding += at - last;
		if (count >= 2) together += at - last;
		count += step;
		last = at;
	}
	return together < POLYPHONY * sounding;
}

/** A stream's median pitch, and its low: the pitch a tenth of the way up its sorted pitches. */
function pitchesOf(notes: Note[]): { median: number; low: number } {
	const pitches = notes.map((n) => n.pitch).sort((a, b) => a - b);
	const mid = pitches.length >> 1;
	const median =
		pitches.length % 2 === 1
			? (pitches[mid] ?? 0)
			: ((pitches[mid - 1] ?? 0) + (pitches[mid] ?? 0)) / 2;
	return { median, low: pitches[Math.floor(pitches.length / LOW_SHARE)] ?? 0 };
}

/** At most `MAX_NAMED` items named, then a count: "a, b, c and d", "a, …, h …and 2 more". */
function namedList(items: string[]): string {
	if (items.length <= MAX_NAMED) return andList(items);
	return `${items.slice(0, MAX_NAMED).join(", ")} …and ${items.length - MAX_NAMED} more`;
}

const nameOf = (names: (string | null)[], track: number) => {
	const name = names[track - 1];
	return name ? ` ("${name}")` : "";
};

/** The one track all of `items` are on, or undefined. */
function oneTrack(items: { track: number }[]): number | undefined {
	const tracks = new Set(items.map((s) => s.track));
	return tracks.size === 1 ? items[0]?.track : undefined;
}

/** The default choice: every pitched stream but the melodies. */
function chosenByDefault(pitched: Note[], names: (string | null)[], report: Report): Note[] {
	const streams = streamsOf(pitched).map((s) => ({
		...s,
		mono: isMonophonic(s.notes),
		...pitchesOf(s.notes),
	}));
	if (streams.length === 0) return [];
	if (streams.every((s) => s.mono)) {
		report.add(
			"harmony-from-melody",
			"warning",
			"every stream of notes is a single line, so the chords are read from them all",
		);
		return pitched;
	}
	const lowest = streams.reduce((low, s) =>
		s.low < low.low || (s.low === low.low && s.median < low.median) ? s : low,
	);
	const melodies = streams.filter((s) => s.mono && s !== lowest);
	if (melodies.length === 0) return pitched;
	const labels = melodies.map(
		(s) => `track ${s.track}${nameOf(names, s.track)}, channel ${s.channel + 1}`,
	);
	report.add(
		"melody-left-out",
		"info",
		`single-note lines left out of the harmony: ${namedList(labels)}`,
		{ track: oneTrack(melodies) },
	);
	const left = new Set(melodies.map((s) => `${s.track} ${s.channel}`));
	return pitched.filter((n) => !left.has(`${n.track} ${n.channel}`));
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The tracks one entry names: a 1-based number, or every track of that name. */
function matching(entry: number | string, names: (string | null)[]): number[] {
	if (typeof entry === "string")
		return names.flatMap((name, i) => (name !== null && sameName(name, entry) ? [i + 1] : []));
	return Number.isInteger(entry) && entry >= 1 && entry <= names.length ? [entry] : [];
}

const quoted = (entry: number | string) =>
	typeof entry === "number" ? String(entry) : `"${entry}"`;

/** The tracks `entries` name, or null to choose by default; one `track-unknown` names every entry that matches nothing. */
function chosenTracks(
	entries: (number | string)[],
	names: (string | null)[],
	report: Report,
): Set<number> | null {
	const chosen = new Set<number>();
	const unknown = entries.filter((entry) => {
		const tracks = matching(entry, names);
		for (const track of tracks) chosen.add(track);
		return tracks.length === 0;
	});
	const fallback = chosen.size === 0 ? "; the harmony is chosen as usual" : "";
	if (unknown.length > 0)
		report.add(
			"track-unknown",
			"warning",
			`no track is ${andList(unknown.map(quoted))}${fallback}`,
		);
	return chosen.size === 0 ? null : chosen;
}

/** The notes the chords are read from. None is an error, `no-notes`. */
export function harmonyNotes(
	notes: Note[],
	names: (string | null)[],
	options: Pick<MidiImportOptions, "tracks">,
	report: Report,
): Note[] {
	const drums = notes.filter((n) => n.channel === DRUMS);
	if (drums.length > 0) {
		const tracks = [...new Set(drums.map((n) => n.track))].map(String);
		report.add(
			"drums-left-out",
			"info",
			`the drums (channel 10) on ${tracks.length === 1 ? "track" : "tracks"} ${namedList(tracks)} are left out`,
			{ track: oneTrack(drums) },
		);
	}
	const pitched = notes.filter((n) => n.channel !== DRUMS);
	const chosen = chosenTracks(options.tracks ?? [], names, report);
	const harmony =
		chosen === null
			? chosenByDefault(pitched, names, report)
			: pitched.filter((n) => chosen.has(n.track));
	if (harmony.length === 0)
		report.add(
			"no-notes",
			"error",
			chosen === null
				? "there are no notes to read chords from outside channel 10"
				: "the tracks options.tracks chose have no notes to read chords from",
		);
	return harmony;
}
