/**
 * The chart model as HTML: a <barmark-chart> holding a declarative shadow
 * root, or the bare markup for pages that bring the stylesheet themselves.
 * Every string from the chart is escaped; every bar carries its spoken name.
 */
import {
	type ChordRecord,
	type Direction,
	type Directives,
	type Key,
	printDirection,
	printPasses,
	type Repeat,
	type SimpleSlot,
	type Slot,
	type TempoChange,
} from "barmark";
import {
	type ChordPieces,
	glyphs,
	NUMERALS,
	type Numerals,
	splitPitch,
	typesetChord,
	typesetNumeral,
} from "./chord.js";
import { creditsText } from "./credits.js";
import { diagramSvg } from "./diagram.js";
import { escapeHtml } from "./escape.js";
import { fontFaceCss } from "./font.js";
import { isTacet as isTacetCell, layoutChart } from "./model.js";
import {
	barLabel,
	speakBar,
	speakDiagram,
	speakVerses,
	UNPLAYABLE,
	VOICING_REPLACED,
} from "./speech.js";
import { FIT_STEPS, MIN_BAR, stylesheet } from "./styles.js";
import type {
	BlockItem,
	CellModel,
	ChartModel,
	DiagramEntry,
	SectionBlock,
	TempoBeat,
	Verse,
} from "./types.js";
import {
	beatLinesHtml,
	pitchHtml,
	type SungBar,
	sungBar,
	sungSlotHtml,
	verseNumbersHtml,
	verseWidth,
} from "./verses-html.js";

export type RenderOptions = {
	theme?: "auto" | "light" | "dark";
	barNumbers?: boolean;
	/**
	 * Boxed letters A, B, C… on each section as played. None when any bar
	 * carries its own rehearsal mark (`@A`, barmark's grammar 2.5): the
	 * chart's marks then stand alone, so no place is marked twice.
	 */
	rehearsalLetters?: boolean;
	/** List the chart's errors and warnings below it. */
	diagnostics?: boolean;
	/** Where the page serves Edwin-Roman.otf: emits its @font-face rule before the chart. */
	fontUrl?: string;
	/** Show each chord as its degree in the bar's key, where the chart names one. Off by default. */
	numerals?: Numerals;
	/**
	 * Wrap a section's rows when it is wider than the chart's box (the default).
	 * With `false` rows keep their columns, and the page scrolls the chart instead.
	 */
	wrap?: boolean;
	/** Draw only the part with this label (barmark's grammar 7.4): one player's view. */
	part?: string;
	/**
	 * How a section sizes its columns. `"shared"` (the default): its rows share
	 * column tracks, so bar lines line up down the section and the widest bar
	 * sets its column's width in every row. `"row"`: each row sizes its own
	 * cells, so one busy bar widens only its own row; bar lines no longer line
	 * up between rows. A system's parts still share theirs. Any other value is
	 * `"shared"`.
	 */
	columns?: Columns;
	/**
	 * A strip of guitar chord diagrams after the header: one for each distinct
	 * chord, in written order. Off when absent; any other value is off.
	 */
	chordDiagrams?: "guitar";
	/** The diagrams' hand: `"left"` mirrors the strings, low string on the right. Any other value is right. */
	diagramHand?: "right" | "left";
};

export type Columns = "shared" | "row";

type Row = Extract<BlockItem, { kind: "row" }>;
/** `gutter`: rows keep the left column, for bar numbers or part labels. */
type Settings = { barNumbers: boolean; gutter: boolean; numerals: Numerals | null; rows: boolean };
/** A system's row: the part it draws, and whether it is the system's first. */
type PartRow = { label: string; name: string; first: boolean };
/**
 * How a bar's slots draw: chords as numerals (the style, and the key of its
 * bar); on a singing line, note sets as pitch names over the syllables sung.
 */
type View = {
	numeral: { style: Numerals; key: Key } | null;
	pitches: boolean;
	sung: SungBar | null;
	/** The bar's unreadable slots' messages still to draw, taken in order (barmark's grammar 2.3). */
	unread?: string[];
};

export function renderChart(text: string, options: RenderOptions = {}): string {
	return `${fontStyle(options)}<barmark-chart${elementAttributes(options)}><template shadowrootmode="open">${shadowContent(text, options)}</template></barmark-chart>`;
}

/** The options as the element's attributes, so it keeps them when it loads or takes new text. */
function elementAttributes(options: RenderOptions): string {
	const theme = themeOf(options);
	return [
		theme === "auto" ? "" : ` theme="${theme}"`,
		options.barNumbers === false ? ' bar-numbers="off"' : "",
		options.rehearsalLetters ? " rehearsal-letters" : "",
		numeralsOf(options) ? ` numerals="${numeralsOf(options)}"` : "",
		options.wrap === false ? ' wrap="off"' : "",
		options.part ? ` show-part="${escapeHtml(options.part)}"` : "",
		byRow(options) ? ' columns="row"' : "",
	].join("");
}

