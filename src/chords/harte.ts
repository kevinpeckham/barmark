import { formatInterval, intervalBetween, intervalKey } from "./intervals.js";
import type { ChordRecord } from "./types.js";
import { byDegree, HARTE_SHORTHANDS } from "./vocabulary.js";

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
