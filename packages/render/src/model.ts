/**
 * The chart model: what to draw, with every musical decision made here
 * (`%` copied out, bar numbers, repeats, errors) so the HTML layer only
 * draws. Built from the parser's document lines; the played bars supply
 * bar numbers and the slots `%` copies.
 */
import {
	type Cell,
	type ChartParse,
	type Directives,
	extractPart,
	type Line,
	type PlayedBar,
	parseChart,
	type SectionOccurrence,
} from "barmark";
import type {
	BlockItem,
	CellModel,
	ChartModel,
	ErrorItem,
	LayoutOptions,
	RowItem,
	SectionBlock,
} from "./types.js";

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
	/** Each section's lines, by its heading's line number. */
	written: Map<number, Group>;
	/** The played bars by the line they are written on: in a chart of several parts, each part's own. */
	bars: PlayedBar[];
};

/** Each part's bars on its own lines; a tutti bar once (barmark's grammar 7.4). */
function barsByLine(parse: ChartParse): PlayedBar[] {
	if (parse.parts.length < 2) return parse.bars;
	const seen = new Set<string>();
	return parse.bars.flatMap((b) =>
		(b.parts ?? []).flatMap((p) => {
			const key = `${b.index}:${p?.line}`;
			if (!p || seen.has(key)) return [];
			seen.add(key);
			const { words: _w, parts: _p, tacet: _t, ...shared } = b;
			return [{ ...shared, line: p.line, slots: p.slots, ...(p.words && { words: p.words }) }];
		}),
	);
}

/** The whole chart, or one part of it; an undeclared part draws the whole chart, with a warning. */
function parseFor(text: string, part: string | undefined): ChartParse {
	const one = part ? extractPart(text, part) : null;
	if (one || !part) return one ?? parseChart(text);
	const whole = parseChart(text);
	const missing = {
		line: 1,
		severity: "warning" as const,
		message: `no part labelled ${part}`,
		token: part,
	};
	return { ...whole, diagnostics: [missing, ...whole.diagnostics] };
}

export function layoutChart(text: string, options: LayoutOptions = {}): ChartModel {
	const parse = parseFor(text, options.part);
	const { header, body } = splitHeader(parse.lines);
	const groups = groupLines(body);
	const ctx: Context = {
		parse,
		source: text.split(/\r?\n/),
		errors: errorsByLine(parse),
		written: new Map(groups.flatMap((g) => (g.heading ? [[g.heading.line, g] as const] : []))),
		bars: barsByLine(parse),
	};
	const blocks = groups.map((g) => layoutGroup(g, ctx));
	if (options.rehearsalLetters) letterBlocks(blocks);
	return {
		title: parse.title,
		part: parse.part,
		parts: parse.parts,
		header,
		blocks,
		diagnostics: parse.diagnostics,
	};
}

