import { type ChartDiagnostic, type ChartParse, extractPart, parseChart } from "barmark";
import { Losses } from "./losses.js";
import { headerLines, headerLosses } from "./meta.js";
import type { LyricsheetOptions, LyricsheetResult, Out } from "./types.js";

const refusal = (message: string, token = ""): ChartDiagnostic => ({
	line: 0,
	severity: "error",
	message,
	token,
});

type Parsed = { ok: true; parse: ChartParse } | { ok: false; diagnostics: ChartDiagnostic[] };

/** Why there is nothing to export, or the parse to export (the part asked for, when one is). */
function parsed(chart: string, options: LyricsheetOptions): Parsed {
	const { part } = options;
	const parse = part === undefined ? parseChart(chart) : extractPart(chart, part);
	const refused = (...diagnostics: ChartDiagnostic[]): Parsed => ({ ok: false, diagnostics });
	if (parse === null)
		return refused(refusal(`no part labelled ${part}`, part), ...parseChart(chart).diagnostics);
	if (parse.diagnostics.some((d) => d.severity === "error")) return refused(...parse.diagnostics);
	return parse.bars.length === 0
		? refused(refusal("the chart has no bars to export"), ...parse.diagnostics)
		: { ok: true, parse };
}

/** A chart as a ChordPro lyric sheet, and what it could not carry. Never throws. */
export function exportLyricsheet(chart: string, options: LyricsheetOptions = {}): LyricsheetResult {
	const p = parsed(chart, options);
	if (!p.ok) return p;
	const out: Out = { lines: [], losses: new Losses() };
	out.lines.push(...headerLines(p.parse, options.title));
	headerLosses(p.parse, out.losses);
	return {
		ok: true,
		text: out.lines.length === 0 ? "" : `${out.lines.join("\n")}\n`,
		diagnostics: p.parse.diagnostics,
		losses: out.losses.list(),
	};
}
