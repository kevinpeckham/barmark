/**
 * Standard MIDI Files from readable event lists, for the reader's tests.
 * It writes every byte itself (never through src/smf), so a reader test and
 * the writer can't share a mistake; `raw` events, chunk lengths, the
 * header's fields and `cut` make the malformed cases. "The helper writes
 * what midi-file reads" (smf-read.test.ts) checks it against `midi-file`.
 */

type Channel = number;
/** One event, `dt` ticks after the one before. */
export type Event = { dt: number } & (
	| { on: [Channel, number, number] }
	| { off: [Channel, number] }
	| { program: [Channel, number] }
	| { control: [Channel, number, number] }
	/** Quarters a minute, as whole microseconds a quarter. */
	| { tempo: number }
	/** Numerator and denominator (a power of two). */
	| { time: [number, number] }
	/** Sharps or flats (negative), and 1 for minor. */
	| { key: [number, number] }
	| { name: string }
	| { text: string }
	| { marker: string }
	| { lyric: string }
	/** A meta event of this type with these bytes. */
	| { meta: [number, number[]] }
	/** A sysex: `F0`, its length and these bytes. */
	| { sysex: number[] }
	/** Bytes as they are, after the delta time. */
	| { raw: number[] }
);

/** A chunk: an `MTrk` of events (an end-of-track added unless `eot: false`), or any chunk of bytes. */
export type Chunk =
	| Event[]
	| { events: Event[]; eot?: boolean; length?: number }
	| { id: string; bytes: number[]; length?: number };

export type SmfSpec = {
	format?: number;
	ppq?: number;
	/** The division as written, in place of `ppq` (SMPTE, 0). */
	division?: number;
	/** The header's track count, in place of the number of track chunks. */
	ntracks?: number;
	tracks: Chunk[];
	/** Leave out a channel status byte equal to the last one written in the track (meta and sysex between keep it). */
	running?: boolean;
	/** Drop this many bytes from the end of the file. */
	cut?: number;
};

const utf8 = new TextEncoder();

function vlq(n: number): number[] {
	const bytes = [n & 0x7f];
	for (let rest = Math.floor(n / 128); rest > 0; rest = Math.floor(rest / 128))
		bytes.unshift((rest & 0x7f) | 0x80);
	return bytes;
}
const u16 = (n: number) => [(n >>> 8) & 0xff, n & 0xff];
const u32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const ascii = (id: string) => Array.from(id, (c) => c.charCodeAt(0));
const meta = (type: number, data: ArrayLike<number>) => [
	0xff,
	type,
	...vlq(data.length),
	...Array.from(data),
];

type Bytes = { status?: number; rest: number[] };
type Triple = [number, number, number];
type Pair = [number, number];
const text = (type: number) => (t: string) => ({ rest: meta(type, utf8.encode(t)) });

/** Each kind of event: its status byte (for a channel event) and the bytes after it. */
const ENCODE: Record<string, (value: never) => Bytes> = {
	on: ([ch, pitch, velocity]: Triple) => ({ status: 0x90 | ch, rest: [pitch, velocity] }),
	off: ([ch, pitch]: Pair) => ({ status: 0x80 | ch, rest: [pitch, 64] }),
	program: ([ch, program]: Pair) => ({ status: 0xc0 | ch, rest: [program] }),
	control: ([ch, control, value]: Triple) => ({ status: 0xb0 | ch, rest: [control, value] }),
	tempo: (qpm: number) => {
		const micros = Math.round(60_000_000 / qpm);
		return { rest: meta(0x51, [(micros >> 16) & 0xff, (micros >> 8) & 0xff, micros & 0xff]) };
	},
	time: ([n, d]: Pair) => ({ rest: meta(0x58, [n, Math.log2(d), 24, 8]) }),
	key: ([sf, mi]: Pair) => ({ rest: meta(0x59, [sf & 0xff, mi]) }),
	name: text(0x03),
	text: text(0x01),
	marker: text(0x06),
	lyric: text(0x05),
	meta: ([type, data]: [number, number[]]) => ({ rest: meta(type, data) }),
	sysex: (data: number[]) => ({ rest: [0xf0, ...vlq(data.length), ...data] }),
	raw: (bytes: number[]) => ({ rest: bytes }),
};

function body(e: Event): Bytes {
	const [kind = "raw", value = []] = Object.entries(e).find(([key]) => key !== "dt") ?? [];
	return (ENCODE[kind] as (value: unknown) => Bytes)(value);
}

function trackBytes(events: Event[], eot: boolean, running: boolean): number[] {
	const out: number[] = [];
	let last = -1;
	for (const e of [...events, ...(eot ? [{ dt: 0, meta: [0x2f, []] } as Event] : [])]) {
		out.push(...vlq(e.dt));
		const { status, rest } = body(e);
		if (status !== undefined && !(running && status === last)) out.push(status);
		last = status ?? ("raw" in e ? -1 : last);
		for (const b of rest) out.push(b);
	}
	return out;
}

function chunkBytes(chunk: Chunk, running: boolean): number[] {
	if (Array.isArray(chunk)) return chunkBytes({ events: chunk }, running);
	const [id, bytes] =
		"id" in chunk
			? [chunk.id, chunk.bytes]
			: ["MTrk", trackBytes(chunk.events, chunk.eot ?? true, running)];
	const out = [...ascii(id), ...u32(chunk.length ?? bytes.length)];
	for (const b of bytes) out.push(b);
	return out;
}

/** The file's bytes. */
export function smf(spec: SmfSpec): Uint8Array {
	const out = [
		...ascii("MThd"),
		...u32(6),
		...u16(spec.format ?? 1),
		...u16(spec.ntracks ?? spec.tracks.length),
		...u16(spec.division ?? spec.ppq ?? 480),
	];
	for (const chunk of spec.tracks)
		for (const b of chunkBytes(chunk, spec.running ?? false)) out.push(b);
	return Uint8Array.from(out.slice(0, out.length - (spec.cut ?? 0)));
}
