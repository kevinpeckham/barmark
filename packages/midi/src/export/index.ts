/** `exportMidi` (spec 2, 3): a chart's performance as a format 1 Standard MIDI File. */
import {
	beatsOf,
	type ChartDiagnostic,
	type ChartParse,
	extractPart,
	type Meter,
	parseChart,
} from "barmark";
import { keyFifths } from "../perform/keys.js";
import { perform } from "../perform/perform.js";
import { add, barQuarters, cmp, toNumber } from "../perform/quarters.js";
import type { MidiLoss, Performance, PerformedTrack, Quarters } from "../perform/types.js";
import type { Smf, SmfEvent } from "../smf/types.js";
import { keyMeta, metaText, tempoMeta, tempoMicros, timeMeta, writeSmf } from "../smf/write.js";
import { assignChannels } from "./channels.js";
import { divisionFor, MAX_TICK, ticker } from "./ticks.js";

export type MidiExportOptions = {
	/** Only this part, as `extractPart` gives it. */
	part?: string;
	/** The title when the chart has none (the CLI passes the file name). */
	title?: string;
	/** Beats a minute, counting grammar 2.1's beat, for a chart with no tempo (default 120). */
	tempo?: number;
};
export type MidiExportResult =
	| { ok: true; bytes: Uint8Array; diagnostics: ChartDiagnostic[]; losses: MidiLoss[] } // warnings only
	| { ok: false; diagnostics: ChartDiagnostic[] }; // at least one error

const TEXT = 0x01;
const COPYRIGHT = 0x02;
const TRACK_NAME = 0x03;
const LYRIC = 0x05;
const MARKER = 0x06;
const SUSTAIN = 64;
const END_OF_TRACK = 0x2f;

const error = (message: string, token = ""): ChartDiagnostic => ({
	line: 0,
	severity: "error",
	message,
	token,
});
const NO_BARS = error("the chart has no bars to export");
const TOO_LONG = error("the chart is too long for a MIDI file to hold");

/** A pitch moved by octaves into MIDI's 0–127 (only a long note set with no octaves leaves it). */
function fold(pitch: number): number {
	if (pitch > 127) return pitch - 12 * Math.ceil((pitch - 127) / 12);
	return pitch < 0 ? pitch + 12 * Math.ceil(-pitch / 12) : pitch;
}
/** A key signature beyond seven sharps or flats, as its enharmonic within them (B# major is C major's). */
const foldFifths = (fifths: number) =>
	fifths > 7 ? fifths - 12 : fifths < -7 ? fifths + 12 : fifths;

/** The played bar a time falls in, for a loss. */
const barAt = (p: Performance, at: Quarters): number =>
	(p.bars.findLast((b) => cmp(b.at, at) <= 0) ?? p.bars[0])?.index ?? 1;

const sameMeter = (a: Meter | undefined, b: Meter) => a?.n === b.n && a?.d === b.d;

type Tick = (at: Quarters) => number;

/** MIDI clocks a metronome click: 24 a quarter, a click a beat (grammar 2.1), so 6/8 clicks on dotted quarters. */
const clicksOf = (meter: Meter) => (24 * toNumber(barQuarters(meter))) / beatsOf(meter);

/** Track 1 (spec 3.3): the title, credits, tempo map, time and key signatures, and markers. */
function conductor(p: Performance, title: string | null, tick: Tick): SmfEvent[] {
	const events: SmfEvent[] = title === null ? [] : [metaText(0, TRACK_NAME, title)];
	for (const line of p.credits.copyright) events.push(metaText(0, COPYRIGHT, line));
	for (const [role, name] of [
		["composer", "Composer"],
		["lyricist", "Lyricist"],
		["arranger", "Arranger"],
	] as const)
		for (const who of p.credits[role]) events.push(metaText(0, TEXT, `${name}: ${who}`));
	for (const t of p.tempos) events.push(tempoMeta(tick(t.at), t.qpm));
	p.bars.forEach((b, i) => {
		if (!sameMeter(p.bars[i - 1]?.meter, b.meter))
			events.push(timeMeta(tick(b.at), b.meter, clicksOf(b.meter)));
	});
	for (const { at, key } of p.keys) {
		const { fifths, minor } = keyFifths(key);
		events.push(keyMeta(tick(at), foldFifths(fifths), minor));
	}
	for (const m of p.markers) events.push(metaText(tick(m.at), MARKER, m.text));
	return events;
}

