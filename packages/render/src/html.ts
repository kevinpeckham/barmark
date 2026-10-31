/**
 * The chart model as HTML: a <barmark-chart> holding a declarative shadow
 * root, or the bare markup for pages that bring the stylesheet themselves.
 * Every string from the chart is escaped; every bar carries its spoken name.
 */
import type { ChordRecord, Directives, Repeat, Slot } from "barmark";
import { glyphs, splitPitch, typesetChord } from "./chord.js";
import { escapeHtml } from "./escape.js";
import { fontFaceCss } from "./font.js";
import { layoutChart } from "./model.js";
import { speakBar } from "./speech.js";
import { FIT_STEPS, stylesheet } from "./styles.js";
import type { BlockItem, CellModel, ChartModel, SectionBlock } from "./types.js";

export type RenderOptions = {
	theme?: "auto" | "light" | "dark";
	barNumbers?: boolean;
	rehearsalLetters?: boolean;
	/** List the chart's errors and warnings below it. */
	diagnostics?: boolean;
	/** Where the page serves Edwin-Roman.otf: emits its @font-face rule before the chart. */
	fontUrl?: string;
};

type Row = Extract<BlockItem, { kind: "row" }>;
type Settings = { barNumbers: boolean };

export function renderChart(text: string, options: RenderOptions = {}): string {
	return `${fontStyle(options)}<barmark-chart><template shadowrootmode="open">${shadowContent(text, options)}</template></barmark-chart>`;
}

export const THEMES = ["auto", "light", "dark"] as const;

/** Only a known theme reaches the markup: hosts may pass any string through. */
const themeOf = (options: RenderOptions) => THEMES.find((t) => t === options.theme) ?? "auto";

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
	const model = layoutChart(text, { rehearsalLetters: options.rehearsalLetters ?? false });
	const settings: Settings = { barNumbers: options.barNumbers ?? true };
	return `<div class="bm-chart" data-theme="${themeOf(options)}"${settings.barNumbers ? "" : ' data-bar-numbers="off"'}>${headerHtml(model)}${model.blocks.map((b) => blockHtml(b, settings)).join("")}${options.diagnostics ? diagnosticsHtml(model) : ""}</div>`;
}

function headerHtml(model: ChartModel): string {
	const title = model.title
		? `<h2 class="bm-title" part="title">${escapeHtml(model.title)}</h2>`
		: "";
	const meta = metaText(model.header);
	if (!title && !meta) return "";
	return `<header class="bm-header">${title}${meta ? `<p class="bm-meta" part="meta">${meta}</p>` : ""}</header>`;
}

/** "D major · 4/4 · ♩ = 145 · swing", escaped. */
function metaText(d: Directives): string {
	return [
		d.key ? `${glyphs(d.key.tonic)} ${d.key.mode}` : "",
		d.time ? `${d.time.n}/${d.time.d}` : "",
		d.tempo ? `♩ = ${d.tempo}` : "",
		d.feel ?? "",
	]
		.filter(Boolean)
		.map(escapeHtml)
		.join(" · ");
}

function blockHtml(block: SectionBlock, settings: Settings): string {
	const label = block.heading === null ? "" : ` aria-label="${escapeHtml(block.heading)}"`;
	return `<section class="bm-section"${label}>${headingHtml(block)}<div class="bm-grid" style="--bm-cols:${Math.max(1, block.columns)}" data-fit="${fitWidth(block)}">${block.items.map((i) => itemHtml(i, block.columns, settings)).join("")}</div></section>`;
}

/**
 * Roughly how many em a section needs with its columns aligned, rounded up
 * to a step the stylesheet knows; narrower than that, its rows wrap.
 */
function fitWidth(block: SectionBlock): number {
	const widths: number[] = [];
	for (const item of block.items) {
		if (item.kind !== "row") continue;
		item.cells.forEach((cell, i) => {
			widths[i] = Math.max(widths[i] ?? 0, cellWidth(cell));
		});
	}
	const total = 5 + widths.reduce((a, b) => a + b, 0);
	return FIT_STEPS.find((step) => step >= total) ?? FIT_STEPS.at(-1) ?? 0;
}

/** Em per bar: padding, plus each slot's text and the gap after it. */
const cellWidth = (cell: CellModel) =>
	cell.kind === "fermata"
		? 2.6
		: Math.max(
				2.6,
				1.5 + (cell.meter ? 0.8 : 0) + cell.slots.reduce((w, s) => w + slotWidth(s), 0),
			);

