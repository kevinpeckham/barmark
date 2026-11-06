/**
 * What a part's notes are (the design's "Notes" and "Part lines"): a chord
 * part's notes come in as voicings, note sets and lines; a melody part's
 * are left out and its chords read alone.
 */
import { INSTRUMENTS, type InstrumentName, instrumentInfo, MAX_LINES, type Meter } from "barmark";
import { type Bar, type LineRead, readLine, type Unread } from "./cells.js";
import { harmonyOf } from "./chords.js";
import type { Losses } from "./losses.js";
import type { Words } from "./lyrics.js";
import { melodyBars } from "./melody.js";
import { type Line, mergeStaves } from "./merge.js";
import { LEFT_OUT, type LeftOut, ON_NOTES, type ReadPart } from "./read.js";
import { readSinging, type Sung } from "./voice.js";

/** One line's cell text per measure, `null` where the line rests the whole bar. */
export type LineBars = { name: string | null; bars: (string | null)[] };

export type ImportedPart = {
	name: string;
	label: string;
	instrument: InstrumentName | null;
	/** `lines[0]` carries the chords; one line named `null` for a part written bare. */
	lines: LineBars[];
	lyrics: ReadPart["measures"];
	hasChords: boolean;
	/** Each `?` on the first line with the program's own text, to write as words. */
	unread: Unread[];
	/** The words a part sings, and the index in `lines` of the line whose notes carry them; null when it sings none. */
	sings: { line: number; words: Words } | null;
};

const DEFAULT_METER: Meter = { n: 4, d: 4 };
const TWO_STAVES = ["RH", "LH", "RH2", "LH2"];

/** Why a part's notes are left out, as its diagnostic. */
const WHY = {
	voices: "more than four voices; notes left out",
	melody: "notes read as a melody and left out",
	grid: "notes off barmark's grid; notes left out",
} as const;

const UNPLACED = "a bar barmark's grid can't hold; written as ?";
const UNREAD = "chord symbols barmark can't read, written as ? with their text as words";
const UNREAD_BARE = "chord symbols barmark can't read, written as ?";

/** Each measure's length, its own meter (a one-bar meter, else the running one) and its chords. */
export function barsOf(part: ReadPart): Bar[] {
	let running = DEFAULT_METER;
	return part.measures.map((m) => {
		running = m.time ?? running;
		return {
			number: m.number,
			length: m.length,
			meter: m.oneBar ?? running,
			chords: m.harmonies.map((h) => ({ at: h.at, ...harmonyOf(h.node, part.transpose) })),
		};
	});
}

/** The part's lines; a two-staff part whose staves split one line (as the export writes a bare keyboard line) is that one line. */
export function linesOf(part: ReadPart): Line[] {
	const count = Math.max(1, ...part.measures.map((m) => m.lines.length));
	const lines = Array.from({ length: count }, (_, i) => part.measures.map((m) => m.lines[i] ?? []));
	const [upper = [], lower = []] = lines;
	const merged = part.staves === 2 && part.voices === 2 && count === 2 && mergeStaves(upper, lower);
	return merged ? [merged] : lines;
}

/**
 * Another program's part with chords: whether it is a melody part (no
 * slashes, a single-note attack on its first line, or every bar of notes
 * a melody's), else the bars of its first line that are a melody's.
 */
function melodyOf(lines: Line[], bars: Bar[]): { part: boolean; bars: number[] } {
	const first = lines[0] ?? [];
	const slashed = lines.some((l) => l.some((bar) => bar.some((a) => a.kind === "slash")));
	const single = first.some((bar) =>
		bar.some((a) => a.kind === "notes" && !a.tieIn && a.pitches.length === 1),
	);
	if (!slashed || single) return { part: true, bars: [] };
	const melodic = melodyBars(first, bars);
	const noteBars = first.filter((bar) => bar.some((a) => a.kind === "notes" && !a.tieIn)).length;
	return { part: melodic.length > 0 && melodic.length === noteBars, bars: melodic };
}

/**
 * The lines as read, why notes were left out, the measures off the grid
 * when that is why, and the bars whose notes alone were left out as a
 * melody's.
 */
type Decided = {
	reads: LineRead[];
	why: keyof typeof WHY | null;
	offGrid: string[];
	melodic: number[];
};

