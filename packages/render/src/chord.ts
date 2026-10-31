/** Chords and notes as display pieces: ♯ and ♭ glyphs, the suffix split for superscript. */
import type { ChordParts } from "barmark";

export type ChordPieces = {
	root: string;
	/** m, dim, aug or 5: set on the baseline. */
	quality: string;
	/** Extension, sus and tones: set as a superscript. */
	superscript: string;
	bass: string | null;
};

const ACCIDENTALS: [RegExp, string][] = [
	[/##/g, "𝄪"],
	[/bb(?=\d|$|\))/g, "𝄫"],
	[/#/g, "♯"],
	[/(?<=[A-G]|^|\(|,)b/g, "♭"],
];

/** `F#` → `F♯`, `b9` → `♭9`, `Bbb` → `B𝄫`. */
export function glyphs(text: string): string {
	return ACCIDENTALS.reduce((t, [re, g]) => t.replace(re, g), text);
}

export function typesetChord(parts: ChordParts): ChordPieces {
	const tones = parts.tones.length ? `(${parts.tones.join(",")})` : "";
	return {
		root: glyphs(parts.root),
		quality: parts.quality,
		superscript: glyphs(`${parts.extension ?? ""}${parts.sus ?? ""}${tones}`),
		bass: parts.bass ? glyphs(parts.bass) : null,
	};
}

/** A note set's label (`E1`, `F#`) as name and octave. */
export function splitPitch(label: string): { name: string; octave: string | null } {
	const m = /^([A-G](?:##|bb|#|b)?)(-?\d+)?$/.exec(label);
	return { name: glyphs(m?.[1] ?? label), octave: m?.[2] ?? null };
}
