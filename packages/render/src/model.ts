/**
 * The chart model: what to draw, with every musical decision made here
 * (`%` copied out, bar numbers, repeats, errors) so the HTML layer only
 * draws. Built from the parser's document lines; the played bars supply
 * bar numbers and the slots `%` copies.
 */
import {
	type Cell,
	type ChartEvent,
	type ChartParse,
	type Directives,
	type Line,
	type PlayedBar,
	parseChart,
	type SectionOccurrence,
} from "barmark";
import type { BlockItem, CellModel, ChartModel, LayoutOptions, SectionBlock } from "./types.js";

type SectionLine = Extract<Line, { kind: "section" }>;
type BarsLine = Extract<Line, { kind: "bars" }>;
type SlotsCell = Extract<CellModel, { kind: "slots" }>;
/** The document's lines between two headings. */
type Group = { heading: SectionLine | null; lines: Line[] };

type Context = {
	parse: ChartParse;
	source: string[];
	/** Error messages by line number. */
	errors: Map<number, string[]>;
	/** Bars numbered above this come after an open repeat: their number is unknown. */
	lastKnownBar: number;
	/** Each section's lines, by its heading's line number. */
	written: Map<number, Group>;
};

export function layoutChart(text: string, options: LayoutOptions = {}): ChartModel {
	const parse = parseChart(text);
	const { header, body } = splitHeader(parse.lines);
	const groups = groupLines(body);
	const ctx: Context = {
		parse,
		source: text.split(/\r?\n/),
		errors: errorsByLine(parse),
		lastKnownBar: lastKnownBar(parse.events),
		written: new Map(groups.flatMap((g) => (g.heading ? [[g.heading.line, g] as const] : []))),
	};
	const blocks = groups.map((g) => layoutGroup(g, ctx));
	if (options.rehearsalLetters) letterBlocks(blocks);
	return { title: parse.title, header, blocks, diagnostics: parse.diagnostics };
}

/** Rehearsal letters mark position: every section occurrence, and leading bars, in play order. */
function letterBlocks(blocks: SectionBlock[]): void {
	let n = 0;
	for (const b of blocks) {
		if (b.form === null && !b.items.some((i) => i.kind === "row")) continue;
		b.rehearsal = letters(n++);
	}
}

/** 0 → A, 25 → Z, 26 → AA, as spreadsheet columns count. */
function letters(n: number): string {
	const head = n >= 26 ? letters(Math.floor(n / 26) - 1) : "";
	return head + String.fromCharCode(65 + (n % 26));
}

function errorsByLine(parse: ChartParse): Map<number, string[]> {
	const errors = new Map<number, string[]>();
	for (const d of parse.diagnostics) {
		if (d.severity !== "error") continue;
		errors.set(d.line, [...(errors.get(d.line) ?? []), d.message]);
	}
	return errors;
}

/** The count of bars up to the end of the first open repeat (all of them if there is none). */
function lastKnownBar(events: ChartEvent[]): number {
	let count = 0;
	const countBars = (es: ChartEvent[]): void => {
		for (const e of es) {
			if (e.kind === "bar") count++;
			else if (e.kind === "open") countBars(e.events);
		}
	};
	for (const e of events) {
		if (e.kind === "open") {
			countBars(e.events);
			return count;
		}
		if (e.kind === "bar") count++;
	}
	return Number.POSITIVE_INFINITY;
}

/** The title line, and the directives before any other content, form the header. */
function splitHeader(lines: Line[]): { header: Directives; body: Line[] } {
	const header: Directives = {};
	let i = 0;
	for (; i < lines.length; i++) {
		const l = lines[i];
		if (l?.kind === "title") continue;
		if (l?.kind !== "directive") break;
		Object.assign(header, l.set);
	}
	return { header, body: lines.slice(i).filter((l) => l.kind !== "title") };
}

function groupLines(lines: Line[]): Group[] {
	const groups: Group[] = [];
	let current: Group = { heading: null, lines: [] };
	for (const l of lines) {
		if (l.kind === "section") {
			if (current.heading || current.lines.length) groups.push(current);
			current = { heading: l, lines: [] };
		} else current.lines.push(l);
	}
	if (current.heading || current.lines.length) groups.push(current);
	return groups;
}

function layoutGroup(group: Group, ctx: Context): SectionBlock {
	const h = group.heading;
	const occurrence = h ? ctx.parse.sections.find((s) => s.line === h.line) : undefined;
	// A heading with an error is drawn as written, like any line with an error.
	const broken = h !== null && ctx.errors.has(h.line);
	const written = occurrence?.replayOf != null ? ctx.written.get(occurrence.replayOf) : undefined;
	const items = [
		...(broken ? [errorItem(h.line, ctx)] : []),
		...(written && occurrence
			? layoutReplay(written, group, occurrence, ctx)
			: layoutLines(group.lines, occurrence, ctx)),
	];
	return blockOf(broken ? null : h, occurrence, items);
}

/**
 * A replay draws its written section with its own bar numbers. Its own
 * text lines replace the written section's in order (extra ones follow the
 * last row); its other lines follow. `->` marks the bar the parser cut.
 */
function layoutReplay(
	written: Group,
	replay: Group,
	occurrence: SectionOccurrence,
	ctx: Context,
): BlockItem[] {
	const isText = (l: Line) => l.kind === "text";
	const body = layoutLines(written.lines, occurrence, ctx);
	const ownText = layoutLines(replay.lines.filter(isText), occurrence, ctx);
	const ownOther = layoutLines(
		replay.lines.filter((l) => !isText(l)),
		occurrence,
		ctx,
	);
	const items = [...substituteText(body, ownText), ...ownOther];
	return occurrence.elided ? markCut(items) : items;
}

