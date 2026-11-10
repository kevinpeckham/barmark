/**
 * A chart's played bars as the pads the alignment renders (design §6.3),
 * read from barmark's `parseChart` play order. Ported from the app's
 * `utils/barmarkChartBars.ts` (`barChords`, `barTempo`, `keyText`, the
 * sections), `audio/chartAlignment.ts` (`slotsOf`, `chartBeatsPerBar`),
 * `utils/chordPitchClasses.ts`, `utils/tonicPitchClass.ts`,
 * `utils/chartBarSeconds.ts` and `utils/median.ts`, on records instead of
 * symbol strings, with the arithmetic in the app's order.
 */
import {
	beatsOf,
	type ChartParse,
	type ChordRecord,
	type Key,
	type PlayedBar,
	type SimpleSlot,
	type Slot,
} from "barmark";

/** The pitch classes a chord sounds (C = 0): the app's `chordPitchClasses` result. */
export type Pitches = { root: number; tones: number[] };

/** One played bar as the alignment renders it. */
export type PadBar = {
	/** `PlayedBar.index`: 1-based, in play order. */
	index: number;
	/** What each slot sounds, dividing the bar equally; null is silent; one pad for an all-hold bar. */
	pads: (Pitches | null)[];
	seconds: number;
	/** Grammar 2.1's beat of the `time:` meter, after the fallback. */
	tempo: number;
	meter: { n: number; d: number };
	/** `${tonic} ${mode}`, the app's `keyText`; null when the chart marks none. */
	key: string | null;
	/** The heading that begins at this bar, else its rehearsal mark (Ruling 4); null otherwise. */
	section: string | null;
};

export type ChartPadBars =
	| { ok: true; bars: PadBar[] }
	| { ok: false; reason: "no-bars" | "no-tempo"; index?: number };

const LETTER_PCS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** The pitch class (C = 0) of a note name such as "F#", "Bb" or "E♭", null when it is not one: the app's `tonicPitchClass`. */
function tonicPitchClass(tonic: string): number | null {
	const letter = LETTER_PCS[tonic[0]?.toUpperCase() ?? ""];
	if (letter === undefined) return null;
	let pc = letter;
	for (const ch of tonic.slice(1)) {
		if (ch === "#" || ch === "♯") pc += 1;
		else if (ch === "b" || ch === "♭") pc -= 1;
		else return null;
	}
	return (pc + 12) % 12;
}

/**
 * The pitch classes a chord record sounds, the app's `chordPitchClasses`:
 * the root, then its pitches and the bass, without repeats. Null for a
 * note set (a rootless record), which has no chord to pad.
 */
export function pitchesOf(record: ChordRecord): Pitches | null {
	if (record.root === null) return null;
	const root = tonicPitchClass(record.root);
	if (root === null) return null;
	const tones: number[] = [];
	for (const note of [...record.pitches, record.bass]) {
		const pc = tonicPitchClass(note);
		if (pc !== null && !tones.includes(pc)) tones.push(pc);
	}
	return { root, tones };
}

/**
 * A bar's seconds, the app's `barTempo` then `chartBarSeconds` in their
 * order: `tempo:` (else `fallback`, both grammar 2.1's beat) counts the
 * beat of the `time:` meter in force, and the bar lasts its own meter's
 * numerator of its bottom note. Null when the bar has no tempo and there
 * is no fallback.
 */
export function barSeconds(bar: PlayedBar, fallback: number | undefined): number | null {
	const time = bar.time ?? bar.meter;
	const tempo = bar.tempo ?? fallback;
	if (tempo === undefined) return null;
	const song = (tempo * time.n) / beatsOf(time);
	const bpm = (song * bar.meter.d) / time.d;
	return (bar.meter.n * 60) / bpm;
}

/** A slot that keeps whatever was sounding: `/`, `?`, or a group led by one. */
const HOLD = Symbol("hold");
/** A slot's read: a chord record, null for silence, or a hold. */
type Read = ChordRecord | null | typeof HOLD;
/** What a leading hold repeats: the last read of the bars before; undefined when nothing was. */
type Carried = ChordRecord | null | undefined;

/** The app's `readSimple`: `N.C.` and silence are silent, the rest that is not a chord holds. */
function readSimple(slot: SimpleSlot): Read {
	if (slot.kind === "chord") return slot.chord;
	return slot.kind === "nc" || slot.kind === "silence" ? null : HOLD;
}

