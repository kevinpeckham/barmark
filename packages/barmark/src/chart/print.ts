import { isBar } from "./barLine.js";
import { printDirection } from "./direction.js";
import { beatsOf } from "./directives.js";
import { readDocument } from "./document.js";
import { extractPart, parseChart } from "./parse.js";
import type {
	Cell,
	ChartParse,
	DeclaredPart,
	Directives,
	Key,
	Line,
	LyricSlot,
	Repeat,
	SimpleSlot,
	Slot,
	Syllable,
	TempoChange,
	Words,
} from "./types.js";

/** A slot with no attack of its own continues whatever sounds before it. A repeated chord name is a re-attack. */
function continues(sounding: SimpleSlot | null, s: Slot): boolean {
	if (s.kind === "hold") return true;
	if (s.kind === "silence" || s.kind === "nc") return !s.push && sounding?.kind === s.kind;
	return false;
}

/**
 * The fewest slots with the same timeline: `G / D /` is `G D`, `-- --` is `--`.
 * Only a slot with no attack of its own merges (`/`, a repeated `--` or
 * `N.C.`); a repeated chord name never does, and a group never heads a merged
 * block, because stretching it would move its members. Given the bar's beat
 * count, the result is never an uneven slot count unless the input's was the
 * same count, so printing adds no warning.
 */
export function reduceSlots(slots: Slot[], beats?: number): Slot[] {
	const k = slots.length;
	const cont: boolean[] = [];
	let sounding: SimpleSlot | null = null;
	for (const s of slots) {
		cont.push(continues(sounding, s));
		const last = s.kind === "group" ? s.members.at(-1) : s;
		if (last && last.kind !== "hold") sounding = last;
	}
	for (let m = 1; m <= k; m++) {
		if (k % m !== 0) continue;
		const size = k / m;
		if (beats !== undefined && m !== k && beats % m !== 0 && m % beats !== 0) continue;
		const merges = (c: boolean, i: number) =>
			i % size === 0 ? size === 1 || slots[i]?.kind !== "group" : c;
		if (cont.every(merges)) return slots.filter((_, i) => i % size === 0);
	}
	return slots;
}

const SYMBOLS = { hold: "/", nc: "N.C.", silence: "--", unknown: "?" } as const;

const PUSHES = { eighth: "<", sixteenth: "<<" } as const;
const ARTICULATIONS = { accent: ">", hit: "^" } as const;
const PEDALS = { press: "+", release: "*" } as const;

/** A slot's leading marks: its push, then its articulation (grammar 2.7, 2.8). */
function printMarks(s: SimpleSlot): string {
	const push = "push" in s && s.push ? PUSHES[s.push] : "";
	const pedal = s.kind === "chord" && s.pedal ? PEDALS[s.pedal] : "";
	return pedal + push + (s.kind === "chord" && s.articulation ? ARTICULATIONS[s.articulation] : "");
}

/** A syllable as written after its note's colon (grammar 4.3). */
const printSyllable = (s: Syllable) =>
	s.kind === "held" ? "/" : s.parts.join("~") + (s.continues ? "-" : "");

/** A lyric row's slot as written (grammar 7.7); a group's members are joined with `_`. */
const printLyricSlot = (s: LyricSlot): string => {
	if (s.kind === "group") return s.members.map(printLyricSlot).join("_");
	if (s.kind === "syllable") return printSyllable(s.syllable);
	return s.kind === "hold" ? "/" : "--";
};

function printSimple(s: SimpleSlot): string {
	const body =
		s.kind === "chord" ? s.chord.canonical + (s.voicing?.canonical ?? "") : SYMBOLS[s.kind];
	const sung = s.kind === "chord" && s.syllable ? `:${printSyllable(s.syllable)}` : "";
	return printMarks(s) + body + (s.dotted ? "." : "") + sung;
}

/** A slot in canonical spelling; a group's members are joined with `_`. */
export function printSlot(s: Slot): string {
	return s.kind === "group" ? s.members.map(printSimple).join("_") : printSimple(s);
}

/** Each slot with the words written before it, and any words after the last. */
function withWords(slots: string[], words: Words[] = []): string {
	const said = (at: number) => words.filter((w) => w.at === at).map((w) => `"${w.text}"`);
	return [...slots.flatMap((s, i) => [...said(i), s]), ...said(slots.length)].join(" ");
}

