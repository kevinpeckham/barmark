import { type ChartDiagnostic, type ChartParse, extractPart, parseChart } from "barmark";
import { comment } from "./changes.js";
import { defineLines } from "./defines.js";
import { gridSection } from "./grid.js";
import { pushAll } from "./lists.js";
import { Losses } from "./losses.js";
import { lyricSection } from "./lyrics.js";
import { headerLines, headerLosses } from "./meta.js";
import { layout, type Occurrence, occurrences } from "./plan.js";
import { sheetOf } from "./sheet.js";
import { textChanged, unescapable } from "./text.js";
import type { LyricsheetOptions, LyricsheetResult, Out } from "./types.js";
import { writtenOf } from "./written.js";

const refusal = (message: string, token = ""): ChartDiagnostic => ({
	line: 0,
	severity: "error",
	message,
	token,
});

type Parsed =
	| { ok: true; parse: ChartParse; whole: ChartParse; diagnostics: ChartDiagnostic[] }
	| { ok: false; diagnostics: ChartDiagnostic[] };

/**
 * The whole chart's diagnostics and a part's, each once, in line order: the
 * sheet takes the singer's words from the whole chart (sheet.ts), so a
 * problem there is the sheet's too.
 */
function merged(whole: ChartDiagnostic[], part: ChartDiagnostic[]): ChartDiagnostic[] {
	const once = new Map<string, ChartDiagnostic>();
	for (const d of [...whole, ...part]) {
		const key = JSON.stringify([d.line, d.severity, d.message, d.token]);
		if (!once.has(key)) once.set(key, d);
	}
	return [...once.values()].sort((a, b) => a.line - b.line);
}

/** Why there is nothing to export, or the parse to export (the part asked for, when one is). */
function parsed(chart: string, options: LyricsheetOptions): Parsed {
	const { part } = options;
	const whole = parseChart(chart);
	const parse = part === undefined ? whole : extractPart(chart, part);
	const refused = (diagnostics: ChartDiagnostic[]): Parsed => ({ ok: false, diagnostics });
	if (parse === null)
		return refused([refusal(`no part labelled ${part}`, part), ...whole.diagnostics]);
	const diagnostics =
		parse === whole ? whole.diagnostics : merged(whole.diagnostics, parse.diagnostics);
	if (diagnostics.some((d) => d.severity === "error")) return refused(diagnostics);
	return parse.bars.length === 0
		? refused([refusal("the chart has no bars to export"), ...diagnostics])
		: { ok: true, parse, whole, diagnostics };
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
	pushAll(
		out.lines,
		lay.header.map((text) => comment(text, undefined, out)),
	);
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
	const block = ["", ...lines, ...(out.lines[headed] === "" ? [] : [""])];
	out.lines = [...out.lines.slice(0, headed), ...block, ...out.lines.slice(headed)];
}

/**
 * The sheet's text: every line through `unescapable`, here where the lines
 * are joined so no line can miss it, one final newline.
 */
function joined(out: Out): string {
	if (out.lines.length === 0) return "";
	const lines = out.lines.map(unescapable);
	if (lines.some((line, i) => line !== out.lines[i])) textChanged(out.losses);
	return `${lines.join("\n")}\n`;
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
	pushAll(out.lines, headerLines(p.parse, options.title));
	const headed = out.lines.length;
	headerLosses(p.parse, out.losses, options.title);
	body(chart, p, options, out);
	if (out.uses) defined(out, headed);
	const text = joined(out);
	return { ok: true, text, diagnostics: p.diagnostics, losses: out.losses.list() };
}
