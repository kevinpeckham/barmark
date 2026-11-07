/** The score: part list, parts and their measures (MusicXML 4.0 score-partwise). */
import {
	type ChartDiagnostic,
	type ChartParse,
	type Credits,
	type DeclaredPart,
	extractPart,
	parseChart,
} from "barmark";
import { clefPlan } from "./clefs.js";
import {
	applyHolds,
	applyPushes,
	eventsOf,
	joinHolds,
	lengthsIn,
	type MeasureEvents,
} from "./events.js";
import { type Instrument, instrumentOf } from "./instruments.js";
import { lyricPartXml, lyricScorePart } from "./lyric-staff.js";
import { fifthsOf, measureXml, placeIn } from "./measure-xml.js";
import { writtenMeasures } from "./measures.js";
import { rhythmic, slashed, soundOf } from "./notes.js";
import { applyPedals } from "./pedal.js";
import { divisionsFor } from "./rhythm.js";
import { VERSION } from "./version.js";
import { fitWritten } from "./written.js";
import { el, text } from "./xml.js";

export type MusicXmlOptions = {
	/** Only the part with this label, as `extractPart` gives it. */
	part?: string;
	/** The title for a chart that has none (the CLI gives the file name). */
	title?: string;
};

export type MusicXmlResult =
	| { ok: true; xml: string; diagnostics: ChartDiagnostic[] }
	| { ok: false; diagnostics: ChartDiagnostic[] };

const DOCTYPE =
	'<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">';

/** The credits (barmark's grammar 7.5) and the encoding, in the schema's order. */
function identificationXml(credits: Credits): string {
	const creators = (["composer", "lyricist", "arranger"] as const).flatMap((role) =>
		credits[role].map((name) => text("creator", name, { type: role })),
	);
	const rights = credits.copyright.map((line) => text("rights", line));
	const encoding = el("encoding", {}, text("software", `@barmark/musicxml ${VERSION}`));
	return el("identification", {}, [...creators, ...rights, encoding]);
}

/**
 * One exported part: what it is called, and the chart as that part plays
 * it, one parse per line when it writes lines (barmark's grammar 7.6).
 */
type PartSource = {
	part: DeclaredPart | null;
	parses: [ChartParse, ...ChartParse[]];
	/** The bare line written beside the named ones, extracted alone. */
	bare?: ChartParse;
};

/** Some of a part's lines, each extracted alone. */
const extractLines = (part: DeclaredPart | null, text: string, names: string[]): ChartParse[] =>
	names.flatMap((name) => extractPart(text, part?.label ?? "", name) ?? []);

/** A part's named lines, each extracted alone; empty when it writes none. */
const linesOf = (part: DeclaredPart | null, text: string): ChartParse[] =>
	extractLines(
		part,
		text,
		(part?.lines ?? []).filter((name) => name !== ""),
	);

/** The bare line a part writes beside its named lines, if it does. */
const bareOf = (part: DeclaredPart | null, text: string): ChartParse | undefined =>
	part?.lines?.includes("") ? extractLines(part, text, [""])[0] : undefined;

/** Each part as single-part parses: several parts through extractPart, one chart as it is. */
function partsOf(parse: ChartParse, text: string): PartSource[] {
	const whole = (part: DeclaredPart | null, own: ChartParse): PartSource => {
		const [first, ...rest] = linesOf(part, text);
		const bare = first ? bareOf(part, text) : undefined;
		return { part, parses: first ? [first, ...rest] : [own], ...(bare ? { bare } : {}) };
	};
	if (parse.parts.length < 2) return [whole(parse.parts[0] ?? null, parse)];
	return parse.parts.map((part) => whole(part, extractPart(text, part.label ?? "") ?? parse));
}

function scorePart(source: PartSource, i: number): string {
	const name = source.part?.name ?? "Chart";
	const label = source.part?.label;
	return el("score-part", { id: `P${i + 1}` }, [
		text("part-name", name),
		label ? text("part-abbreviation", label) : "",
		soundXml(instrumentOf(source.part), `P${i + 1}-I1`),
	]);
}

/** A matched instrument's playback sound: its name and General MIDI program. */
function soundXml(instrument: Instrument | null, id: string): string {
	if (!instrument?.program) return "";
	return [
		el("score-instrument", { id }, text("instrument-name", instrument.sound)),
		el("midi-instrument", { id }, text("midi-program", instrument.program)),
	].join("");
}

/** A list's value at `index`, and the one before it (null for the first). */
function around<T>(list: T[], index: number, fallback: T): { now: T; before: T | null } {
	return {
		now: list[index] ?? fallback,
		before: index > 0 ? (list[index - 1] ?? fallback) : null,
	};
}

/** A parse's measures and their events, holds and pushes applied. */
function streamOf(parse: ChartParse) {
	const measures = writtenMeasures(parse);
	const held = applyHolds(applyPushes(measures.map(eventsOf)));
	const rhythmicBars = held.map(rhythmic);
	return { measures, rhythmicBars, bars: joinHolds(held, rhythmicBars) };
}

type Stream = ReturnType<typeof streamOf>;

const silent = (bar: MeasureEvents | undefined) =>
	!bar || bar.events.every((e) => soundOf(e).kind === "rest");

/**
 * Where a part's bare line plays in each bar (grammar 7.6): in a bar its
 * named lines rest, in the first line's place; in a bar they play, beside
 * them (`beside`); nowhere in a bar it rests, which then exports as if the
 * part wrote no bare line.
 */
