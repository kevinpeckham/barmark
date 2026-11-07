import { printKey } from "barmark";
import type { Input } from "./input.js";
import type { BarSpan } from "./runs.js";

export type WriteOptions = { simile: boolean; barsPerLine: number };

const sameMeter = (a: BarSpan, b: BarSpan) =>
	a.meter.n === b.meter.n && a.meter.d === b.meter.d && a.beats === b.beats;

/** The starting directives on one line, or null when there are none. */
function directives(input: Input): string | null {
	const parts: string[] = [];
	if (input.key) parts.push(`key: ${printKey(input.key)}`);
	if (input.meterWritten) parts.push(`time: ${input.meter.n}/${input.meter.d}`);
	if (input.tempo !== null) parts.push(`tempo: ${input.tempo}`);
	return parts.length > 0 ? parts.join(", ") : null;
}

/** One bar's slots with holds as `/`; the first slot of the chart and of a section is named. */
function held(input: Input, symbols: string[][], b: number): string[] {
	const here = symbols[b] as string[];
	let before = symbols[b - 1]?.at(-1);
	const named = b === 0 || input.sections.has(b);
	return here.map((s, k) => {
		const hold = before === s && !(named && k === 0);
		before = s;
		return hold ? "/" : s;
	});
}

/**
 * Whether bar `b` is written `%` (spec 6.3.6): its written slots equal the
 * bar before's, it starts on an attack, and it sits in the same passage. The
 * parser copies the previous bar's written slots, holds included, so the
 * comparison is of held cells. A directive line before it (changes, Task 5)
 * also refuses it: they share `changes`.
 */
function repeats(input: Input, cells: string[][], b: number): boolean {
	const prev = cells[b - 1];
	const here = cells[b];
	const bar = input.bars[b];
	const before = input.bars[b - 1];
	if (!prev || !here || !bar || !before) return false;
	if (input.sections.has(b) || input.changes.has(b) || !sameMeter(bar, before)) return false;
	return here[0] !== "/" && here.length === prev.length && here.every((s, k) => s === prev[k]);
}

/**
 * The chart text before printing: holds (6.3.5), then `%` (6.3.6), then the
 * layout: the directives line, then the bars `barsPerLine` to a line.
 */
export function writeChart(input: Input, symbols: string[][], options: WriteOptions): string {
	const slots = symbols.map((_, b) => held(input, symbols, b));
	const cells = slots.map((c, b) =>
		options.simile && repeats(input, slots, b) ? "%" : c.join(" "),
	);
	const lines: string[] = [];
	const head = directives(input);
	if (head !== null) lines.push(head);
	for (let i = 0; i < cells.length; i += options.barsPerLine)
		lines.push(`| ${cells.slice(i, i + options.barsPerLine).join(" | ")} |`);
	return `${lines.join("\n")}\n`;
}