/** The lines as read: every line's notes, or the first line alone (its chords alone when it has chords) and why. */
function decide(part: ReadPart, from: { barmark: boolean }, hasChords: boolean): Decided {
	const lines = linesOf(part);
	const bars = barsOf(part);
	const alone = (why: keyof typeof WHY): Decided => ({
		reads: [
			readLine(lines[0] ?? [], bars, {
				chords: true,
				notes: !hasChords,
				melody: why === "melody",
			}),
		],
		why,
		offGrid: [],
		melodic: [],
	});
	if (part.voices > MAX_LINES || lines.length > MAX_LINES) return alone("voices");
	const melody = hasChords && !from.barmark ? melodyOf(lines, bars) : { part: false, bars: [] };
	if (melody.part) return alone("melody");
	const melodic = melody.bars;
	const first = { chords: true, notes: true, melodyBars: new Set(melodic) };
	const reads = lines.map((l, i) =>
		readLine(l, bars, i === 0 ? first : { chords: false, notes: true }),
	);
	const offGrid = [...new Set(reads.flatMap((r) => r.offGrid))];
	if (offGrid.length === 0) return { reads, why: null, offGrid, melodic };
	return { ...alone("grid"), offGrid };
}

/** The marks barmark can't write; those on the notes alone only when the notes come in. */
function reportMarks(part: ReadPart, notesKept: boolean, losses: Losses): void {
	for (const kind of Object.keys(LEFT_OUT) as LeftOut[])
		if (notesKept || !ON_NOTES.includes(kind))
			for (const m of part.unread[kind]) losses.add(kind, LEFT_OUT[kind], part.name, m);
}

/** The measures where a part attacks notes: those a melody or too many voices leave out. */
const noteMeasures = (part: ReadPart) =>
	part.measures
		.filter((m) => m.lines.some((l) => l.some((a) => a.kind === "notes")))
		.map((m) => m.number);

/** Why notes were left out, by measure. */
function reportWhy(d: Decided, part: ReadPart, losses: Losses): void {
	if (d.why === "grid") for (const m of d.offGrid) losses.add("grid", WHY.grid, part.name, m);
	else if (d.why) for (const m of noteMeasures(part)) losses.add(d.why, WHY[d.why], part.name, m);
	else
		for (const i of d.melodic)
			losses.add("melody", WHY.melody, part.name, part.measures[i]?.number);
}

/** The chord symbols written as `?`. */
function reportUnread(unread: Unread[], part: ReadPart, losses: Losses): void {
	for (const u of unread)
		losses.add(
			u.text === "" ? "unreadBare" : "unread",
			u.text === "" ? UNREAD_BARE : UNREAD,
			part.name,
			part.measures[u.measure]?.number,
		);
}

function report(d: Decided, part: ReadPart, hasChords: boolean, losses: Losses): void {
	reportWhy(d, part, losses);
	reportLines(d.reads, part.name, losses);
	reportMarks(part, d.why === null || !hasChords, losses);
	reportUnread(d.reads[0]?.unread ?? [], part, losses);
}

function reportLines(reads: LineRead[], part: string, losses: Losses): void {
	for (const r of reads) {
		for (const m of r.moved)
			losses.add("moved", "chord symbols moved to the nearest beat", part, m);
		for (const m of r.offGrid) losses.add("unplaced", UNPLACED, part, m);
		for (const m of r.stray)
			losses.add("voicing", "voicing notes outside the chord; the chord written alone", part, m);
	}
}

/** The lines that play somewhere, named as the file can't: RH, LH, RH2, LH2 on two staves, else 1 to 4. */
function named(d: Decided, staves: number): LineBars[] {
	const playing = d.reads
		.map((r, index) => ({ r, index }))
		.filter(({ r, index }) => index === 0 || r.cells.some((c) => c !== null));
	return playing.map(({ r, index }) => ({
		name: playing.length === 1 ? null : staves === 2 ? (TWO_STAVES[index] ?? null) : `${index + 1}`,
		bars: r.cells,
	}));
}

const NOT_LABEL = /[^\p{L}\p{N}]/gu;

/** The abbreviation cleaned to letters and digits, else the name's initials; digits never lead. */
function labelOf(name: string, abbreviation: string | null): string {
	const initials = name
		.split(/\s+/)
		.map((w) => w.replace(NOT_LABEL, "").charAt(0))
		.join("");
	const raw = abbreviation?.replace(NOT_LABEL, "") || initials;
	const [, digits = "", rest = ""] = /^(\p{N}*)(.*)$/u.exec(raw) ?? [];
	return rest ? rest + digits : `P${digits}`;
}

