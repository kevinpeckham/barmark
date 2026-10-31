import { transpose } from "./intervals.js";
import { printChord } from "./print.js";
import type { ParseResult } from "./types.js";
import {
	type ChordParts,
	chordIntervals,
	EXTENSIONS,
	type Quality,
	type Sus,
	TONES,
	validateParts,
} from "./vocabulary.js";

const ROOT = /^[A-G][#b]?/;
const INLINE_ALTERATION = /^[b#](5|9|11|13)/;

/** Splits a symbol into its parts, or names the text it could not read. */
function tokenize(symbol: string): ChordParts | string {
	const root = ROOT.exec(symbol)?.[0];
	if (!root) return "a chord starts with a root A–G";
	let rest = symbol.slice(root.length);

	let quality: Quality = "";
	if (rest.startsWith("mmaj")) {
		quality = "m";
		rest = rest.slice(1);
	} else if (rest.startsWith("m") && !rest.startsWith("maj")) {
		quality = "m";
		rest = rest.slice(1);
	} else if (rest.startsWith("dim") || rest.startsWith("aug")) {
		quality = rest.slice(0, 3) as Quality;
		rest = rest.slice(3);
	} else if (rest.startsWith("5")) {
		quality = "5";
		rest = rest.slice(1);
	}

	const ext = EXTENSIONS.find(([name]) => rest.startsWith(name))?.[0] ?? null;
	if (ext) rest = rest.slice(ext.length);

	const tones: string[] = [];
	if (ext) {
		for (let m = INLINE_ALTERATION.exec(rest); m; m = INLINE_ALTERATION.exec(rest)) {
			tones.push(m[0]);
			rest = rest.slice(m[0].length);
		}
	}

	let sus: Sus | null = null;
	if (rest.startsWith("sus2") || rest.startsWith("sus4")) {
		sus = rest.slice(0, 4) as Sus;
		rest = rest.slice(4);
	}

	const paren = /^\(([^)]*)\)/.exec(rest);
	if (paren) {
		for (const t of (paren[1] ?? "").split(",").map((x) => x.trim())) {
			if (!TONES.includes(t)) return `"${t}" is not a tone a parenthesis can add`;
			tones.push(t);
		}
		rest = rest.slice(paren[0].length);
	}

	let bass: string | null = null;
	const slash = /^\/([A-G][#b]?)$/.exec(rest);
	if (slash) {
		bass = slash[1] ?? null;
		rest = "";
	}
	if (rest) return `cannot read "${rest}"`;
	return { root, quality, extension: ext, sus, tones, bass };
}

export function parseChord(symbol: string): ParseResult {
	const parts = tokenize(symbol);
	if (typeof parts === "string") {
		return { ok: false, error: { message: `${symbol}: ${parts}`, token: symbol } };
	}
	const invalid = validateParts(parts, symbol);
	if (invalid) return { ok: false, error: invalid };
	const { intervals, warnings, alteredOpen } = chordIntervals(parts, symbol);
	const pitches = intervals.map((i) => transpose(parts.root, i));
	if (parts.bass && !pitches.includes(parts.bass)) pitches.push(parts.bass);
	return {
		ok: true,
		warnings,
		value: {
			kind: "chord",
			source: symbol,
			canonical: printChord(parts),
			root: parts.root,
			intervals,
			pitches,
			bass: parts.bass ?? parts.root,
			alteredOpen,
			harte: "",
		},
	};
}
