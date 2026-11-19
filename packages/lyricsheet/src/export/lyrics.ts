/**
 * A sung section occurrence as a ChordPro lyric environment (spec 4.1 to
 * 4.6): one line per written bar line, each chord before the syllable it
 * lands on, and `{chorus}` for a replayed chorus that sings what the
 * chorus before it sang.
 */
import { memberShares, type PlayedBar, type SimpleSlot, type Slot, type Syllable } from "barmark";
import { changeLines, comment } from "./changes.js";
import { groupBy, pushAll } from "./lists.js";
import { lyricLine, type Piece } from "./merge.js";
import { directive } from "./meta.js";
import type { Layout, Occurrence, Run } from "./plan.js";
import { isGap, spelled } from "./spell.js";
import { labelValue, plain, spaced, textChanged, unhashed, unjoined, untagged } from "./text.js";
import type { Out } from "./types.js";

export type Context = {
	/** Every occurrence before this one in play order, sung or not. */
	previous: Occurrence[];
	layout: Layout;
	/** The chart's first played bar, whose key, time and tempo the header wrote. */
	first: PlayedBar;
	/** The last chorus the sheet wrote: what `{chorus}` would recall. */
	chorus: { last: { form: number | null; body: string } | null };
};

const LOST = {
	"chord-names":
		'a chord name ChordPro\'s chord parser does not know is written as barmark spells it: ChordPro readers may show it as text (diagrams: "guitar" defines a shape for one that has a shape, which they then draw)',
	"note-sets":
		"a note set is written as its notes' names, as text and not a chord; its octaves and root mark are lost",
	voicing: "a voicing is written as its chord's name; its notes are lost",
	marks: "pushes, accents, hits and pedal marks are not written; the chord is, unmarked",
	"bar-meter": "lyric lines do not show a bar's own meter",
	fermata:
		"a fermata is written as the annotation *… (ChordPro has none): a reader sees an ellipsis over the words or in a grid's cell, not a fermata sign",
	"chord-moved":
		"a chord between two syllables of one word is written before the word's next syllable",
	"stacked-verses":
		"verses stacked on the same bars (not one verse per pass of a repeat) are written one pass per verse, each with its chords: ChordPro has no stacking",
} as const;

export const lose = (out: Out, code: keyof typeof LOST, bar: PlayedBar) =>
	out.losses.add(code, LOST[code], bar);

/** The environment a heading's first word names (spec 4.6): verse, chorus or bridge, any case; else verse. */
function envOf(name: string | null): "verse" | "chorus" | "bridge" {
	const word = /^[a-z]+/i.exec(name ?? "")?.[0]?.toLowerCase();
	return word === "chorus" || word === "bridge" ? word : "verse";
}

/** `label="…"`: the heading as written, quoted as the label's value needs (`labelValue`); null for none. */
export function labelOf(name: string | null, out: Out, bar: PlayedBar | undefined): string | null {
	if (name === null) return null;
	const label = untagged(name);
	if (label !== name || /[{}]|\\n/.test(name) || spaced(name) !== name)
		textChanged(out.losses, bar);
	return `label="${labelValue(label)}"`;
}

/** `{start_of_verse: label="…"}`, or with no label for the unnamed section. */
function startLine(env: string, name: string | null, out: Out, bar: PlayedBar | undefined): string {
	const label = labelOf(name, out, bar);
	return label === null ? directive(`start_of_${env}`) : directive(`start_of_${env}`, label);
}

/** Where the line is: the repeated N.C. or stop that has no attack of its own. */
export type LineState = { last: "nc" | "silence" | null };

/** A note set's notes as text, octaves and root mark left out, each once. */
const noteNames = (pitches: string[]) =>
	[...new Set(pitches.map((p) => p.replace(/-?\d+$/, "")))].join(" ");

/** What a chord or note set slot writes, and what it loses. */
function chordText(slot: Extract<SimpleSlot, { kind: "chord" }>, bar: PlayedBar, out: Out): string {
	if (slot.push || slot.articulation || slot.pedal) lose(out, "marks", bar);
	if (slot.chord.kind === "notes") {
		lose(out, "note-sets", bar);
		return `*${noteNames(slot.chord.pitches)}`;
	}
	// With diagrams, the shapes decide which of these losses stand (defines.ts).
	if (out.uses) out.uses.push({ chord: slot.chord, voicing: slot.voicing ?? null, bar });
	else {
		if (slot.voicing) lose(out, "voicing", bar);
		if (isGap(slot.chord)) lose(out, "chord-names", bar);
	}
	return spelled(slot.chord);
}

