/**
 * Which chords of a chart get a diagram (design 4.2, 4.3, 5.2), and the
 * shape `@barmark/fretboard` gives each. Nothing here draws.
 */
import { shapeFor } from "@barmark/fretboard";
import type { ChordRecord, Key, Slot } from "barmark";
import type { BlockItem, DiagramEntry, RowItem, SectionBlock } from "./types.js";

type SlotsCell = Extract<RowItem["cells"][number], { kind: "slots" }>;

/** The rows of a block's items, in written order: a row, or each row of a system that has one. */
const rowsOf = (item: BlockItem): RowItem[] =>
	item.kind === "row"
		? [item]
		: item.kind === "system"
			? item.rows.flatMap((p) => (p.row.kind === "row" ? [p.row] : []))
			: [];

/** The chords a slot writes: a group's members each. */
const chordsIn = (slot: Slot) => (slot.kind === "group" ? slot.members : [slot]);

/** One entry for a chord as written, or none: a single note is no chord, a hold or rest has none. */
function entryFor(chord: ChordRecord, voicing: ChordRecord | null, key: Key | null) {
	const found = shapeFor(chord, voicing ?? undefined);
	if (found.ok) return { chord, voicing, key, shape: found.shape, caveat: found.caveat };
	if (found.reason === "single-note") return null;
	return { chord, voicing, key, shape: null, caveat: null };
}

/**
 * The chart's chords as diagram entries: one for each distinct chord (a
 * name, or a note set, with its written voicing), in written order, with
 * the key in force where it first appears. A replay, a `%` and a later
 * appearance add nothing. `isVoice` says whether a row is a part's voice
 * line, whose note sets are melody (barmark's grammar 7.7): it gives none.
 */
export function chartDiagrams(
	blocks: SectionBlock[],
	isVoice: (row: RowItem) => boolean,
): DiagramEntry[] {
	const seen = new Set<string>();
	const entries: DiagramEntry[] = [];
	const cells = blocks
		.flatMap((b) => b.items.flatMap(rowsOf))
		.filter((row) => !isVoice(row))
		.flatMap((row) => row.cells.filter((c): c is SlotsCell => c.kind === "slots"));
	for (const cell of cells) {
		for (const slot of cell.slots.flatMap(chordsIn)) {
			if (slot.kind !== "chord") continue;
			const voicing = slot.voicing ?? null;
			const id = `${slot.chord.canonical}\n${voicing?.canonical ?? ""}`;
			if (seen.has(id)) continue;
			seen.add(id);
			const entry = entryFor(slot.chord, voicing, cell.key ?? null);
			if (entry) entries.push(entry);
		}
	}
	return entries;
}