/** Rehearsal letters mark position: every section occurrence, and leading bars, in play order. */
function letterBlocks(blocks: SectionBlock[]): void {
	let n = 0;
	for (const b of blocks) {
		if (b.form === null && !b.items.some((i) => i.kind === "row" || i.kind === "system")) continue;
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

/** The title line, and the directives before any other content, form the header. */
function splitHeader(lines: Line[]): { header: Directives; body: Line[] } {
	const header: Directives = {};
	let i = 0;
	for (; i < lines.length; i++) {
		const l = lines[i];
		if (l?.kind === "title" || l?.kind === "part") continue;
		if (l?.kind !== "directive") break;
		// A new feel replaces the old one whole, its amount included.
		if (l.set.feel) delete header.swingPercent;
		Object.assign(header, l.set);
	}
	return { header, body: lines.slice(i).filter((l) => l.kind !== "title" && l.kind !== "part") };
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
		out.findLastIndex((i) => i.kind === "row" || i.kind === "system"),
		out.findLastIndex((i) => i.kind === "text"),
	);
	out.splice(after + 1, 0, ...queue);
	return out;
}

/** The row's last bar, marked cut. */
function cutRow(row: RowItem): RowItem {
	const c = row.cells.findLastIndex((cell) => cell.kind === "slots");
	const cells = row.cells.map((cell, i) =>
		i === c && cell.kind === "slots" ? { ...cell, cut: true } : cell,
	);
	return { ...row, cells };
}

const hasBars = (i: BlockItem) =>
	(i.kind === "row" && lastSlots(i.cells) !== null) || i.kind === "system";

/** The parser cuts the last bar it would play; a fermata is not a bar. A system's every part loses it. */
function markCut(items: BlockItem[]): BlockItem[] {
	const r = items.findLastIndex(hasBars);
	const item = items[r];
	if (!item || (item.kind !== "row" && item.kind !== "system")) return items;
	const cut: BlockItem =
		item.kind === "row"
			? cutRow(item)
			: {
					...item,
					rows: item.rows.map((p) => (p.row.kind === "row" ? { ...p, row: cutRow(p.row) } : p)),
				};
	return items.map((it, i) => (i === r ? cut : it));
}

/** How many cells an item's widest row has. */
const widthOf = (i: BlockItem) =>
	i.kind === "row"
		? i.cells.length
		: i.kind === "system"
			? Math.max(0, ...i.rows.map((p) => (p.row.kind === "row" ? p.row.cells.length : 0)))
			: 0;

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
		columns: Math.max(0, ...items.map(widthOf)),
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
	for (const [i, l] of lines.entries()) {
		const system = systemOf(l);
		if (system !== null) {
			// A system is laid out once, at its first line.
			if (systemOf(lines[i - 1]) === system) continue;
			const item = layoutSystem(systemLines(lines, i), occurrence, previous, ctx);
			previous = lastOfSystem(item) ?? previous;
			items.push(item);
			continue;
		}
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

type SystemLine = Extract<Line, { kind: "bars" | "invalid" }>;
const systemOf = (l: Line | undefined) =>
	(l?.kind === "bars" || l?.kind === "invalid") && l.system !== undefined ? l.system : null;

/** The lines of the system that starts at `i`. */
function systemLines(lines: Line[], i: number): SystemLine[] {
	const system = systemOf(lines[i]);
	const out: SystemLine[] = [];
	for (const l of lines.slice(i)) {
		if (systemOf(l) !== system) break;
		out.push(l as SystemLine);
	}
	return out;
}

type SystemItem = Extract<BlockItem, { kind: "system" }>;

const lastOfSystem = (item: SystemItem) => {
	const first = item.rows.find((p) => p.row.kind === "row" && !p.row.cells.some(isTacet))?.row;
	return first?.kind === "row" ? lastSlots(first.cells) : null;
};

const isTacet = (c: CellModel) => c.kind === "slots" && c.tacet === true;

/** A row per declared part, in score order: its own line, its error, or tacet bars. */
function layoutSystem(
	lines: SystemLine[],
	occurrence: SectionOccurrence | undefined,
	previous: SlotsCell | null,
	ctx: Context,
): SystemItem {
	const ref = lines.find((l): l is BarsLine => l.kind === "bars" && !ctx.errors.has(l.line));
	const reference = ref
		? layoutRow(ref, playedOn(ref.line, occurrence, ctx.bars), previous, ctx)
		: null;
	const rows = ctx.parse.parts.map((p) => {
		const own = lines.find((l) => l.part === p.label);
		const row: RowItem | ErrorItem =
			own && ctx.errors.has(own.line)
				? errorItem(own.line, ctx)
				: own?.kind === "bars"
					? layoutRow(own, playedOn(own.line, occurrence, ctx.bars), previous, ctx)
					: tacetRow(reference, lines[0]?.line ?? 0);
		return { label: p.label ?? "", name: p.name, row };
	});
	return {
		kind: "system",
		line: lines[0]?.line ?? 0,
		barNumber: reference?.barNumber ?? null,
		rows,
	};
}

const NO_ROW: RowItem = {
	kind: "row",
	line: 0,
	barNumber: null,
	opens: false,
	closes: false,
	repeat: null,
	ending: null,
	cells: [],
};

/** The system's bars, with nothing played in them (barmark's grammar 7.4). */
function tacetRow(reference: RowItem | null, line: number): RowItem {
	const base = reference ?? NO_ROW;
	const cells: CellModel[] = base.cells.map((c) =>
		c.kind === "slots" ? { kind: "slots", meter: c.meter, slots: [], cut: false, tacet: true } : c,
	);
	return { ...base, line, cells };
}

function layoutLine(
	l: Line,
	occurrence: SectionOccurrence | undefined,
	previous: SlotsCell | null,
	ctx: Context,
): BlockItem | null {
	switch (l.kind) {
		case "bars":
			return layoutRow(l, playedOn(l.line, occurrence, ctx.bars), previous, ctx);
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

function errorItem(line: number, ctx: Context): ErrorItem {
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
): RowItem {
	const cells: CellModel[] = [];
	// A cut bar is not played: what it would play is what the line's bar played when written.
	const written = ctx.bars.filter((b) => b.line === l.line);
	let bar = 0;
	let prev = previous;
	for (const cell of l.cells) {
		const model = layoutCell(cell, played[bar] ?? written[bar], prev);
		if (cell.kind === "slots" || cell.kind === "simile") bar++;
		if (model.kind === "slots") prev = model;
		cells.push(model);
	}
	return {
		kind: "row",
		line: l.line,
		// Numbered as written, as a band counts (issue #92): repeats, endings, jumps and replays don't move it.
		barNumber: (played[0] ?? written[0])?.written ?? null,
		opens: l.opens,
		closes: l.closes,
		repeat: l.repeat,
		ending: l.ending,
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
	if (cell.kind === "direction" || cell.kind === "rehearsal") return cell;
	return withPlayed(layoutBar(cell, played, previous), played);
}

/** A bar or `%`, with the slots it plays. */
function layoutBar(
	cell: Extract<Cell, { kind: "slots" | "simile" }>,
	played: PlayedBar | undefined,
	previous: SlotsCell | null,
): SlotsCell {
	const own = cell.kind === "slots" ? cell : null;
	return {
		kind: "slots",
		meter: (own ?? previous)?.meter ?? null,
		slots: played?.slots ?? own?.slots ?? [],
		cut: false,
		...wordsOf(cell),
	};
}

/** The words written on a bar, and whether the part rests there, as fields to spread. */
const wordsOf = (cell: Extract<Cell, { kind: "slots" | "simile" }>) => ({
	...(cell.words && { words: cell.words }),
	...(cell.kind === "slots" && cell.tacet && { tacet: cell.tacet }),
});

/** What the parser says about the bar as played: inside a rit. or accel., and its key. */
function withPlayed(cell: SlotsCell, played: PlayedBar | undefined): SlotsCell {
	const change = played?.tempoChange?.kind;
	const key = played?.key;
	return { ...cell, ...(change ? { tempoChange: change } : {}), ...(key ? { key } : {}) };
}