function substituteText(items: BlockItem[], own: BlockItem[]): BlockItem[] {
	if (!own.length) return items;
	const queue = [...own];
	const out = items.flatMap((i) => {
		if (i.kind !== "text") return [i];
		const next = queue.shift();
		return next ? [next] : [];
	});
	// Extra lines continue after the last row and any text already following it.
	const after = Math.max(
		out.findLastIndex((i) => i.kind === "row"),
		out.findLastIndex((i) => i.kind === "text"),
	);
	out.splice(after + 1, 0, ...queue);
	return out;
}

/** The parser cuts the last bar it would play; a fermata is not a bar. */
function markCut(items: BlockItem[]): BlockItem[] {
	const r = items.findLastIndex((i) => i.kind === "row" && lastSlots(i.cells) !== null);
	const row = items[r];
	if (row?.kind !== "row") return items;
	const c = row.cells.findLastIndex((cell) => cell.kind === "slots");
	const cells = row.cells.map((cell, i) =>
		i === c && cell.kind === "slots" ? { ...cell, cut: true } : cell,
	);
	return items.map((item, i) => (i === r ? { ...row, cells } : item));
}

function blockOf(
	h: SectionLine | null,
	occurrence: SectionOccurrence | undefined,
	items: BlockItem[],
): SectionBlock {
	return {
		heading: h?.name ?? null,
		repeat: h?.repeat ?? null,
		form: occurrence?.form ?? null,
		rehearsal: null,
		columns: Math.max(0, ...items.map((i) => (i.kind === "row" ? i.cells.length : 0))),
		items,
	};
}

function layoutLines(
	lines: Line[],
	occurrence: SectionOccurrence | undefined,
	ctx: Context,
): BlockItem[] {
	const items: BlockItem[] = [];
	let previous: SlotsCell | null = null;
	for (const l of lines) {
		if (ctx.errors.has(l.line)) {
			items.push(errorItem(l.line, ctx));
			continue;
		}
		const item = layoutLine(l, occurrence, previous, ctx);
		if (!item) continue;
		if (item.kind === "row") previous = lastSlots(item.cells) ?? previous;
		items.push(item);
	}
	return items;
}

function layoutLine(
	l: Line,
	occurrence: SectionOccurrence | undefined,
	previous: SlotsCell | null,
	ctx: Context,
): BlockItem | null {
	switch (l.kind) {
		case "bars":
			return layoutRow(l, playedOn(l.line, occurrence, ctx.parse.bars), previous, ctx);
		case "text":
			return textItem(l.text);
		case "directive":
			return { kind: "directive", set: l.set };
		case "invalid":
			return errorItem(l.line, ctx);
		default:
			return null;
	}
}

function textItem(text: string): BlockItem {
	const note = /^###(\s|$)/.exec(text);
	return note
		? { kind: "text", text: text.slice(note[0].length).trim(), note: true }
		: { kind: "text", text, note: false };
}

function errorItem(line: number, ctx: Context): BlockItem {
	return {
		kind: "error",
		line,
		source: (ctx.source[line - 1] ?? "").trimEnd(),
		messages: ctx.errors.get(line) ?? [],
	};
}

const lastSlots = (cells: CellModel[]) =>
	cells.findLast((c): c is SlotsCell => c.kind === "slots") ?? null;

/** The bars a line plays within its section occurrence, in play order. */
function playedOn(
	line: number,
	occurrence: SectionOccurrence | undefined,
	bars: PlayedBar[],
): PlayedBar[] {
	const first = occurrence?.firstBar ?? 1;
	const last = occurrence?.lastBar ?? Number.POSITIVE_INFINITY;
	return bars.filter((b) => b.line === line && b.index >= first && b.index <= last);
}

function layoutRow(
	l: BarsLine,
	played: PlayedBar[],
	previous: SlotsCell | null,
	ctx: Context,
): BlockItem {
	const cells: CellModel[] = [];
	// A cut bar is not played: what it would play is what the line's bar played when written.
	const written = ctx.parse.bars.filter((b) => b.line === l.line);
	let bar = 0;
	let prev = previous;
	for (const cell of l.cells) {
		const model = layoutCell(cell, played[bar] ?? written[bar], prev);
		if (cell.kind !== "fermata") bar++;
		if (model.kind === "slots") prev = model;
		cells.push(model);
	}
	const firstIndex = played[0]?.index;
	return {
		kind: "row",
		line: l.line,
		barNumber: firstIndex !== undefined && firstIndex <= ctx.lastKnownBar ? firstIndex : null,
		opens: l.opens,
		closes: l.closes,
		repeat: l.repeat,
		cells,
	};
}

/** A cell as drawn: `%` becomes the bar it copies, its slots as the parser resolved them; `previous` lends only its meter. */
function layoutCell(
	cell: Cell,
	played: PlayedBar | undefined,
	previous: SlotsCell | null,
): CellModel {
	if (cell.kind === "fermata") return { kind: "fermata" };
	const from = cell.kind === "slots" ? cell : previous;
	return withTempoChange(
		{
			kind: "slots",
			meter: from?.meter ?? null,
			slots: played?.slots ?? (cell.kind === "slots" ? cell.slots : []),
			cut: false,
		},
		played,
	);
}

/** Marks a bar played inside a rit. or accel. */
function withTempoChange(cell: SlotsCell, played: PlayedBar | undefined): SlotsCell {
	const change = played?.tempoChange?.kind;
	return change ? { ...cell, tempoChange: change } : cell;
}
