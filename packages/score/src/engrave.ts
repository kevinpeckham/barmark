import { exportMusicXml } from "@barmark/musicxml";
import type { ChartDiagnostic } from "barmark";
import type { VerovioToolkit } from "verovio/esm";
import { cleanSvg } from "./markup.js";

export type EngraveOptions = {
	/** The width available, in CSS pixels; below 320 it is 320. */
	width: number;
	/** Verovio's scale (default 40). */
	scale?: number;
};

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

/**
 * The MusicXML as Verovio should read it. Verovio 6.4 appends every chord <degree> to the
 * kind text, `print-object="no"` or not, so a degree the text already spells is drawn twice
 * (`D7sus4(7)`); a degree that is not printed is dropped, which changes nothing it draws.
 */
const forVerovio = (xml: string) =>
	xml.replace(/<degree print-object="no">[\s\S]*?<\/degree>/g, "");

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

/** A chart as a full score, or why it cannot be one. */
export function engraveChart(vrv: VerovioToolkit, text: string, options: EngraveOptions): Engraved {
	const exported = exportMusicXml(text);
	if (!exported.ok)
		return { ok: false, reason: refusal(exported.diagnostics), diagnostics: exported.diagnostics };
	try {
		const engraved = engraveXml(vrv, exported.xml, options);
		return { ok: true, xml: exported.xml, pages: engraved.pages, svg: cleanSvg(engraved.svg) };
	} catch (e) {
		return { ok: false, reason: e instanceof Error ? e.message : String(e), diagnostics: [] };
	}
}