export const THEMES = ["auto", "light", "dark"] as const;

/** Only a known theme reaches the markup: hosts may pass any string through. */
const themeOf = (options: RenderOptions) => THEMES.find((t) => t === options.theme) ?? "auto";
const numeralsOf = (options: RenderOptions) => NUMERALS.find((n) => n === options.numerals) ?? null;
/** Whether each row sizes its own columns: only for `"row"` exactly, so anything else a host passes is shared. */
const byRow = (options: RenderOptions) => options.columns === "row";

/** What goes in the shadow root: the styles and the chart. */
export const shadowContent = (text: string, options: RenderOptions = {}) =>
	`<style>${stylesheet}</style>${chartHtml(text, options)}`;

/** A chart that could not be loaded: the message, shown where the chart would be. */
export const loadErrorContent = (message: string, options: RenderOptions = {}) =>
	`<style>${stylesheet}</style><div class="bm-chart" data-theme="${themeOf(options)}">${errorHtml("", [message])}</div>`;

const fontStyle = (options: RenderOptions) =>
	options.fontUrl ? `<style>${fontFaceCss(options.fontUrl)}</style>` : "";

export function renderChartUnwrapped(text: string, options: RenderOptions = {}): string {
	return `${fontStyle(options)}${chartHtml(text, options)}`;
}

function chartHtml(text: string, options: RenderOptions): string {
	const model = layoutChart(text, {
		rehearsalLetters: options.rehearsalLetters ?? false,
		...(options.part && { part: options.part }),
		...(options.chordDiagrams === "guitar" && { chordDiagrams: "guitar" as const }),
	});
	const barNumbers = options.barNumbers ?? true;
	const parts = labelled(model);
	const settings: Settings = {
		barNumbers,
		gutter: barNumbers || parts,
		numerals: numeralsOf(options),
		rows: byRow(options),
	};
	// Every section's left column is as wide as the longest part label, so tutti rows line up with systems.
	const widest = Math.max(0, ...model.parts.flatMap(rowLabelsOf).map((l) => l.length));
	const gutter = parts ? ` data-parts style="--bm-label-chars:${widest}"` : "";
	return `<div class="bm-chart" data-theme="${themeOf(options)}"${gutter}${layoutAttributes(options, settings)}>${headerHtml(model)}${diagramsHtml(model.diagrams, settings.numerals, handOf(options))}${model.blocks.map((b) => blockHtml(b, settings)).join("")}${copyrightHtml(model)}${options.diagnostics ? diagnosticsHtml(model) : ""}</div>`;
}

/** The chart's layout switches the stylesheet reads, each only when it is off its default. */
const layoutAttributes = (options: RenderOptions, settings: Settings) =>
	`${settings.barNumbers ? "" : ' data-bar-numbers="off"'}${options.wrap === false ? ' data-wrap="off"' : ""}${settings.rows ? ' data-columns="row"' : ""}`;

/** Whether systems have labelled rows: several parts, or one part writing lines (barmark's grammar 7.6). */
const labelled = (model: ChartModel) =>
	model.parts.length > 1 || model.parts.some((p) => (p.lines?.length ?? 0) > 0);

/** A part's row labels: its own, and one per line it writes (barmark's grammar 7.6). */
const rowLabelsOf = (p: ChartModel["parts"][number]) => [
	p.label ?? "",
	...(p.lines ?? []).map((n) => `${p.label ?? ""}.${n}`),
];

function headerHtml(model: ChartModel): string {
	const title = model.title
		? `<h2 class="bm-title" part="title">${escapeHtml(model.title)}</h2>`
		: "";
	const names =
		model.parts.length > 1 ? model.parts.map((p) => p.name).join(", ") : model.part?.name;
	const meta = [names ? escapeHtml(names) : "", metaHtml(model.header, model.tempoBeat)]
		.filter(Boolean)
		.join(" · ");
	const credits = creditsText(model.credits)
		.map((c) => `<p class="bm-credits" part="credits">${escapeHtml(c)}</p>`)
		.join("");
	if (!title && !credits && !meta) return "";
	return `<header class="bm-header">${title}${credits}${meta ? `<p class="bm-meta" part="meta">${meta}</p>` : ""}</header>`;
}

type Hand = "right" | "left";
const handOf = (options: RenderOptions): Hand =>
	options.diagramHand === "left" ? "left" : "right";

/** The chart's chords as guitar diagrams, in one wrapping row after the header (design 5.1); nothing when it has none. */
function diagramsHtml(entries: DiagramEntry[], numerals: Numerals | null, hand: Hand): string {
	if (entries.length === 0) return "";
	return `<section class="bm-diagrams" part="diagrams" aria-label="Guitar chords"><ul role="list">${entries.map((e) => diagramHtml(e, numerals, hand)).join("")}</ul></section>`;
}

