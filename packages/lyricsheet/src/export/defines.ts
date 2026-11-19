/**
 * Guitar chord shapes as `{define}` lines (spec 6): with `diagrams: "guitar"`
 * a define for every chord name the body writes, from `@barmark/fretboard`,
 * so a reader draws the diagram. ChordPro has one shape per name, and a
 * `{define}` placed before a name's first use quiets the reference tool's
 * warnings about it, even for a name its own chord parser rejects (a gap).
 */
import { type Shape, shapeFor } from "@barmark/fretboard";
import type { ChordRecord, PlayedBar } from "barmark";
import { lose } from "./lyrics.js";
import { directive } from "./meta.js";
import { isGap, spelled } from "./spell.js";
import type { Out, Use } from "./types.js";

/** What the body writes for one name: its chord, its voicings and the bars to report losses at. */
type Entry = {
	name: string;
	chord: ChordRecord;
	/** Each distinct voicing written, by its canonical text (null: none). */
	voicings: Map<string | null, ChordRecord | null>;
	/** The bars of the uses with a voicing, and (for a gap) all of them. */
	voiced: PlayedBar[];
	bars: PlayedBar[];
};

/** The uses grouped by the name written, in the order each name is first written. */
function entriesOf(uses: Use[]): Entry[] {
	const entries = new Map<string, Entry>();
	for (const u of uses) {
		const name = spelled(u.chord);
		let e = entries.get(name);
		if (!e) {
			e = { name, chord: u.chord, voicings: new Map(), voiced: [], bars: [] };
			entries.set(name, e);
		}
		e.voicings.set(u.voicing?.canonical ?? null, u.voicing);
		e.bars.push(u.bar);
		if (u.voicing) e.voiced.push(u.bar);
	}
	return [...entries.values()];
}

type Shown = { shape: Shape; voiced: boolean; shell: boolean };

/**
 * The shape a name's diagram shows: the written voicing's when every use
 * writes that one voicing and it fits a hand, else the name's own.
 */
function shapeOf(e: Entry): Shown | null {
	const [only, ...more] = [...e.voicings.values()];
	if (only && more.length === 0) {
		const r = shapeFor(e.chord, only);
		if (r.ok && r.caveat === null) return { shape: r.shape, voiced: true, shell: false };
	}
	const own = shapeFor(e.chord);
	return own.ok ? { shape: own.shape, voiced: false, shell: own.caveat === "shell" } : null;
}

/**
 * The `{define}` text of a shape: `base-fret` and `frets` (low string
 * first, `x` muted, `0` open), each fret counted from `base-fret`. The
 * diagram is four frets tall, so a shape reaching the fifth fret starts at
 * its lowest fretted one (a shape spans at most three frets).
 */
function frets(shape: Shape): { base: number; text: string } {
	const fretted = shape.frets.filter((f) => f > 0);
	// At most six strings: a spread of this list is small.
	const base = Math.max(...fretted, 0) <= 4 ? 1 : Math.min(...fretted);
	const text = shape.frets.map((f) => (f < 0 ? "x" : f === 0 ? "0" : String(f - base + 1)));
	return { base, text: text.join(" ") };
}

/** Names as a loss message lists them: the first ten, and how many more. */
function listed(names: string[]): string {
	const shown = names.slice(0, 10).join(", ");
	return names.length > 10 ? `${shown} and ${names.length - 10} more` : shown;
}

const NOT_DRAWN =
	"a voicing is written as its chord's name and its notes are not drawn: the chord's own shape is, when it has one (a name has one shape, and the chart's voicings of it differ, or the voicing does not fit the guitar)";

/** What a name's diagram does not carry: the voicing's notes (unless drawn), and a gap's name (unless defined). */
function report(e: Entry, got: Shown | null, out: Out): void {
	if (!got?.voiced) for (const bar of e.voiced) out.losses.add("voicing", NOT_DRAWN, bar);
	if (got === null && isGap(e.chord)) for (const bar of e.bars) lose(out, "chord-names", bar);
}

/**
 * The define lines for the chords the body wrote, one per name in the
 * order first written, and the losses of those with no (or only a shell)
 * shape. A gap chord that is defined is no longer a `chord-names` loss.
 */
export function defineLines(uses: Use[], out: Out): string[] {
	const lines: string[] = [];
	const bare: string[] = [];
	const shell: string[] = [];
	for (const e of entriesOf(uses)) {
		const got = shapeOf(e);
		report(e, got, out);
		if (got === null) {
			bare.push(e.name);
			continue;
		}
		if (got.shell) shell.push(e.name);
		const { base, text } = frets(got.shape);
		lines.push(directive("define", `${e.name} base-fret ${base} frets ${text}`));
	}
	if (bare.length)
		out.losses.add(
			"no-shape",
			`no guitar shape: ${listed(bare)}, so no diagram is written for ${bare.length === 1 ? "it" : "them"}`,
		);
	if (shell.length)
		out.losses.add(
			"shell-shape",
			`a shape that stands for an altered chord leaves its altered tones out: ${listed(shell)}`,
		);
	return lines;
}
