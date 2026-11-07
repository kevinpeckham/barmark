import { harteToBarmark, type Key, parseChart, printKey, printSlot, spellPitch } from "barmark";

/** Cached results stop growing past this many entries. */
const CACHE_LIMIT = 4096;

function remember<T>(cache: Map<string, T>, key: string, make: () => T): T {
	if (cache.has(key)) return cache.get(key) as T;
	const value = make();
	if (cache.size >= CACHE_LIMIT) cache.clear();
	cache.set(key, value);
	return value;
}

/**
 * A label or symbol longer than this is not read (it becomes `?`, with
 * `label-unknown`). The longest real chord, a Harte label with a bass or a
 * note set with octaves, is well under 40 characters; 64 leaves room. Without
 * a cap, one long note-set run resumed across thousands of bars is written in
 * full at every attack: a 14 KB input gave a 1.2 MB chart.
 */
export const MAX_SYMBOL_LENGTH = 64;
/** A note set of more notes than this is not read: a piano has ten fingers, a voicing rarely more than eight. */
export const MAX_NOTES = 16;

const SHARPS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLATS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const LETTER: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const ROOT = /^[A-G][#b]*/;

function pitchClassOf(root: string): number {
	let pc = LETTER[root.charAt(0)] ?? 0;
	for (const c of root.slice(1)) pc += c === "#" ? 1 : -1;
	return ((pc % 12) + 12) % 12;
}

const doubled = (s: string | null) => s === null || /##|bb/.test(s);

function respelled(label: string, root: string, name: string): string | null {
	return harteToBarmark(`${name}${label.slice(root.length)}`);
}

function labelUncached(label: string, key: Key | null): string | null {
	const root = ROOT.exec(label)?.[0];
	if (root === undefined) return harteToBarmark(label);
	const pc = pitchClassOf(root);
	const first = spellPitch(pc, key);
	const result = respelled(label, root, first);
	if (!doubled(result)) return result;
	const other = [SHARPS[pc], FLATS[pc]].find((n) => n !== first);
	const retry = other === undefined ? null : respelled(label, root, other);
	return doubled(retry) ? result : retry;
}

const labels = new Map<string, string | null>();

/**
 * The barmark slot for a Harte label, its root respelled for the key in force;
 * `N` is `N.C.`, `X` is `?`, null when the label cannot be read.
 */
export function labelSymbol(label: string, key: Key | null): string | null {
	if (label.length > MAX_SYMBOL_LENGTH) return null;
	return remember(labels, `${key ? printKey(key) : ""}\u0000${label}`, () =>
		labelUncached(label, key),
	);
}

function slotUncached(symbol: string): string | null {
	if (/[|\r\n]/.test(symbol)) return null;
	const parse = parseChart(`| ${symbol} |`);
	if (parse.diagnostics.some((d) => d.severity === "error")) return null;
	const line = parse.lines.find((l) => l.kind === "bars");
	const cell = line?.kind === "bars" && line.cells.length === 1 ? line.cells[0] : undefined;
	if (cell?.kind !== "slots" || cell.meter || cell.words || cell.slots.length !== 1) return null;
	const slot = cell.slots[0];
	if (slot?.kind === "unknown") return "?";
	if (slot?.kind === "nc" && !slot.push && !slot.dotted) return printSlot(slot);
	if (parse.diagnostics.length > 0) return null;
	if (slot?.kind !== "chord") return null;
	const { voicing, pedal, articulation, push, syllable, dotted } = slot;
	if (voicing || pedal || articulation || push || syllable || dotted) return null;
	return printSlot(slot);
}

const slots = new Map<string, string | null>();

/**
 * A symbol given as slot text, in its canonical spelling: exactly one chord,
 * note set, `N.C.` or `?`; null for anything else, or anything with an error.
 */
export function slotSymbol(symbol: string): string | null {
	if (symbol.length > MAX_SYMBOL_LENGTH) return null;
	const inside = /\{([^}]*)\}/.exec(symbol)?.[1];
	if (inside !== undefined && inside.split(/[\s,]+/).filter(Boolean).length > MAX_NOTES)
		return null;
	return remember(slots, symbol, () => slotUncached(symbol));
}
