import { type Barre, GUITAR, type Shape, type Tuning } from "./types.js";

const MUTED = -1;

/** The highest sounding string's index, or -1 when none sounds. */
function highestSounding(frets: readonly number[]): number {
	return frets.findLastIndex((f) => f >= 0);
}

/** The lowest fretted (above the nut) fret, or 0 when none is. */
function lowestFretted(frets: readonly number[]): number {
	const fretted = frets.filter((f) => f > 0);
	return fretted.length === 0 ? 0 : Math.min(...fretted);
}

/** The barre that holds the lowest fret across at least two strings, when more than four strings are fretted and a barre can hold them. */
function barreOf(frets: readonly number[]): Barre | undefined {
	if (frets.filter((f) => f > 0).length <= 4) return undefined;
	const fret = lowestFretted(frets);
	const from = frets.indexOf(fret);
	const to = highestSounding(frets);
	if (from >= to) return undefined;
	if (frets.slice(from, to + 1).some((f) => f < fret || f === 0)) return undefined;
	return { fret, from, to };
}

/** A shape from absolute frets: `base` and `barre` worked out. */
export function shapeFrom(frets: readonly number[]): Shape {
	const base = Math.max(...frets) <= 5 ? 1 : lowestFretted(frets);
	const barre = barreOf(frets);
	return barre ? { frets: [...frets], base, barre } : { frets: [...frets], base };
}

/** A shape from six characters, low string first, `x` muted and `0` to `9` a fret ("x32010" is C), or from six words, as `shapeText` writes them when a fret is 10 or more ("x 10 12 12 11 10"; frets 0 to 24).
 * @throws on text that is neither form: it reads table and test literals, not user input. */
export function shapeOf(text: string): Shape {
	const words = text.includes(" ") ? text.split(" ") : [...text];
	if (words.length !== 6 || !words.every((w) => /^(x|0|[1-9]\d?)$/.test(w))) {
		throw new Error(`not six strings, each x or a fret: "${text}"`);
	}
	const frets = words.map((w) => (w === "x" ? MUTED : Number(w)));
	if (frets.some((f) => f > 24)) throw new Error(`a fret above 24: "${text}"`);
	return shapeFrom(frets);
}

/** The shape's text when every fret is under 10, else the frets joined by spaces ("x 10 12 12 11 10"). */
export function shapeText(shape: Shape): string {
	const marks = shape.frets.map((f) => (f < 0 ? "x" : String(f)));
	return shape.frets.every((f) => f < 10) ? marks.join("") : marks.join(" ");
}

/** The MIDI notes a shape sounds, low string first. */
export function sounding(shape: Shape, tuning: Tuning = GUITAR): number[] {
	const notes: number[] = [];
	shape.frets.forEach((f, i) => {
		const open = tuning.strings[i];
		if (f >= 0 && open !== undefined) notes.push(open + f);
	});
	return notes;
}

/** The fingers a shape needs: its fretted strings, or 1 + the strings above the lowest fret when a barre holds it; 99 when no hand can. */
export function fingersNeeded(frets: readonly number[]): number {
	const barre = barreOf(frets);
	if (barre) return 1 + frets.filter((f) => f > barre.fret).length;
	const fretted = frets.filter((f) => f > 0).length;
	return fretted > 4 ? 99 : fretted;
}
