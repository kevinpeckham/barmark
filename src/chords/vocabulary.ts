/**
 * Grammar Appendix A as data: the one source the parser, printer and
 * Harte converter read.
 */
import { intervalKey, parseInterval } from "./intervals.js";
import type { Diagnostic, Interval } from "./types.js";

export type Quality = "" | "m" | "dim" | "aug" | "5";
export type Extension = "6" | "6/9" | "7" | "maj7" | "9" | "maj9" | "11" | "13" | "maj13" | "7alt";
export type Sus = "sus2" | "sus4";

export type ChordParts = {
	root: string;
	quality: Quality;
	extension: Extension | null;
	sus: Sus | null;
	tones: string[];
	bass: string | null;
};

const ivs = (...s: string[]): Interval[] =>
	s.map((x) => {
		const i = parseInterval(x);
		if (!i) throw new Error(`bad interval ${x}`);
		return i;
	});

export const QUALITIES: Record<Quality, Interval[]> = {
	"": ivs("1", "3", "5"),
	m: ivs("1", "b3", "5"),
	dim: ivs("1", "b3", "b5"),
	aug: ivs("1", "3", "#5"),
	"5": ivs("1", "5"),
};

/** Longest first, so the tokenizer can take the first prefix that matches. */
export const EXTENSIONS: [Extension, Interval[]][] = [
	["7alt", ivs("b7")],
	["maj13", ivs("7", "9", "13")],
	["maj9", ivs("7", "9")],
	["maj7", ivs("7")],
	["6/9", ivs("6", "9")],
	["13", ivs("b7", "9", "13")],
	["11", ivs("b7", "9", "11")],
	["9", ivs("b7", "9")],
	["7", ivs("b7")],
	["6", ivs("6")],
];

/** Appendix A.3. */
export const VALID_EXTENSIONS: Record<Quality, (Extension | null)[]> = {
	"": [null, "6", "6/9", "7", "maj7", "9", "maj9", "11", "13", "maj13", "7alt"],
	m: [null, "6", "6/9", "7", "maj7", "9", "maj9", "11", "13"],
	dim: [null, "7"],
	aug: [null, "7", "maj7"],
	"5": [null],
};

/** `sus` is allowed only on the major quality, with these extensions. */
export const SUS_ALLOWED_WITH: (Extension | null)[] = [null, "7", "9", "13"];

/** Tones a parenthesis may hold. Tone `7` means the interval b7. */
export const TONES = ["2", "4", "6", "7", "9", "11", "13", "b5", "#5", "b9", "#9", "#11", "b13"];

export const toneInterval = (tone: string): Interval => {
	const i = parseInterval(tone === "7" ? "b7" : tone);
	if (!i) throw new Error(`bad tone ${tone}`);
	return i;
};

const same = (a: Interval, b: Interval) => a.degree === b.degree && a.alter === b.alter;

/** Degree order, then flat before natural before sharp. */
export const byDegree = (a: Interval, b: Interval) => a.degree - b.degree || a.alter - b.alter;

export function validateParts(parts: ChordParts, symbol: string): Diagnostic | null {
	if (!VALID_EXTENSIONS[parts.quality].includes(parts.extension)) {
		return {
			message: `"${parts.quality || "major"}" with "${parts.extension}" is not a valid combination (Appendix A.3)`,
			token: symbol,
		};
	}
	if (parts.sus && (parts.quality !== "" || !SUS_ALLOWED_WITH.includes(parts.extension))) {
		return { message: `"${parts.sus}" is not allowed on this chord (Appendix A.3)`, token: symbol };
	}
	return null;
}

