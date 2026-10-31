import { byDegree, type ChordParts, toneInterval } from "./vocabulary.js";

/** The tones in canonical order (by degree), as the canonical spelling lists them. */
const sortTones = (tones: string[]) =>
	[...tones].sort((a, b) => byDegree(toneInterval(a), toneInterval(b)));

/** The parts as the canonical spelling has them: the same parts, tones sorted. */
export function canonicalParts(parts: ChordParts): ChordParts {
	return { ...parts, tones: sortTones(parts.tones) };
}

/** The canonical text after the root: quality, extension, sus, sorted tones. */
export function printSuffix(parts: Omit<ChordParts, "root" | "bass">): string {
	const tones = sortTones(parts.tones);
	return `${parts.quality}${parts.extension ?? ""}${parts.sus ?? ""}${tones.length ? `(${tones.join(",")})` : ""}`;
}

/** The canonical spelling: root, suffix, bass. */
export function printChord(parts: ChordParts): string {
	return `${parts.root}${printSuffix(parts)}${parts.bass ? `/${parts.bass}` : ""}`;
}
