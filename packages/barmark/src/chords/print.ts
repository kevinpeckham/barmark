import { byDegree, type ChordParts, isOmission, toneInterval } from "./vocabulary.js";

/** The tones in canonical order: added tones by degree, then what is left out (`(b9,no5)`). */
const sortTones = (tones: string[]) => [
	...tones.filter((t) => !isOmission(t)).sort((a, b) => byDegree(toneInterval(a), toneInterval(b))),
	...tones.filter(isOmission).sort(),
];

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
