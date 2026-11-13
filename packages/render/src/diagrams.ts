/**
 * Which chords of a chart get a diagram (design 4.2, 4.3, 5.2), and the
 * shape `@barmark/fretboard` gives each. Nothing here draws.
 */
import { shapeFor } from "@barmark/fretboard";
import type { ChartParse, ChordRecord, Key, Line, Slot } from "barmark";
import type { BlockItem, DiagramEntry, RowItem, SectionBlock } from "./types.js";
import { partOf, singerOf } from "./verses.js";

/** The rows of a block's items, in written order: a row, or each row of a system that has one. */
const rowsOf = (item: BlockItem): RowItem[] =>
	item.kind === "row"
		? [item]
		: item.kind === "system"
			? item.rows.flatMap((p) => (p.row.kind === "row" ? [p.row] : []))
			: [];

/** The chords a slot writes: a group's members each. */
const chordsIn = (slot: Slot) => (slot.kind === "group" ? slot.members : [slot]);

/** One entry for a chord as written, or none: a single note is no chord. */
function entryFor(chord: ChordRecord, voicing: ChordRecord | null, key: Key | null) {
	const found = shapeFor(chord, voicing ?? undefined);
	if (found.ok) return { chord, voicing, key, shape: found.shape, caveat: found.caveat };
	if (found.reason === "single-note") return null;
	return { chord, voicing, key, shape: null, caveat: null };
}

/** What a bar line is in its part (barmark's grammar 7.6, 7.7). */
type Role = { first: boolean; singing: boolean };

/** The lines that carry the harmony where they play: the parser's answer, the first line of each part playing in a played bar (barmark's grammar 7.6). */
function harmonyLines(parse: ChartParse): Set<number> {
	return new Set(
		parse.bars.flatMap((b) => [
			...(b.parts ?? []).flatMap((p) => (p ? [p.line] : [])),
			...(b.lines?.[0] ? [b.lines[0].line] : []),
		]),
	);
}

/** Each bar line's role, by its line number. */
function rolesOf(parse: ChartParse): Map<number, Role> {
	const harmony = harmonyLines(parse);
	// A line of a part that writes no other line is its first.
	const isFirst = (l: Extract<Line, { kind: "bars" }>) => {
		const p = partOf(l, parse);
		return !p?.lines || harmony.has(l.line);
	};
	return new Map(
		parse.lines.flatMap((l) =>
			l.kind === "bars"
				? [[l.line, { first: isFirst(l), singing: singerOf(l, parse) !== null }] as const]
				: [],
		),
	);
}

/** The chord slots of a row that may give an entry, each with the key of its bar: a note set on a singing line is melody (7.7). */
function candidates(row: RowItem, role: Role | undefined) {
	return row.cells.flatMap((cell) =>
		cell.kind === "slots"
			? cell.slots
					.flatMap(chordsIn)
					.flatMap((slot) =>
						slot.kind !== "chord" || (role?.singing && slot.chord.kind === "notes")
							? []
							: [{ slot, key: cell.key ?? null }],
					)
			: [],
	);
}

/**
 * The chart's chords as diagram entries: one for each distinct chord (a
 * name, or a note set, with its written voicing), in written order, with
 * the key in force where it first appears. A replay, a `%` and a later
 * appearance add nothing. A line that is not its part's first gives none
 * (7.6), and a note set on a singing line is melody, so it gives none (7.7);
 * a chord name there is harmony and does.
 */
export function chartDiagrams(blocks: SectionBlock[], parse: ChartParse): DiagramEntry[] {
	const roles = rolesOf(parse);
	const seen = new Set<string>();
	const entries: DiagramEntry[] = [];
	for (const row of blocks.flatMap((b) => b.items.flatMap(rowsOf))) {
		const role = roles.get(row.line);
		if (role && !role.first) continue;
		for (const { slot, key } of candidates(row, role)) {
			const voicing = slot.voicing ?? null;
			const id = `${slot.chord.canonical}\n${voicing?.canonical ?? ""}`;
			if (seen.has(id)) continue;
			seen.add(id);
			const entry = entryFor(slot.chord, voicing, key);
			if (entry) entries.push(entry);
		}
	}
	return entries;
}
