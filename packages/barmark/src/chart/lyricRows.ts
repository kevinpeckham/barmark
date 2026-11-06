import { isBar } from "./barLine.js";
import { readSyllable } from "./syllable.js";
import type { ChartDiagnostic, Line, LyricSlot } from "./types.js";

type LyricsLine = Extract<Line, { kind: "lyrics" }>;
type Covered = Extract<Line, { kind: "bars" | "invalid" }>;
/** What a lyric row lies under: one bar line, or a labelled system's lines (grammar 7.4). */
type Unit = Covered[];

/** `lyrics:` or `lyrics N:`, then a bar line (grammar 7.7). */
export const LYRIC_ROW = /^lyrics(?:\s+(\d+))?:\s*(\|.*)$/i;

/** One token of a lyric row: `/` a hold, `--` a breath, else a syllable (4.3); null when none reads. */
function readToken(token: string): LyricSlot | null {
	if (token === "/") return { kind: "hold" };
	if (token === "--") return { kind: "breath" };
	if (/["{}]/.test(token)) return null;
	const syllable = readSyllable(token);
	return syllable?.kind === "sung" ? { kind: "syllable", syllable } : null;
}

/** A slot: a token, or tokens joined by `_` into a group. */
function readSlot(token: string): LyricSlot | null {
	const members = token.split("_").map(readToken);
	if (members.some((m) => m === null)) return null;
	const read = members as LyricSlot[];
	return read.length === 1 ? (read[0] ?? null) : { kind: "group", members: read };
}

const problemOf = (token: string) =>
	/["{}]/.test(token)
		? "a lyric row holds syllables only: no quotes or braces"
		: `not a syllable: ${token}`;

/** A row's cells, each a list of slots, with a diagnostic for each that doesn't read. */
function readCells(
	bar: string,
	line: number,
): { cells: LyricSlot[][]; diagnostics: ChartDiagnostic[] } {
	const diagnostics: ChartDiagnostic[] = [];
	const parts = bar.split("|").slice(1);
	if (parts.at(-1)?.trim() === "") parts.pop();
	else
		diagnostics.push({
			line,
			severity: "warning",
			message: "missing trailing |",
			token: parts.at(-1)?.trim() ?? "",
		});
	const cells = parts.map((part) => {
		const tokens = part.trim().split(/\s+/).filter(Boolean);
		if (!tokens.length)
			diagnostics.push({
				line,
				severity: "error",
				message: "empty bar in a lyric row; a bar with nothing sung is --",
				token: "| |",
			});
		return tokens.flatMap((token) => {
			const slot = readSlot(token);
			if (!slot) diagnostics.push({ line, severity: "error", message: problemOf(token), token });
			return slot ? [slot] : [];
		});
	});
	return { cells, diagnostics };
}

/** Why a verse number can't be read, or null: from 1 up to the largest safe integer, so it prints back as written. */
const verseProblem = (verse: number) => {
	if (verse === 0) return "a verse is numbered from 1";
	return verse > Number.MAX_SAFE_INTEGER
		? `a verse number goes up to ${Number.MAX_SAFE_INTEGER}`
		: null;
};

/**
 * A lyric row (grammar 7.7), not yet attached to the bars it covers. Null
 * when the line isn't one, or when it has an error.
 */
export function readLyricRow(
	text: string,
	line: number,
): { row: LyricsLine | null; diagnostics: ChartDiagnostic[] } {
	const m = LYRIC_ROW.exec(text);
	if (!m) return { row: null, diagnostics: [] };
	const verse = m[1] === undefined ? null : Number(m[1]);
	const problem = verse === null ? null : verseProblem(verse);
	if (problem)
		return { row: null, diagnostics: [{ line, severity: "error", message: problem, token: text }] };
	const { cells, diagnostics } = readCells(m[2] ?? "", line);
	const failed = diagnostics.some((d) => d.severity === "error");
	return { row: failed ? null : { kind: "lyrics", line, verse, cells, covers: [] }, diagnostics };
}

/** A lyric row, or a line kept as text because its row has an error: either holds its place. */
const isRow = (l: Line) =>
	l.kind === "lyrics" || (l.kind === "text" && !l.escaped && LYRIC_ROW.test(l.text));

const isCovered = (l: Line): l is Covered => l.kind === "bars" || l.kind === "invalid";

const normalize = (name: string) => name.toLowerCase().replace(/\s+/g, " ").trim();

const plural = (n: number, what: string) => `${n} ${what}${n === 1 ? "" : "s"}`;

/** Why a row can't lie under a unit, or null: its bar count must be the unit's. */
function countProblem(row: LyricsLine, unit: Unit): string | null {
	const ref = unit.find((l) => l.kind === "bars" && !l.dropped);
	if (ref?.kind !== "bars") return null;
	const n = ref.cells.filter(isBar).length;
	if (row.cells.length === n) return null;
	return `this lyric row has ${plural(row.cells.length, "bar")}; the bar line it covers has ${n} (line ${ref.line})`;
}

type Section = { name: string | null; lines: Line[] };

function sectionsOf(lines: Line[]): Section[] {
	const sections: Section[] = [{ name: null, lines: [] }];
	for (const l of lines)
		if (l.kind === "section") sections.push({ name: l.name, lines: [] });
		else sections.at(-1)?.lines.push(l);
	return sections;
}

/** A section's bar lines as units, and each row under a unit with the unit it lies under. */
function unitsOf(lines: Line[]): { units: Unit[]; under: Map<Line, Unit | null> } {
	const units: Unit[] = [];
	const under = new Map<Line, Unit | null>();
	let above: Unit | null = null;
	for (const l of lines) {
		if (isCovered(l)) {
			if (above && l.system !== undefined && above[0]?.system === l.system) above.push(l);
			else {
				above = [l];
				units.push(above);
			}
		} else if (isRow(l)) under.set(l, above);
		else above = null;
	}
	return { units, under };
}

/** A row, the unit it lies under (none when it lies under no bar line), and the error when none. */
type Placed = { row: Line; unit: Unit | null | undefined; problem: string };

const NOT_UNDER = "a lyric row goes under a bar line, or under a replay heading";

/** A row's verse as written, so each verse's rows under a replay count apart. */
const verseOf = (row: Line) =>
	row.kind === "lyrics"
		? String(row.verse ?? "")
		: row.kind === "text"
			? (LYRIC_ROW.exec(row.text)?.[1] ?? "")
			: "";

/** Rows under a replay heading: each verse's rows cover the replayed section's units in turn. */
function replayRows(rows: Line[], source: Unit[], name: string): Placed[] {
	const counts = new Map<string, number>();
	const problem = `${name} has ${plural(source.length, "bar line")} to cover; this lyric row is one too many`;
	return rows.map((row) => {
		const k = counts.get(verseOf(row)) ?? 0;
		counts.set(verseOf(row), k + 1);
		return { row, unit: source[k], problem };
	});
}

/** Where each row of a section lies, recording a written section's units for its replays. */
function placeRows(s: Section, definitions: Map<string, Unit[]>): Placed[] {
	const { units, under } = unitsOf(s.lines);
	const key = s.name === null ? null : normalize(s.name);
	const source = key === null ? undefined : definitions.get(key);
	if (key !== null && units.length) definitions.set(key, units);
	if (units.length || !source)
		return [...under].map(([row, unit]) => ({ row, unit, problem: NOT_UNDER }));
	return replayRows([...under.keys()], source, s.name ?? "");
}

/**
 * Attach each lyric row to the bar lines it covers (grammar 7.7): the bar
 * line or system just above it, or under a replay heading the replayed
 * section's lines, one row each per verse. A row covering nothing, or with
 * a bar count other than its unit's, is an error. Never throws.
 */
export function attachLyrics(lines: Line[]): { lines: Line[]; diagnostics: ChartDiagnostic[] } {
	const diagnostics: ChartDiagnostic[] = [];
	const covers = new Map<Line, number[]>();
	const definitions = new Map<string, Unit[]>();
	const placed = sectionsOf(lines).flatMap((s) => placeRows(s, definitions));
	// A row with an error of its own (kept as text) only holds its place.
	for (const { row, unit, problem } of placed) {
		if (row.kind !== "lyrics") continue;
		const why = unit ? countProblem(row, unit) : problem;
		if (why) diagnostics.push({ line: row.line, severity: "error", message: why, token: "lyrics" });
		if (unit)
			covers.set(
				row,
				unit.map((l) => l.line),
			);
	}
	const out = lines.map((l) => (l.kind === "lyrics" ? { ...l, covers: covers.get(l) ?? [] } : l));
	return { lines: out, diagnostics };
}