/** N.C. or a stop, unless the slot before was the same (a repeat has no attack of its own). */
function restText(kind: "nc" | "silence", st: LineState): string | null {
	if (st.last === kind) return null;
	st.last = kind;
	return kind === "nc" ? "*N.C." : "*Stop";
}

/** What a slot writes in a lyric line (spec 4.3), or null for none (a hold, a repeated N.C.). */
export function slotText(slot: SimpleSlot, st: LineState, bar: PlayedBar, out: Out): string | null {
	if (slot.kind === "hold") return null;
	if ((slot.kind === "nc" || slot.kind === "silence") && slot.push) lose(out, "marks", bar);
	if (slot.kind === "nc" || slot.kind === "silence") return restText(slot.kind, st);
	st.last = null;
	return slot.kind === "unknown" ? "*?" : chordText(slot, bar, out);
}

/** A bar's pieces, with whether any text in them was changed for ChordPro. */
type BarPieces = { pieces: Piece[]; changed: boolean };

/** Each simple slot of a top-level slot with its onset, as `slotTimes` in barmark times them. */
export function membersAt(
	slot: Slot,
	at: number,
	each: number,
): { slot: SimpleSlot; at: number }[] {
	const members = slot.kind === "group" ? slot.members : [slot];
	const shares = memberShares(members);
	let t = at;
	return members.map((m, i) => {
		const here = { slot: m, at: t };
		t += each * (shares[i] ?? 0);
		return here;
	});
}

/** A bar's words, rehearsal mark and chords, from `offset` whole notes into the line. */
function harmonyPieces(bar: PlayedBar, offset: number, st: LineState, out: Out): BarPieces {
	const length = bar.meter.n / bar.meter.d;
	const each = length / Math.max(1, bar.slots.length);
	const pieces: Piece[] = bar.rehearsal ? [{ at: offset, chord: `*@${bar.rehearsal}` }] : [];
	let changed = false;
	// The bar's words by slot, once: a scan of every word for each slot is quadratic in a long bar.
	const words = groupBy(bar.words ?? [], (w) => w.at);
	const wordsAt = (k: number) => {
		for (const w of words.get(k) ?? []) {
			const text = plain(w.text);
			changed ||= text !== w.text;
			const at = offset + k * each;
			pieces.push(
				k === bar.slots.length ? { at, chord: `*${text}`, alone: true } : { at, chord: `*${text}` },
			);
		}
	};
	bar.slots.forEach((slot, k) => {
		wordsAt(k);
		for (const m of membersAt(slot, offset + k * each, each)) {
			const chord = slotText(m.slot, st, bar, out);
			if (chord !== null) pieces.push({ at: m.at, chord });
		}
	});
	wordsAt(bar.slots.length);
	// A pickup's short meter is how a pickup is written, not a bar's own meter.
	if (bar.time && bar.written !== 0) lose(out, "bar-meter", bar);
	return { pieces, changed };
}

/** A syllable with brackets and braces as ChordPro shows them unchanged, or itself when it has none. */
function shown(s: Syllable): Syllable {
	if (s.kind !== "sung" || s.parts.every((p) => plain(p) === p)) return s;
	return { ...s, parts: s.parts.map(plain) };
}

/** A bar's sung syllables, from `offset` whole notes into the line. */
function sungPieces(bar: PlayedBar, offset: number): BarPieces {
	const pieces: Piece[] = [];
	let changed = false;
	for (const l of bar.lyrics ?? [])
		for (const s of l.syllables) {
			const syllable = shown(s.syllable);
			changed ||= syllable !== s.syllable;
			pieces.push({ at: offset + s.at, syllable });
		}
	return { pieces, changed };
}

/** `*…` at `at`, alone, when a fermata follows played bar `after` (0: before the first bar). */
function fermataAt(
	bar: PlayedBar,
	after: number,
	at: number,
	fermatas: Set<number>,
	out: Out,
): Piece[] {
	if (!fermatas.has(after)) return [];
	lose(out, "fermata", bar);
	return [{ at, chord: "*…", alone: true }];
}

/** One written line's bars as one lyric line, and its losses. */
function lyricText(bars: PlayedBar[], fermatas: Set<number>, out: Out): string {
	const pieces: Piece[] = [];
	const owner: PlayedBar[] = [];
	const st: LineState = { last: null };
	let offset = 0;
	let changed = false;
	for (const bar of bars) {
		const length = bar.meter.n / bar.meter.d;
		const harmony = harmonyPieces(bar, offset, st, out);
		const sung = sungPieces(bar, offset);
		const own = [
			...fermataAt(bar, bar.index === 1 ? 0 : -1, offset, fermatas, out),
			...harmony.pieces,
			...sung.pieces,
			...fermataAt(bar, bar.index, offset + length, fermatas, out),
		];
		pushAll(pieces, own);
		for (const _ of own) owner.push(bar);
		changed ||= harmony.changed || sung.changed;
		offset += length;
	}
	const text = lyricLine(pieces, (i) => {
		const bar = owner[i];
		if (bar) lose(out, "chord-moved", bar);
	});
	const written = unjoined(unhashed(text));
	if (changed || written !== text) textChanged(out.losses, bars[0]);
	return written;
}