/** One diagram: the drawing (or, with no shape, a frame saying why), its name, its numeral and its note. */
function diagramHtml(entry: DiagramEntry, numerals: Numerals | null, hand: Hand): string {
	// With numerals on, the label says the degree, as the bar's speech does.
	const label = speakDiagram(entry, numerals && entry.key ? entry.key : undefined);
	const drawing = entry.shape
		? diagramSvg(entry.shape, hand, label)
		: `<span class="bm-diagram-none" role="img" aria-label="${escapeHtml(label)}">${escapeHtml(UNPLAYABLE)}</span>`;
	const note =
		entry.caveat === "voicing-replaced"
			? `<span class="bm-diagram-note" aria-hidden="true">${escapeHtml(VOICING_REPLACED)}</span>`
			: "";
	return `<li class="bm-diagram" part="diagram">${drawing}${diagramNameHtml(entry)}${diagramNumeralHtml(entry, numerals)}${note}</li>`;
}

/** A name as the grid marks it up, then its written voicing, smaller; a note set as written, free to wrap. */
function diagramNameHtml({ chord, voicing }: DiagramEntry): string {
	if (chord.kind === "notes" || !chord.parts)
		return `<span class="bm-diagram-name bm-diagram-set" aria-hidden="true">${escapeHtml(chord.canonical)}</span>`;
	const voiced = voicing
		? `<span class="bm-diagram-voicing">${escapeHtml(voicing.canonical)}</span>`
		: "";
	return `<span class="bm-diagram-name" aria-hidden="true">${piecesHtml(typesetChord(chord.parts), "")}${voiced}</span>`;
}

/** With `numerals`, a named chord's degree in the key where it first appears; the name above stays in letters. */
function diagramNumeralHtml({ chord, key }: DiagramEntry, numerals: Numerals | null): string {
	if (!numerals || !key || chord.kind === "notes" || !chord.parts) return "";
	const pieces = typesetNumeral(chord.parts, key, numerals);
	if (!pieces) return "";
	return `<span class="bm-diagram-numeral" aria-hidden="true">${piecesHtml(pieces, ` data-numeral="${numerals}"`)}</span>`;
}

/** The copyright lines, small, at the chart's foot. */
function copyrightHtml(model: ChartModel): string {
	const lines = model.credits.copyright;
	if (lines.length === 0) return "";
	return `<footer class="bm-copyright" part="copyright">${lines.map((c) => `<p>${escapeHtml(c)}</p>`).join("")}</footer>`;
}

/**
 * Each beat note a tempo can count (barmark's grammar 2.1), and its name. A
 * dotted beat adds a full stop, "♩.", as tempo marks are typed in text: the
 * combining augmentation dot (U+1D16D) is missing from most fonts and sits
 * apart from the note where it is drawn.
 */
const BEAT_NOTES: Record<TempoBeat["note"], readonly [string, string]> = {
	2: ["\u{1D15E}", "half"],
	4: ["♩", "quarter"],
	8: ["♪", "eighth"],
	16: ["\u{1D161}", "sixteenth"],
};

/** The beat note, spoken by its name: "♩." is "dotted quarter note". */
function beatHtml(beat: TempoBeat): string {
	const [glyph, name] = BEAT_NOTES[beat.note];
	const dotted = beat.dotted ? "dotted " : "";
	return `<span class="bm-beat" role="img" aria-label="${dotted}${name} note">${glyph}${beat.dotted ? "." : ""}</span>`;
}

const tempoHtml = (bpm: number, beat: TempoBeat) => `${beatHtml(beat)} = ${bpm}`;

/** "rit. to ♩ = 90" (♩. in 6/8), "accel.", "a tempo". */
function tempoChangeHtml(c: TempoChange, beat: TempoBeat): string {
	if (c.kind === "a tempo") return c.kind;
	return `${c.kind}.${c.to === null ? "" : ` to ${tempoHtml(c.to, beat)}`}`;
}

/**
 * "D major · 4/4 · ♩ = 145 · swing" (or "swing 58%"), as markup, a tempo
 * counting `beat`; labelled, "Key D major · Time 4/4 · …".
 */
function metaHtml(d: Directives, beat: TempoBeat, labelled = false): string {
	return [
		["Key", d.key ? escapeHtml(`${glyphs(d.key.tonic)} ${d.key.mode}`) : ""],
		["Time", d.time ? `${d.time.n}/${d.time.d}` : ""],
		["Tempo", d.tempo ? tempoHtml(d.tempo, beat) : ""],
		// "a tempo" names itself; "Tempo a tempo" would stutter.
		[
			d.tempoChange?.kind === "a tempo" ? "" : "Tempo",
			d.tempoChange ? tempoChangeHtml(d.tempoChange, beat) : "",
		],
		[
			"Feel",
			d.feel
				? escapeHtml(`${d.feel}${d.swingPercent === undefined ? "" : ` ${d.swingPercent}%`}`)
				: "",
		],
	]
		.filter(([, value]) => value)
		.map(([label, value]) => (labelled && label ? `${label} ${value}` : (value ?? "")))
		.join(" · ");
}