/** The chord's intervals after every rule in Appendix A.2, without the slash bass. */
export function chordIntervals(
	parts: ChordParts,
	symbol: string,
): { intervals: Interval[]; warnings: Diagnostic[]; alteredOpen: boolean } {
	const warnings: Diagnostic[] = [];
	let s = [...QUALITIES[parts.quality]];
	const add = (i: Interval) => {
		if (!s.some((x) => same(x, i))) s.push(i);
	};
	const remove = (i: Interval) => {
		s = s.filter((x) => !same(x, i));
	};
	const ext = EXTENSIONS.find(([name]) => name === parts.extension)?.[1] ?? [];
	if (parts.extension === "7" && parts.quality === "dim") add({ degree: 7, alter: -2 });
	else for (const i of ext) add(i);
	if (parts.extension === "7alt") remove({ degree: 5, alter: 0 });
	// The eleventh rule: a natural 11 and a major third never sound together.
	if (parts.extension === "11" && parts.quality === "") remove({ degree: 3, alter: 0 });
	if (parts.extension === "13" && parts.quality === "m") add({ degree: 11, alter: 0 });
	if (parts.sus) {
		remove({ degree: 3, alter: 0 });
		remove({ degree: 3, alter: -1 });
		add({ degree: parts.sus === "sus2" ? 2 : 4, alter: 0 });
	}
	// Applied in the order the printer writes them, so a symbol and its canonical
	// form always name the same chord.
	const tones = [...parts.tones].sort((a, b) => byDegree(toneInterval(a), toneInterval(b)));
	for (const tone of tones) {
		const i = toneInterval(tone);
		if (tone !== "7" && i.alter !== 0) remove({ degree: i.degree, alter: 0 });
		if (s.some((x) => intervalKey(x) === intervalKey(i))) {
			warnings.push({ message: `${symbol} already contains ${tone}`, token: tone });
		} else s.push(i);
	}
	return { intervals: s.sort(byDegree), warnings, alteredOpen: parts.extension === "7alt" };
}

/**
 * Appendix A.5, applied in this order after ♯/♭ become #/b. Each pattern
 * reads the text after the root, so a rule can never touch the root's
 * own accidental.
 */
export const ALIASES: [RegExp, string][] = [
	[/^Δ7?/, "maj7"],
	[/^ø7?/, "m7(b5)"],
	[/^°7/, "dim7"],
	[/^°/, "dim"],
	[/^\+7/, "aug7"],
	[/^\+/, "aug"],
	[/^(minmaj7|m\(maj7\))/, "mmaj7"],
	[/^(Maj7|ma7)/, "maj7"],
	[/^min/, "m"],
	[/^-/, "m"],
	[/^maj(?=$|\/)/, ""],
	[/sus(?![24])/, "sus4"],
];

const NATURALS: Record<number, string> = {
	0: "C",
	2: "D",
	4: "E",
	5: "F",
	7: "G",
	9: "A",
	11: "B",
};
const SHARPS: Record<number, string> = { 1: "C#", 3: "D#", 6: "F#", 8: "G#", 10: "A#" };
const FLATS: Record<number, string> = { 1: "Db", 3: "Eb", 6: "Gb", 8: "Ab", 10: "Bb" };

/** The single-accidental spelling of a double-sharp or double-flat root. */
function enharmonicRoot(semitone: number, sharp: boolean): string {
	return NATURALS[semitone] ?? (sharp ? SHARPS : FLATS)[semitone] ?? "";
}

