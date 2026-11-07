/** Chords and notes as display pieces: ♯ and ♭ glyphs, the suffix split for superscript. */
import { type ChordParts, degreeOf, type Interval, type Key } from "barmark";

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

/** A chord as the page sets it: root and quality on the baseline, extension, sus and added tones raised, the bass after the slash, accidentals as glyphs. */
export function typesetChord(parts: ChordParts): ChordPieces {
	const tones = parts.tones.length ? `(${parts.tones.join(",")})` : "";
	return {
		root: glyphs(parts.root),
		quality: parts.quality,
		superscript: glyphs(`${parts.extension ?? ""}${parts.sus ?? ""}${tones}`),
		bass: parts.bass ? glyphs(parts.bass) : null,
	};
}

/** How chords read in a key: Nashville numbers (6m⁷) or Roman numerals (vi⁷). */
export type Numerals = "nashville" | "roman";
export const NUMERALS: readonly Numerals[] = ["nashville", "roman"];

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];
/** In Roman numerals case carries minor, so only diminished and augmented keep a mark. */
const ROMAN_QUALITY: Record<ChordParts["quality"], string> = {
	"": "",
	m: "",
	dim: "°",
	aug: "+",
	// Raised into the superscript with the other numerals (raisePower).
	"5": "",
};

/** A power chord's 5 goes up with the superscript: on the baseline it joins the number (1 and 5 read as 15). */
const raisePower = (p: ChordPieces): ChordPieces =>
	p.quality === "5" ? { ...p, quality: "", superscript: `5${p.superscript}` } : p;

const accidentals = (alter: number) => (alter < 0 ? "b" : "#").repeat(Math.abs(alter));

/** `{ degree: 7, alter: -1 }` → `♭7`. */
const degreeText = (d: Interval) => glyphs(`${accidentals(d.alter)}${d.degree}`);

/**
 * A chord as its degree in `key`: Nashville keeps the chord's quality and
 * superscript after the number; Roman shows minor and diminished in lower
 * case. Both raise a power chord's 5 into the superscript (1⁵, I⁵). A
 * slash bass is a number in both. Null if the root has no degree.
 */
export function typesetNumeral(parts: ChordParts, key: Key, style: Numerals): ChordPieces | null {
	const degree = degreeOf(parts.root, key);
	if (!degree) return null;
	const pieces = raisePower(typesetChord(parts));
	const bass = parts.bass ? degreeOf(parts.bass, key) : null;
	const withBass = { ...pieces, bass: bass ? degreeText(bass) : pieces.bass };
	if (style === "nashville") return { ...withBass, root: degreeText(degree) };
	const numeral = ROMAN[degree.degree - 1] ?? "";
	const lower = parts.quality === "m" || parts.quality === "dim";
	return {
		...withBass,
		root: glyphs(accidentals(degree.alter)) + (lower ? numeral.toLowerCase() : numeral),
		quality: ROMAN_QUALITY[parts.quality],
	};
}

/** A note set's label (`E1`, `F#`) as name and octave. */
export function splitPitch(label: string): { name: string; octave: string | null } {
	const m = /^([A-G](?:##|bb|#|b)?)(-?\d+)?$/.exec(label);
	return { name: glyphs(m?.[1] ?? label), octave: m?.[2] ?? null };
}
