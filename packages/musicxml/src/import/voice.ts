/**
 * A part that sings (the voice-and-lyrics design, section 7): its harmony
 * on its bare line, its melody on the line named `Mel` with verse 1's
 * syllables on the notes; with no harmony, the melody on its bare line.
 * Its other verses become lyric rows (`lyrics.ts`). A rhythm the grammar
 * can't write snaps to the nearest it can (`snap.ts`), with a loss.
 */
import { beatsOf, MAX_LINES } from "barmark";
import { cmp, type Frac, ZERO } from "../rhythm.js";
import { type Bar, type LineRead, noteSet, readLine } from "./cells.js";
import { placeBar } from "./grid.js";
import { type Holds, newHolds, type SungEvent, tokensAt, type Words, wordsOf } from "./lyrics.js";
import type { Line } from "./merge.js";
import type { Attack } from "./read.js";
import { snapOnsets } from "./snap.js";

/** An attack of the melody as placed: its symbol (a note set with its syllable, or `--`), and its words. */
type Placed = { at: Frac; symbol: string; sung: SungEvent | null };

/** A melody line read bar by bar: its cells, its words' onsets, and the measures whose rhythm snapped. */
type VoiceRead = { cells: (string | null)[]; sung: SungEvent[][]; snapped: string[] };

const newNote = (a: Attack) => a.kind === "notes" && !a.tieIn && a.pitches.length > 0;

/**
 * A bar's attacks as the melody writes them: a new note as its note set
 * with verse 1's syllable when it sings, a rest (or a slash, rhythm alone)
 * as `--` once, a tie's continuation as nothing (a hold).
 */
function attacksOf(attacks: Attack[], holding: Holds, sing: boolean): Placed[] {
	const out: Placed[] = [];
	for (const a of attacks) {
		if (newNote(a)) {
			const tokens = sing ? tokensAt(a.lyrics, holding) : new Map<number, string>();
			const first = tokens.get(1);
			const symbol = first === undefined ? noteSet(a.pitches) : `${noteSet(a.pitches)}:${first}`;
			out.push({ at: a.at, symbol, sung: { at: a.at, tokens, otherwise: "--" } });
		} else if (a.kind !== "notes") {
			holding.on.clear();
			if (out.at(-1)?.symbol !== "--") out.push({ at: a.at, symbol: "--", sung: null });
		}
	}
	return out;
}

/**
 * The bar's attacks on the grid, snapped to it when they don't fit: its
 * cell, its words' onsets and whether it snapped. With no attack, a hold;
 * should even snapping fail, a rest.
 */
function placed(events: Placed[], bar: Bar): { cell: string; sung: SungEvent[]; snapped: boolean } {
	const sung = (list: Placed[]) => list.flatMap((e) => (e.sung ? [e.sung] : []));
	if (events.length === 0) return { cell: "/", sung: [], snapped: false };
	const exact = placeBar(events, bar.length, bar.meter, true);
	if (exact) return { cell: exact.cell, sung: sung(events), snapped: false };
	const moved = snapOnsets(events, bar.length, beatsOf(bar.meter));
	for (const e of moved) if (e.sung) e.sung.at = e.at;
	const cell = placeBar(moved, bar.length, bar.meter, true)?.cell;
	return cell
		? { cell, sung: sung(moved), snapped: true }
		: { cell: "--", sung: [], snapped: true };
}

/** One bar of a melody: its cell (null when it plays no note), its words, whether it snapped, and whether it ends sounding. */
function voiceBar(attacks: Attack[], bar: Bar, sounding: boolean, holding: Holds, sing: boolean) {
	const events = attacksOf(attacks, holding, sing);
	if (!attacks.some((a) => a.kind === "notes"))
		return { cell: null, sung: [], snapped: false, ends: false };
	if (!sounding && !events.some((e) => cmp(e.at, ZERO) === 0))
		events.unshift({ at: ZERO, symbol: "--", sung: null });
	// The line sounds on into the next bar when its last sound here is a note.
	return { ...placed(events, bar), ends: attacks.at(-1)?.kind === "notes" };
}

/**
 * A melody line: each bar's notes, rests and holds, with verse 1's
 * syllables on the notes when `sing`; a bar of slashes or rests alone
 * rests (`null`). Onsets a group can't write snap to the nearest it can.
 */
function readVoice(bars: Attack[][], shared: Bar[], sing: boolean): VoiceRead {
	const out: VoiceRead = { cells: [], sung: [], snapped: [] };
	const holding = newHolds();
	let sounding = false;
	shared.forEach((bar, i) => {
		const read = voiceBar(bars[i] ?? [], bar, sounding, holding, sing);
		out.cells.push(read.cell);
		out.sung.push(read.sung);
		if (read.snapped) out.snapped.push(bar.number);
		sounding = read.ends;
	});
	return out;
}