/** One performed track's events on its channel: name, program, notes, pedal, lyrics and words. */
function trackEvents(
	t: PerformedTrack,
	channel: number,
	ticks: ReturnType<typeof ticker>,
): SmfEvent[] {
	const { tick, span } = ticks;
	const events: SmfEvent[] = [
		metaText(0, TRACK_NAME, t.name),
		{ tick: 0, kind: "program", channel, program: t.program - 1 },
	];
	for (const n of t.notes) {
		const [on, off] = span(n.at, add(n.at, n.length));
		const pitch = fold(n.pitch);
		events.push(
			{ tick: on, kind: "on", channel, pitch, velocity: n.velocity },
			{ tick: off, kind: "off", channel, pitch, velocity: 64 },
		);
	}
	for (const e of t.pedal)
		events.push({
			tick: tick(e.at),
			kind: "control",
			channel,
			control: SUSTAIN,
			value: e.down ? 127 : 0,
		});
	for (const l of t.lyrics) events.push(metaText(tick(l.at), LYRIC, l.text));
	for (const w of t.words) events.push(metaText(tick(w.at), TEXT, w.text));
	return events;
}

/** The losses the file adds to the performance's: a tempo clamped, channels shared, ticks rounded. */
function fileLosses(
	p: Performance,
	shared: boolean,
	rounded: { at: Quarters; ppq: number } | null,
): MidiLoss[] {
	const clamped = p.tempos.find((t) => tempoMicros(t.qpm).clamped);
	const losses: MidiLoss[] = [];
	if (clamped)
		losses.push({
			code: "tempo-range",
			message: `a tempo of ${clamped.qpm} quarters a minute is beyond what MIDI can hold: clamped`,
			bar: barAt(p, clamped.at),
		});
	if (shared)
		losses.push({
			code: "channels-shared",
			message:
				"more than 15 tracks: a part's lines share a channel, and channels repeat beyond 15 parts",
		});
	if (rounded)
		losses.push({
			code: "ticks-rounded",
			message: `a rhythm finer than the file's ${rounded.ppq} ticks a quarter is rounded to the nearest tick`,
			bar: barAt(p, rounded.at),
		});
	return losses;
}

const roundedAt = (at: Quarters | null, ppq: number) => (at === null ? null : { at, ppq });

/** Each loss code once, at the first bar it happened in. */
function once(losses: MidiLoss[]): MidiLoss[] {
	const first = new Map<string, MidiLoss>();
	for (const loss of losses) {
		const seen = first.get(loss.code);
		if (!seen || (loss.bar ?? Infinity) < (seen.bar ?? Infinity)) first.set(loss.code, loss);
	}
	return [...first.values()];
}

/** The chart, or the part asked for, parsed; or why there is nothing to export (spec 3.9). */
function parsed(
	text: string,
	options: MidiExportOptions,
): { ok: true; parse: ChartParse } | { ok: false; diagnostics: ChartDiagnostic[] } {
	const part = options.part;
	const parse = part === undefined ? parseChart(text) : extractPart(text, part);
	if (parse === null)
		return {
			ok: false,
			diagnostics: [error(`no part labelled ${part}`, part), ...parseChart(text).diagnostics],
		};
	if (parse.diagnostics.some((d) => d.severity === "error"))
		return { ok: false, diagnostics: parse.diagnostics };
	if (parse.bars.length === 0) return { ok: false, diagnostics: [NO_BARS, ...parse.diagnostics] };
	return { ok: true, parse };
}

/**
 * The file `exportMidi` writes, as events: a conductor track, then one
 * track per performed track; with the chart's diagnostics and the losses.
 */
export function midiOf(
	text: string,
	options: MidiExportOptions = {},
):
	| { ok: true; smf: Smf; diagnostics: ChartDiagnostic[]; losses: MidiLoss[] }
	| { ok: false; diagnostics: ChartDiagnostic[] } {
	const read = parsed(text, options);
	if (!read.ok) return read;
	const { parse } = read;
	const p = perform(parse, options.tempo === undefined ? {} : { tempo: options.tempo });
	if (toNumber(p.end) * 480 >= MAX_TICK)
		return { ok: false, diagnostics: [TOO_LONG, ...parse.diagnostics] };
	const { ppq } = divisionFor(p);
	const ticks = ticker(ppq);
	const { channels, shared } = assignChannels(p.tracks);
	const end = ticks.tick(p.end);
	const close = (events: SmfEvent[]): SmfEvent[] => [
		...events,
		{ tick: end, kind: "meta", type: END_OF_TRACK, data: new Uint8Array() },
	];
	const tracks = [
		close(conductor(p, parse.title ?? options.title ?? null, ticks.tick)),
		...p.tracks.map((t, i) => close(trackEvents(t, channels[i] as number, ticks))),
	];
	return {
		ok: true,
		smf: { format: 1, ppq, tracks },
		diagnostics: parse.diagnostics,
		losses: once([...p.losses, ...fileLosses(p, shared, roundedAt(ticks.firstRounded(), ppq))]),
	};
}

/** A chart's play order as a format 1 Standard MIDI File, or its diagnostics when it has an error. Never throws. */
export function exportMidi(text: string, options: MidiExportOptions = {}): MidiExportResult {
	const midi = midiOf(text, options);
	if (!midi.ok) return midi;
	const { smf, diagnostics, losses } = midi;
	return { ok: true, bytes: writeSmf(smf), diagnostics, losses };
}
