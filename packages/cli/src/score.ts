/**
 * barmark render --score: the chart engraved as a full score, the drawing
 * `<barmark-score>` shows, by Verovio in this process (no worker). Verovio's
 * module (about 7 MB) comes from `io.verovio` on the first score only, so the
 * other commands never load it.
 */
import { exportMusicXml } from "@barmark/musicxml";
import { stylesheet } from "@barmark/render";
import { engraveChart, engraveXml, type ScoreTheme, scorePane, scoreStyles } from "@barmark/score";
import type { ChartDiagnostic } from "barmark";
import type { VerovioToolkit } from "verovio/esm";
import type { Io } from "./io.js";

/** The width a score is engraved at unless --width says otherwise, in CSS pixels. */
export const DEFAULT_WIDTH = 900;
/** `@barmark/score` engraves nothing narrower; Verovio's page width (2.5 units a pixel) stops at 100000. */
export const MIN_WIDTH = 320;
export const MAX_WIDTH = 40_000;

let toolkit: Promise<VerovioToolkit> | undefined;

/** One toolkit for the process, its log off: Verovio would otherwise print to stdout, into the page. */
function loadToolkit(verovio: Io["verovio"]): Promise<VerovioToolkit> {
	toolkit ??= (async () => {
		const esm = await import("verovio/esm");
		const module = await (await verovio())();
		// Verovio's typings omit the log switch; it is exported all the same (as the score worker uses it).
		const { enableLog, LOG_OFF } = esm as unknown as {
			enableLog(level: number, module: unknown): void;
			LOG_OFF: number;
		};
		enableLog(LOG_OFF, module);
		return new esm.VerovioToolkit(module);
	})();
	return toolkit;
}

type Result = { ok: true; svg: string } | { ok: false; reason: string };

/** Why the export failed, worded as `engraveChart` words it: the first error, with its line when it has one. */
function exportReason(diagnostics: readonly ChartDiagnostic[]): string {
	const first = diagnostics.find((d) => d.severity === "error") ?? diagnostics[0];
	if (first === undefined) return "the chart could not be exported";
	return first.line > 0 ? `Line ${first.line}: ${first.message}` : first.message;
}

/** One part alone: its MusicXML (`@barmark/musicxml`'s `part`), engraved as `engraveChart` engraves the whole. */
function engravePart(vrv: VerovioToolkit, text: string, part: string, width: number): Result {
	const exported = exportMusicXml(text, { part });
	if (!exported.ok) return { ok: false, reason: exportReason(exported.diagnostics) };
	try {
		return { ok: true, svg: engraveXml(vrv, exported.xml, { width }).svg };
	} catch (e) {
		return { ok: false, reason: e instanceof Error ? e.message : String(e) };
	}
}

export type ScoreOptions = { theme: ScoreTheme; width: number; part?: string; label: string };

/** The score's markup and styles for a page body, or why the chart cannot be engraved. */
export async function scoreBody(
	text: string,
	options: ScoreOptions,
	io: Pick<Io, "verovio">,
): Promise<{ ok: true; html: string } | { ok: false; reason: string }> {
	const vrv = await loadToolkit(io.verovio);
	const engraved =
		options.part === undefined
			? engraveChart(vrv, text, { width: options.width })
			: engravePart(vrv, text, options.part, options.width);
	if (!engraved.ok) return { ok: false, reason: engraved.reason };
	try {
		const pane = scorePane(engraved.svg, options.theme, options.label);
		return { ok: true, html: `<style>${stylesheet}${scoreStyles}</style>\n${pane}` };
	} catch (e) {
		return { ok: false, reason: e instanceof Error ? e.message : String(e) };
	}
}
