/** Chord symbols read from <harmony>: by meaning, then by display text, else `?`. */
import { harteToBarmark, type Interval, parseChord } from "barmark";
import { type Degree, intervalsOf } from "../harmony.js";
import { writtenName } from "../written.js";
import { child, children, textOf, type XNode } from "./tree.js";

export type Transpose = { chromatic: number; octave: number; diatonic?: number | null };

/** A chord symbol's place in a bar: the slot symbol, and the program's own text when that is `?`. */
export type ReadChord = { slot: string; original: string | null };

const UNKNOWN = (original: string | null): ReadChord => ({ slot: "?", original });

const accidentals = (alter: number) => (alter > 0 ? "#".repeat(alter) : "b".repeat(-alter));

/** A <root> or <bass>'s note name at concert pitch, or null when it has no step. */
function nameOf(node: XNode | undefined, prefix: "root" | "bass", by: Transpose): string | null {
	const step = textOf(node, `${prefix}-step`);
	if (!/^[A-G]$/.test(step)) return null;
	const alter = Math.round(Number(textOf(node, `${prefix}-alter`)) || 0);
	// <transpose> is the interval from written to sounding; the export wrote the name
	// above concert pitch, so moving back is the same arithmetic the other way round.
	const whole = Math.trunc(by.chromatic / 12);
	const chromatic = by.chromatic - 12 * whole;
	const diatonic = (by.diatonic ?? Math.round((by.chromatic * 7) / 12)) - 7 * whole;
	return writtenName(`${step}${accidentals(alter)}`, { diatonic, chromatic });
}

function degreesOf(harmony: XNode): Degree[] {
	return children(harmony, "degree").flatMap((d) => {
		const value = Number(textOf(d, "degree-value"));
		const type = textOf(d, "degree-type");
		if (!Number.isInteger(value) || (type !== "add" && type !== "alter" && type !== "subtract"))
			return [];
		return [{ value, alter: Math.round(Number(textOf(d, "degree-alter")) || 0), type }];
	});
}

const spelled = (i: Interval) => `${accidentals(i.alter)}${i.degree}`;

/** The chord symbol a kind and its degrees mean, or null when no named chord fits. */
function byMeaning(root: string, kind: string, harmony: XNode): string | null {
	const intervals = intervalsOf(kind, degreesOf(harmony));
	if (intervals.length === 0) return null;
	const named = harteToBarmark(`${root}:(${intervals.map(spelled).join(",")})`);
	return named && !named.startsWith("{") && named !== "?" && named !== "N.C." ? named : null;
}

const chordOf = (text: string) => {
	const r = parseChord(text);
	return r.ok && r.value.kind === "chord" ? r.value : null;
};

const notesOf = (intervals: Interval[]) => intervals.map(spelled).sort().join(" ");

/** A <harmony> as a slot symbol, its names moved to concert pitch by the part's <transpose>. */
export function readHarmony(node: XNode, transpose: Transpose): ReadChord {
	const kindNode = child(node, "kind");
	const kind = textOf(kindNode);
	const display = kindNode?.attrs.text ?? "";
	if (kind === "none") return { slot: "N.C.", original: null };
	const root = nameOf(child(node, "root"), "root", transpose);
	if (root === null) return UNKNOWN(textOf(node, "function") || display || null);
	const bassNode = child(node, "bass");
	const bass = bassNode ? nameOf(bassNode, "bass", transpose) : null;
	const slash = bass ? `/${bass}` : "";

	const shown = `${root}${display}${slash}`;
	const shownChord = display === "" ? null : chordOf(shown);
	const meant = byMeaning(root, kind, node);
	const meantChord = meant === null ? null : chordOf(meant + slash);
	if (meantChord) {
		// Several names spell the same notes (m7(b5), dim(7)): keep the one the file wrote.
		const sameNotes = shownChord && notesOf(shownChord.intervals) === notesOf(meantChord.intervals);
		return { slot: (sameNotes ? shownChord : meantChord).canonical, original: null };
	}
	return shownChord ? { slot: shownChord.canonical, original: null } : UNKNOWN(shown);
}
