import { toHarte } from "./harte.js";
import { noteSemitone, transpose } from "./intervals.js";
import { canonicalParts, printChord } from "./print.js";
import type { ChordRecord, Diagnostic, ParseResult } from "./types.js";
import {
	ALIASES,
	type ChordParts,
	chordIntervals,
	EXTENSIONS,
	type Quality,
	rejection,
	type Sus,
	TONES,
	validateParts,
} from "./vocabulary.js";

const ROOT = /^[A-G][#b]?/;
const INLINE_ALTERATION = /^(b5|#5|b9|#9|#11|b13)/;

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

/**
 * Logic Pro's spellings (Appendix A.5): groups in a row are one list
 * (`(5)(7)` is `(5,7)`), and `5` in a bare root's group is the power chord
 * (`F#(5,7)` is `F#5(7)`). After a quality or extension, `(5)` stays an error.
 */
function logicGroups(rest: string): string {
	const joined = rest.replace(/\)\(/g, ",");
	const group = /^\(([^)]*)\)/.exec(joined);
	const tones = group?.[1]?.split(",").map((t) => t.trim()) ?? [];
	if (!group || !tones.includes("5")) return joined;
	const others = tones.filter((t) => t !== "5");
	return `5${others.length ? `(${others.join(",")})` : ""}${joined.slice(group[0].length)}`;
}

/** Appendix A.5 and A.6: Unicode, rejections, then aliases into canonical vocabulary. */
function normalizeSymbol(symbol: string): { text: string } | Diagnostic {
	const text = symbol.replace(/♯/g, "#").replace(/♭/g, "b");
	const rejected = rejection(text, noteSemitone);
	if (rejected) return rejected;
	const root = ROOT.exec(text)?.[0] ?? "";
	let rest = text.slice(root.length);
	for (const [pattern, replacement] of ALIASES) rest = rest.replace(pattern, replacement);
	rest = logicGroups(rest);
	const added = [...rest.matchAll(/add(2|4|9|11)/g)].map((m) => m[1] ?? "");
	if (added.length) {
		rest = rest.replace(/add(2|4|9|11)/g, "");
		const close = rest.indexOf(")");
		if (close >= 0) rest = `${rest.slice(0, close)},${added.join(",")}${rest.slice(close)}`;
		else {
			const slash = /\/[A-G][#b]?$/.exec(rest);
			const at = slash ? slash.index : rest.length;
			rest = `${rest.slice(0, at)}(${added.join(",")})${rest.slice(at)}`;
		}
	}
	return { text: root + rest };
}

export function parseChord(symbol: string): ParseResult {
	const normal = normalizeSymbol(symbol);
	if (!("text" in normal)) return { ok: false, error: normal };
	const parts = tokenize(normal.text);
	if (typeof parts === "string") {
		return { ok: false, error: { message: `${symbol}: ${parts}`, token: symbol } };
	}
	const invalid = validateParts(parts, symbol);
	if (invalid) return { ok: false, error: invalid };
	const { intervals, warnings, alteredOpen } = chordIntervals(parts, symbol);
	const pitches = intervals.map((i) => transpose(parts.root, i));
	if (parts.bass && !pitches.includes(parts.bass)) pitches.push(parts.bass);
	const value: ChordRecord = {
		kind: "chord",
		source: symbol,
		canonical: printChord(parts),
		root: parts.root,
		intervals,
		pitches,
		bass: parts.bass ?? parts.root,
		alteredOpen,
		harte: "",
		parts: canonicalParts(parts),
	};
	value.harte = toHarte(value);
	return { ok: true, warnings, value };
}