/** The fewest slots, unless merging them would lose the place of some words. */
function reduceWithWords(
	slots: Slot[],
	words: Words[] | undefined,
	beats?: number,
): [Slot[], Words[]] {
	const reduced = reduceSlots(slots, beats);
	const size = slots.length / reduced.length;
	if (!words) return [reduced, []];
	if (words.some((w) => w.at % size !== 0)) return [slots, words];
	return [reduced, words.map((w) => ({ ...w, at: w.at / size }))];
}

/** A cell in canonical form: `%`, `...`, a mark, or an optional `[n/d]` and the fewest slots, with any words. */
export function printCell(c: Cell, beats?: number): string {
	if (c.kind === "simile") return withWords(["%"], c.words);
	if (c.kind === "fermata") return "...";
	if (c.kind === "direction") return printDirection(c.direction);
	if (c.kind === "rehearsal") return `@${c.label}`;
	const meter = c.meter ? `[${c.meter.n}/${c.meter.d}] ` : "";
	const [slots, words] = reduceWithWords(c.slots, c.words, beats);
	return meter + withWords(slots.map(printSlot), words);
}

/** An ending's passes as printed after its `|`: in order, runs of three or more as a range (`1-3`, `1,2`, `1,3-5`). */
export function printPasses(passes: number[]): string {
	const runs: number[][] = [];
	for (const p of passes) {
		const run = runs.at(-1);
		if (run && run.at(-1) === p - 1) run.push(p);
		else runs.push([p]);
	}
	return runs.flatMap((r) => (r.length >= 3 ? [`${r[0]}-${r.at(-1)}`] : r.map(String))).join(",");
}

const printRepeat = (r: Repeat) => (r === null ? "" : r === "open" ? " x ..." : ` x${r}`);

function printKey(k: Key): string {
	if (k.mode === "major") return k.tonic;
	if (k.mode === "minor") return `${k.tonic}m`;
	return `${k.tonic} ${k.mode}`;
}

function printTempoChange(c: TempoChange): string {
	if (c.kind === "a tempo") return "a tempo";
	return `${c.kind}.${c.to === null ? "" : ` to ${c.to}`}`;
}

function printDirectives(d: Directives): string {
	const parts: string[] = [];
	if (d.key) parts.push(`key: ${printKey(d.key)}`);
	if (d.time) parts.push(`time: ${d.time.n}/${d.time.d}`);
	if (d.tempo !== undefined) parts.push(`tempo: ${d.tempo}`);
	if (d.tempoChange) parts.push(`tempo: ${printTempoChange(d.tempoChange)}`);
	if (d.feel)
		parts.push(`feel: ${d.feel}${d.swingPercent === undefined ? "" : ` ${d.swingPercent}%`}`);
	return parts.join(", ");
}

type BarsLine = Extract<Line, { kind: "bars" }>;
type LyricsLine = Extract<Line, { kind: "lyrics" }>;

/** A lyric row's label: `lyrics:`, or `lyrics N:` for verse N. */
const lyricLabel = (l: LyricsLine) => `lyrics${l.verse === null ? "" : ` ${l.verse}`}:`;

/** A lyric row's pieces, never reduced: its holds place the syllables. */
const lyricPieces = (l: LyricsLine) => ({
	open: "|",
	cells: l.cells.map((c) => c.map(printLyricSlot).join(" ")),
	close: "|",
});

/** A bar line's opening, cells and closing, each printed. */
function barPieces(
	l: BarsLine,
	beats: (number | undefined)[],
): { open: string; cells: string[]; close: string } {
	return {
		open: l.opens ? "|:" : l.ending ? `|${printPasses(l.ending)}` : "|",
		cells: l.cells.map((c, i) => printCell(c, beats[i])),
		close: `${l.closes ? ":|" : "|"}${printRepeat(l.repeat)}`,
	};
}

const joinPieces = (p: { open: string; cells: string[]; close: string }) =>
	`${p.open} ${p.cells.join(" | ")} ${p.close}`;

/**
 * One parsed line in canonical form. Text and invalid lines print as stored.
 * `beats` gives each cell's beat count where known, so reduction adds no warning.
 */
