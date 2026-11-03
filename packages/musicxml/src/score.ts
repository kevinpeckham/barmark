/** The score: part list, parts and their measures (MusicXML 4.0 score-partwise). */
import { type ChartDiagnostic, type ChartParse, extractPart, type Part, parseChart } from "barmark";
import { applyPushes, eventsOf } from "./events.js";
import { measureXml } from "./measure-xml.js";
import { writtenMeasures } from "./measures.js";
import { clefFor } from "./notes.js";
import { barLength, divisionsFor } from "./rhythm.js";
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
	]);
}

function partXml(source: PartSource, i: number): string {
	const measures = writtenMeasures(source.parse);
	const bars = applyPushes(measures.map(eventsOf));
	const clef = clefFor(measures);
	const divisions = divisionsFor(
		bars.flatMap((b) => [barLength(b.measure.meter), ...b.events.map((e) => e.length)]),
	);
	const xml = bars.map((bar, index) =>
		measureXml(bar, {
			divisions,
			index,
			previous: measures[index - 1] ?? null,
			next: measures[index + 1] ?? null,
			clef,
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
		el("identification", {}, el("encoding", {}, text("software", `@barmark/musicxml ${VERSION}`))),
		el("part-list", {}, sources.map(scorePart)),
	];
	const xml = `<?xml version="1.0" encoding="UTF-8"?>\n${DOCTYPE}\n${el("score-partwise", { version: "4.0" }, [...head, ...sources.map(partXml)])}\n`;
	return { ok: true, xml, diagnostics: parse.diagnostics };
}
