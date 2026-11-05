/**
 * `readMxl`: a compressed MusicXML file (`.mxl`, a zip archive) unpacked to
 * its score's text, with no dependency: the zip directory is read here and
 * entries are inflated by the platform's `DecompressionStream`. The archive
 * is untrusted, so the work is bounded: a limit on entries and on each
 * entry's size (checked while inflating, never trusting the size claimed),
 * every offset checked against the file, and ZIP64 and encrypted entries
 * refused.
 */
import { parseXml, type XNode } from "./tree.js";

/** How much an archive may hold: entries in its directory, and bytes in one unpacked entry. */
export type MxlLimits = { entries: number; bytes: number };

const LIMITS: MxlLimits = { entries: 1000, bytes: 64 * 1024 * 1024 };

/**
 * The platform's stream and text APIs, typed here: the package builds
 * against ESNext alone (no DOM or Node types), and Bun, Node and browsers
 * all provide them. `DecompressionStream` may be missing (Node before 18)
 * or refuse "deflate-raw" (before 20.12).
 */
type Platform = {
	DecompressionStream?: new (
		format: "deflate-raw",
	) => {
		readable: {
			getReader(): {
				read(): Promise<{ done: true } | { done: false; value: Uint8Array }>;
				cancel(): Promise<void>;
			};
		};
		writable: { getWriter(): { write(chunk: Uint8Array): Promise<void>; close(): Promise<void> } };
	};
	TextDecoder: new (
		label: string,
		options?: { fatal: boolean },
	) => { decode(bytes: Uint8Array): string };
};
const platform = globalThis as unknown as Platform;

const EOCD = 0x06054b50;
const ZIP64_LOCATOR = 0x07064b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const EOCD_SIZE = 22;
const CENTRAL_SIZE = 46;
const LOCAL_SIZE = 30;
const MAX_COMMENT = 0xffff;
const STORED = 0;
const DEFLATED = 8;

const NO_DIRECTORY = "not a .mxl file: no zip directory (the file may be truncated)";
const ZIP64 = "ZIP64 .mxl files aren't supported";
const NEEDS_NODE = "reading .mxl needs Node 20.12 or later";
const damaged = (what: string) => `the .mxl is damaged: ${what}`;

type Entry = {
	name: string;
	flags: number;
	method: number;
	compressed: number;
	declared: number;
	offset: number;
};

/** The archive's bytes, read little-endian with every read in bounds. */
class Bytes {
	private readonly view: DataView;
	constructor(readonly bytes: Uint8Array) {
		this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	}
	get length(): number {
		return this.bytes.length;
	}
	fits(at: number, size: number): boolean {
		return at >= 0 && size >= 0 && at + size <= this.bytes.length;
	}
	u16(at: number): number {
		return this.view.getUint16(at, true);
	}
	u32(at: number): number {
		return this.view.getUint32(at, true);
	}
	slice(at: number, size: number): Uint8Array {
		return this.bytes.subarray(at, at + size);
	}
}

/** Where the end-of-directory record starts, searching back over a comment of at most 64 KiB. */
function findEnd(b: Bytes): number {
	const last = b.length - EOCD_SIZE;
	for (let at = last; at >= 0 && at >= last - MAX_COMMENT; at--)
		if (b.u32(at) === EOCD && at + EOCD_SIZE + b.u16(at + 20) <= b.length) return at;
	throw new Error(NO_DIRECTORY);
}

const names = new platform.TextDecoder("utf-8");

function readEntry(b: Bytes, at: number, end: number): Entry {
	if (!b.fits(at, CENTRAL_SIZE) || at + CENTRAL_SIZE > end || b.u32(at) !== CENTRAL)
		throw new Error(damaged("its directory is malformed"));
	const nameLength = b.u16(at + 28);
	if (at + CENTRAL_SIZE + nameLength > end) throw new Error(damaged("its directory is malformed"));
	const entry: Entry = {
		flags: b.u16(at + 8),
		method: b.u16(at + 10),
		compressed: b.u32(at + 20),
		declared: b.u32(at + 24),
		offset: b.u32(at + 42),
		name: names.decode(b.slice(at + CENTRAL_SIZE, nameLength)),
	};
	if ([entry.compressed, entry.declared, entry.offset].includes(0xffffffff)) throw new Error(ZIP64);
	return entry;
}

/** Where the directory is and how many entries it lists, from its end record, checked. */
function bounds(b: Bytes, limits: MxlLimits): { start: number; end: number; count: number } {
	const record = findEnd(b);
	const count = b.u16(record + 10);
	const size = b.u32(record + 12);
	const start = b.u32(record + 16);
	const locator = record >= 20 && b.u32(record - 20) === ZIP64_LOCATOR;
	// A ZIP64 archive's end record holds these saturated values, the real ones elsewhere.
	const saturated = count === 0xffff || size === 0xffffffff || start === 0xffffffff;
	if (locator || saturated) throw new Error(ZIP64);
	if (count > limits.entries) throw new Error(`the .mxl holds more than ${limits.entries} files`);
	if (!b.fits(start, size) || start + size > record)
		throw new Error(damaged("its directory runs past the end of the file"));
	return { start, end: start + size, count };
}

/** The archive's directory: each entry's name, flags, method, sizes and where its data is. */
function directory(b: Bytes, limits: MxlLimits): Entry[] {
	const { start, end, count } = bounds(b, limits);
	const entries: Entry[] = [];
	let at = start;
	for (let i = 0; i < count; i++) {
		entries.push(readEntry(b, at, end));
		at += CENTRAL_SIZE + b.u16(at + 28) + b.u16(at + 30) + b.u16(at + 32);
	}
	return entries;
}

