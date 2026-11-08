/** A chart's play order as timed notes, in exact quarters (spec 4). */
import type { ChartEvent, ChartParse } from "barmark";
import { applyPushes } from "./figures.js";
import { keysOf } from "./keys.js";
import { lineNotes, type TimedSlot } from "./line.js";
import { lyricsOf } from "./lyrics.js";
import { markersOf, wordsOf } from "./marks.js";
import { pedalEvents } from "./pedal.js";
import { add, barQuarters, cmp, slotQuarters, sub, toNumber, ZERO } from "./quarters.js";
import { swingLine, swingMap } from "./swing.js";
import { type TimedBar, tempoMap } from "./tempo.js";
import type { MidiLoss, Performance, Quarters } from "./types.js";

const BASS_INSTRUMENTS = new Set(["electric bass", "double bass"]);

/** The play order from the events: bars at their onsets, each marked when a fermata follows it, an open repeat's events once. */
function timeline(events: ChartEvent[]): { bars: TimedBar[]; open: number | null } {
	const bars: TimedBar[] = [];
	let at = ZERO;
	let open: number | null = null;
	const walk = (list: ChartEvent[]) => {
		for (const e of list) {
			if (e.kind === "bar") {
				bars.push({ bar: e.bar, at });
				at = add(at, barQuarters(e.bar.meter));
			} else if (e.kind === "fermata") {
				const before = bars.at(-1);
				if (before) before.fermata = true;
			} else {
				const first = bars.length;
				walk(e.events);
				open ??= bars[first]?.bar.index ?? null;
			}
		}
	};
	walk(events);
	return { bars, open };
}

const openLoss = (bar: number): MidiLoss => ({
	code: "open-repeat",
	message: "an open repeat (x ...) plays once: MIDI can't repeat as needed",
	bar,
});

/** The chart's play order performed: one track, "Chart", on piano, with the tempo map, keys and markers. */
export function perform(parse: ChartParse, options: { tempo?: number } = {}): Performance {
	const { bars: timed, open } = timeline(parse.events);
	const bars: Performance["bars"] = timed.map(({ bar, at }) => ({
		index: bar.index,
		at,
		meter: bar.meter,
	}));
	const slots: TimedSlot[] = timed.flatMap(({ bar, at }) =>
		slotQuarters(bar.slots, bar.meter).map((s) => ({
			slot: s.slot,
			at: add(at, s.at),
			length: s.length,
		})),
	);
	const last = timed.at(-1);
	const end = last ? add(last.at, barQuarters(last.bar.meter)) : ZERO;
	const instrument = parse.parts[0]?.instrument;
	const tempo = tempoMap(timed, options);
	const keys = keysOf(timed);
	// Pushes land first, then swing moves every point once (3.6).
	const pushed = applyPushes(slots);
	const { swing, losses } = swingMap(timed, pushed);
	const line = swingLine(pushed, swing);
	const swung = <T extends { at: Quarters }>(items: T[]) =>
		items.map((e) => ({ ...e, at: swing(e.at) }));
	return {
		title: parse.title,
		credits: parse.credits,
		bars,
		tempos: tempo.tempos,
		keys: keys.keys,
		markers: markersOf(parse, bars),
		tracks: [
			{
				name: "Chart",
				part: null,
				line: null,
				role: "line",
				program: 1,
				notes: lineNotes(line, instrument !== undefined && BASS_INSTRUMENTS.has(instrument)),
				pedal: swung(pedalEvents(parse, null)),
				lyrics: swung(timed.flatMap(({ bar, at }) => lyricsOf(bar, at))),
				words: swung(timed.flatMap(({ bar, at }) => wordsOf(bar, at))),
			},
		],
		end,
		losses: [
			...(open === null ? [] : [openLoss(open)]),
			...tempo.losses,
			...keys.losses,
			...losses,
		],
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
