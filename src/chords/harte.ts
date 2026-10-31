import {
	formatInterval,
	intervalBetween,
	intervalKey,
	parseInterval,
	transpose,
} from "./intervals.js";
import { parseChord } from "./parse.js";
import type { ChordRecord, Interval } from "./types.js";
import { byDegree, enumerateSuffixes, HARTE_SHORTHANDS, intervalSetKey } from "./vocabulary.js";

/**
 * The Harte label for a parsed chord or note set: the largest shorthand
 * contained in the chord, the remaining intervals in parentheses, and the
 * bass as an interval when it is not the root. Note sets without a marked
 * root use their bass as the Harte root, because Harte requires one.
 */
export function toHarte(r: ChordRecord): string {
	const root = r.root ?? r.bass;
	const keys = new Set(r.intervals.map(intervalKey));
	const written = new Set(r.intervals.map(formatInterval));
	// Most intervals wins; ties go to the shorthand naming more degrees exactly as
	// written (sus4 over sus2 in a 9sus4, whose 9 only shares the 2's pitch class).
	let best = { name: "1", used: new Set([intervalKey({ degree: 1, alter: 0 })]), exact: 1 };
	for (const [name, ivs] of HARTE_SHORTHANDS) {
		const used = new Set(ivs.map(intervalKey));
		if (![...used].every((k) => keys.has(k))) continue;
		const exact = ivs.filter((i) => written.has(formatInterval(i))).length;
		if (used.size > best.used.size || (used.size === best.used.size && exact > best.exact)) {
			best = { name, used, exact };
		}
	}
	const { name: shorthand, used } = best;
	const added = r.intervals.filter((i) => !used.has(intervalKey(i))).sort(byDegree);
	const list = added.length ? `(${added.map(formatInterval).join(",")})` : "";
	const bass = r.bass === root ? "" : `/${formatInterval(intervalBetween(root, r.bass))}`;
	return `${root}:${shorthand}${list}${bass}`;
}

/** What annotators mean by each Harte shorthand, as a barmark suffix (so `13` is barmark's 13). */
const INTENDED: Record<string, string> = {
	maj: "",
	min: "m",
	dim: "dim",
	aug: "aug",
	maj7: "maj7",
	min7: "m7",
	"7": "7",
	dim7: "dim7",
	hdim7: "m7(b5)",
	minmaj7: "mmaj7",
	maj6: "6",
	min6: "m6",
	"9": "9",
	maj9: "maj9",
	min9: "m9",
	sus2: "sus2",
	sus4: "sus4",
	"11": "11",
	min11: "m11",
	"13": "13",
	min13: "m13",
	maj13: "maj13",
	"5": "5",
};

const HARTE = /^([A-G][#b]*)(?::([^(/]*)(?:\(([^)]*)\))?)?(?:\/([#b]*\d+))?$/;

/** A Harte label's root, intervals (shorthand at its intended meaning, list applied) and bass. */
export function parseHarte(
	label: string,
): { root: string; intervals: Interval[]; bass: string } | "N" | "X" | null {
	if (label === "N" || label === "X") return label;
	const m = HARTE.exec(label);
	if (!m) return null;
	const [, root = "", shorthand = "maj", list, bassText] = m;
	let intervals: Interval[];
	if (shorthand === "1") intervals = [{ degree: 1, alter: 0 }];
	else if (shorthand === "") intervals = [];
	else {
		const suffix = INTENDED[shorthand];
		if (suffix === undefined) return null;
		const chord = parseChord(`C${suffix}`);
		if (!chord.ok) return null;
		intervals = chord.value.intervals;
	}
	for (const item of list ? list.split(",").map((x) => x.trim()) : []) {
		const omit = item.startsWith("*");
		const i = parseInterval(omit ? item.slice(1) : item);
		if (!i) return null;
		intervals = intervals.filter((x) => intervalKey(x) !== intervalKey(i));
		if (!omit) intervals.push(i);
	}
	const bassInterval = bassText ? parseInterval(bassText) : null;
	if (bassText && !bassInterval) return null;
	const bass = bassInterval ? transpose(root, bassInterval) : root;
	return { root, intervals: intervals.sort(byDegree), bass };
}

const SINGLE_ACCIDENTAL = /^[A-G][#b]?$/;

/** A barmark slot for a Harte label: a named chord when one has exactly its notes, else a note set. */
export function harteToBarmark(label: string): string | null {
	const h = parseHarte(label);
	if (h === "N") return "N.C.";
	if (h === "X") return "?";
	if (!h || !SINGLE_ACCIDENTAL.test(h.root)) return null;
	const rootSounds = h.intervals.some((i) => i.degree === 1 && i.alter === 0);
	const candidates = rootSounds ? enumerateSuffixes().get(intervalSetKey(h.intervals)) : undefined;
	// Same notes, several names (A11 and A9sus4 under the eleventh rule): take the
	// one naming most degrees as the label wrote them, then the shortest.
	const written = new Set(h.intervals.map(formatInterval));
	const exact = (c: { intervals: Interval[] }) =>
		c.intervals.filter((i) => written.has(formatInterval(i))).length;
	const suffix = candidates?.reduce((best, c) => (exact(c) > exact(best) ? c : best)).suffix;
	if (suffix !== undefined && SINGLE_ACCIDENTAL.test(h.bass)) {
		return `${h.root}${suffix}${h.bass === h.root ? "" : `/${h.bass}`}`;
	}
	const others = h.intervals.map((i) => transpose(h.root, i)).filter((n) => n !== h.bass);
	const notes = [h.bass, ...new Set(others)].map((n) =>
		rootSounds && n === h.root && n !== h.bass ? `${n}!` : n,
	);
	return `{${notes.join(" ")}}`;
}