export function printLine(l: Line, beats: (number | undefined)[] = []): string {
	switch (l.kind) {
		case "title":
			return `# ${l.text}`;
		case "section":
			return `## ${l.name.replace(/\s+/g, " ")}${printRepeat(l.repeat)}${l.elided ? " ->" : ""}`;
		case "directive":
			return printDirectives(l.set);
		case "part":
			return `part: ${l.label ? `${l.label} = ` : ""}${l.name}${l.instrument ? `, instrument: ${l.instrument}` : ""}${l.clef ? `, clef: ${l.clef}` : ""}`;
		case "credit":
			return `${l.role}: ${l.text}`;
		case "bars":
			return joinPieces(barPieces(l, beats));
		case "break":
			return "---";
		case "lyrics":
			return `${lyricLabel(l)} ${joinPieces(lyricPieces(l))}`;
		default:
			return l.text;
	}
}

/**
 * A chart in canonical form (spec §8). Spelling and layout only: lines with
 * errors and text lines print as written, and the author's blank lines and
 * fences stay. Never throws.
 */
export function printChart(text: string): string {
	return printParsed(text, parseChart(text));
}

type Beats = (l: Line) => (number | undefined)[];

/** A labelled line's label as printed: the part's, and its line's name (`Pno.RH`, grammar 7.6). */
const labelOf = (l: BarsLine) =>
	`${l.part ?? ""}${l.lineName === undefined ? "" : `.${l.lineName}`}`;
const labelsOf = (p: DeclaredPart) => [
	p.label ?? "",
	...(p.lines ?? []).map((n) => (n ? `${p.label}.${n}` : (p.label ?? ""))),
];

/** Score order: by part, then by the part's line, a bare line first. */
function scoreOf(l: BarsLine, parsed: ChartParse): number {
	const at = parsed.parts.findIndex((p) => p.label === l.part);
	const line = l.lineName === undefined ? -1 : (parsed.parts[at]?.lines ?? []).indexOf(l.lineName);
	return at * 10 + line + 1;
}

type Pieces = { label: string; line: number; open: string; cells: string[]; close: string };
type Span = [number, number];

/**
 * The bar-line cells a row's cell `k` lies under: from its bar to the next
 * bar, so a fermata, mark or direction falls in the cell before it, and
 * any before the first bar in the first cell.
 */
const spanOf = (k: number, bars: number[], n: number): Span => [
	k === 0 ? 0 : (bars[k] ?? 0),
	(bars[k + 1] ?? n) - 1,
];
const roomOf = (columns: number[], [a, b]: Span) =>
	columns.slice(a, b + 1).reduce((x, y) => x + y, 0) + 3 * (b - a);

/** Each column's width: the widest of the bar lines' cells, widened for a row's cell that won't fit. */
function columnsOf(lines: Pieces[], rows: Pieces[], bars: number[]): number[] {
	const columns = (lines[0]?.cells ?? []).map((_, i) =>
		Math.max(...lines.map((p) => p.cells[i]?.length ?? 0)),
	);
	for (const r of rows)
		for (const [k, c] of r.cells.entries()) {
			const room = roomOf(columns, spanOf(k, bars, columns.length));
			const at = bars[k] ?? 0;
			if (c.length > room) columns[at] = (columns[at] ?? 0) + c.length - room;
		}
	return columns;
}

/**
 * Bar lines and the lyric rows under them, labels padded to `width` and
 * pipes lined up; a row's cell spans the cells of its bar (grammar 7.7).
 */
function alignBlock(
	lines: Pieces[],
	rows: Pieces[],
	bars: number[],
	width: number,
): Map<number, string> {
	const w = Math.max(width, ...rows.map((r) => r.label.length));
	const columns = columnsOf(lines, rows, bars);
	const print = (p: Pieces, pad: (c: string, i: number) => string) =>
		`${p.label.padEnd(w)} ${joinPieces({ ...p, cells: p.cells.map(pad) })}`.trimEnd();
	const texts = new Map<number, string>();
	for (const p of lines)
		texts.set(
			p.line,
			print(p, (c, i) => c.padEnd(columns[i] ?? 0)),
		);
	for (const r of rows)
		texts.set(
			r.line,
			print(r, (c, k) => c.padEnd(roomOf(columns, spanOf(k, bars, columns.length)))),
		);
	return texts;
}

