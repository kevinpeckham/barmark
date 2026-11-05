/**
 * What a part's notes are (the design's "Notes" and "Part lines"): a chord
 * part's notes come in as voicings, note sets and lines; a melody part's
 * are left out and its chords read alone.
 */
import { INSTRUMENTS, type InstrumentName, instrumentInfo, MAX_LINES, type Meter } from "barmark";
import { type Bar, type LineRead, readLine, type Unread } from "./cells.js";
import { readHarmony } from "./chords.js";
import type { Losses } from "./losses.js";
import { type Line, mergeStaves } from "./merge.js";
import type { ReadPart } from "./read.js";

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
};

const DEFAULT_METER: Meter = { n: 4, d: 4 };
const TWO_STAVES = ["RH", "LH", "RH2", "LH2"];

/** Why a part's notes are left out, as its diagnostic. */
const WHY = {
	voices: "more than four voices; notes left out",
	melody: "notes read as a melody and left out",
	grid: "notes off barmark's grid; notes left out",
} as const;

/** Each measure's length, its own meter (a one-bar meter, else the running one) and its chords. */
function barsOf(part: ReadPart): Bar[] {
	let running = DEFAULT_METER;
	return part.measures.map((m) => {
		running = m.time ?? running;
		return {
			number: m.number,
			length: m.length,
			meter: m.oneBar ?? running,
			chords: m.harmonies.map((h) => ({ at: h.at, ...readHarmony(h.node, part.transpose) })),
		};
	});
}

/** The part's lines; a two-staff part whose staves split one line (as the export writes a bare keyboard line) is that one line. */
function linesOf(part: ReadPart): Line[] {
	const count = Math.max(1, ...part.measures.map((m) => m.lines.length));
	const lines = Array.from({ length: count }, (_, i) => part.measures.map((m) => m.lines[i] ?? []));
	const [upper = [], lower = []] = lines;
	const merged = part.staves === 2 && part.voices === 2 && count === 2 && mergeStaves(upper, lower);
	return merged ? [merged] : lines;
}

/** Another program's part acts as chords when it writes slashes and its first line attacks no single notes. */
function actsAsChords(lines: Line[]): boolean {
	const slashed = lines.some((l) => l.some((bar) => bar.some((a) => a.kind === "slash")));
	const single = (lines[0] ?? []).some((bar) =>
		bar.some((a) => a.kind === "notes" && !a.tieIn && a.pitches.length === 1),
	);
	return slashed && !single;
}

type Decided = { reads: LineRead[]; why: keyof typeof WHY | null };

/** The lines as read: every line's notes, or the first line alone (its chords alone when it has chords) and why. */
function decide(part: ReadPart, from: { barmark: boolean }, hasChords: boolean): Decided {
	const lines = linesOf(part);
	const bars = barsOf(part);
	const alone = (why: keyof typeof WHY): Decided => ({
		reads: [readLine(lines[0] ?? [], bars, { chords: true, notes: !hasChords })],
		why,
	});
	if (part.voices > MAX_LINES || lines.length > MAX_LINES) return alone("voices");
	if (hasChords && !from.barmark && !actsAsChords(lines)) return alone("melody");
	const reads = lines.map((l, i) => readLine(l, bars, { chords: i === 0, notes: true }));
	const offGrid = [...new Set(reads.flatMap((r) => r.offGrid))];
	if (offGrid.length === 0) return { reads, why: null };
	const out = alone("grid");
	return { ...out, reads: out.reads.map((r) => ({ ...r, offGrid })) };
}

function report(d: Decided, part: string, losses: Losses): void {
	const [first] = d.reads;
	if (d.why === "grid") for (const m of first?.offGrid ?? []) losses.add("grid", WHY.grid, part, m);
	else if (d.why) losses.add(d.why, WHY[d.why], part);
	for (const r of d.reads) {
		for (const m of r.moved)
			losses.add("moved", "chord symbols moved to the nearest beat", part, m);
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

/**
 * A part as barmark lines, or null for a part of notes alone that neither
 * barmark wrote nor `--part` named. Barmark's own files are read
 * structurally; another program's part reads its notes only when it writes
 * slashes and no single notes on its first line, and every note lands on
 * the grid.
 */
export function importPart(
	part: ReadPart,
	from: { barmark: boolean; forced: boolean },
	losses: Losses,
): ImportedPart | null {
	const hasChords = part.measures.some((m) => m.harmonies.length > 0);
	if (!hasChords && !from.barmark && !from.forced) return null;
	const decided = decide(part, from, hasChords);
	report(decided, part.name, losses);
	return {
		name: part.name,
		label: labelOf(part.name, part.abbreviation),
		instrument: instrumentOf(part),
		lines: named(decided, part.staves),
		lyrics: part.measures,
		hasChords,
		unread: decided.reads[0]?.unread ?? [],
	};
}
