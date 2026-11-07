import { type Key, type Meter, printKey } from "barmark";
import type { BarChange, Input } from "./input.js";
import type { BarSpan } from "./runs.js";

export type WriteOptions = { simile: boolean; barsPerLine: number };

const sameMeter = (a: BarSpan, b: BarSpan) =>
	a.meter.n === b.meter.n && a.meter.d === b.meter.d && a.beats === b.beats;

/** Directives on one line, in the order key, time, tempo; null when there are none. */
function directiveLine(key: Key | null, meter: Meter | null, tempo: number | null): string | null {
	const parts: string[] = [];
	if (key) parts.push(`key: ${printKey(key)}`);
	if (meter) parts.push(`time: ${meter.n}/${meter.d}`);
	if (tempo !== null) parts.push(`tempo: ${tempo}`);
	return parts.length > 0 ? parts.join(", ") : null;
}

const changeLine = (c: BarChange) => directiveLine(c.key ?? null, c.meter ?? null, c.tempo ?? null);

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
 * comparison is of held cells. A bar with an unknown slot (`?`) is written
 * out, never `%`. A directive line before it (changes, Task 5)
 * also refuses it: they share `changes`.
 */
function repeats(input: Input, cells: string[][], b: number, symbols: string[][]): boolean {
	const prev = cells[b - 1];
	const here = cells[b];
	const bar = input.bars[b];
	const before = input.bars[b - 1];
	if (!prev || !here || !bar || !before || symbols[b]?.includes("?")) return false;
	if (input.sections.has(b) || input.changes.has(b) || !sameMeter(bar, before)) return false;
	return here[0] !== "/" && here.length === prev.length && here.every((s, k) => s === prev[k]);
}

/** A pickup bar names its own one-bar meter in front of its first slot. */
function cellOf(input: Input, slots: string[], b: number): string {
	const bar = input.bars[b] as BarSpan;
	const text = slots.join(" ");
	return bar.pickup ? `[${bar.meter.n}/${bar.meter.d}] ${text}` : text;
}

/**
 * The chart text before printing: holds (6.3.5), then `%` (6.3.6), then the
 * layout: the title, the starting directives, then the bars `barsPerLine` to
 * a line. A heading or a directive line starts a new line, the heading first;
 * a pickup is an extra bar on the first line, and a section on the first
 * grid bar is written before it.
 */
export function writeChart(input: Input, symbols: string[][], options: WriteOptions): string {
	const slots = symbols.map((_, b) => held(input, symbols, b));
	const cells = slots.map((c, b) =>
		options.simile && repeats(input, slots, b, symbols) ? "%" : cellOf(input, c, b),
	);
	const lines: string[] = [];
	if (input.title !== null) lines.push(`# ${input.title}`);
	const head = directiveLine(input.key, input.meterWritten ? input.meter : null, input.tempo);
	if (head !== null) lines.push(head);
	const pickup = input.bars[0]?.pickup === true;
	let row: string[] = [];
	let counted = 0;
	const flush = () => {
		if (row.length > 0) lines.push(`| ${row.join(" | ")} |`);
		row = [];
		counted = 0;
	};
	const heading = (b: number) => {
		const name = input.sections.get(b);
		if (name === undefined) return;
		flush();
		lines.push(`## ${name}`);
	};
	if (pickup) heading(1);
	for (const [b, cell] of cells.entries()) {
		if (!(pickup && b <= 1)) heading(b);
		const change = input.changes.get(b);
		const line = change ? changeLine(change) : null;
		if (line !== null) {
			flush();
			lines.push(line);
		}
		if (counted === options.barsPerLine) flush();
		row.push(cell);
		if (!(pickup && b === 0)) counted++;
	}
	flush();
	return `${lines.join("\n")}\n`;
}
