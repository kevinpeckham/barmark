import { type ChartDiagnostic, type ChartParse, extractPart, parseChart } from "barmark";
import { comment } from "./changes.js";
import { defineLines } from "./defines.js";
import { gridSection } from "./grid.js";
import { Losses } from "./losses.js";
import { lyricSection } from "./lyrics.js";
import { headerLines, headerLosses } from "./meta.js";
import { layout, type Occurrence, occurrences } from "./plan.js";
import { sheetOf } from "./sheet.js";
import type { LyricsheetOptions, LyricsheetResult, Out } from "./types.js";
import { writtenOf } from "./written.js";

const refusal = (message: string, token = ""): ChartDiagnostic => ({
	line: 0,
	severity: "error",
	message,
	token,
});

type Parsed =
	| { ok: true; parse: ChartParse; whole: ChartParse }
	| { ok: false; diagnostics: ChartDiagnostic[] };

/** Why there is nothing to export, or the parse to export (the part asked for, when one is). */
function parsed(chart: string, options: LyricsheetOptions): Parsed {
	const { part } = options;
	const whole = parseChart(chart);
	const parse = part === undefined ? whole : extractPart(chart, part);
	const refused = (...diagnostics: ChartDiagnostic[]): Parsed => ({ ok: false, diagnostics });
	if (parse === null)
		return refused(refusal(`no part labelled ${part}`, part), ...whole.diagnostics);
	if (parse.diagnostics.some((d) => d.severity === "error")) return refused(...parse.diagnostics);
	return parse.bars.length === 0
		? refused(refusal("the chart has no bars to export"), ...parse.diagnostics)
		: { ok: true, parse, whole };
}

/**
 * The sheet after its header: text lines written before any bar, then
 * each section occurrence in play order. A sung one is a lyric
 * environment; one with no words a grid.
 */
function body(chart: string, p: Parsed & { ok: true }, options: LyricsheetOptions, out: Out): void {
	const sheet = sheetOf(chart, p.parse, options, out, p.whole);
	const first = sheet.bars[0];
	if (!first) return;
	const lay = layout(sheet);
	out.lines.push(...lay.header.map((text) => comment(text, undefined, out)));
	const previous: Occurrence[] = [];
	const context = {
		previous,
		layout: lay,
		first,
		chorus: { last: null },
		written: writtenOf(sheet),
	};
	for (const o of occurrences(sheet)) {
		if (o.sung) lyricSection(o, out, context);
		else gridSection(o, out, context);
		previous.push(o);
	}
}

/**
 * The define block after the header (`headed` lines), a blank line on each
 * side, before whatever the body wrote first; none when no chord has a shape.
 */
function defined(out: Out, headed: number): void {
	const lines = defineLines(out.uses ?? [], out);
	if (lines.length === 0) return;
	out.lines.splice(headed, 0, "", ...lines, ...(out.lines[headed] === "" ? [] : [""]));
}

/** A chart as a ChordPro lyric sheet, and what it could not carry. Never throws. */
export function exportLyricsheet(chart: string, options: LyricsheetOptions = {}): LyricsheetResult {
	const p = parsed(chart, options);
	if (!p.ok) return p;
	const out: Out = {
		lines: [],
		losses: new Losses(),
		...(options.diagrams === "guitar" && { uses: [] }),
	};
	out.lines.push(...headerLines(p.parse, options.title));
	const headed = out.lines.length;
	headerLosses(p.parse, out.losses, options.title);
	body(chart, p, options, out);
	if (out.uses) defined(out, headed);
	return {
		ok: true,
		text: out.lines.length === 0 ? "" : `${out.lines.join("\n")}\n`,
		diagnostics: p.parse.diagnostics,
		losses: out.losses.list(),
	};
}
