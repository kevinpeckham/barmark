/**
 * A sung section occurrence as a ChordPro lyric environment (spec 4.1 to
 * 4.6): one line per written bar line, each chord before the syllable it
 * lands on, and `{chorus}` for a replayed chorus that sings what the
 * chorus before it sang.
 */
import { memberShares, type PlayedBar, type SimpleSlot, type Slot, type Syllable } from "barmark";
import { changeLines, comment, plain, textChanged, unhashed } from "./changes.js";
import { lyricLine, type Piece } from "./merge.js";
import { directive } from "./meta.js";
import type { Layout, Occurrence, Run } from "./plan.js";
import { isGap, spelled } from "./spell.js";
import type { Out } from "./types.js";

export type Context = {
	/** Every occurrence before this one in play order, sung or not. */
	previous: Occurrence[];
	layout: Layout;
	/** The chart's first played bar, whose key, time and tempo the header wrote. */
	first: PlayedBar;
};

const LOST = {
	"chord-names":
		'a chord name ChordPro\'s chord parser does not know is written as barmark spells it: ChordPro readers may show it as text, and diagrams: "guitar" gives it a shape',
	"chord-timing": "lyric lines keep the order of a bar's chords, not where in the bar each falls",
	stop: "a stop (--) is written as the text *Stop",
	"note-sets":
		"a note set is written as its notes' names, as text and not a chord; its octaves and root mark are lost",
	voicing: "a voicing is written as its chord's name; its notes are lost",
	marks: "pushes, accents, hits and pedal marks are not written; the chord is, unmarked",
	"bar-meter": "lyric lines do not show a bar's own meter",
	fermata: "a fermata is written as the text *…, with no length",
	"chord-moved":
		"a chord between two syllables of one word is written before the word's next syllable",
	"stacked-verses":
		"verses stacked on bars that play once are written one pass per verse, each with its chords: ChordPro has no stacking",
} as const;

const lose = (out: Out, code: keyof typeof LOST, bar: PlayedBar) =>
	out.losses.add(code, LOST[code], bar);

/** The environment a heading's first word names (spec 4.6): verse, chorus or bridge, any case; else verse. */
function envOf(name: string | null): "verse" | "chorus" | "bridge" {
	const word = /^[a-z]+/i.exec(name ?? "")?.[0]?.toLowerCase();
	return word === "chorus" || word === "bridge" ? word : "verse";
}

/** `{start_of_verse: label="…"}`: the heading as written, `\` and `"` escaped as the label's quotes need. */
function startLine(env: string, name: string | null, out: Out, bar: PlayedBar | undefined): string {
	if (name === null) return directive(`start_of_${env}`);
	if (/[{}\p{Cc}\u2028\u2029]/u.test(name)) textChanged(out, bar);
	return directive(`start_of_${env}`, `label="${name.replace(/[\\"]/g, (c) => `\\${c}`)}"`);
}

/** Where the line is: the repeated N.C. or stop that has no attack of its own. */
type LineState = { last: "nc" | "silence" | null };

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
	if (slot.voicing) lose(out, "voicing", bar);
	if (isGap(slot.chord)) lose(out, "chord-names", bar);
	return spelled(slot.chord);
}

/** N.C. or a stop, unless the slot before was the same (a repeat has no attack of its own). */
function restText(kind: "nc" | "silence", st: LineState, bar: PlayedBar, out: Out): string | null {
	if (st.last === kind) return null;
	st.last = kind;
	if (kind === "silence") lose(out, "stop", bar);
	return kind === "nc" ? "*N.C." : "*Stop";
}

/** What a slot writes in a lyric line (spec 4.3), or null for none (a hold, a repeated N.C.). */
function slotText(slot: SimpleSlot, st: LineState, bar: PlayedBar, out: Out): string | null {
	if (slot.kind === "hold") return null;
	if ((slot.kind === "nc" || slot.kind === "silence") && slot.push) lose(out, "marks", bar);
	if (slot.kind === "nc" || slot.kind === "silence") return restText(slot.kind, st, bar, out);
	st.last = null;
	return slot.kind === "unknown" ? "*?" : chordText(slot, bar, out);
}