function blockHtml(block: SectionBlock, settings: Settings): string {
	const label = block.heading === null ? "" : ` aria-label="${escapeHtml(block.heading)}"`;
	return `<section class="bm-section"${label}>${headingHtml(block)}<div class="bm-grid" style="--bm-cols:${Math.max(1, block.columns)}" data-fit="${fitWidth(block, settings.rows)}">${block.items.map((i) => itemHtml(i, block.columns, settings)).join("")}</div></section>`;
}

/**
 * Roughly how many em a section needs, rounded up to a step the stylesheet
 * knows; narrower than that, its rows wrap. With shared columns that is the
 * widest cell of each column, added up; with `rows`, the widest row.
 */
function fitWidth(block: SectionBlock, rows: boolean): number {
	const lines = block.items.map(rowWidths);
	const sum = (widths: number[]) => widths.reduce((a, b) => a + b, 0);
	const needed = rows ? Math.max(0, ...lines.map(sum)) : sum(widest(lines));
	const total = 5 + needed;
	return FIT_STEPS.find((step) => step >= total) ?? FIT_STEPS.at(-1) ?? 0;
}

/** Em per cell of a row: its bar, or the words under it when they are wider. None for anything else. */
function rowWidths(item: BlockItem): number[] {
	if (item.kind !== "row") return [];
	const verses = [...(item.verses ?? []), ...(item.lyrics ?? [])];
	return widest([item.cells.map(cellWidth), ...verses.map((v) => v.cells.map(verseWidth))]);
}

/** The widest of each column across lines of widths. */
function widest(lines: number[][]): number[] {
	const widths: number[] = [];
	for (const line of lines)
		for (const [i, w] of line.entries()) widths[i] = Math.max(widths[i] ?? 0, w);
	return widths;
}

/** Em per bar: padding, plus each slot's text and the gap after it. */
function cellWidth(cell: CellModel): number {
	if (cell.kind === "direction") return 1 + 0.55 * printDirection(cell.direction).length;
	if (cell.kind === "rehearsal") return 1.4 + 0.6 * cell.label.length;
	if (cell.kind === "fermata") return MIN_BAR;
	return Math.max(
		MIN_BAR,
		1.5 + (cell.meter ? 0.8 : 0) + cell.slots.reduce((w, s) => w + slotWidth(s), 0),
	);
}

/** Roughly: 0.65em a baseline character, 0.4em a superscript one, 0.6em between slots, 0.45em a push mark. */
function slotWidth(slot: Slot): number {
	return ("push" in slot && slot.push ? 0.45 : 0) + unmarkedWidth(slot);
}

function unmarkedWidth(slot: Slot): number {
	if (slot.kind === "group") return slot.members.reduce((w, m) => w + slotWidth(m), 0.2);
	if (slot.kind !== "chord") return slot.kind === "nc" ? 1.8 : 1.4;
	const { chord } = slot;
	if (chord.kind === "notes" || !chord.parts) return 0.65 * chord.canonical.length + 0.6;
	const p = typesetChord(chord.parts);
	const base = p.root.length + p.quality.length + (p.bass ? p.bass.length + 1 : 0);
	return 0.65 * base + 0.4 * p.superscript.length + 0.6;
}

function headingHtml(block: SectionBlock): string {
	if (block.heading === null) return "";
	const letter = block.rehearsal
		? `<span class="bm-rehearsal" part="rehearsal">${block.rehearsal}</span><span class="bm-sr">,</span> `
		: "";
	return `<h3 class="bm-heading" part="heading">${letter}${escapeHtml(block.heading)}${repeatHtml(block.repeat)}</h3>`;
}

/** The visible count and its spoken form: ×2 is "play 2 times". */
function repeatHtml(repeat: Repeat): string {
	if (repeat === null) return "";
	return repeat === "open"
		? ` <span class="bm-times" aria-hidden="true">× as needed</span><span class="bm-sr">repeat until cued</span>`
		: ` <span class="bm-times" aria-hidden="true">×${repeat}</span><span class="bm-sr">play ${repeat} times</span>`;
}

