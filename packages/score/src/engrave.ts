import { exportMusicXml } from "@barmark/musicxml";
import {
	type ChartDiagnostic,
	type ChartParse,
	type PlayedBar,
	parseChart,
	type Slot,
} from "barmark";
import type { VerovioToolkit } from "verovio/esm";
import { cleanSvg } from "./markup.js";

export type EngraveOptions = {
	/** The width available, in CSS pixels; below 320 it is 320. */
	width: number;
	/** Verovio's scale (default 40). */
	scale?: number;
	/** The most notes the score may write out (`writtenNotes`); default `MAX_WRITTEN_NOTES`. */
	maxNotes?: number;
	/** The longest MusicXML engraved, in characters; default `MAX_XML_LENGTH`. */
	maxXmlLength?: number;
};

/**
 * The most notes a score may write out before it is refused, unexported:
 * a short chart with repeats can play thousands of bars, and writing each
 * out would take gigabytes. A long lead sheet writes a few thousand.
 */
export const MAX_WRITTEN_NOTES = 50_000;

/** The longest MusicXML handed to Verovio, in characters: a second guard, on what the export wrote. */
export const MAX_XML_LENGTH = 50_000_000;

const TOO_LARGE = "The score is too large to draw";

const slotNotes = (slots: Slot[]) =>
	slots.reduce((n, s) => n + (s.kind === "group" ? s.members.length : 1), 0);

/** A part's (or a single-part chart's) share of a bar: each line's slots, else its own. */
const lineNotes = (bar: { slots: Slot[]; lines?: { slots: Slot[] }[] }) =>
	bar.lines ? bar.lines.reduce((n, l) => n + slotNotes(l.slots), 0) : slotNotes(bar.slots);

function barNotes(bar: PlayedBar): number {
	const played = bar.parts
		? bar.parts.reduce((n, p) => n + (p ? lineNotes(p) : 0), 0)
		: lineNotes(bar);
	return played + (bar.lyrics ?? []).reduce((n, l) => n + l.syllables.length, 0);
}

/**
 * How many notes a score of the chart writes, at most: every played bar's
 * slots in every part and line (a group's members each) and its sung
 * syllables. One pass over the play order.
 */
export const writtenNotes = (parse: ChartParse): number =>
	parse.bars.reduce((n, bar) => n + barNotes(bar), 0);

export type Engraved =
	| { ok: true; svg: string; pages: number; xml: string }
	| { ok: false; reason: string; diagnostics: ChartDiagnostic[] };

/** Verovio's options for a score, all but `pageWidth` and `scale`. */
export const LAYOUT = {
	pageHeight: 60000,
	adjustPageHeight: true,
	breaks: "auto",
	svgViewBox: true,
	footer: "none",
	header: "auto",
	justifyVertically: false,
} as const;

const DEFAULT_SCALE = 40;
const MIN_WIDTH = 320;

const HIDDEN_DEGREE = '<degree print-object="no">';
const DEGREE_END = "</degree>";

/**
 * The MusicXML as Verovio should read it. Verovio 6.4 appends every chord <degree> to the
 * kind text, `print-object="no"` or not, so a degree the text already spells is drawn twice
 * (`D7sus4(7)`); a degree that is not printed is dropped, which changes nothing it draws.
 */
export function forVerovio(xml: string): string {
	// One pass with indexOf, never a backtracking regex: an opener with no closer ends the
	// search, so a hostile file of openers costs linear time, not a rescan per opener.
	const parts: string[] = [];
	let from = 0;
	for (;;) {
		const open = xml.indexOf(HIDDEN_DEGREE, from);
		if (open < 0) break;
		const close = xml.indexOf(DEGREE_END, open + HIDDEN_DEGREE.length);
		if (close < 0) break;
		parts.push(xml.slice(from, open));
		from = close + DEGREE_END.length;
	}
	parts.push(xml.slice(from));
	return parts.join("");
}

/** MusicXML laid out for a width, every page as SVG in a `bms-score-page` div. Throws on unreadable XML. */
export function engraveXml(
	vrv: VerovioToolkit,
	xml: string,
	options: EngraveOptions,
): { svg: string; pages: number } {
	const scale = options.scale ?? DEFAULT_SCALE;
	vrv.setOptions({
		...LAYOUT,
		scale,
		// Verovio's page width is in its own units at scale 100.
		pageWidth: Math.round((Math.max(MIN_WIDTH, options.width) * 100) / scale),
	});
	if (!vrv.loadData(forVerovio(xml))) throw new Error("Verovio could not read the score");
	const pages = vrv.getPageCount();
	if (pages < 1) throw new Error("The score has no pages");
	const svgs: string[] = [];
	for (let p = 1; p <= pages; p++)
		svgs.push(`<div class="bms-score-page">${vrv.renderToSVG(p)}</div>`);
	return { svg: svgs.join(""), pages };
}

function refusal(diagnostics: ChartDiagnostic[]): string {
	const first = diagnostics.find((d) => d.severity === "error") ?? diagnostics[0];
	if (!first) return "The chart has no bars";
	// A diagnostic about the whole chart has line 0: there is no line to name.
	return first.line > 0 ? `Line ${first.line}: ${first.message}` : first.message;
}

/**
 * A chart as a full score, or why it cannot be one. A chart that would
 * write more than `maxNotes` notes is refused before it is exported, and
 * MusicXML longer than `maxXmlLength` before Verovio reads it.
 */
export function engraveChart(vrv: VerovioToolkit, text: string, options: EngraveOptions): Engraved {
	if (writtenNotes(parseChart(text)) > (options.maxNotes ?? MAX_WRITTEN_NOTES))
		return { ok: false, reason: TOO_LARGE, diagnostics: [] };
	const exported = exportMusicXml(text);
	if (!exported.ok)
		return { ok: false, reason: refusal(exported.diagnostics), diagnostics: exported.diagnostics };
	if (exported.xml.length > (options.maxXmlLength ?? MAX_XML_LENGTH))
		return { ok: false, reason: TOO_LARGE, diagnostics: [] };
	try {
		const engraved = engraveXml(vrv, exported.xml, options);
		return { ok: true, xml: exported.xml, pages: engraved.pages, svg: cleanSvg(engraved.svg) };
	} catch (e) {
		return { ok: false, reason: e instanceof Error ? e.message : String(e), diagnostics: [] };
	}
}