function bareAlone(
	bars: MeasureEvents[],
	rhythmicBars: boolean[],
	named: Stream[],
	bare: Stream | null,
) {
	const beside: (MeasureEvents | undefined)[] = [];
	if (!bare) return { bars, rhythmicBars, beside };
	const alone = bars.map((_, i) => !silent(bare.bars[i]) && named.every((s) => silent(s.bars[i])));
	bars.forEach((_, i) => {
		beside[i] = alone[i] || silent(bare.bars[i]) ? undefined : bare.bars[i];
	});
	return {
		bars: bars.map((bar, i) => (alone[i] ? (bare.bars[i] ?? bar) : bar)),
		rhythmicBars: rhythmicBars.map((r, i) => (alone[i] ? (bare.rhythmicBars[i] ?? r) : r)),
		beside,
	};
}

function partXml(source: PartSource, i: number): string {
	const [lead, ...others] = source.parses;
	const first = streamOf(lead);
	const streams = [first, ...others.map(streamOf)];
	const lined = (source.part?.lines?.length ?? 0) > 0;
	const { measures } = first;
	const bare = source.bare ? streamOf(source.bare) : null;
	const pedalled = applyPedals(first.bars, (i) => streams.every((s) => s.bars[i]?.measure.tacet));
	const { bars, rhythmicBars, beside } = bareAlone(pedalled, first.rhythmicBars, streams, bare);
	const slashedBars = bars.map(slashed);
	const instrument = instrumentOf(source.part);
	const keys = measures.flatMap((m) => (m.key ? [fifthsOf(m.key)] : []));
	const written = fitWritten(instrument?.written ?? { diatonic: 0, chromatic: 0 }, keys);
	const fixed = instrument?.clef;
	const clefs = fixed ? bars.map(() => fixed) : clefPlan(bars);
	const divisions = divisionsFor(
		streams.flatMap((s) => lengthsIn([...s.bars, ...(bare?.bars ?? [])])),
	);
	const xml = bars.map((bar, index) =>
		measureXml(bar, {
			divisions,
			...placeIn(measures, index),
			slashed: around(slashedBars, index, true),
			clef: around(clefs, index, "G"),
			rhythmic: rhythmicBars[index] ?? false,
			written,
			staves: instrument?.staves ?? 1,
			score: i === 0,
			...(lined
				? { lines: [bar.events, ...streams.slice(1).map((s) => s.bars[index]?.events ?? [])] }
				: {}),
			...(beside[index] ? { bare: beside[index] } : {}),
		}),
	);
	return el("part", { id: `P${i + 1}` }, xml);
}

/** Whether a chart with no parts sings on its notes: some note carries a syllable (grammar 4.3). */
const notesSing = (parse: ChartParse) =>
	parse.lines.some(
		(l) =>
			l.kind === "bars" &&
			l.cells.some(
				(c) =>
					c.kind === "slots" &&
					c.slots.some((s) =>
						(s.kind === "group" ? s.members : [s]).some((m) => m.kind === "chord" && m.syllable),
					),
			),
	);

/**
 * Whether a parse's words have no melody to sit on (grammar 7.7): no part
 * sings, or the part whose they are writes no notes.
 */
function unsung(parse: ChartParse): boolean {
	const words = parse.bars.flatMap((b) => b.lyrics ?? []).find((l) => l.syllables.length > 0);
	if (!words) return false;
	if (parse.parts.length === 0) return !notesSing(parse);
	return parse.parts.find((p) => p.label === words.part)?.sings === undefined;
}

/** The parse that carries a lyric row with no melody, if any: the chart's words, or a singer's with no notes. */
const lyricSource = (sources: PartSource[]) =>
	sources.flatMap((s) => [...s.parses, ...(s.bare ? [s.bare] : [])]).find(unsung);

/** MusicXML needs at least one measure in every part. */
const NO_BARS: ChartDiagnostic = {
	line: 0,
	severity: "error",
	message: "the chart has no bars to export",
	token: "",
};

const noPart = (label: string): ChartDiagnostic => ({
	line: 0,
	severity: "error",
	message: `no part labelled ${label}`,
	token: label,
});

/** A chart as MusicXML 4.0, or its diagnostics when it has an error. Never throws. */
export function exportMusicXml(chart: string, options: MusicXmlOptions = {}): MusicXmlResult {
	const parse = parseChart(chart);
	if (parse.diagnostics.some((d) => d.severity === "error"))
		return { ok: false, diagnostics: parse.diagnostics };
	if (parse.bars.length === 0) return { ok: false, diagnostics: [NO_BARS, ...parse.diagnostics] };
	const wanted = options.part?.toLowerCase();
	const sources = partsOf(parse, chart).filter(
		(s) => !wanted || s.part?.label?.toLowerCase() === wanted,
	);
	if (options.part && sources.length === 0)
		return { ok: false, diagnostics: [noPart(options.part), ...parse.diagnostics] };
	const title = parse.title ?? options.title;
	// A lyric row with no melody is a staff of its own, after the parts; a part exported alone leaves it out.
	const words = options.part ? undefined : lyricSource(sources);
	const wordsId = `P${sources.length + 1}`;
	const head = [
		title ? el("work", {}, text("work-title", title)) : "",
		identificationXml(parse.credits),
		el("part-list", {}, [...sources.map(scorePart), words ? lyricScorePart(wordsId) : ""]),
	];
	const parts = [...sources.map(partXml), words ? lyricPartXml(words, wordsId) : ""];
	const xml = `<?xml version="1.0" encoding="UTF-8"?>\n${DOCTYPE}\n${el("score-partwise", { version: "4.0" }, [...head, ...parts])}\n`;
	return { ok: true, xml, diagnostics: parse.diagnostics };
}