function itemHtml(item: BlockItem, columns: number, settings: Settings): string {
	switch (item.kind) {
		case "row":
			return rowHtml(item, columns, settings);
		case "system":
			return systemHtml(item, columns, settings);
		case "text":
			return `<p class="bm-text${item.note ? " bm-note" : ""}" part="text">${escapeHtml(item.text)}</p>`;
		case "directive":
			// Mid-chart, a change names itself: "→ Time 3/4", never a lone "3/4".
			return `<p class="bm-directive" part="meta"><span class="bm-change" aria-hidden="true">→</span><span>${metaHtml(item.set, item.tempoBeat, true)}</span></p>`;
		case "error":
			return errorHtml(item.source, item.messages);
	}
}

function errorHtml(source: string, messages: string[]): string {
	const message = escapeHtml(messages.join("; "));
	return `<div class="bm-error" title="${message}"><code>${escapeHtml(source)}</code><span class="bm-sr">Error: ${message}</span></div>`;
}

/** A system: its parts' rows stacked, sharing the section's columns (barmark's grammar 7.4). */
function systemHtml(
	item: Extract<BlockItem, { kind: "system" }>,
	columns: number,
	settings: Settings,
): string {
	const names = escapeHtml(item.rows.map((p) => p.name).join(", "));
	// The first drawn row carries what the system shares: its number, ×N, the ending's number.
	const lead = item.rows.findIndex((p) => p.row.kind === "row");
	const rows = item.rows.map((p, i) =>
		p.row.kind === "error"
			? errorHtml(p.row.source, p.row.messages)
			: rowHtml(p.row, columns, settings, { label: p.label, name: p.name, first: i === lead }),
	);
	return `<div class="bm-system" role="group" aria-label="${names}">${rows.join("")}</div>`;
}

/** The left column: the bar number, and in a system the part's label. */
function gutterHtml(row: Row, settings: Settings, part?: PartRow): string {
	if (!settings.gutter) return "";
	const shown = settings.barNumbers && (!part || part.first) && row.barNumber !== 0;
	const number = shown ? (row.barNumber ?? "") : "";
	const label = part
		? `<span class="bm-part-label" part="part-label">${escapeHtml(part.label)}</span>`
		: "";
	return `<span class="bm-bar-number" part="bar-number" aria-hidden="true">${label}${number}</span>`;
}

/** A row's cells; a tacet row says "tacet" in its first bar. */
function rowCells(row: Row, numerals: Numerals | null, ending: string): string[] {
	let n = row.barNumber;
	const firstTacet = row.cells.findIndex(isTacetCell);
	const firstBar = row.cells.findIndex((c) => c.kind === "slots");
	return row.cells.map((cell, i) => {
		const marks = repeatMarks(row, i) + (i === 0 ? ending : "");
		const sung: Sung = {
			pitches: row.sings === true,
			words: [wordsOn(row.verses, i, "sung"), wordsOn(row.lyrics, i, "words")]
				.filter(Boolean)
				.join(", "),
			bar: sungBar(row.verses, i),
			first: i === firstBar,
			beats: beatLinesHtml(row.lyrics, i, i === firstBar),
		};
		const html = isTacetCell(cell)
			? tacetHtml(cell, n, marks, i === firstTacet)
			: cellHtml(cell, n, marks, numerals, sung);
		if (n !== null && cell.kind === "slots") n++;
		return html;
	});
}

/** The words on a row's cell, as a screen reader hears them after the bar's notes. */
const wordsOn = (verses: Verse[] = [], i: number, label: "sung" | "words") =>
	speakVerses(
		verses.map((v) => ({ verse: v.verse, syllables: v.cells[i]?.flat() ?? [] })),
		verses.length > 1,
		label,
	);

const sr = (text: string) => (text ? `<span class="bm-sr">${text}</span>` : "");

/** The row's class list. */
function rowClasses(row: Row, part: PartRow | undefined): string {
	const classes = ["bm-row"];
	if (part) classes.push("bm-part-row");
	if (row.sings) classes.push("bm-sings");
	if (row.cells.some(isTacetCell)) classes.push("bm-tacet");
	if (row.ending || row.continues) classes.push("bm-ending");
	return classes.join(" ");
}

/** What a screen reader hears before a row's bars: its part, a repeat start, its ending. */
function rowOpening(row: Row, part: PartRow | undefined, ending: string): string {
	const opens =
		leads(part) && (row.opens || typeof row.repeat === "number" || row.repeat === "open");
	return sr(part ? escapeHtml(part.name) : "") + sr(opens ? "repeat start" : "") + sr(ending);
}

/** Whether a row says what its system shares: a row on its own, or a system's first drawn row. */
const leads = (part: PartRow | undefined) => !part || part.first;

