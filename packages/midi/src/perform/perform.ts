/** A chart's play order as timed notes, in exact quarters (spec 4). */
import type { ChartEvent, ChartParse, SimpleSlot } from "barmark";
import { applyPushes } from "./figures.js";
import { keysOf } from "./keys.js";
import { lineNotes, type TimedSlot } from "./line.js";
import { lyricsOf } from "./lyrics.js";
import { markersOf, wordsOf } from "./marks.js";
import { pedalEvents } from "./pedal.js";
import { add, barQuarters, cmp, slotQuarters, sub, toNumber, ZERO } from "./quarters.js";
import { swingLine, swingMap } from "./swing.js";
import { type TimedBar, tempoMap } from "./tempo.js";
import { type Stream, streamBar, type TrackPlan, tracksOf } from "./tracks.js";
import type { MidiLoss, Performance, PerformedTrack, Quarters } from "./types.js";

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

/** A rest's stand-in: where a line rests or its part is tacet, an N.C. fills the bar, as the parse writes a tacet bar. */
const REST: SimpleSlot = { kind: "nc" };

/** A line's slots in play order at their onsets; an N.C. for each bar where it doesn't play. */
function streamSlots(timed: TimedBar[], stream: Stream): TimedSlot[] {
	return timed.flatMap(({ bar, at }) =>
		slotQuarters(streamBar(bar, stream)?.slots ?? [REST], bar.meter).map((s) => ({
			...s,
			at: add(at, s.at),
		})),
	);
}

/** A line as written and as pushed (3.6), and where each pushed onset moved to. */
type Played = { pushed: TimedSlot[]; moved: (at: Quarters) => Quarters };

function played(line: TimedSlot[]): Played {
	const pushed = applyPushes(line);
	const key = (at: Quarters) => `${at.n}/${at.d}`;
	const moved = new Map<string, Quarters>();
	line.forEach((t, i) => {
		const to = pushed[i]?.at;
		if (to && cmp(to, t.at) !== 0) moved.set(key(t.at), to);
	});
	return { pushed, moved: (at) => moved.get(key(at)) ?? at };
}

/**
 * The track each part's lyrics go to (3.8): its singing line's, else its
 * first track; the first track for lyrics no part sings.
 */
function singerOf(
	parse: ChartParse,
	plans: TrackPlan[],
): (label?: string) => TrackPlan | undefined {
	return (label) => {
		if (label === undefined) return plans[0];
		const i = parse.parts.findIndex((p) => p.label?.toLowerCase() === label.toLowerCase());
		const sings = parse.parts[i]?.sings;
		const own = plans.filter((t) => i >= 0 && t.partIndex === i);
		const line = own.find((t) => t.role === "line" && (t.streams[0]?.line ?? "") === sings);
		return line ?? own[0] ?? plans[0];
	};
}

/** Everything a track reads: the played bars, each line played, the swing, and who sings. */
type Context = {
	timed: TimedBar[];
	lines: Map<Stream, Played>;
	swing: (at: Quarters) => Quarters;
	singer: (label?: string) => TrackPlan | undefined;
	parse: ChartParse;
};

/** A plan performed: its lines' notes, its part's pedal, its lines' words and the lyrics it sings, swung. */
function performTrack(plan: TrackPlan, ctx: Context): PerformedTrack {
	const { timed, lines, swing } = ctx;
	const lineOf = (s: Stream) => lines.get(s) as Played;
	const swung = <T extends { at: Quarters }>(items: T[], moved: Played["moved"] = (at) => at) =>
		items.map((e) => ({ ...e, at: swing(moved(e.at)) }));
	const words = plan.words.flatMap((s) =>
		swung(
			timed.flatMap(({ bar, at }) => {
				const own = streamBar(bar, s);
				return own ? wordsOf(own, bar.meter, at) : [];
			}),
			lineOf(s).moved,
		),
	);
	// Lyrics move with the singing line's pushed notes.
	const singing = plan.role === "line" ? plan.streams[0] : undefined;
	const lyrics = timed.flatMap(({ bar, at }) =>
		lyricsOf(
			(bar.lyrics ?? []).filter((l) => ctx.singer(l.part) === plan),
			at,
		),
	);
	return {
		name: plan.name,
		part: plan.part,
		line: plan.line,
		role: plan.role,
		program: plan.program,
		notes: plan.streams
			.flatMap((s) => lineNotes(swingLine(lineOf(s).pushed, swing), plan))
			.sort((a, b) => cmp(a.at, b.at) || a.pitch - b.pitch),
		// The first part's bars are the chart's own (`null`), as are a single part's.
		pedal: swung(pedalEvents(ctx.parse, plan.partIndex === 0 ? null : plan.partIndex)),
		lyrics: swung(lyrics, singing && lineOf(singing).moved),
		words,
	};
}

/**
 * The chart's play order performed (spec 3.3, 4): a track per part line in
 * score order, a melodic part's harmony track, the tempo map, keys and markers.
 */
export function perform(parse: ChartParse, options: { tempo?: number } = {}): Performance {
	const { bars: timed, open } = timeline(parse.events);
	const bars: Performance["bars"] = timed.map(({ bar, at }) => ({
		index: bar.index,
		at,
		meter: bar.meter,
	}));
	const last = timed.at(-1);
	const end = last ? add(last.at, barQuarters(last.bar.meter)) : ZERO;
	const tempo = tempoMap(timed, options);
	const keys = keysOf(timed);
	const plans = tracksOf(parse);
	// Pushes land first, then swing moves every point once (3.6), one map for every line.
	const lines = new Map<Stream, Played>();
	for (const s of plans.flatMap((t) => t.streams)) lines.set(s, played(streamSlots(timed, s)));
	const { swing, losses } = swingMap(
		timed,
		[...lines.values()].flatMap((l) => l.pushed),
	);
	const ctx: Context = { timed, lines, swing, singer: singerOf(parse, plans), parse };
	return {
		title: parse.title,
		credits: parse.credits,
		bars,
		tempos: tempo.tempos,
		keys: keys.keys,
		markers: markersOf(parse, bars),
		tracks: plans.map((plan) => performTrack(plan, ctx)),
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
