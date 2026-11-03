/** The measures a part writes, in written order: what the XML writer draws from. */
import type { ChartParse, Key, Meter, PlayedBar, Slot, Words } from "barmark";

/** What shapes the timeline around a measure; Task 6 fills it in. */
export type Marks = Record<string, never>;

export type Measure = {
	/** barmark's written number, shown as the measure's number. */
	shown: number;
	meter: Meter;
	key: Key | null;
	slots: Slot[];
	words: Words[];
	/** The part rests here (grammar 7.4). */
	tacet: boolean;
	marks: Marks;
};

/** The bars as written, each once, with `%` resolved as the parser played it. */
export function writtenMeasures(parse: ChartParse): Measure[] {
	const played = new Map<number, PlayedBar>();
	for (const b of parse.bars) if (!played.has(b.written)) played.set(b.written, b);
	return [...played.values()]
		.sort((a, b) => a.written - b.written)
		.map((b) => ({
			shown: b.written,
			meter: b.meter,
			key: b.key,
			slots: b.slots,
			words: b.words ?? [],
			tacet: b.tacet === true,
			marks: {},
		}));
}
