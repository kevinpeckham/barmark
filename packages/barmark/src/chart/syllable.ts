import type { Syllable } from "./types.js";

/**
 * A syllable token (grammar 4.3): `/` holds the syllable before, a
 * trailing `-` continues the word, and `~` joins elided syllables on one
 * note. Null when no syllable reads: the token is empty, a side of a `~`
 * is, or it is a hold with a hyphen (`/-`), since a hold can't begin or
 * continue a word.
 */
export function readSyllable(text: string): Syllable | null {
	if (text === "/") return { kind: "held" };
	if (text === "/-") return null;
	const continues = text.endsWith("-");
	const parts = (continues ? text.slice(0, -1) : text).split("~");
	if (parts.some((p) => p === "")) return null;
	return { kind: "sung", parts, continues };
}

/** The note part of a slot token and the syllable written after it, if any. */
export type Split = { note: string; syllable: string | null };

/**
 * Split a group member at the colon after its note set's closing brace (and
 * a rhythm's dot): `{C4}.:maz-` is `{C4}.` and `maz-`. A member with no
 * brace splits at its first colon, so `G:la` is `G` and `la`, which the
 * caller rejects: only a note set takes a syllable.
 */
export function splitSyllable(member: string): Split {
	const brace = member.indexOf("}");
	const after = member[brace + 1] === "." ? brace + 2 : brace + 1;
	const colon = brace < 0 ? member.indexOf(":") : member[after] === ":" ? after : -1;
	if (colon < 0) return { note: member, syllable: null };
	return { note: member.slice(0, colon), syllable: member.slice(colon + 1) };
}