/** An occurrence's bars by written line (or system), a new line where play goes back (a repeat). */
export function byLine(bars: PlayedBar[]): PlayedBar[][] {
	const out: PlayedBar[][] = [];
	let prev: PlayedBar | undefined;
	for (const bar of bars) {
		if (!prev || bar.line !== prev.line || bar.written <= prev.written) out.push([]);
		out.at(-1)?.push(bar);
		prev = bar;
	}
	return out;
}

/** The run of bar lines a bar is written in. */
export const runOf = (layout: Layout, bar: PlayedBar | undefined): Run | undefined =>
	bar && layout.runs.get(bar.line);

/** Where a written line is played: the bar before it, the bar after it, and whether it opens the occurrence. */
type Around = { prev: PlayedBar | undefined; next: PlayedBar | undefined; opens: boolean };

/** A run's text lines on one side of it, as comments. */
export const texts = (run: Run | undefined, side: keyof Run, bar: PlayedBar, out: Out) =>
	(run?.[side] ?? []).map((t) => comment(t, bar, out));

/** The lyric line, and the end of an open repeat after it. */
function played(bars: PlayedBar[], last: PlayedBar, out: Out, layout: Layout): string[] {
	const text = lyricText(bars, layout.fermatas, out);
	const lines = text === "" ? [] : [text];
	if (layout.openEnds.has(last.index)) lines.push(directive("comment", "repeat ad lib."));
	return lines;
}

/** One written line's lines: its run's text before it, changes, the lyric line, an open repeat's end, text after. */
function lineLines(bars: PlayedBar[], around: Around, out: Out, context: Context): string[] {
	const { layout } = context;
	const [first] = bars;
	const last = bars.at(-1);
	if (!first || !last) return [];
	const run = runOf(layout, first);
	const fresh = around.opens || runOf(layout, around.prev) !== run;
	return [
		...(fresh ? texts(run, "before", first, out) : []),
		...changeLines(around.prev, first, context.first, out),
		...played(bars, last, out, layout),
		...(runOf(layout, around.next) !== run ? texts(run, "after", last, out) : []),
	];
}

/** The lines inside an occurrence's environment, written line by written line. */
function bodyOf(o: Occurrence, out: Out, context: Context): string[] {
	const groups = byLine(o.bars);
	let prev = context.previous.at(-1)?.bars.at(-1);
	return groups.flatMap((bars, g) => {
		const around = { prev, next: groups[g + 1]?.[0], opens: g === 0 };
		prev = bars.at(-1) ?? prev;
		return lineLines(bars, around, out, context);
	});
}

/** Whether `{chorus}` says the same: a replay of the written chorus last written, singing its lines, with its chords. */
function recalls(o: Occurrence, body: string, context: Context): boolean {
	const before = context.chorus.last;
	return o.replay && o.form !== null && before?.form === o.form && before.body === body;
}

/** A sung occurrence as a lyric environment, or `{chorus}` (spec 4.1, 4.5, 4.6). */
export function lyricSection(o: Occurrence, out: Out, context: Context): void {
	const lines = bodyOf(o, out, context);
	if (o.stacked) for (const bar of o.bars) if (bar.lyrics?.length) lose(out, "stacked-verses", bar);
	const env = envOf(o.name);
	const body = lines.join("\n");
	const recalled = env === "chorus" && recalls(o, body, context);
	if (env === "chorus") context.chorus.last = { form: o.form, body };
	if (out.lines.length) out.lines.push("");
	pushAll(out.lines, headingTexts(o, context, out));
	if (recalled) out.lines.push(directive("chorus"));
	else {
		out.lines.push(startLine(env, o.name, out, o.bars[0]));
		pushAll(out.lines, lines);
		out.lines.push(directive(`end_of_${env}`));
	}
}

/**
 * The text under a heading with no bar lines of its own (a replay), as
 * comments before its first occurrence, outside any environment.
 */
export function headingTexts(o: Occurrence, context: Context, out: Out): string[] {
	const before = context.previous.at(-1);
	const first = before?.heading !== o.heading || before?.form !== o.form;
	const texts = o.heading === null || !first ? [] : (context.layout.headings.get(o.heading) ?? []);
	return texts.map((t) => comment(t, o.bars[0], out));
}
