import type { Meter } from "./types.js";

/** A slot that may be dotted: a bar line's (grammar 2.2) or a lyric row's, which never is. */
type Member = { kind: string; dotted?: true };

/**
 * How a group divides its slot (grammar 2.2), as fractions summing to 1:
 * equally, or 3:1 (1:3) when one member of a pair is dotted.
 */
export function memberShares(members: Member[]): number[] {
	const dotted = members.findIndex((m) => m.dotted);
	if (members.length === 2 && dotted >= 0) return dotted === 0 ? [0.75, 0.25] : [0.25, 0.75];
	return members.map(() => 1 / members.length);
}

/** A simple slot with its onset from the bar's start and its length, both in whole notes. */
export type Timed<T> = { slot: T; at: number; length: number };

/**
 * Each simple slot of a bar in order, with its onset and length in whole
 * notes: the bar split evenly among its slots (grammar 2.1), and a group's
 * slot among its members (2.2). A lyric row's slots are timed as a bar
 * line's (7.7).
 */
export function slotTimes<T extends Member>(
	slots: (T | { kind: "group"; members: T[] })[],
	meter: Meter,
): Timed<T>[] {
	const each = meter.n / meter.d / slots.length;
	const out: Timed<T>[] = [];
	let at = 0;
	for (const s of slots) {
		const members: T[] = "members" in s ? s.members : [s];
		const shares = memberShares(members);
		members.forEach((slot, i) => {
			const length = each * (shares[i] ?? 0);
			out.push({ slot, at, length });
			at += length;
		});
	}
	return out;
}
