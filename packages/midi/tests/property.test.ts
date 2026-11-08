/** Import's property tests (spec 9): the jump charts survive export and import; jitter and legato change nothing. */
import { describe, expect, test } from "bun:test";
import { parseChart } from "barmark";
import { type MidiEvent, parseMidi, writeMidi } from "midi-file";
import { jumpChart } from "../../musicxml/tests/import/jump-charts.js";
import { mulberry32 } from "../../sync/tests/helpers/fuzz.js";
import { exportMidi, importMidi } from "../src/index.js";
import { GENERATOR_FORM } from "./helpers/charts.js";
import { byEar, throughMidi } from "./helpers/voted.js";

/** A 32nd and a 16th at the export's 480 ticks a quarter. */
const ON_JITTER = 60;
const OFF_LEGATO = 120;

const isOff = (e: MidiEvent) => e.type === "noteOff" || (e.type === "noteOn" && e.velocity === 0);

type Timed = { at: number; i: number; e: MidiEvent };

/**
 * A track's events with every note-on moved by up to `ON_JITTER` ticks
 * either way (not before 0) and every note-off up to `OFF_LEGATO` later,
 * by `r`; a note-off never after the next note-on of its pitch, as a key
 * can't sound twice at once.
 */
function jitterTrack(track: MidiEvent[], r: () => number): Timed[] {
	let tick = 0;
	const timed = track.map((e, i): Timed => {
		tick += e.deltaTime;
		if (e.type === "noteOn" && e.velocity > 0)
			return { at: Math.max(0, tick + Math.round((r() * 2 - 1) * ON_JITTER)), i, e };
		if (isOff(e)) return { at: tick + Math.round(r() * OFF_LEGATO), i, e };
		return { at: tick, i, e };
	});
	const key = (e: MidiEvent) => ("noteNumber" in e ? `${e.channel} ${e.noteNumber}` : "");
	const nextOn = new Map<string, number>();
	for (let k = timed.length - 1; k >= 0; k--) {
		const t = timed[k] as Timed;
		if (t.e.type === "noteOn" && t.e.velocity > 0) nextOn.set(key(t.e), t.at);
		else if (isOff(t.e)) t.at = Math.min(t.at, nextOn.get(key(t.e)) ?? t.at);
	}
	return timed;
}

/** The file with each track's notes jittered (`jitterTrack`), its events re-sorted by their new times (a note-off first at a tie), the end of the track last. */
function jittered(bytes: Uint8Array, seed: number): Uint8Array {
	const r = mulberry32(seed);
	const midi = parseMidi(bytes);
	const tracks = midi.tracks.map((track) => {
		const body = jitterTrack(track, r).filter((t) => t.e.type !== "endOfTrack");
		body.sort((a, b) => a.at - b.at || Number(isOff(b.e)) - Number(isOff(a.e)) || a.i - b.i);
		let last = 0;
		const events = body.map(({ at, e }) => {
			const out = { ...e, deltaTime: at - last };
			last = at;
			return out;
		});
		return [...events, { deltaTime: 0, meta: true, type: "endOfTrack" } as MidiEvent];
	});
	return Uint8Array.from(writeMidi({ header: midi.header, tracks }));
}

describe("property", () => {
	test("jump charts survive export and import", () => {
		const failed: string[] = [];
		let charts = 0;
		for (let seed = 1; seed <= 300; seed++) {
			const text = jumpChart(seed);
			if (text === null || parseChart(text).parts.length > 1) continue;
			charts++;
			const { misses } = byEar(parseChart(text), parseChart(throughMidi(text)));
			if (misses.length > 0) failed.push(`seed ${seed}: ${misses.slice(0, 3).join("; ")}`);
		}
		expect(charts).toBeGreaterThan(100);
		expect(failed).toEqual([]);
	});

	// each note-on up to ±60 ticks spreads one chord's notes over a 16th: the attack window
	test("jitter and legato change nothing", () => {
		const failed: string[] = [];
		for (const [name, chart] of GENERATOR_FORM) {
			const out = exportMidi(chart);
			if (!out.ok) throw new Error(name);
			for (let seed = 1; seed <= 50; seed++) {
				const back = importMidi(jittered(out.bytes, seed)).text;
				if (back !== chart) failed.push(`${name}, seed ${seed}: ${JSON.stringify(back)}`);
			}
		}
		expect(failed).toEqual([]);
	});
});