function rowHtml(row: Row, columns: number, settings: Settings, part?: PartRow): string {
	const label = row.ending && leads(part) ? endingLabel(row.ending) : null;
	const cells = rowCells(row, settings.numerals, label ? ` data-ending="${label.shown}"` : "");
	const goesOn =
		row.continues && leads(part) ? `${endingLabel(row.continues).spoken}, continued` : "";
	const empty = `<span class="bm-empty" aria-hidden="true"></span>`.repeat(
		Math.max(0, columns - row.cells.length),
	);
	const said = rowOpening(row, part, label?.spoken ?? goesOn);
	return `<div class="${rowClasses(row, part)}">${said}${gutterHtml(row, settings, part)}${cells.join("")}${empty}<span class="bm-repeat">${leads(part) ? rowRepeatHtml(row) : ""}</span></div>`;
}

/** An ending's passes as printed, "1.", "1.–3.", "1., 3.", and spoken, "ending for passes 1 to 3". */
function endingLabel(passes: number[]): { shown: string; spoken: string } {
	const parts = printPasses(passes)
		.split(",")
		.map((part) => part.split("-"));
	const shown = parts.map((p) => p.map((n) => `${n}.`).join("–")).join(", ");
	const said = parts.map((p) => p.join(" to "));
	const list = said.length > 1 ? `${said.slice(0, -1).join(", ")} and ${said.at(-1)}` : said[0];
	return { shown, spoken: `ending for pass${passes.length > 1 ? "es" : ""} ${list}` };
}

/** Repeat bar lines: ‖: on a row's first bar, :‖ on its last. */
function repeatMarks(row: Row, i: number): string {
	const whole = row.repeat !== null && !row.closes;
	const start = i === 0 && (row.opens || whole);
	const end = i === row.cells.length - 1 && (row.closes || row.repeat !== null);
	return `${start ? " data-repeat-start" : ""}${end ? " data-repeat-end" : ""}`;
}

function rowRepeatHtml(row: Row): string {
	if (row.repeat === null)
		return row.closes ? `<span class="bm-sr">repeat end, play 2 times</span>` : "";
	return repeatHtml(row.repeat).trim();
}

/**
 * The words on a bar: on a singing line its note sets as pitch names, its
 * syllables under them and the verse numbers when it is the row's first
 * bar; a lyric row's lines on no melody (`beats`); and all of it as a
 * screen reader hears it.
 */
type Sung = {
	pitches: boolean;
	words: string;
	bar: SungBar | null;
	first: boolean;
	beats: string;
};

/** A bar's unreadable slots' errors, spoken after the bar (barmark's grammar 2.3). */
const spokenErrors = (cell: CellModel) =>
	cell.kind === "slots" ? (cell.unread ?? []).map((m) => `error: ${m}`) : [];

function cellHtml(
	cell: CellModel,
	barNumber: number | null,
	marks: string,
	numerals: Numerals | null,
	sung: Sung,
): string {
	const numeral =
		numerals && cell.kind === "slots" && cell.key ? { style: numerals, key: cell.key } : null;
	const said = [speakBar(barNumber, cell, numeral !== null), ...spokenErrors(cell), sung.words];
	const spoken = `<span class="bm-sr">${escapeHtml(said.filter(Boolean).join(", "))}</span>`;
	if (cell.kind !== "slots") return betweenBarsHtml(cell, spoken, marks);
	const change = cell.tempoChange ? ` data-tempo-change="${cell.tempoChange}"` : "";
	const [body, end] = barBody(cell, { numeral, pitches: sung.pitches, sung: sung.bar });
	const numbers = sung.first ? verseNumbersHtml(sung.bar) : "";
	const drawn = `<span class="bm-bar-body" aria-hidden="true">${body}</span>`;
	// A lyric row's lines go under the bar body, in a stack that wraps with the bar.
	const stack = sung.beats ? `<span class="bm-bar-stack">${drawn}${sung.beats}</span>` : drawn;
	return `<div class="bm-bar" part="bar"${cell.cut ? " data-cut" : ""}${change}${marks}>${spoken}${numbers}${stack}${end}</div>`;
}

/** What a bar shows: its meter, its slots (or `%`), and "cut"; then the words after its last slot. */
function barBody(cell: Extract<CellModel, { kind: "slots" }>, given: View): [string, string] {
	// Each unreadable slot takes its message in turn (barmark's grammar 2.3).
	const view = { ...given, unread: [...(cell.unread ?? [])] };
	const meter = cell.meter
		? `<span class="bm-meter"><span>${cell.meter.n}</span><span>${cell.meter.d}</span></span>`
		: "";
	const cut = cell.cut ? `<span class="bm-cut">cut</span>` : "";
	const [written, end] = slotsWithWords(cell, view);
	const slots = cell.simile ? `<span class="bm-simile">%</span>` : written.join("");
	return [`${meter}${slots}${cut}`, end];
}

