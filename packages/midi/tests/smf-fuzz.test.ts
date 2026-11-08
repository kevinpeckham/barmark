import { expect, test } from "bun:test";
import { parseChart, printChart } from "barmark";
import { mulberry32 } from "../../sync/tests/helpers/fuzz.js";
import { exportMidi, importMidi } from "../src/index.js";
import { readSmf } from "../src/smf/read.js";
import type { SmfEvent } from "../src/smf/types.js";
import { CHARTS } from "./helpers/charts.js";
import { type Event, smf } from "./helpers/smf.js";

type Rand = () => number;
const int = (r: Rand, n: number) => Math.floor(r() * n);

/** The codes the reader may give. */
const READER_CODES = new Set([
	"not-midi",
	"format-2",
	"smpte",
	"too-large",
	"truncated",
	"track-count",
	"bad-event",
	"meta-invalid",
	"unknown-chunk",
]);
const SEVERITIES = new Set(["error", "warning", "info"]);

const notes: Event[] = Array.from({ length: 24 }, (_, i): Event[] => [
	{ dt: 0, on: [i % 3, 48 + i, 80] },
	{ dt: 0, lyric: `la${i}` },
	{ dt: 240, off: [i % 3, 48 + i] },
]).flat();
const exported = (index: number) => {
	const r = exportMidi(CHARTS[index]?.[1] ?? "");
	if (!r.ok) throw new Error("the base chart doesn't export");
	return r.bytes;
};
/** Well-formed files to mutate. */
const BASES: Uint8Array[] = [
	smf({
		running: true,
		tracks: [
			[
				{ dt: 0, name: "Song" },
				{ dt: 0, tempo: 96 },
				{ dt: 0, time: [3, 4] },
				{ dt: 0, key: [2, 0] },
				{ dt: 0, marker: "Verse" },
			],
			[
				{ dt: 0, name: "Piano" },
				{ dt: 0, program: [0, 0] },
				{ dt: 0, control: [0, 64, 127] },
				...notes,
			],
			[{ dt: 0, sysex: [0x7e, 0x7f, 0x09, 0x01, 0xf7] }, ...notes],
		],
	}),
	smf({ format: 0, tracks: [notes] }),
	exported(0),
	exported(2),
];

/** Where each chunk starts (its id), walking the lengths as written. */
function chunkStarts(bytes: Uint8Array): number[] {
	const starts: number[] = [];
	for (let at = 0; at + 8 <= bytes.length; ) {
		starts.push(at);
		const view = new DataView(bytes.buffer, bytes.byteOffset);
		at += 8 + view.getUint32(at + 4);
	}
	return starts;
}

const MUTATIONS: ((r: Rand, bytes: Uint8Array) => Uint8Array)[] = [
	// Truncate at a random byte.
	(r, bytes) => bytes.slice(0, int(r, bytes.length)),
	// Flip one to eight random bytes.
	(r, bytes) => {
		const out = bytes.slice();
		for (let i = 1 + int(r, 8); i > 0; i--) out[int(r, out.length)] = int(r, 256);
		return out;
	},
	// Set a chunk's length to 0xFFFFFFFF.
	(r, bytes) => {
		const out = bytes.slice();
		const starts = chunkStarts(out);
		const at = starts[int(r, starts.length)];
		if (at === undefined) return out;
		out.set([0xff, 0xff, 0xff, 0xff], at + 4);
		return out;
	},
	// Insert a random event stream into a track, its chunk's length grown to match half the time.
	(r, bytes) => {
		const starts = chunkStarts(bytes).slice(1);
		const chunk = starts[int(r, starts.length)] ?? 14;
		const at = Math.min(bytes.length, chunk + 8 + int(r, 64));
		const stream = Array.from({ length: 1 + int(r, 64) }, () =>
			r() < 0.5 ? int(r, 128) : 0x80 + int(r, 128),
		);
		const out = Uint8Array.from([...bytes.slice(0, at), ...stream, ...bytes.slice(at)]);
		if (r() < 0.5 && chunk + 8 <= bytes.length) {
			const view = new DataView(out.buffer);
			view.setUint32(chunk + 4, view.getUint32(chunk + 4) + stream.length);
		}
		return out;
	},
];

type Read = ReturnType<typeof readSmf>;

/** A diagnostic's track is one of the file's: within those read, or (when the read failed) at least 1. */
const trackInRange = (track: number, r: Read) =>
	Number.isInteger(track) && track >= 1 && (r.smf === null || track <= r.smf.tracks.length);

