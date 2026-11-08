/** A chart's play order as timed notes, in exact quarters (spec 4). */
import { beatsOf, type ChartEvent, type ChartParse, type PlayedBar } from "barmark";
import { lineNotes, type TimedSlot } from "./line.js";
import { add, barQuarters, cmp, mul, q, slotQuarters, sub, toNumber, ZERO } from "./quarters.js";
import type { Performance, Quarters } from "./types.js";

const BASS_INSTRUMENTS = new Set(["electric bass", "double bass"]);

/** The played bars in order from the events: fermatas skipped for now, an open repeat's events once. */
function playedBars(events: ChartEvent[]): PlayedBar[] {
	return events.flatMap((e) =>
		e.kind === "bar" ? [e.bar] : e.kind === "open" ? playedBars(e.events) : [],
	);
}

/** One beat of a meter in quarters: a dotted quarter in 6/8, 9/8 and 12/8. */
const beatQuarters = (bar: PlayedBar) => mul(barQuarters(bar.meter), q(1, beatsOf(bar.meter)));

/** The chart's play order performed: one track, "Chart", on piano, at one tempo. */
export function perform(parse: ChartParse, options: { tempo?: number } = {}): Performance {
	const played = playedBars(parse.events);
	const bars: Performance["bars"] = [];
	const slots: TimedSlot[] = [];
	let at = ZERO;
	for (const bar of played) {
		bars.push({ index: bar.index, at, meter: bar.meter });
		for (const s of slotQuarters(bar.slots, bar.meter))
			slots.push({ slot: s.slot, at: add(at, s.at), length: s.length });
		at = add(at, barQuarters(bar.meter));
	}
	const first = played[0];
	const bpm = options.tempo ?? 120;
	const qpm = first ? bpm * toNumber(beatQuarters(first)) : bpm;
	const instrument = parse.parts[0]?.instrument;
	return {
		title: parse.title,
		credits: parse.credits,
		bars,
		tempos: [{ at: ZERO, qpm }],
		keys: [],
		markers: [],
		tracks: [
			{
				name: "Chart",
				part: null,
				line: null,
				role: "line",
				program: 1,
				notes: lineNotes(slots, instrument !== undefined && BASS_INSTRUMENTS.has(instrument)),
				pedal: [],
				lyrics: [],
				words: [],
			},
		],
		end: at,
		losses: [],
	};
}

/** Seconds from the start at a point, through the tempo map. */
export function secondsAt(p: Performance, at: Quarters): number {
	let seconds = 0;
	for (const [i, t] of p.tempos.entries()) {
		if (cmp(t.at, at) >= 0) break;
		const next = p.tempos[i + 1]?.at;
		const until = next && cmp(next, at) < 0 ? next : at;
		seconds += (toNumber(sub(until, t.at)) * 60) / t.qpm;
	}
	return seconds;
}
