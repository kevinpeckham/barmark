import { shapeFrom } from "./shape.js";
import { withinLimits } from "./sounds.js";
import { GUITAR, type Shape, type Tuning } from "./types.js";

/** The frets note `k` might take on a string with this open pitch. */
type Frets = (k: number, open: number) => number[];

const LAST_FRET = 15;

/** The strings from the lowest to the highest that sounds, less one: the fewer the muted strings between them. */
const reach = (frets: readonly number[]): number =>
	frets.findLastIndex((f) => f >= 0) - frets.findIndex((f) => f >= 0);

/** Lowest highest-fret first, then the fewest muted strings inside, then the frets as numbers, low string first. */
function better(a: Shape, b: Shape): number {
	const d = Math.max(...a.frets) - Math.max(...b.frets) || reach(a.frets) - reach(b.frets);
	const i = a.frets.findIndex((f, s) => f !== b.frets[s]);
	return d || (a.frets[i] as number) - (b.frets[i] as number);
}

/** Put `count` notes on strictly ascending strings, each higher than the one before, at the frets `at` proposes and the guitar has, and keep what the hand holds, best first. */
function place(strings: readonly number[], count: number, at: Frets): Shape[] {
	const out: Shape[] = [];
	const frets = strings.map(() => -1);
	const walk = (k: number, from: number, above: number): void => {
		if (k === count) {
			const shape = shapeFrom(frets);
			if (withinLimits(shape, 1, true)) out.push(shape);
			return;
		}
		for (let s = from; s <= strings.length - (count - k); s++) {
			const open = strings[s] as number;
			for (const f of at(k, open)) {
				if (f < 0 || f > LAST_FRET || open + f <= above) continue;
				frets[s] = f;
				walk(k + 1, s + 1, open + f);
			}
			frets[s] = -1;
		}
	};
	if (count > 0) walk(0, 0, -Infinity);
	return out.sort(better);
}

/** Fingerings that sound exactly these MIDI notes (a repeated pitch has none), one a string, strings ascending; muted strings between them allowed. Best first. */
export function exactShapes(notes: readonly number[], tuning: Tuning = GUITAR): Shape[] {
	const sorted = [...notes].sort((a, b) => a - b);
	return place(tuning.strings, sorted.length, (k, open) => [(sorted[k] as number) - open]);
}

/** Fingerings that sound these pitch classes in this order, low to high, one a string, octaves free. Best first. */
export function orderedShapes(pitchClasses: readonly number[], tuning: Tuning = GUITAR): Shape[] {
	return place(tuning.strings, pitchClasses.length, (k, open) => {
		const f = ((pitchClasses[k] as number) - open + 120) % 12;
		return [f, f + 12];
	});
}