/** Roughly: 0.65em a baseline character, 0.4em a superscript one, 0.6em between slots. */
function slotWidth(slot: Slot): number {
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
		case "text":
			return `<p class="bm-text${item.note ? " bm-note" : ""}" part="text">${escapeHtml(item.text)}</p>`;
		case "directive":
			return `<p class="bm-directive" part="meta">${metaText(item.set)}</p>`;
		case "error":
			return errorHtml(item.source, item.messages);
	}
}

function errorHtml(source: string, messages: string[]): string {
	const message = escapeHtml(messages.join("; "));
	return `<div class="bm-error" title="${message}"><code>${escapeHtml(source)}</code><span class="bm-sr">Error: ${message}</span></div>`;
}

function rowHtml(row: Row, columns: number, settings: Settings): string {
	const number = settings.barNumbers
		? `<span class="bm-bar-number" part="bar-number" aria-hidden="true">${row.barNumber ?? ""}</span>`
		: "";
	let n = row.barNumber;
	const cells = row.cells.map((cell, i) => {
		const html = cellHtml(cell, n, repeatMarks(row, i));
		if (n !== null && cell.kind === "slots") n++;
		return html;
	});
	const empty = `<span class="bm-empty" aria-hidden="true"></span>`.repeat(
		Math.max(0, columns - row.cells.length),
	);
	const opens = row.opens || typeof row.repeat === "number" || row.repeat === "open";
	return `<div class="bm-row">${opens ? `<span class="bm-sr">repeat start</span>` : ""}${number}${cells.join("")}${empty}<span class="bm-repeat">${rowRepeatHtml(row)}</span></div>`;
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

function cellHtml(cell: CellModel, barNumber: number | null, marks: string): string {
	const spoken = `<span class="bm-sr">${escapeHtml(speakBar(barNumber, cell))}</span>`;
	if (cell.kind === "fermata")
		return `<div class="bm-bar bm-fermata" part="bar"${marks}>${spoken}<span aria-hidden="true">${FERMATA}</span></div>`;
	const meter = cell.meter
		? `<span class="bm-meter"><span>${cell.meter.n}</span><span>${cell.meter.d}</span></span>`
		: "";
	const cut = cell.cut ? `<span class="bm-cut">cut</span>` : "";
	return `<div class="bm-bar" part="bar"${cell.cut ? " data-cut" : ""}${marks}>${spoken}<span class="bm-bar-body" aria-hidden="true">${meter}${cell.slots.map(slotHtml).join("")}${cut}</span></div>`;
}

const FERMATA = `<svg class="bm-fermata-glyph" viewBox="0 0 24 14" width="1.4em" height="0.8em"><path d="M2 13 A10 10 0 0 1 22 13" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="11" r="1.8" fill="currentColor"/></svg>`;

function slotHtml(slot: Slot): string {
	switch (slot.kind) {
		case "chord":
			return chordHtml(slot.chord);
		case "hold":
			return `<span class="bm-hold">/</span>`;
		case "nc":
			return `<span class="bm-nc">N.C.</span>`;
		case "silence":
			return `<span class="bm-silence"></span>`;
		case "unknown":
			return `<span class="bm-unknown">?</span>`;
		case "group":
			return `<span class="bm-group" data-count="${slot.members.length}"><span class="bm-tuplet">${slot.members.length}</span>${slot.members.map(slotHtml).join("")}</span>`;
	}
}

function chordHtml(record: ChordRecord): string {
	if (record.kind === "notes" || !record.parts) return notesHtml(record);
	const p = typesetChord(record.parts);
	const quality = p.quality ? `<span class="bm-quality">${p.quality}</span>` : "";
	const sup = p.superscript ? `<sup>${escapeHtml(p.superscript)}</sup>` : "";
	const bass = p.bass ? `<span class="bm-bass">/${escapeHtml(p.bass)}</span>` : "";
	return `<span class="bm-chord" part="chord">${escapeHtml(p.root)}${quality}${sup}${bass}</span>`;
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
	return `<ul class="bm-diagnostics">${model.diagnostics.map((d) => `<li class="bm-${d.severity}">line ${d.line}: ${escapeHtml(d.message)}</li>`).join("")}</ul>`;
}
