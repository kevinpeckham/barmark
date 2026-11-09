import { exportMusicXml } from "@barmark/musicxml";
import {
	type ChartDiagnostic,
	type ChartParse,
	type ChordRecord,
	type PlayedBar,
	type PlayedSyllable,
	parseChart,
	type SimpleSlot,
	type Slot,
	type Words,
} from "barmark";
import type { VerovioToolkit } from "verovio/esm";
import { cleanSvg } from "./markup.js";

export type EngraveOptions = {
	/** The width available, in CSS pixels; below 320 it is 320. */
	width: number;
	/** Verovio's scale (default 40). */
	scale?: number;
	/** The most the score may cost (`scoreCost`, about the bytes of MusicXML it writes); default `MAX_SCORE_COST`. */
	maxCost?: number;
	/** The longest MusicXML engraved, in characters: the export stops writing past it; default `MAX_XML_LENGTH`. */
	maxXmlLength?: number;
};

/**
 * The most a score may cost (`scoreCost`, about the bytes of MusicXML it
 * writes) before it is refused, unexported: a short chart with repeats can
 * play thousands of bars, and writing each out could take gigabytes. A
 * long lead sheet costs about half a megabyte.
 */
export const MAX_SCORE_COST = 50_000_000;

/** The longest MusicXML handed to Verovio, in characters: the export stops writing past it (`maxLength`). */
export const MAX_XML_LENGTH = 50_000_000;

const TOO_LARGE = "The score is too large to draw";

// What the export writes for each thing, beyond its text, in bytes, from measuring it
// (see the calibration test in tests/engrave.test.ts): a part's measure (a rest when tacet), a
// line's voice in it, a note or slash, each pitch of a note set or chord, each degree of a
// chord symbol, a syllable, words, and a bar's heading or mark.
const COST = {
	measure: 600,
	line: 200,
	slot: 450,
	pitch: 250,
	degree: 150,
	syllable: 200,
	words: 400,
	heading: 300,
} as const;

/** Text as the export escapes it: `&<>"'` take up to six bytes each. */
const escaped = (text: string) => text.length + 5 * (text.match(/[&<>"']/g)?.length ?? 0);

function chordCost(c: ChordRecord | undefined): number {
	if (!c) return 0;
	return escaped(c.source) + c.pitches.length * COST.pitch + c.intervals.length * COST.degree;
}

/** A note or slash, and its chord or notes; its syllable is the bar's (`lyricsCost`). */
const memberCost = (m: SimpleSlot) =>
	m.kind === "chord" ? COST.slot + chordCost(m.chord) + chordCost(m.voicing) : COST.slot;

const slotCost = (s: Slot) =>
	s.kind === "group" ? s.members.reduce((n, m) => n + memberCost(m), 0) : memberCost(s);

const wordsCost = (words: Words[] | undefined) =>
	(words ?? []).reduce((n, w) => n + COST.words + escaped(w.text), 0);

type Written = { slots: Slot[]; words?: Words[] };

const lineCost = (l: Written) =>
	COST.line + l.slots.reduce((n, s) => n + slotCost(s), 0) + wordsCost(l.words);

/** A part's share of a bar: its measure, then each line's notes, or its own. */
const partCost = (p: (Written & { lines?: Written[] }) | null) =>
	COST.measure +
	(p === null ? 0 : p.lines ? p.lines.reduce((n, l) => n + lineCost(l), 0) : lineCost(p));

/** A syllable and its text; one on no note of the singing line is a lyric staff's slash too. */
const syllableCost = ({ syllable, note }: PlayedSyllable) =>
	COST.syllable +
	(syllable.kind === "sung" ? escaped(syllable.parts.join("")) : 0) +
	(note ? 0 : COST.slot);

const lyricsCost = (bar: PlayedBar) =>
	(bar.lyrics ?? []).reduce((n, l) => n + l.syllables.reduce((m, s) => m + syllableCost(s), 0), 0);

/** One played bar: every declared part's measure (a tacet one's rest too), its notes and words, the sung syllables (a lyric staff's measure with them), and its heading. */
function barCost(bar: PlayedBar, parts: number): number {
	const played = bar.parts
		? bar.parts.reduce((n, p) => n + partCost(p), 0) + (parts - bar.parts.length) * COST.measure
		: partCost(bar);
	const sung = bar.lyrics?.length ? COST.measure + lyricsCost(bar) : 0;
	const heading = COST.heading + escaped(bar.section ?? "") + escaped(bar.rehearsal ?? "");
	return played + sung + heading;
}

/**
 * About how many bytes of MusicXML a score of the chart writes: every
 * played bar's measure in every declared part (tacet ones too), each
 * slot, pitch, degree, syllable and words, with the length of its text,
 * and its heading. One pass over the play order, cheap enough to refuse a
 * chart before exporting it. It is an early gate, not the bound: it
 * leaves out what is rarely large (a part's silent lines, text lines), and
 * the export's own `maxLength` budget, which `engraveChart` sets, is what
 * keeps the MusicXML within `MAX_XML_LENGTH`.
 */
export function scoreCost(parse: ChartParse): number {
	const parts = Math.max(1, parse.parts.length);
	return parse.bars.reduce((n, bar) => n + barCost(bar, parts), 0);
}

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
 * cost more than `maxCost` is refused before it is exported, and the
 * export stops writing MusicXML longer than `maxXmlLength`.
 */
export function engraveChart(vrv: VerovioToolkit, text: string, options: EngraveOptions): Engraved {
	if (scoreCost(parseChart(text)) > (options.maxCost ?? MAX_SCORE_COST))
		return { ok: false, reason: TOO_LARGE, diagnostics: [] };
	// The export's own budget is the bound: it stops writing at the limit.
	const exported = exportMusicXml(text, { maxLength: options.maxXmlLength ?? MAX_XML_LENGTH });
	if (!exported.ok && exported.tooLarge) return { ok: false, reason: TOO_LARGE, diagnostics: [] };
	if (!exported.ok)
		return { ok: false, reason: refusal(exported.diagnostics), diagnostics: exported.diagnostics };
	try {
		const engraved = engraveXml(vrv, exported.xml, options);
		return { ok: true, xml: exported.xml, pages: engraved.pages, svg: cleanSvg(engraved.svg) };
	} catch (e) {
		return { ok: false, reason: e instanceof Error ? e.message : String(e), diagnostics: [] };
	}
}