/** A system's lines in score order, labels padded and pipes lined up, with its lyric rows (section 8, grammar 7.4, 7.7). */
function alignSystem(
	block: Block,
	parsed: ChartParse,
	beatsFor: Beats,
	edit: (l: Line) => Line,
): Map<number, string> {
	const system = block.lines as BarsLine[];
	const labelled = system[0]?.system !== undefined;
	const width = labelled
		? Math.max(...parsed.parts.flatMap(labelsOf).map((label) => label.length))
		: 0;
	const sorted = labelled
		? [...system].sort((a, b) => scoreOf(a, parsed) - scoreOf(b, parsed))
		: system;
	// Sorted lines take the written lines' places, so the system's rows stay together.
	const pieces = sorted.map((l, i) => ({
		label: labelled ? labelOf(l) : "",
		line: system[i]?.line ?? l.line,
		...barPieces(edit(l) as BarsLine, beatsFor(l)),
	}));
	const rows = block.rows.map((r) => ({ label: lyricLabel(r), line: r.line, ...lyricPieces(r) }));
	const bars = (system[0]?.cells ?? []).flatMap((c, i) => (isBar(c) ? [i] : []));
	return alignBlock(pieces, rows, bars, width);
}

/** A system, or an unlabelled bar line, with the lyric rows written just under it. */
type Block = { lines: Line[]; rows: LyricsLine[] };

/** A row lies just under its bars unless a heading comes between: under a replay heading it doesn't. */
const isUnder = (r: LyricsLine, lines: Line[]) => {
	if (!r.covers.length) return false;
	const last = Math.max(...r.covers);
	return !lines.some((l) => l.kind === "section" && l.line > last && l.line < r.line);
};

/** The block a bar line is in: its system's, or its own. */
const blockKey = (l: Line) =>
	(l.kind === "bars" || l.kind === "invalid") && l.system !== undefined
		? `system ${l.system}`
		: `line ${l.line}`;

const inSystem = (l: Line) => (l.kind === "bars" || l.kind === "invalid") && l.system !== undefined;

function blockFor(blocks: Map<string, Block>, l: Line): Block {
	const block = blocks.get(blockKey(l)) ?? { lines: [], rows: [] };
	blocks.set(blockKey(l), block);
	return block;
}

/** Each system, and each bar line with rows just under it, with those rows (grammar 7.4, 7.7). */
function blocksOf(lines: Line[]): Block[] {
	const blocks = new Map<string, Block>();
	for (const l of lines.filter(inSystem)) blockFor(blocks, l).lines.push(l);
	const byLine = new Map(lines.map((l) => [l.line, l]));
	for (const r of lines) {
		if (r.kind !== "lyrics" || !isUnder(r, lines)) continue;
		// An extracted part keeps only some of a system's lines.
		const first = r.covers.map((n) => byLine.get(n)).find((l) => l !== undefined);
		if (!first) continue;
		const block = blockFor(blocks, first);
		if (!block.lines.length) block.lines.push(first);
		block.rows.push(r);
	}
	return [...blocks.values()];
}

/** Canonical text for the lines of systems and of bar lines with lyric rows, by line number. */
function systemTexts(
	parsed: ChartParse,
	errored: Set<number>,
	beatsFor: Beats,
	edit: (l: Line) => Line,
): Map<number, string> {
	const texts = new Map<number, string>();
	for (const block of blocksOf(parsed.lines)) {
		const { lines } = block;
		const valid = lines.filter((l): l is BarsLine => l.kind === "bars" && !errored.has(l.line));
		const rows = block.rows.filter((r) => !errored.has(r.line));
		const labelled = valid[0]?.system !== undefined;
		if (!labelled && !rows.length) continue;
		// A system with an error is neither sorted nor padded, so the error's line stays where it was written.
		if (valid.length === lines.length) {
			for (const [line, text] of alignSystem({ lines: valid, rows }, parsed, beatsFor, edit))
				texts.set(line, text);
			continue;
		}
		for (const l of valid) texts.set(l.line, `${labelOf(l)} ${printLine(edit(l), beatsFor(l))}`);
	}
	return texts;
}