function sizeText(n: number): string {
	const MiB = 1024 * 1024;
	if (n >= MiB && n % MiB === 0) return `${n / MiB} MiB`;
	if (n >= 1024 && n % 1024 === 0) return `${n / 1024} KiB`;
	return `${n} bytes`;
}

const tooLarge = (e: Entry, limits: MxlLimits) =>
	new Error(`${e.name} in the .mxl is larger than ${sizeText(limits.bytes)}`);

/** An entry's stored bytes, every offset checked against the file. */
function dataOf(b: Bytes, e: Entry): Uint8Array {
	const past = damaged(`${e.name} runs past the end of the file`);
	if (!b.fits(e.offset, LOCAL_SIZE) || b.u32(e.offset) !== LOCAL) throw new Error(past);
	const start = e.offset + LOCAL_SIZE + b.u16(e.offset + 26) + b.u16(e.offset + 28);
	if (!b.fits(start, e.compressed)) throw new Error(past);
	return b.slice(start, e.compressed);
}

function decompressor() {
	try {
		if (!platform.DecompressionStream) throw new Error(NEEDS_NODE);
		return new platform.DecompressionStream("deflate-raw");
	} catch {
		// Missing, or too old to know "deflate-raw" (Node before 20.12).
		throw new Error(NEEDS_NODE);
	}
}

/** Raw deflate inflated, stopping as soon as the output passes the limit. */
async function inflate(data: Uint8Array, e: Entry, limits: MxlLimits): Promise<Uint8Array> {
	const stream = decompressor();
	const writer = stream.writable.getWriter();
	// Errors surface on the reading side; these promises only settle the writer.
	writer.write(data).catch(() => {});
	writer.close().catch(() => {});
	const reader = stream.readable.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const read = await reader.read().catch(() => {
			throw new Error(damaged(`${e.name}'s compressed data is corrupt`));
		});
		if (read.done) break;
		total += read.value.length;
		if (total > limits.bytes) {
			await reader.cancel().catch(() => {});
			throw tooLarge(e, limits);
		}
		chunks.push(read.value);
	}
	const out = new Uint8Array(total);
	let at = 0;
	for (const c of chunks) {
		out.set(c, at);
		at += c.length;
	}
	return out;
}

/** UTF-8, or UTF-16 when a byte-order mark says so (XML's rule for UTF-16). */
function decode(bytes: Uint8Array, e: Entry): string {
	const [a, b] = bytes;
	const encoding =
		a === 0xff && b === 0xfe ? "utf-16le" : a === 0xfe && b === 0xff ? "utf-16be" : "utf-8";
	try {
		return new platform.TextDecoder(encoding, { fatal: true }).decode(bytes);
	} catch {
		throw new Error(`${e.name} in the .mxl isn't UTF-8 or UTF-16 text`);
	}
}

/** One entry's text, refusing what can't or shouldn't be unpacked. */
async function textOf(b: Bytes, e: Entry, limits: MxlLimits): Promise<string> {
	if (e.flags & 1) throw new Error(`${e.name} in the .mxl is encrypted`);
	if (e.method !== STORED && e.method !== DEFLATED)
		throw new Error(
			`${e.name} in the .mxl uses compression method ${e.method}; only stored and deflated are read`,
		);
	if (e.declared > limits.bytes) throw tooLarge(e, limits);
	const data = dataOf(b, e);
	if (e.method === STORED && data.length > limits.bytes) throw tooLarge(e, limits);
	return decode(e.method === STORED ? data : await inflate(data, e, limits), e);
}

function firstRootfile(node: XNode): string | null {
	if (node.name === "rootfile" && node.attrs["full-path"]) return node.attrs["full-path"];
	for (const c of node.children) {
		const found = firstRootfile(c);
		if (found) return found;
	}
	return null;
}

const isScore = (name: string) => !name.startsWith("META-INF/") && /\.(musicxml|xml)$/i.test(name);

/** The score's entry: `META-INF/container.xml`'s first rootfile, else the first `.musicxml` or `.xml`. */
async function rootEntry(b: Bytes, entries: Entry[], limits: MxlLimits): Promise<Entry> {
	const container = entries.find((e) => e.name === "META-INF/container.xml");
	const root = container ? parseXml(await textOf(b, container, limits)) : null;
	const path = root ? firstRootfile(root)?.replace(/^\/+/, "") : undefined;
	if (path) {
		const named = entries.find((e) => e.name === path);
		if (!named)
			throw new Error(`the .mxl's container.xml names ${path}, which isn't in the archive`);
		return named;
	}
	const first = entries.find((e) => isScore(e.name));
	if (!first) throw new Error("no MusicXML file in the .mxl");
	return first;
}

/** `readMxl` with its limits open to tests. */
export async function unpackMxl(bytes: Uint8Array, limits: MxlLimits = LIMITS): Promise<string> {
	const b = new Bytes(bytes);
	if (b.length < EOCD_SIZE) throw new Error(NO_DIRECTORY);
	const entries = directory(b, limits);
	return textOf(b, await rootEntry(b, entries, limits), limits);
}

/**
 * The MusicXML text inside a compressed `.mxl` file. Rejects, never throws,
 * with an `Error` naming the problem: not a zip, damaged, too large, ZIP64,
 * encrypted, or holding no score. Inflating needs `DecompressionStream`
 * with `"deflate-raw"` (Node 20.12 or later, Bun, browsers).
 */
export function readMxl(bytes: Uint8Array): Promise<string> {
	return unpackMxl(bytes);
}
