/**
 * Grammar Appendix A as data: the one source the parser, printer and
 * Harte converter read.
 */
import { parseInterval } from "./intervals.js";
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
	for (const tone of parts.tones) {
		const i = toneInterval(tone);
		if (tone !== "7" && i.alter !== 0) {
			remove({ degree: i.degree, alter: 0 });
		} else if (s.some((x) => same(x, i))) {
			warnings.push({ message: `${symbol} already contains ${tone}`, token: tone });
		}
		add(i);
	}
	return { intervals: s.sort(byDegree), warnings, alteredOpen: parts.extension === "7alt" };
}
