/** Tracks and programs (spec 3.3): one per part line in score order, and a melodic part's harmony track. */
import {
	type ChartParse,
	type DeclaredPart,
	type InstrumentName,
	instrumentInfo,
	type PlayedBar,
	type Slot,
	type Words,
} from "barmark";

/** Which of a line's slots a track sounds: all of them, its note sets only, or its chord symbols only. */
export type Takes = "all" | "notes" | "chords";

/**
 * A line of the chart as a part writes it: `part` indexes `parse.parts`
 * (null in a chart with no parts); `line` is its line's name, "" for a
 * part's bare line, null for a part that writes no lines.
 */
export type Stream = { part: number | null; line: string | null };

/**
 * One track to perform: what PerformedTrack names, the streams whose
 * slots it sounds (`takes` of each), the streams whose words it carries,
 * and whether it plays a chord symbol as a bass instrument does.
 */
export type TrackPlan = {
	name: string;
	part: string | null;
	line: string | null;
	role: "line" | "harmony";
	program: number;
	takes: Takes;
	bass: boolean;
	streams: Stream[];
	words: Stream[];
	/** The part's index in `parse.parts`, for its pedal; null in a chart with no parts. */
	partIndex: number | null;
};

const BASS_INSTRUMENTS = new Set<InstrumentName>(["electric bass", "double bass"]);
/** The melodic instruments (3.3): their chord symbols sound on piano, in a track of their own. */
const MELODIC = new Set<InstrumentName>([
	"trumpet in Bb",
	"alto sax",
	"tenor sax",
	"trombone",
	"flute",
	"violin",
	"cello",
	"voice",
]);

/** A stream's share of a played bar: its slots and words; null where it rests or its part is tacet. */
export function streamBar(
	bar: PlayedBar,
	{ part, line }: Stream,
): { slots: Slot[]; words?: Words[] } | null {
	const own = bar.parts ? (bar.parts[part ?? 0] ?? null) : bar.tacet ? null : bar;
	if (own === null || line === null) return own;
	return own.lines?.find((l) => l.name === line) ?? null;
}

/** Whether a stream writes a note set anywhere in play order. */
function writesNotes(parse: ChartParse, stream: Stream): boolean {
	return parse.bars.some((bar) =>
		(streamBar(bar, stream)?.slots ?? []).some((slot) =>
			(slot.kind === "group" ? slot.members : [slot]).some(
				(s) => s.kind === "chord" && s.chord.kind === "notes",
			),
		),
	);
}

/** A part's line tracks, and its harmony track when its instrument is melodic. */
function partTracks(parse: ChartParse, p: DeclaredPart, partIndex: number): TrackPlan[] {
	const info = p.instrument ? instrumentInfo(p.instrument) : null;
	const melodic = info !== null && MELODIC.has(info.name);
	const streams: Stream[] = (p.lines?.length ? p.lines : [null]).map((line) => ({
		part: partIndex,
		line,
	}));
	// A melodic part's line that writes no note set sounds only through its harmony track.
	const kept = melodic ? streams.filter((s) => writesNotes(parse, s)) : streams;
	const label = p.label ?? p.name;
	const lineTracks = kept.map(
		(s): TrackPlan => ({
			// A part keeping one line, or a bare line, is named by the part; a named line by both.
			name: kept.length === 1 || !s.line ? p.name : `${p.name} ${s.line}`,
			part: label,
			line: s.line || null,
			role: "line",
			program: info?.program ?? 1,
			takes: melodic ? "notes" : "all",
			bass: info !== null && BASS_INSTRUMENTS.has(info.name),
			streams: [s],
			words: [s],
			partIndex,
		}),
	);
	if (!melodic) return lineTracks;
	const harmony: TrackPlan = {
		name: `${p.name} chords`,
		part: label,
		line: null,
		role: "harmony",
		program: 1,
		takes: "chords",
		bass: false,
		streams,
		words: streams.filter((s) => !kept.includes(s)),
		partIndex,
	};
	return [...lineTracks, harmony];
}

/** The chart's tracks in score order (spec 3.3); a chart with no `part:` is one track, "Chart", on piano. */
export function tracksOf(parse: ChartParse): TrackPlan[] {
	if (parse.parts.length === 0) {
		const chart: Stream = { part: null, line: null };
		return [
			{
				name: "Chart",
				part: null,
				line: null,
				role: "line",
				program: 1,
				takes: "all",
				bass: false,
				streams: [chart],
				words: [chart],
				partIndex: null,
			},
		];
	}
	return parse.parts.flatMap((p, i) => partTracks(parse, p, i));
}
