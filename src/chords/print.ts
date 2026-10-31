import { byDegree, type ChordParts, toneInterval } from "./vocabulary.js";

/** The canonical spelling: root, quality, extension, sus, sorted tones, bass. */
export function printChord(parts: ChordParts): string {
	const tones = [...parts.tones].sort((a, b) => byDegree(toneInterval(a), toneInterval(b)));
	return [
		parts.root,
		parts.quality,
		parts.extension ?? "",
		parts.sus ?? "",
		tones.length ? `(${tones.join(",")})` : "",
		parts.bass ? `/${parts.bass}` : "",
	].join("");
}
