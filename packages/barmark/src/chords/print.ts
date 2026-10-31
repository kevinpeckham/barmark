import { byDegree, type ChordParts, toneInterval } from "./vocabulary.js";

/** The canonical text after the root: quality, extension, sus, sorted tones. */
export function printSuffix(parts: Omit<ChordParts, "root" | "bass">): string {
	const tones = [...parts.tones].sort((a, b) => byDegree(toneInterval(a), toneInterval(b)));
	return `${parts.quality}${parts.extension ?? ""}${parts.sus ?? ""}${tones.length ? `(${tones.join(",")})` : ""}`;
}

/** The canonical spelling: root, suffix, bass. */
export function printChord(parts: ChordParts): string {
	return `${parts.root}${printSuffix(parts)}${parts.bass ? `/${parts.bass}` : ""}`;
}