/** A bar of the harmony's line that writes its chords' rhythm: slashes, and no new note. */
const slashBar = (attacks: Attack[]) =>
	attacks.some((a) => a.kind === "slash") && !attacks.some(newNote);

/**
 * The harmony's line: chords alone where the melody sings, as a lead
 * sheet writes them (held over its rests); in bars of slashes, their
 * rhythm. `N.C.` where the melody sings before any chord.
 */
function harmonyLine(first: Line, bars: Bar[], voices: VoiceRead[]): LineRead {
	const melodyBars = new Set(bars.flatMap((_, i) => (slashBar(first[i] ?? []) ? [] : [i])));
	const read = readLine(first, bars, { chords: true, notes: true, melodyBars });
	read.cells = read.cells.map((c, i) =>
		c === null && voices.some((v) => v.cells[i] != null) ? "N.C." : c,
	);
	return read;
}

/** The line that sings: the first with lyrics, else the first. */
function singingIndex(lines: Line[]): number {
	const found = lines.findIndex((l) => l.some((bar) => bar.some((a) => a.lyrics.length > 0)));
	return Math.max(0, found);
}

/** A singing part read: its harmony's line (null with none), its melody lines, the one that sings, its words and the measures that snapped. */
export type Sung = {
	harmony: LineRead | null;
	voices: (string | null)[][];
	/** The index in `voices` of the line that sings. */
	sings: number;
	words: Words;
	snapped: string[];
	/** Lines left out past barmark's four. */
	dropped: boolean;
	/** The bars with lyrics no note of the line that sings carries, each with why. */
	unplaced: Unplaced[];
};

/** Why a bar's lyrics weren't placed: on another line, a rest or tie, a slash, or lost as the rhythm snapped. */
export type Unplaced = { index: number; why: "line" | "rest" | "slash" | "snap" };

/** Whether an attack carries words (not only an extend held on from before). */
const worded = (a: Attack) => a.lyrics.some((l) => l.parts.some((p) => p.trim() !== ""));

/** Words a bar's onsets carry: those with a syllable of their own, not a `/` held on. */
const carried = (events: SungEvent[]) =>
	events.filter((e) => [...e.tokens.values()].some((t) => t !== "/")).length;

/**
 * The bars with lyrics the melody can't carry: on a line that doesn't sing,
 * on a rest, slash or tie of the line that does, or lost as its rhythm was
 * placed.
 */
function unplacedIn(lines: Line[], singing: number, own: VoiceRead, bars: Bar[]): Unplaced[] {
	return bars.flatMap((_, index): Unplaced[] => {
		const mine = (lines[singing]?.[index] ?? []).filter(worded);
		const off = mine.filter((a) => !newNote(a));
		if (lines.some((l, k) => k !== singing && (l[index] ?? []).some(worded)))
			return [{ index, why: "line" }];
		if (off.some((a) => a.kind === "slash")) return [{ index, why: "slash" }];
		if (off.length > 0) return [{ index, why: "rest" }];
		const lost = mine.filter(newNote).length > carried(own.sung[index] ?? []);
		return lost ? [{ index, why: "snap" }] : [];
	});
}

/**
 * A part that sings, read: up to four lines in all (the harmony's line
 * counting one); past that, the line that sings alone.
 */
export function readSinging(lines: Line[], bars: Bar[], hasChords: boolean): Sung {
	const room = MAX_LINES - (hasChords ? 1 : 0);
	const singing = singingIndex(lines);
	const dropped = lines.length > room;
	const kept = dropped ? [lines[singing] ?? []] : lines;
	const sings = dropped ? 0 : singing;
	const voices = kept.map((l, i) => readVoice(l, bars, i === sings));
	const own = voices[sings] ?? { cells: [], sung: [], snapped: [] };
	return {
		harmony: hasChords ? harmonyLine(lines[0] ?? [], bars, voices) : null,
		voices: voices.map((v) => v.cells),
		sings,
		words: wordsOf(
			own.sung,
			bars,
			own.cells.map((c) => c === "/"),
		),
		snapped: bars.flatMap((bar) =>
			voices.some((v) => v.snapped.includes(bar.number)) ? [bar.number] : [],
		),
		dropped,
		unplaced: unplacedIn(lines, singing, own, bars),
	};
}

/** A lyric staff's words: each slash's syllables, a slash with none holding on, a rest a breath. */
export function staffWords(line: Line, bars: Bar[]): Words {
	const holding = newHolds();
	const onsets = bars.map((_, i) =>
		(line[i] ?? []).flatMap((a): SungEvent[] => {
			if (a.kind === "rest") return [{ at: a.at, tokens: new Map(), otherwise: "--" }];
			if (a.tieIn) return [];
			const tokens = tokensAt(a.lyrics, holding);
			for (const [verse, token] of tokens) if (token === "/") tokens.delete(verse);
			return [{ at: a.at, tokens, otherwise: "/" }];
		}),
	);
	return wordsOf(onsets, bars, []);
}