/** A bar's pieces, with whether any text in them was changed for ChordPro. */
type BarPieces = { pieces: Piece[]; changed: boolean };

/** Each simple slot of a top-level slot with its onset, as `slotTimes` in barmark times them. */
function membersAt(slot: Slot, at: number, each: number): { slot: SimpleSlot; at: number }[] {
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
	const wordsAt = (k: number) => {
		for (const w of bar.words ?? []) {
			if (w.at !== k) continue;
			const text = plain(w.text);
			changed ||= text !== w.text;
			const at = offset + k * each;
			pieces.push(
				k === bar.slots.length ? { at, chord: `*${text}`, alone: true } : { at, chord: `*${text}` },
			);
		}
	};
	let attacks = 0;
	bar.slots.forEach((slot, k) => {
		wordsAt(k);
		for (const m of membersAt(slot, offset + k * each, each)) {
			const chord = slotText(m.slot, st, bar, out);
			if (chord !== null) pieces.push({ at: m.at, chord });
			attacks += chord === null ? 0 : 1;
		}
	});
	wordsAt(bar.slots.length);
	if (attacks > 1) lose(out, "chord-timing", bar);
	if (bar.time) lose(out, "bar-meter", bar);
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
		pieces.push(...own);
		owner.push(...own.map(() => bar));
		changed ||= harmony.changed || sung.changed;
		offset += length;
	}
	const text = lyricLine(pieces, (i) => {
		const bar = owner[i];
		if (bar) lose(out, "chord-moved", bar);
	});
	if (changed || text.startsWith("#")) textChanged(out, bars[0]);
	return unhashed(text);
}

/** An occurrence's bars by written line (or system): consecutive bars written on one line. */
function byLine(bars: PlayedBar[]): PlayedBar[][] {
	const out: PlayedBar[][] = [];
	let line: number | null = null;
	for (const bar of bars) {
		if (bar.line !== line || !out.length) out.push([]);
		out.at(-1)?.push(bar);
		line = bar.line;
	}
	return out;
}

/** The run of bar lines a bar is written in. */
const runOf = (layout: Layout, bar: PlayedBar | undefined): Run | undefined =>
	bar && layout.runs.get(bar.line);

/** Where a written line is played: the bar before it, the bar after it, and whether it opens the occurrence. */
type Around = { prev: PlayedBar | undefined; next: PlayedBar | undefined; opens: boolean };

/** A run's text lines on one side of it, as comments. */
const texts = (run: Run | undefined, side: keyof Run, bar: PlayedBar, out: Out) =>
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

/** The last chorus each sheet wrote (its name and the lines inside it): what `{chorus}` would recall. */
const lastChorus = new WeakMap<Out, { name: string | null; body: string }>();

/** Whether `{chorus}` says the same: a replayed chorus singing what the last chorus written sang, with its chords. */
function recalls(o: Occurrence, body: string, out: Out): boolean {
	const before = lastChorus.get(out);
	return o.replay && before?.name === o.name && before.body === body;
}

/** A sung occurrence as a lyric environment, or `{chorus}` (spec 4.1, 4.5, 4.6). */
export function lyricSection(o: Occurrence, out: Out, context: Context): void {
	const lines = bodyOf(o, out, context);
	if (o.stacked) for (const bar of o.bars) if (bar.lyrics?.length) lose(out, "stacked-verses", bar);
	const env = envOf(o.name);
	const body = lines.join("\n");
	const recalled = env === "chorus" && recalls(o, body, out);
	if (env === "chorus") lastChorus.set(out, { name: o.name, body });
	if (out.lines.length) out.lines.push("");
	if (recalled) out.lines.push(directive("chorus"));
	else out.lines.push(startLine(env, o.name, out, o.bars[0]), ...lines, directive(`end_of_${env}`));
}
