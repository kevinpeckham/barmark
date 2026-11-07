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
	return parts.length > 0 ? parts.join("  ") : null;
}

/**
 * Whether bar `b` is written `%` (spec 6.3.6): it repeats the bar before slot
 * for slot, starts on an attack, and sits in the same passage. A directive
 * line before it (changes, Task 5) would also refuse it: they share `changes`.
 */
function repeats(input: Input, symbols: string[][], b: number): boolean {
	const prev = symbols[b - 1];
	const here = symbols[b];
	const bar = input.bars[b];
	const before = input.bars[b - 1];
	if (!prev || !here || !bar || !before) return false;
	if (input.sections.has(b) || input.changes.has(b) || !sameMeter(bar, before)) return false;
	if (here.length !== prev.length || here[0] === prev.at(-1)) return false;
	return here.every((s, k) => s === prev[k]);
}

/** One bar's cell: slots, a hold written `/` where it equals the slot before. */
function cell(input: Input, symbols: string[][], b: number, last: string | undefined): string {
	const here = symbols[b] as string[];
	let before = last;
	const named = b === 0 || input.sections.has(b);
	return here
		.map((s, k) => {
			const held = before === s && !(named && k === 0);
			before = s;
			return held ? "/" : s;
		})
		.join(" ");
}

/**
 * The chart text before printing: holds (6.3.5), then `%` (6.3.6), then the
 * layout: the directives line, then the bars `barsPerLine` to a line.
 */
export function writeChart(input: Input, symbols: string[][], options: WriteOptions): string {
	const cells = symbols.map((_, b) =>
		options.simile && repeats(input, symbols, b)
			? "%"
			: cell(input, symbols, b, symbols[b - 1]?.at(-1)),
	);
	const lines: string[] = [];
	const head = directives(input);
	if (head !== null) lines.push(head);
	for (let i = 0; i < cells.length; i += options.barsPerLine)
		lines.push(`| ${cells.slice(i, i + options.barsPerLine).join(" | ")} |`);
	return `${lines.join("\n")}\n`;
}