/** Every diagnostic is one the reader gives, well formed; smf is null exactly on an error. */
function diagnosticsProblem(r: Read): string | null {
	for (const d of r.diagnostics) {
		if (!READER_CODES.has(d.code)) return `unknown code ${d.code}`;
		if (!SEVERITIES.has(d.severity) || d.message === "") return "a malformed diagnostic";
		if (d.track !== undefined && !trackInRange(d.track, r)) return `track ${d.track} out of range`;
	}
	const failed = r.diagnostics.some((d) => d.severity === "error");
	return failed === (r.smf === null) ? null : "smf is null exactly when there is an error";
}

/** An event's ticks don't go back, and its channel and pitch are in range. */
function eventProblem(e: SmfEvent, tick: number): string | null {
	if (!Number.isInteger(e.tick) || e.tick < tick) return `tick ${e.tick} after ${tick}`;
	if ("channel" in e && !(e.channel >= 0 && e.channel <= 15)) return `channel ${e.channel}`;
	if ("pitch" in e && !(e.pitch >= 0 && e.pitch <= 127)) return `pitch ${e.pitch}`;
	return null;
}

function tracksProblem(r: Read): string | null {
	if (r.smf === null) return null;
	if (r.names.length !== r.smf.tracks.length) return "a name for each track";
	for (const track of r.smf.tracks) {
		let tick = 0;
		for (const e of track) {
			const problem = eventProblem(e, tick);
			if (problem !== null) return problem;
			tick = e.tick;
		}
	}
	return null;
}

/** What the reader promises for any bytes: the first broken promise, or null. */
function broken(bytes: Uint8Array): string | null {
	const r = readSmf(bytes);
	return diagnosticsProblem(r) ?? tracksProblem(r);
}

test("2,000 seeded mutations never throw", () => {
	const failures: string[] = [];
	for (let seed = 1; seed <= 2000; seed++) {
		const r = mulberry32(seed);
		let bytes = BASES[int(r, BASES.length)] ?? new Uint8Array();
		for (let n = 1 + int(r, 3); n > 0; n--)
			bytes = (MUTATIONS[int(r, MUTATIONS.length)] ?? ((_, b) => b))(r, bytes);
		try {
			const problem = broken(bytes);
			if (problem !== null) failures.push(`seed ${seed}: ${problem}`);
		} catch (error) {
			failures.push(`seed ${seed}: threw ${error}`);
		}
	}
	expect(failures).toEqual([]);
});

/** What import promises for any bytes: no internal error; "" exactly on an error, else a chart that parses cleanly and prints unchanged. */
function importBroken(bytes: Uint8Array): string | null {
	const r = importMidi(bytes);
	const internal = r.diagnostics.find((d) => d.message.startsWith("internal error"));
	if (internal) return internal.message;
	const failed = r.diagnostics.some((d) => d.severity === "error");
	if (failed) return r.text === "" ? null : "text with an error";
	if (r.text === "") return "no text and no error";
	const errors = parseChart(r.text).diagnostics.filter((d) => d.severity === "error");
	if (errors.length > 0) return `the chart has errors: ${errors[0]?.message}`;
	return printChart(r.text) === r.text ? null : "the chart doesn't print unchanged";
}

test("2,000 seeded mutations import to a valid chart or an error", () => {
	const failures: string[] = [];
	for (let seed = 1; seed <= 2000; seed++) {
		const r = mulberry32(seed);
		let bytes = BASES[int(r, BASES.length)] ?? new Uint8Array();
		for (let n = 1 + int(r, 3); n > 0; n--)
			bytes = (MUTATIONS[int(r, MUTATIONS.length)] ?? ((_, b) => b))(r, bytes);
		const problem = importBroken(bytes);
		if (problem !== null) failures.push(`seed ${seed}: ${problem}`);
	}
	expect(failures).toEqual([]);
}, 120_000);

test("random bytes never throw", () => {
	const failures: string[] = [];
	for (let seed = 1; seed <= 200; seed++) {
		const r = mulberry32(seed);
		const head = r() < 0.5 ? [0x4d, 0x54, 0x68, 0x64] : [];
		const bytes = Uint8Array.from([
			...head,
			...Array.from({ length: int(r, 200) }, () => int(r, 256)),
		]);
		try {
			const problem = broken(bytes);
			if (problem !== null) failures.push(`seed ${seed}: ${problem}`);
		} catch (error) {
			failures.push(`seed ${seed}: threw ${error}`);
		}
	}
	expect(failures).toEqual([]);
});