/** A bar where the part rests; the first of a row says so, in its body. */
function tacetHtml(cell: CellModel, n: number | null, marks: string, first: boolean): string {
	const cut = cell.kind === "slots" && cell.cut;
	const spoken = `<span class="bm-sr">${barLabel(n)}: tacet${cut ? ", cut on this pass" : ""}</span>`;
	return `<div class="bm-bar bm-tacet-bar" part="bar"${marks}${cut ? " data-cut" : ""}>${spoken}<span class="bm-bar-body" aria-hidden="true">${first ? "tacet" : ""}</span></div>`;
}

/** A bar's slots, each under any words before it, and the words after the last slot. */
function slotsWithWords(
	cell: Extract<CellModel, { kind: "slots" }>,
	view: View,
): [string[], string] {
	const words = (at: number) =>
		(cell.words ?? [])
			.filter((w) => w.at === at)
			.map((w) => escapeHtml(w.text))
			.join(" ");
	const slots = cell.slots.map((s, i) => {
		const said = words(i);
		const html = slotHtml(s, view);
		return said
			? `<span class="bm-worded"><span class="bm-words" part="words">${said}</span>${html}</span>`
			: html;
	});
	const after = words(cell.slots.length);
	return [
		slots,
		after
			? `<span class="bm-words bm-words-end" part="words" aria-hidden="true">${after}</span>`
			: "",
	];
}

/** A fermata, a rehearsal mark or a direction: a place between bars, drawn as its sign. */
function betweenBarsHtml(
	cell: Exclude<CellModel, { kind: "slots" }>,
	spoken: string,
	marks: string,
) {
	if (cell.kind === "fermata")
		return `<div class="bm-bar bm-fermata" part="bar"${marks}>${spoken}<span aria-hidden="true">${FERMATA}</span></div>`;
	if (cell.kind === "rehearsal")
		return `<div class="bm-bar bm-mark" part="mark"${marks}>${spoken}<span class="bm-box" aria-hidden="true">${escapeHtml(cell.label)}</span></div>`;
	return `<div class="bm-bar bm-direction" part="direction" data-direction="${cell.direction.kind}"${marks}>${spoken}<span aria-hidden="true">${directionGlyph(cell.direction)}</span></div>`;
}

/** Segno and coda as the score's signs; To Coda and the jumps as their words. */
function directionGlyph(d: Direction): string {
	if (d.kind === "segno") return SEGNO;
	if (d.kind === "coda") return CODA;
	const words = `<span class="bm-direction-words">${escapeHtml(printDirection(d))}</span>`;
	return d.kind === "to coda" ? `${words} ${CODA}` : words;
}

const SEGNO = `<svg class="bm-sign" viewBox="0 0 20 28" width="0.9em" height="1.25em"><path d="M14.5 6.5c-1-3-6.5-3.5-7.5-.5s3 4.5 4.5 5.5 5 3.5 3 7-7.5 2-8-1" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M4 24 16 3" stroke="currentColor" stroke-width="1.6"/><circle cx="4.5" cy="13" r="1.6" fill="currentColor"/><circle cx="15.5" cy="15" r="1.6" fill="currentColor"/></svg>`;
const CODA = `<svg class="bm-sign" viewBox="0 0 24 24" width="1em" height="1em"><circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 1v22M1 12h22" stroke="currentColor" stroke-width="1.6"/></svg>`;

const FERMATA = `<svg class="bm-fermata-glyph" viewBox="0 0 24 14" width="1.4em" height="0.8em"><path d="M2 13 A10 10 0 0 1 22 13" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="11" r="1.8" fill="currentColor"/></svg>`;

/** `‹` for an eighth push, `«` for a sixteenth. */
const PUSH_MARK = { eighth: "‹", sixteenth: "«" } as const;
const ARTICULATION_MARK = { accent: ">", hit: "^" } as const;
/** The piano score's marks: Ped. under a press, ✱ under a release (barmark's grammar 2.9). */
const PEDAL_MARK = { press: "Ped.", release: "✱" } as const;

const marksOf = (slot: Slot) => ({
	push: "push" in slot ? (slot.push ?? null) : null,
	articulation: slot.kind === "chord" ? (slot.articulation ?? null) : null,
	pedal: slot.kind === "chord" ? (slot.pedal ?? null) : null,
});

const dataOf = (marks: ReturnType<typeof marksOf>) =>
	Object.entries(marks)
		.map(([k, v]) => (v ? ` data-${k}="${v}"` : ""))
		.join("");

/** A slot with its push mark before it, its accent or hit above it and its pedal mark below. */
function slotHtml(slot: Slot, view: View): string {
	const html = markedSlotHtml(slot, view);
	// On a singing line each note, a group's members each, has its syllables under it.
	return view.sung && slot.kind !== "group" ? sungSlotHtml(html, view.sung) : html;
}

