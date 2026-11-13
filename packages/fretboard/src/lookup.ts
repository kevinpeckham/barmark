import { type ChordRecord, parseChord } from "barmark";
import { pitchClass } from "./pitch.js";
import { shapeFrom, shapeOf, shapeText } from "./shape.js";
import { MOVABLE, OPEN } from "./table.js";
import type { Shape } from "./types.js";

/** A movable row, read: its root's pitch class and its frets. */
type Movable = { root: number; frets: number[] };

/** The table read into maps: open rows by identity, movable rows by their tones measured from the root. */
type Index = { open: Map<string, number[]>; movable: Map<string, Movable[]> };

let index: Index | null = null;

const sorted = (tones: Iterable<number>): string => [...tones].sort((a, b) => a - b).join(".");

/** The chord's sounding pitch classes and its bass, each measured up from `from`. */
function keyFrom(chord: ChordRecord, from: number): string {
	const tones = new Set(
		[...chord.pitches, chord.bass].map((p) => (pitchClass(p) - from + 12) % 12),
	);
	return `${sorted(tones)}/${(pitchClass(chord.bass) - from + 12) % 12}`;
}

/** A row's name read as a chord, or null when it has no root. */
function rowChord(name: string): ChordRecord | null {
	const r = parseChord(name);
	return r.ok && r.value.kind === "chord" && r.value.root !== null ? r.value : null;
}

/** Read the table once, on first use. */
function readTable(): Index {
	const open = new Map<string, number[]>();
	for (const [name, text] of OPEN) {
		const c = rowChord(name);
		if (c) open.set(keyFrom(c, 0), shapeOf(text).frets);
	}
	const movable = new Map<string, Movable[]>();
	for (const [name, text] of MOVABLE) {
		const c = rowChord(name);
		if (!c?.root) continue;
		const root = pitchClass(c.root);
		const key = keyFrom(c, root);
		movable.set(key, [...(movable.get(key) ?? []), { root, frets: shapeOf(text).frets }]);
	}
	return { open, movable };
}

/** The lowest fretted fret, the measure by which the lower of two moved shapes wins. */
const lowestFret = (frets: readonly number[]): number => Math.min(...frets.filter((f) => f > 0));

/** Whether shape `a` sits lower on the neck than `b`, ties broken on their text. */
function lower(a: Shape, b: Shape): boolean {
	const d = lowestFret(a.frets) - lowestFret(b.frets);
	return d !== 0 ? d < 0 : shapeText(a) < shapeText(b);
}

/** The lowest of the movable rows moved up to `root`, or null when every one passes fret 15. */
function lowestMoved(rows: readonly Movable[], root: number): Shape | null {
	let best: Shape | null = null;
	for (const row of rows) {
		const up = (root - row.root + 12) % 12;
		const frets = row.frets.map((f) => (f < 0 ? f : f + up));
		if (frets.some((f) => f > 15)) continue;
		const shape = shapeFrom(frets);
		if (!best || lower(shape, best)) best = shape;
	}
	return best;
}

/** The table's shape for a named chord: its open shape, else the lowest movable shape of its form moved to its root; null when the table has neither. */
export function tableShape(chord: ChordRecord): Shape | null {
	if (chord.kind !== "chord" || chord.root === null) return null;
	index ??= readTable();
	const open = index.open.get(keyFrom(chord, 0));
	if (open) return shapeFrom(open);
	const root = pitchClass(chord.root);
	return lowestMoved(index.movable.get(keyFrom(chord, root)) ?? [], root);
}
