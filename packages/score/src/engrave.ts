import { exportMusicXml } from "@barmark/musicxml";
import type { ChartDiagnostic } from "barmark";
import type { VerovioToolkit } from "verovio/esm";

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
	if (!vrv.loadData(xml)) throw new Error("Verovio could not read the score");
	const pages = vrv.getPageCount();
	if (pages < 1) throw new Error("The score has no pages");
	const svgs: string[] = [];
	for (let p = 1; p <= pages; p++)
		svgs.push(`<div class="bms-score-page">${vrv.renderToSVG(p)}</div>`);
	return { svg: svgs.join(""), pages };
}

function refusal(diagnostics: ChartDiagnostic[]): string {
	const first = diagnostics.find((d) => d.severity === "error") ?? diagnostics[0];
	return first ? `Line ${first.line}: ${first.message}` : "The chart has no bars";
}

/** A chart as a full score, or why it cannot be one. */
export function engraveChart(vrv: VerovioToolkit, text: string, options: EngraveOptions): Engraved {
	const exported = exportMusicXml(text);
	if (!exported.ok)
		return { ok: false, reason: refusal(exported.diagnostics), diagnostics: exported.diagnostics };
	return { ok: true, xml: exported.xml, ...engraveXml(vrv, exported.xml, options) };
}
