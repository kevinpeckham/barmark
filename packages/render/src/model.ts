/**
 * The chart model: what to draw, with every musical decision made here
 * (`%` copied out, bar numbers, repeats, errors) so the HTML layer only
 * draws. Built from the parser's document lines; the played bars supply
 * bar numbers and the slots `%` copies.
 */
import {
	type Cell,
	type ChartParse,
	type DeclaredPart,
	type Directives,
	extractPart,
	type Line,
	type LineBar,
	type PartBar,
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
	Verse,
} from "./types.js";
import { type Landing, landings, rowVerses, singerOf, sungVerses } from "./verses.js";

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
	bars: DrawnBar[];
};

/** A played bar as drawn: `perPart` marks a tutti bar its parts play differently. */
type DrawnBar = PlayedBar & { perPart?: true };

/** Whether a tutti bar's parts play different slots, as `%` or `/` on a tutti line can. */
const playedApart = (b: PlayedBar, line: number) => {
	const own = (b.parts ?? []).filter((p) => p?.line === line).map((p) => JSON.stringify(p?.slots));
	return new Set(own).size > 1;
};

/** What each line written plays in a bar: each part's share, or each of its lines' (barmark's grammar 7.4, 7.6). */
const sharesOf = (b: PlayedBar): (PartBar | LineBar)[] =>
	b.lines ?? (b.parts ?? []).flatMap((p): (PartBar | LineBar)[] => p?.lines ?? [p]);

/** Each part's bars on its own lines, and each line's; a tutti bar once (barmark's grammar 7.4, 7.6). */
function barsByLine(parse: ChartParse): DrawnBar[] {
	if (parse.parts.length < 2 && !parse.parts.some((p) => p.lines)) return parse.bars;
	const seen = new Set<string>();
	return parse.bars.flatMap((b) =>
		sharesOf(b).flatMap((p) => {
			const key = `${b.index}:${p?.line}`;
			if (!p || seen.has(key)) return [];
			seen.add(key);
			const { words: _w, parts: _p, tacet: _t, lines: _l, ...shared } = b;
			const apart = playedApart(b, p.line) ? { perPart: true as const } : {};
			return [
				{ ...shared, ...apart, line: p.line, slots: p.slots, ...(p.words && { words: p.words }) },
			];
		}),
	);
}