/** The instrument barmark knows by the part's instrument name, else by its General MIDI program. */
function instrumentOf(part: ReadPart): InstrumentName | null {
	const byName = part.instrumentName ? instrumentInfo(part.instrumentName) : null;
	return (byName ?? INSTRUMENTS.find((i) => i.program === part.midiProgram))?.name ?? null;
}

const SNAPPED = "a rhythm barmark can't write, snapped to the nearest it can";
const DROPPED = "more than four lines with the harmony; only the line that sings kept";

/** Whether a part sings (the voice-and-lyrics design, section 7): it has lyrics, or a voice's sound. */
const singsAt = (part: ReadPart) =>
	part.sound?.startsWith("voice.") === true ||
	part.measures.some((m) => m.lines.some((l) => l.some((a) => a.lyrics.length > 0)));

/** A singing part's melody lines that play (the line that sings always, with no harmony), named: under the harmony on one staff, the line that sings `Mel`; else as other lines are. */
function voiceLines(sung: Sung, staves: number): { lines: LineBars[]; sings: number | null } {
	const hasChords = sung.harmony !== null;
	const playing = sung.voices
		.map((bars, index) => ({ bars, index }))
		.filter(
			({ bars, index }) => bars.some((c) => c !== null) || (!hasChords && index === sung.sings),
		);
	const nameOf = (index: number) => {
		if (playing.length === 1) return hasChords ? "Mel" : null;
		if (staves === 2) return TWO_STAVES[index] ?? null;
		return hasChords && index === sung.sings ? "Mel" : `${index + 1}`;
	};
	const lines = playing.map(({ bars, index }) => ({ name: nameOf(index), bars }));
	const at = playing.findIndex(({ index }) => index === sung.sings);
	return { lines, sings: at < 0 ? null : at };
}

/** A part that sings: its harmony on its bare line, its melody under it, and what was lost. */
function importSinging(part: ReadPart, hasChords: boolean, losses: Losses): ImportedPart {
	const sung = readSinging(linesOf(part), barsOf(part), hasChords);
	const harmony = sung.harmony;
	const voices = voiceLines(sung, part.staves);
	const first = harmony ? [{ name: null, bars: harmony.cells }] : [];
	reportLines(harmony ? [harmony] : [], part.name, losses);
	for (const m of sung.snapped) losses.add("snapped", SNAPPED, part.name, m);
	if (sung.dropped) losses.add("dropped", DROPPED, part.name);
	reportMarks(part, true, losses);
	const unread = harmony?.unread ?? [];
	reportUnread(unread, part, losses);
	const sings =
		voices.sings === null ? null : { line: voices.sings + first.length, words: sung.words };
	return {
		name: part.name,
		label: labelOf(part.name, part.abbreviation),
		instrument: instrumentOf(part),
		lines: [...first, ...voices.lines],
		lyrics: part.measures,
		hasChords,
		unread: unread.filter((u) => u.text !== ""),
		sings,
	};
}

/**
 * A part as barmark lines, or null for a part of notes alone that neither
 * barmark wrote nor `--part` named. Barmark's own files are read
 * structurally; another program's part reads its notes only when it writes
 * slashes and no single notes on its first line, and every note lands on
 * the grid, and then reads a bar whose notes move as a melody's (see
 * `melody.ts`) as its chords alone.
 */
export function importPart(
	part: ReadPart,
	from: { barmark: boolean; forced: boolean },
	losses: Losses,
): ImportedPart | null {
	const hasChords = part.measures.some((m) => m.harmonies.length > 0);
	if (singsAt(part)) return importSinging(part, hasChords, losses);
	if (!hasChords && !from.barmark && !from.forced) return null;
	const decided = decide(part, from, hasChords);
	report(decided, part, hasChords, losses);
	return {
		name: part.name,
		label: labelOf(part.name, part.abbreviation),
		instrument: instrumentOf(part),
		lines: named(decided, part.staves),
		lyrics: part.measures,
		hasChords,
		unread: (decided.reads[0]?.unread ?? []).filter((u) => u.text !== ""),
		sings: null,
	};
}
