import { intervalKey } from "./intervals.js";
import { printSuffix } from "./print.js";
import type { Interval } from "./types.js";
import {
	type ChordParts,
	chordIntervals,
	type Quality,
	SUS_ALLOWED_WITH,
	type Sus,
	TONES,
	VALID_EXTENSIONS,
} from "./vocabulary.js";

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