/** The whole chart, or one part of it; an undeclared part draws the whole chart, with a warning. */
function parseFor(text: string, part: string | undefined): ChartParse {
	const one = part ? extractPart(text, part) : null;
	if (one || !part) return one ?? parseChart(text);
	const whole = parseChart(text);
	const missing = {
		// Line 0: the warning is about the chart, not one of its lines.
		line: 0,
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
		credits: parse.credits,
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

/** Lines that name the chart rather than play it: never part of the body. */
const NAMING = new Set<Line["kind"]>(["title", "part", "credit"]);

/** The title line, and the directives before any other content, form the header. */
function splitHeader(lines: Line[]): { header: Directives; body: Line[] } {
	const header: Directives = {};
	let i = 0;
	for (; i < lines.length; i++) {
		const l = lines[i];
		if (!l || NAMING.has(l.kind)) continue;
		if (l.kind !== "directive") break;
		// A new feel replaces the old one whole, its amount included.
		if (l.set.feel) delete header.swingPercent;
		Object.assign(header, l.set);
	}
	return { header, body: lines.slice(i).filter((l) => !NAMING.has(l.kind)) };
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
		// A system is laid out once, at its first line.
		if (system !== null && systemOf(lines[i - 1]) === system) continue;
		const laid: Laid =
			system === null
				? layoutOne(l, occurrence, previous, ctx)
				: layoutSystemAt(systemLines(lines, i), occurrence, previous, ctx);
		previous = laid.previous;
		items.push(...laid.items);
	}
	return items;
}

/** What laying out a line gives: its items, and the last bar drawn so far, whose meter `%` borrows. */
type Laid = { items: BlockItem[]; previous: SlotsCell | null };

/** A system, and the words under it that no line in it sings. */
function layoutSystemAt(
	lines: SystemLine[],
	occurrence: SectionOccurrence | undefined,
	previous: SlotsCell | null,
	ctx: Context,
): Laid {
	const item = layoutSystem(lines, occurrence, previous, ctx);
	const lyrics = lyricRows(lines, occurrence, ctx);
	// The words go under the system: in its last row that plays.
	const last = item.rows.findLastIndex((p) => p.row.kind === "row" && !p.row.cells.some(isTacet));
	const rows = item.rows.map((p, i) =>
		i === last && p.row.kind === "row" && lyrics.length ? { ...p, row: { ...p.row, lyrics } } : p,
	);
	return { items: [{ ...item, rows }], previous: lastOfSystem(item) ?? previous };
}

/** A line outside a system: as written when it has an error; a bar line with the words under it. */
function layoutOne(
	l: Line,
	occurrence: SectionOccurrence | undefined,
	previous: SlotsCell | null,
	ctx: Context,
): Laid {
	if (ctx.errors.has(l.line)) return { items: [errorItem(l.line, ctx)], previous };
	const item = layoutLine(l, occurrence, previous, ctx);
	if (!item) return { items: [], previous };
	if (item.kind !== "row" || l.kind !== "bars") return { items: [item], previous };
	const lyrics = lyricRows([l], occurrence, ctx);
	const row = lyrics.length ? { ...item, lyrics } : item;
	return { items: [row], previous: lastSlots(item.cells) ?? previous };
}

/** The written bars a bar line draws, as played in the occurrence: a cut bar as written. */
function landingsOn(l: BarsLine, played: PlayedBar[], ctx: Context): Landing[] {
	const written = ctx.bars.filter((b) => b.line === l.line);
	let bar = 0;
	const bars = l.cells.map((cell) => {
		if (cell.kind !== "slots" && cell.kind !== "simile") return undefined;
		const i = bar++;
		return played[i] ?? written[i];
	});
	return landings(bars, played.length ? played : written);
}

/**
 * The words under a row or system that no line in it sings under its
 * slots (barmark's grammar 7.7): a lyric row on no melody, spaced by beat.
 */
function lyricRows(
	lines: SystemLine[],
	occurrence: SectionOccurrence | undefined,
	ctx: Context,
): Verse[] {
	const drawn = lines.filter((l): l is BarsLine => l.kind === "bars" && !ctx.errors.has(l.line));
	const ref = drawn[0];
	if (!ref) return [];
	const sung = new Set(drawn.flatMap((l) => singerOf(l, ctx.parse) ?? []));
	const lands = landingsOn(ref, playedOn(ref.line, occurrence, ctx.bars), ctx);
	return rowVerses(lands, sung);
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

/** A bar where the part rests, in a system or a part's own view (barmark's grammar 7.4). */
export const isTacet = (c: CellModel) => c.kind === "slots" && c.tacet === true;

/** A part's lines in a system, in score order: its bare line, then its lines (barmark's grammar 7.6). */
function ownLines(lines: SystemLine[], p: DeclaredPart): SystemLine[] {
	const order = (l: SystemLine) =>
		l.lineName === undefined ? -1 : (p.lines ?? []).indexOf(l.lineName);
	return lines.filter((l) => l.part === p.label).sort((a, b) => order(a) - order(b));
}

/** A row's spoken name: the part's, and its line's (barmark's grammar 7.6): "Piano RH". */
const spokenOf = (p: DeclaredPart, l: SystemLine) =>
	l.lineName === undefined ? p.name : `${p.name} ${l.lineName}`;

/** A system row's label: the part's, and its line's name (`Pno.RH`). */
const labelOf = (l: SystemLine) =>
	`${l.part ?? ""}${l.lineName === undefined ? "" : `.${l.lineName}`}`;

/** A row per declared part, or per line it writes, in score order: its own line, its error, or tacet bars. */
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
	const ownRow = (own: SystemLine): RowItem | ErrorItem =>
		ctx.errors.has(own.line) || own.kind !== "bars"
			? errorItem(own.line, ctx)
			: layoutRow(own, playedOn(own.line, occurrence, ctx.bars), previous, ctx);
	const rows = ctx.parse.parts.flatMap((p) => {
		const own = ownLines(lines, p);
		if (!own.length)
			return [
				{ label: p.label ?? "", name: p.name, row: tacetRow(reference, lines[0]?.line ?? 0) },
			];
		return own.map((l) => ({ label: labelOf(l), name: spokenOf(p, l), row: ownRow(l) }));
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
		...singing(l, cells, played, ctx),
	};
}

/** A singing line's fields: its note sets as pitch names, and the verses under its slots (barmark's grammar 7.7). */
function singing(l: BarsLine, cells: CellModel[], played: PlayedBar[], ctx: Context) {
	const singer = singerOf(l, ctx.parse);
	if (singer === null) return {};
	const verses = sungVerses(cells, landingsOn(l, played, ctx), singer);
	// A line with no words draws as any part line does.
	return verses.length ? { sings: true as const, verses } : {};
}

/** A cell as drawn: `%` becomes the bar it copies, its slots as the parser resolved them; `previous` lends only its meter. */
function layoutCell(
	cell: Cell,
	played: PlayedBar | undefined,
	previous: SlotsCell | null,
): CellModel {
	if (cell.kind === "fermata") return { kind: "fermata" };
	if (cell.kind === "direction" || cell.kind === "rehearsal") return cell;
	// Parts that play a tutti bar differently each read their own: draw it as written.
	if ((played as DrawnBar | undefined)?.perPart)
		return withPlayed(asWritten(cell, previous), played);
	return withPlayed(layoutBar(cell, played, previous), played);
}

/** A tutti bar as written: its own slots, holds as holds, or `%` itself. */
function asWritten(
	cell: Extract<Cell, { kind: "slots" | "simile" }>,
	previous: SlotsCell | null,
): SlotsCell {
	const bar = layoutBar(cell, undefined, previous);
	return cell.kind === "simile" ? { ...bar, slots: [], simile: true } : bar;
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