function markedSlotHtml(slot: Slot, view: View): string {
	const body = unmarkedSlotHtml(slot, view);
	const marks = marksOf(slot);
	const { push, articulation, pedal } = marks;
	if (!push && !articulation && !pedal) return body;
	const before = push ? `<span class="bm-push" aria-hidden="true">${PUSH_MARK[push]}</span>` : "";
	const above = articulation
		? `<span class="bm-artic">${ARTICULATION_MARK[articulation]}</span>`
		: "";
	const below = pedal
		? `<span class="bm-pedal" aria-hidden="true">${PEDAL_MARK[pedal]}</span>`
		: "";
	return `<span class="bm-marked"${dataOf(marks)}>${before}${above}${body}${below}</span>`;
}

/** A group: a tuplet number over equal members, or a dotted figure with its dot (barmark's grammar 2.2). */
function groupHtml(members: SimpleSlot[], view: View): string {
	const dotted = members.some((m) => m.dotted);
	const inner = members
		.map((m) =>
			m.dotted
				? `<span class="bm-dotted">${slotHtml(m, view)}<span class="bm-dot" aria-hidden="true">.</span></span>`
				: slotHtml(m, view),
		)
		.join("");
	if (dotted)
		return `<span class="bm-group" data-count="${members.length}" data-dotted>${inner}</span>`;
	return `<span class="bm-group" data-count="${members.length}"><span class="bm-tuplet">${members.length}</span>${inner}</span>`;
}

function unmarkedSlotHtml(slot: Slot, view: View): string {
	switch (slot.kind) {
		case "chord":
			return chordHtml(slot.chord, view);
		case "hold":
			return `<span class="bm-hold">/</span>`;
		case "nc":
			return `<span class="bm-nc">N.C.</span>`;
		case "silence":
			return `<span class="bm-silence"></span>`;
		case "unknown":
			return unknownHtml(slot.text, view);
		case "group":
			return groupHtml(slot.members, view);
	}
}

/**
 * `?`, or an unreadable slot as its author wrote it (barmark's grammar
 * 2.3); one written on its own line carries its error, a `%` copy doesn't.
 */
function unknownHtml(text: string | undefined, view: View): string {
	if (text === undefined) return `<span class="bm-unknown">?</span>`;
	const message = view.unread?.shift();
	if (message === undefined) return `<span class="bm-unknown">${escapeHtml(text)}</span>`;
	return `<span class="bm-unknown bm-unread" part="unread" title="${escapeHtml(message)}">${escapeHtml(text)}</span>`;
}

function chordHtml(record: ChordRecord, view: View): string {
	if (record.kind === "notes" && view.pitches) return pitchHtml(record);
	if (record.kind === "notes" || !record.parts) return notesHtml(record);
	const { numeral } = view;
	const pieces = numeral ? typesetNumeral(record.parts, numeral.key, numeral.style) : null;
	if (!pieces) return piecesHtml(typesetChord(record.parts), "");
	return piecesHtml(pieces, ` data-numeral="${numeral?.style}"`);
}

function piecesHtml(p: ChordPieces, attributes: string): string {
	const quality = p.quality ? `<span class="bm-quality">${p.quality}</span>` : "";
	const sup = p.superscript ? `<sup>${escapeHtml(p.superscript)}</sup>` : "";
	const bass = p.bass ? `<span class="bm-bass">/${escapeHtml(p.bass)}</span>` : "";
	return `<span class="bm-chord" part="chord"${attributes}>${escapeHtml(p.root)}${quality}${sup}${bass}</span>`;
}

/** A single note is ringed; a set sits in faint braces with its root underlined. */
function notesHtml(record: ChordRecord): string {
	const labels = record.canonical
		.replace(/^\{|\}$/g, "")
		.split(/\s+/)
		.filter(Boolean);
	const notes = labels.map((label) => {
		const root = label.endsWith("!");
		const { name, octave } = splitPitch(root ? label.slice(0, -1) : label);
		const html = `${escapeHtml(name)}${octave === null ? "" : `<sub>${escapeHtml(octave)}</sub>`}`;
		return root ? `<u>${html}</u>` : html;
	});
	if (notes.length === 1)
		return `<span class="bm-chord" part="chord"><span class="bm-ring">${notes[0]}</span></span>`;
	return `<span class="bm-chord bm-notes" part="chord"><span class="bm-brace">{</span>${notes.map((n) => `<span class="bm-note-name">${n}</span>`).join(" ")}<span class="bm-brace">}</span></span>`;
}

function diagnosticsHtml(model: ChartModel): string {
	if (!model.diagnostics.length) return "";
	// Line 0: about the whole chart, not a line of it.
	const at = (line: number) => (line > 0 ? `line ${line}: ` : "");
	return `<ul class="bm-diagnostics">${model.diagnostics.map((d) => `<li class="bm-${d.severity}">${at(d.line)}${escapeHtml(d.message)}</li>`).join("")}</ul>`;
}
