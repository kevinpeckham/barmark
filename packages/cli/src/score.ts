/**
 * barmark render --score: the chart engraved as a full score, the drawing
 * `<barmark-score>` shows, by Verovio in this process (no worker). Verovio
 * (about 7 MB) is imported on the first score only, so the other commands
 * never load it.
 */
import { exportMusicXml } from "@barmark/musicxml";
import { stylesheet } from "@barmark/render";
import { engraveChart, engraveXml, type ScoreTheme, scorePane, scoreStyles } from "@barmark/score";
import type { VerovioToolkit } from "verovio/esm";

/** The width a score is engraved at unless --width says otherwise, in CSS pixels. */
export const DEFAULT_WIDTH = 900;
/** `@barmark/score` engraves nothing narrower; Verovio's page width (2.5 units a pixel) stops at 100000. */
export const MIN_WIDTH = 320;
export const MAX_WIDTH = 40_000;

let toolkit: Promise<VerovioToolkit> | undefined;

/** One toolkit for the process, its log off: Verovio would otherwise print to stdout, into the page. */
function loadToolkit(): Promise<VerovioToolkit> {
	toolkit ??= (async () => {
		const esm = await import("verovio/esm");
		const { default: createModule } = await import("verovio/wasm");
		const module = await createModule();
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

/**
 * One part alone: its MusicXML (`@barmark/musicxml`'s `part`), engraved as
 * `engraveChart` engraves the whole. The caller has checked the part
 * exists, so its export fails only when the chart's does: `engraveChart`
 * then gives the reason, worded as for the whole chart, before Verovio runs.
 */
function engravePart(vrv: VerovioToolkit, text: string, part: string, width: number): Result {
	const exported = exportMusicXml(text, { part });
	if (!exported.ok) {
		const whole = engraveChart(vrv, text, { width });
		return whole.ok ? { ok: false, reason: `no part labelled ${part}` } : whole;
	}
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
): Promise<{ ok: true; html: string } | { ok: false; reason: string }> {
	const vrv = await loadToolkit();
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
