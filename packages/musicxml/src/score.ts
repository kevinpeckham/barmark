/** The score: part list, parts and their measures (MusicXML 4.0 score-partwise). */
import {
	type ChartDiagnostic,
	type ChartParse,
	type Credits,
	extractPart,
	type Part,
	parseChart,
} from "barmark";
import { clefPlan } from "./clefs.js";
import { applyHolds, applyPushes, eventsOf, joinHolds } from "./events.js";
import { type Instrument, instrumentOf } from "./instruments.js";
import { measureXml } from "./measure-xml.js";
import { writtenMeasures } from "./measures.js";
import { rhythmic, slashed } from "./notes.js";
import { barLength, beatLength, divisionsFor } from "./rhythm.js";
import { VERSION } from "./version.js";
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

/** One exported part: what it is called, and the chart as that part plays it. */
type PartSource = { part: Part | null; parse: ChartParse };

/** Each part as a single-part parse: several parts through extractPart, one chart as it is. */
function partsOf(parse: ChartParse, text: string): PartSource[] {
	if (parse.parts.length < 2) return [{ part: parse.parts[0] ?? null, parse }];
	return parse.parts.map((part) => ({
		part,
		parse: extractPart(text, part.label ?? "") ?? parse,
	}));
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
	if (!instrument) return "";
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

function partXml(source: PartSource, i: number): string {
	const measures = writtenMeasures(source.parse);
	const held = applyHolds(applyPushes(measures.map(eventsOf)));
	const rhythmicBars = held.map(rhythmic);
	const bars = joinHolds(held, rhythmicBars);
	const slashedBars = bars.map(slashed);
	const instrument = instrumentOf(source.part);
	const fixed = instrument?.clef;
	const clefs = fixed ? bars.map(() => fixed) : clefPlan(bars);
	const divisions = divisionsFor(
		bars.flatMap((b) => [
			barLength(b.measure.meter),
			beatLength(b.measure.meter),
			...b.events.map((e) => e.length),
		]),
	);
	const xml = bars.map((bar, index) =>
		measureXml(bar, {
			divisions,
			index,
			previous: measures[index - 1] ?? null,
			next: measures[index + 1] ?? null,
			slashed: around(slashedBars, index, true),
			clef: around(clefs, index, "G"),
			rhythmic: rhythmicBars[index] ?? false,
			octave: instrument?.octaveUp ? 1 : 0,
			staves: instrument?.staves ?? 1,
		}),
	);
	return el("part", { id: `P${i + 1}` }, xml);
}

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
	const head = [
		title ? el("work", {}, text("work-title", title)) : "",
		identificationXml(parse.credits),
		el("part-list", {}, sources.map(scorePart)),
	];
	const xml = `<?xml version="1.0" encoding="UTF-8"?>\n${DOCTYPE}\n${el("score-partwise", { version: "4.0" }, [...head, ...sources.map(partXml)])}\n`;
	return { ok: true, xml, diagnostics: parse.diagnostics };
}