/** The app's `readSlot`: a group reads its first member. */
function readSlot(slot: Slot): Read {
	if (slot.kind !== "group") return readSimple(slot);
	const first = slot.members[0];
	return first ? readSimple(first) : HOLD;
}

/**
 * The app's `barChords`: [] when every read holds; otherwise a hold
 * repeats the read before it, a leading hold the one carried in, and with
 * nothing carried it is dropped.
 */
function barReads(bar: PlayedBar, carried: Carried): (ChordRecord | null)[] {
	const reads = bar.slots.map(readSlot);
	if (reads.every((r) => r === HOLD)) return [];
	const out: (ChordRecord | null)[] = [];
	let current = carried;
	for (const read of reads) {
		if (read !== HOLD) current = read;
		if (current !== undefined) out.push(current);
	}
	return out;
}

/** The app's `slotsOf`: each read's pad, a chord without one (a note set) holding what was sounding. */
function padsOf(reads: (ChordRecord | null)[], held: Pitches | null): (Pitches | null)[] {
	if (reads.length === 0) return [held];
	const pads: (Pitches | null)[] = [];
	for (const read of reads) {
		held = read === null ? null : (pitchesOf(read) ?? held);
		pads.push(held);
	}
	return pads;
}

/** The app's `keyText`. */
const keyText = (key: Key | null) => (key ? `${key.tonic} ${key.mode}` : null);

/** The play-order bar each section heading begins at, the heading's name: the app's `headingsAt`. */
function headingsAt(parse: ChartParse): Map<number, string> {
	const at = new Map<number, string>();
	for (const s of parse.sections) {
		if (s.firstBar !== null && !at.has(s.firstBar)) at.set(s.firstBar, s.name);
	}
	return at;
}

/**
 * A chart's played bars as pads, the app's `barmarkChartBars` then its
 * render's slots (`slotsOf`). `fallback` (grammar 2.1's beat) times the
 * bars the chart gives no tempo. Refuses `no-bars` when nothing plays and
 * `no-tempo`, with the bar's index, when a bar has no tempo and there is
 * no fallback.
 */
export function chartPadBars(parse: ChartParse, fallback: number | undefined): ChartPadBars {
	if (parse.bars.length === 0) return { ok: false, reason: "no-bars" };
	const sectionAt = headingsAt(parse);
	const bars: PadBar[] = [];
	let carried: Carried;
	let held: Pitches | null = null;
	for (const bar of parse.bars) {
		const seconds = barSeconds(bar, fallback);
		if (seconds === null) return { ok: false, reason: "no-tempo", index: bar.index };
		const reads = barReads(bar, carried);
		if (reads.length > 0) carried = reads[reads.length - 1];
		const pads = padsOf(reads, held);
		held = pads.at(-1) ?? null;
		bars.push({
			index: bar.index,
			pads,
			seconds,
			tempo: (bar.tempo ?? fallback) as number,
			meter: { n: bar.meter.n, d: bar.meter.d },
			key: keyText(bar.key),
			section: sectionAt.get(bar.index) ?? (bar.rehearsal || null),
		});
	}
	return { ok: true, bars };
}

/** The middle of `values` (the mean of the two middle ones for an even count); NaN for none: the app's `median`. */
function median(values: number[]): number {
	if (values.length === 0) return Number.NaN;
	const sorted = values.toSorted((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2
		? (sorted[mid] as number)
		: ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/** The chart's bar: the median of its bars' seconds, the app's `declaredBar`, the comb's centre. */
export function chartBar(bars: PadBar[]): number {
	return median(bars.map((b) => b.seconds));
}

/** The beats in the chart's most common meter (`n/d`, the first on a tie), its numerator; four with no bars: the app's `chartBeatsPerBar`. */
export function chartBeatsPerBar(bars: PadBar[]): number {
	const counts = new Map<string, { count: number; n: number }>();
	for (const b of bars) {
		const key = `${b.meter.n}/${b.meter.d}`;
		const seen = counts.get(key);
		if (seen) seen.count += 1;
		else counts.set(key, { count: 1, n: b.meter.n });
	}
	let best: { count: number; n: number } | null = null;
	for (const entry of counts.values()) if (best === null || entry.count > best.count) best = entry;
	return best === null ? 4 : best.n;
}