/** Each line's beat counts on its first play, every part's lines included. */
function beatsOfLines(parsed: ChartParse): Beats {
	const byLine = new Map(parsed.lines.map((l) => [l.line, l]));
	const firstPlay = new Map<number, number[]>();
	for (const b of parsed.bars) {
		const lines = new Set([b.line, ...(b.parts ?? []).flatMap((p) => (p ? [p.line] : []))]);
		for (const line of lines) {
			const l = byLine.get(line);
			const meters = firstPlay.get(line) ?? [];
			const cells = l?.kind === "bars" ? l.cells.filter(isBar).length : 0;
			if (meters.length < cells) firstPlay.set(line, [...meters, beatsOf(b.meter)]);
		}
	}
	return (l: Line) => {
		if (l.kind !== "bars") return [];
		const meters = firstPlay.get(l.line) ?? [];
		let next = 0;
		return l.cells.map((c) => (isBar(c) ? meters[next++] : undefined));
	};
}

/**
 * `printChart` over a parse you already have (`parseChart(text)`), so the
 * text isn't read twice. `edit`, if given, changes each line before it prints.
 */
export function printParsed(
	text: string,
	parsed: ChartParse,
	edit: (l: Line) => Line = (l) => l,
): string {
	return printLines(text, parsed, edit, new Set());
}

/** How one non-blank physical line prints. */
type LinePrinter = (raw: string, l: Line | undefined) => string;

function linePrinter(parsed: ChartParse, edit: (l: Line) => Line): LinePrinter {
	const errored = new Set(
		parsed.diagnostics.filter((d) => d.severity === "error").map((d) => d.line),
	);
	const beatsFor = beatsOfLines(parsed);
	const systems = systemTexts(parsed, errored, beatsFor, edit);
	return (raw, l) => {
		if (!l) return raw.trim().startsWith("```") ? raw.trim() : raw.trimEnd();
		if (l.kind === "text" || errored.has(l.line)) return raw.trimEnd();
		return systems.get(l.line) ?? printLine(edit(l), beatsFor(l));
	};
}

/** Blank lines: runs collapse to one, and one goes before a heading unless the line before is one. */
function spaceBefore(out: string[], l: Line | undefined, afterHeading: boolean): void {
	if (out.length === 0 || out.at(-1) === "") return;
	if (!l || (l.kind === "section" && !afterHeading)) out.push("");
}

/** The printer, leaving out the physical lines in `skip`. */
function printLines(
	text: string,
	parsed: ChartParse,
	edit: (l: Line) => Line,
	skip: Set<number>,
): string {
	const byLine = new Map(parsed.lines.map((l) => [l.line, l]));
	const print = linePrinter(parsed, edit);
	const out: string[] = [];
	let lastWasHeading = false;
	const physical = text.replace(/^\uFEFF/, "").split(/\r?\n/);
	for (const [i, raw] of physical.entries()) {
		if (skip.has(i + 1)) continue;
		const t = raw.trim();
		if (!t) {
			spaceBefore(out, undefined, false);
			continue;
		}
		const l = t.startsWith("```") ? undefined : byLine.get(i + 1);
		// Consecutive headings (a run of replays) stay together, as the spec's examples write them.
		if (l?.kind === "section") spaceBefore(out, l, lastWasHeading);
		lastWasHeading = l?.kind === "section";
		out.push(print(raw, l));
	}
	return finish(out);
}

/** The lines as text, without trailing blank lines. */
function finish(out: string[]): string {
	while (out.at(-1) === "") out.pop();
	return out.length ? `${out.join("\n")}\n` : "";
}

/**
 * One part of a chart in canonical form, as a single-part chart (grammar
 * 7.4): its `part:` line, the tutti lines, its own lines, and `N.C.` bars
 * where it is tacet. Null when no part has that label. Never throws.
 */
export function printPart(text: string, label: string): string | null {
	const parsed = extractPart(text, label);
	if (!parsed) return null;
	const kept = new Set(parsed.lines.map((l) => l.line));
	const skip = new Set(
		readDocument(text)
			.lines.filter(
				(l) =>
					// A `part:` demoted to text (a shared label) would declare a part again in the extract.
					(l.kind === "text" && /^part\s*:/i.test(l.text)) ||
					((l.kind === "part" ||
						l.kind === "bars" ||
						l.kind === "invalid" ||
						l.kind === "lyrics") &&
						!kept.has(l.line)),
			)
			.map((l) => l.line),
	);
	return printLines(text, parsed, (l) => l, skip);
}