/** Appendix A.6: a rejection with its suggestion, or null when the symbol is not one. */
export function rejection(symbol: string, semitoneOf: (note: string) => number): Diagnostic | null {
	const reject = (message: string, suggestion: string): Diagnostic => ({
		message: `${symbol}: ${message}`,
		token: symbol,
		suggestion,
	});
	if (/^[a-g]/.test(symbol)) {
		return reject("a root is an uppercase letter", symbol[0]?.toUpperCase() + symbol.slice(1));
	}
	if (symbol.startsWith("H"))
		return reject('German "H" is ambiguous; write B', `B${symbol.slice(1)}`);
	const double = /^([A-G])(bb|##)(.*)$/.exec(symbol);
	if (double) {
		const [, letter = "", acc = "", rest = ""] = double;
		const root = enharmonicRoot(semitoneOf(letter + acc), acc === "##");
		return reject("a root takes at most one accidental", root + rest);
	}
	const big = /^([A-G][#b]?)M(?!aj)(.*)$/.exec(symbol);
	if (big) {
		const [, root = "", rest = ""] = big;
		const fixed = /^aj/i.test(rest)
			? `maj${rest.slice(2)}`
			: /^\d/.test(rest)
				? `maj${rest}`
				: rest === "" || rest.startsWith("/")
					? rest
					: `m${rest}`;
		return reject('"M" is one shifted letter from "m"; write maj', root + fixed);
	}
	const bare = /^([A-G][#b]?)([24])(?=$|\/)/.exec(symbol);
	if (bare) {
		const [, root = "", n = ""] = bare;
		const [sus, add] = n === "2" ? ["sus2", "9"] : ["sus4", "11"];
		return reject(
			`"${n}" means different chords in different traditions`,
			`${root}${sus} or ${root}(${add})`,
		);
	}
	return null;
}

/** Harte (2005) shorthands with Harte's own definitions, in tie-break order. */
export const HARTE_SHORTHANDS: [string, Interval[]][] = [
	["maj", ivs("1", "3", "5")],
	["min", ivs("1", "b3", "5")],
	["dim", ivs("1", "b3", "b5")],
	["aug", ivs("1", "3", "#5")],
	["maj7", ivs("1", "3", "5", "7")],
	["min7", ivs("1", "b3", "5", "b7")],
	["7", ivs("1", "3", "5", "b7")],
	["dim7", ivs("1", "b3", "b5", "bb7")],
	["hdim7", ivs("1", "b3", "b5", "b7")],
	["minmaj7", ivs("1", "b3", "5", "7")],
	["maj6", ivs("1", "3", "5", "6")],
	["min6", ivs("1", "b3", "5", "6")],
	["9", ivs("1", "3", "5", "b7", "9")],
	["maj9", ivs("1", "3", "5", "7", "9")],
	["min9", ivs("1", "b3", "5", "b7", "9")],
	["sus4", ivs("1", "4", "5")],
	["sus2", ivs("1", "2", "5")],
	["11", ivs("1", "3", "5", "b7", "9", "11")],
	["min11", ivs("1", "b3", "5", "b7", "9", "11")],
	["13", ivs("1", "3", "5", "b7", "9", "11", "13")],
	["min13", ivs("1", "b3", "5", "b7", "9", "11", "13")],
	["maj13", ivs("1", "3", "5", "7", "9", "11", "13")],
	["5", ivs("1", "5")],
	["1", ivs("1")],
];

export type Suffix = { suffix: string; intervals: Interval[]; tones: number };

let suffixes: Map<string, Suffix[]> | null = null;

/**
 * Every chord suffix Appendix A allows (with up to three parenthesized tones),
 * grouped by its sorted spelled pitch classes, shortest spelling first.
 * `7alt` is left out: it claims altered tones its pitches don't show.
 */
export function enumerateSuffixes(): Map<string, Suffix[]> {
	if (suffixes) return suffixes;
	const found = new Map<string, Suffix[]>();
	const combos: string[][] = [[]];
	for (let i = 0; i < TONES.length; i++) {
		combos.push([TONES[i] ?? ""]);
		for (let j = i + 1; j < TONES.length; j++) {
			combos.push([TONES[i] ?? "", TONES[j] ?? ""]);
			for (let k = j + 1; k < TONES.length; k++)
				combos.push([TONES[i] ?? "", TONES[j] ?? "", TONES[k] ?? ""]);
		}
	}
	for (const quality of Object.keys(VALID_EXTENSIONS) as Quality[]) {
		for (const extension of VALID_EXTENSIONS[quality]) {
			if (extension === "7alt") continue;
			const susOptions: (Sus | null)[] =
				quality === "" && SUS_ALLOWED_WITH.includes(extension) ? [null, "sus2", "sus4"] : [null];
			for (const sus of susOptions) {
				for (const tones of combos) {
					const parts: ChordParts = { root: "", quality, extension, sus, tones, bass: null };
					const { intervals, warnings } = chordIntervals(parts, "");
					// Skip warnings and spellings that double a pitch class (11(4), 9(2)).
					if (warnings.length || new Set(intervals.map(intervalKey)).size !== intervals.length)
						continue;
					const key = intervalSetKey(intervals);
					const list = found.get(key) ?? [];
					list.push({ suffix: printSuffix(parts), intervals, tones: tones.length });
					found.set(key, list);
				}
			}
		}
	}
	for (const list of found.values()) {
		list.sort(
			(a, b) =>
				a.tones - b.tones || a.suffix.length - b.suffix.length || (a.suffix < b.suffix ? -1 : 1),
		);
	}
	suffixes = found;
	return found;
}

export const intervalSetKey = (intervals: Interval[]) =>
	[...new Set(intervals.map(intervalKey))].sort().join("|");

/** The canonical text after the root; mirrors printChord without importing it. */
function printSuffix(parts: ChordParts): string {
	const tones = [...parts.tones].sort((a, b) => byDegree(toneInterval(a), toneInterval(b)));
	return `${parts.quality}${parts.extension ?? ""}${parts.sus ?? ""}${tones.length ? `(${tones.join(",")})` : ""}`;
}
