import type { SimpleSlot } from "./types.js";

/**
 * How a group divides its slot (grammar 2.2), as fractions summing to 1:
 * equally, or 3:1 (1:3) when one member of a pair is dotted.
 */
export function memberShares(members: SimpleSlot[]): number[] {
	const dotted = members.findIndex((m) => m.dotted);
	if (members.length === 2 && dotted >= 0) return dotted === 0 ? [0.75, 0.25] : [0.25, 0.75];
	return members.map(() => 1 / members.length);
}
