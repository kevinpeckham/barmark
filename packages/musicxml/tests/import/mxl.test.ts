import { describe, expect, test } from "bun:test";
import { deflateRawSync } from "node:zlib";
import { unpackMxl } from "../../src/import/mxl.js";
import { readMxl } from "../../src/index.js";

type Entry = {
	name: string;
	data: Uint8Array | string;
	/** 0 stored, 8 deflated (the default), anything else unsupported. */
	method?: number;
	flags?: number;
	/** The uncompressed size the central directory claims; the real one by default. */
	declared?: number;
	compressedSize?: number;
	offset?: number;
	/** Written as a streaming writer does (flag bit 3): sizes zero in the local header, a data descriptor after the data. */
	streamed?: boolean;
};

/** The local header's sizes and what follows the data: a data descriptor for a streamed entry. */
function streaming(e: Entry, sizes: [number, 2 | 4][]) {
	if (!e.streamed) return { local: sizes, after: [] as number[] };
	const zero: [number, 2 | 4][] = [
		[0, 4],
		[0, 4],
		[0, 4],
	];
	return { local: zero, after: fields([0x08074b50, 4], ...sizes) };
}

const utf8 = (s: string) => new TextEncoder().encode(s);

/** Little-endian fields: `[value, bytes]` pairs. */
const fields = (...pairs: [number, 2 | 4][]): number[] =>
	pairs.flatMap(([v, n]) => Array.from({ length: n }, (_, i) => (v >>> (8 * i)) & 0xff));

/** An entry's stored bytes and the size fields both headers carry. */
function packed(e: Entry): { body: Uint8Array; sizes: [number, 2 | 4][] } {
	const raw = typeof e.data === "string" ? utf8(e.data) : e.data;
	const body = (e.method ?? 8) === 8 ? new Uint8Array(deflateRawSync(raw)) : raw;
	// CRC-32 0: the reader doesn't check it.
	return {
		body,
		sizes: [
			[0, 4],
			[e.compressedSize ?? body.length, 4],
			[e.declared ?? raw.length, 4],
		],
	};
}

/** A zip archive of the entries, local headers first, then the central directory and its end. */
function zip(
	entries: Entry[],
	end: { count?: number; cdOffset?: number; zip64Locator?: boolean } = {},
): Uint8Array {
	const locals: number[] = [];
	const central: number[] = [];
	for (const e of entries) {
		const { body, sizes } = packed(e);
		const name = utf8(e.name);
		const flags = (e.flags ?? 0) | (e.streamed ? 8 : 0);
		const lead: [number, 2 | 4][] = [
			[flags, 2],
			[e.method ?? 8, 2],
			[0, 4],
		];
		const head = [...lead, ...sizes];
		const { local, after } = streaming(e, sizes);
		const offset = e.offset ?? locals.length;
		locals.push(
			...fields([0x04034b50, 4], [20, 2], ...lead, ...local, [name.length, 2], [0, 2]),
			...name,
			...body,
			...after,
		);
		central.push(
			...fields(
				[0x02014b50, 4],
				[20, 2],
				[20, 2],
				...head,
				[name.length, 2],
				[0, 2],
				[0, 2],
				[0, 2],
				[0, 2],
				[0, 4],
				[offset, 4],
			),
			...name,
		);
	}
	const count = end.count ?? entries.length;
	const eocd = fields(
		[0x06054b50, 4],
		[0, 2],
		[0, 2],
		[count, 2],
		[count, 2],
		[central.length, 4],
		[end.cdOffset ?? locals.length, 4],
		[0, 2],
	);
	// A ZIP64 end locator: signature, disk, the ZIP64 end record's offset, disks.
	const locator = end.zip64Locator ? fields([0x07064b50, 4], [0, 4], [0, 4], [0, 4], [1, 4]) : [];
	return new Uint8Array([...locals, ...central, ...locator, ...eocd]);
}

const SCORE = '<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"/>';
const container = (path: string) =>
	`<?xml version="1.0" encoding="UTF-8"?><container><rootfiles><rootfile full-path="${path}" media-type="application/vnd.recordare.musicxml+xml"/><rootfile full-path="other.xml"/></rootfiles></container>`;
const mimetype: Entry = { name: "mimetype", data: "application/vnd.recordare.musicxml", method: 0 };

const rejection = async (p: Promise<string>): Promise<string> => {
	try {
		await p;
	} catch (e) {
		expect(e).toBeInstanceOf(Error);
		return (e as Error).message;
	}
	throw new Error("expected a rejection");
};

describe("reads", () => {
	test("a stored .mxl", async () => {
		const bytes = zip([
			mimetype,
			{ name: "META-INF/container.xml", data: container("score.xml"), method: 0 },
			{ name: "score.xml", data: SCORE, method: 0 },
		]);
		expect(await readMxl(bytes)).toBe(SCORE);
	});

	test("a deflated .mxl", async () => {
		const bytes = zip([
			mimetype,
			{ name: "META-INF/container.xml", data: container("score.xml") },
			{ name: "score.xml", data: SCORE },
		]);
		expect(await readMxl(bytes)).toBe(SCORE);
	});

	test("container.xml's first rootfile, wherever it is", async () => {
		const bytes = zip([
			{ name: "META-INF/container.xml", data: container("music/song.musicxml") },
			{ name: "other.xml", data: "<other/>" },
			{ name: "music/song.musicxml", data: SCORE },
		]);
		expect(await readMxl(bytes)).toBe(SCORE);
	});

	test("without container.xml, the first .musicxml or .xml", async () => {
		const bytes = zip([
			mimetype,
			{ name: "META-INF/notes.xml", data: "<meta/>" },
			{ name: "readme.txt", data: "hello" },
			{ name: "song.musicxml", data: SCORE },
			{ name: "later.xml", data: "<later/>" },
		]);
		expect(await readMxl(bytes)).toBe(SCORE);
	});

	test("an entry streamed with a data descriptor (flag bit 3), as many zip writers make them", async () => {
		const bytes = zip([
			{ name: "META-INF/container.xml", data: container("score.xml"), streamed: true },
			{ name: "score.xml", data: SCORE, streamed: true },
		]);
		expect(await readMxl(bytes)).toBe(SCORE);
	});

	test("UTF-16 with a byte-order mark, either way round", async () => {
		const le = new Uint8Array([0xff, 0xfe, ...[..."<a/>"].flatMap((c) => [c.charCodeAt(0), 0])]);
		const be = new Uint8Array([0xfe, 0xff, ...[..."<a/>"].flatMap((c) => [0, c.charCodeAt(0)])]);
		expect(await readMxl(zip([{ name: "a.xml", data: le }]))).toBe("<a/>");
		expect(await readMxl(zip([{ name: "a.xml", data: be }]))).toBe("<a/>");
	});

	test("UTF-8 with a byte-order mark", async () => {
		const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8("<é/>")]);
		expect(await readMxl(zip([{ name: "a.xml", data: bom }]))).toBe("<é/>");
	});
});

describe("rejects", () => {
	test("text that isn't UTF-8", async () => {
		const latin1 = new Uint8Array([0x3c, 0x61, 0xe9, 0x2f, 0x3e]);
		expect(await rejection(readMxl(zip([{ name: "a.xml", data: latin1 }])))).toBe(
			"a.xml in the .mxl isn't UTF-8 or UTF-16 text",
		);
	});

	test("a rootless archive", async () => {
		expect(await rejection(readMxl(zip([mimetype, { name: "readme.txt", data: "x" }])))).toBe(
			"no MusicXML file in the .mxl",
		);
	});

	test("a container.xml naming a file the archive doesn't hold", async () => {
		const bytes = zip([{ name: "META-INF/container.xml", data: container("gone.xml") }]);
		expect(await rejection(readMxl(bytes))).toBe(
			"the .mxl's container.xml names gone.xml, which isn't in the archive",
		);
	});

	test("a truncated archive", async () => {
		const bytes = zip([{ name: "score.xml", data: SCORE }]);
		expect(await rejection(readMxl(bytes.slice(0, bytes.length - 30)))).toBe(
			"not a .mxl file: no zip directory (the file may be truncated)",
		);
		expect(await rejection(readMxl(new Uint8Array()))).toBe(
			"not a .mxl file: no zip directory (the file may be truncated)",
		);
	});

	test("an entry whose data runs past the end", async () => {
		const bytes = zip([{ name: "score.xml", data: SCORE, compressedSize: 100_000 }]);
		expect(await rejection(readMxl(bytes))).toBe(
			"the .mxl is damaged: score.xml runs past the end of the file",
		);
	});

	test("an entry whose local header is out of bounds", async () => {
		const bytes = zip([{ name: "score.xml", data: SCORE, offset: 1_000_000 }]);
		expect(await rejection(readMxl(bytes))).toBe(
			"the .mxl is damaged: score.xml runs past the end of the file",
		);
	});

	test("a central directory out of bounds", async () => {
		const bytes = zip([{ name: "score.xml", data: SCORE }], { cdOffset: 1_000_000 });
		expect(await rejection(readMxl(bytes))).toBe(
			"the .mxl is damaged: its directory runs past the end of the file",
		);
	});

	test("more than 1000 entries", async () => {
		const bytes = zip([{ name: "score.xml", data: SCORE }], { count: 1001 });
		expect(await rejection(readMxl(bytes))).toBe("the .mxl holds more than 1000 files");
	});

	test("ZIP64", async () => {
		const bytes = zip([{ name: "score.xml", data: SCORE }], { count: 0xffff });
		expect(await rejection(readMxl(bytes))).toBe("ZIP64 .mxl files aren't supported");
		const located = zip([{ name: "score.xml", data: SCORE }], { zip64Locator: true });
		expect(await rejection(readMxl(located))).toBe("ZIP64 .mxl files aren't supported");
		const sized = zip([{ name: "score.xml", data: SCORE, declared: 0xffffffff }]);
		expect(await rejection(readMxl(sized))).toBe("ZIP64 .mxl files aren't supported");
	});

	test("an encrypted entry", async () => {
		const bytes = zip([{ name: "score.xml", data: SCORE, flags: 1 }]);
		expect(await rejection(readMxl(bytes))).toBe("score.xml in the .mxl is encrypted");
	});

	test("an unsupported compression method", async () => {
		const bytes = zip([{ name: "score.xml", data: SCORE, method: 12 }]);
		expect(await rejection(readMxl(bytes))).toBe(
			"score.xml in the .mxl uses compression method 12; only stored and deflated are read",
		);
	});

	test("a declared size over the cap, before inflating", async () => {
		const bytes = zip([{ name: "score.xml", data: SCORE, declared: 65 * 1024 * 1024 }]);
		expect(await rejection(readMxl(bytes))).toBe("score.xml in the .mxl is larger than 64 MiB");
	});

	test("a zip bomb: inflating past the cap stops, whatever the size claimed", async () => {
		const bomb = new Uint8Array(1024 * 1024); // 1 MiB of zeros deflates to about 1 KiB
		const bytes = zip([{ name: "score.xml", data: bomb, declared: 100 }]);
		expect(bytes.length).toBeLessThan(4096);
		expect(await rejection(unpackMxl(bytes, { bytes: 64 * 1024, entries: 1000 }))).toBe(
			"score.xml in the .mxl is larger than 64 KiB",
		);
	});

	test("a stored entry over the cap", async () => {
		const bytes = zip([{ name: "score.xml", data: new Uint8Array(2048), method: 0, declared: 10 }]);
		expect(await rejection(unpackMxl(bytes, { bytes: 1024, entries: 1000 }))).toBe(
			"score.xml in the .mxl is larger than 1 KiB",
		);
	});

	test("not a zip at all", async () => {
		expect(await rejection(readMxl(utf8(SCORE)))).toBe(
			"not a .mxl file: no zip directory (the file may be truncated)",
		);
	});

	test("a runtime without deflate-raw", async () => {
		const bytes = zip([{ name: "score.xml", data: SCORE }]);
		const real = globalThis.DecompressionStream;
		const g = globalThis as { DecompressionStream?: unknown };
		try {
			g.DecompressionStream = undefined;
			expect(await rejection(readMxl(bytes))).toBe("reading .mxl needs Node 20.12 or later");
			g.DecompressionStream = class {
				constructor(format: string) {
					throw new TypeError(`unsupported format ${format}`);
				}
			};
			expect(await rejection(readMxl(bytes))).toBe("reading .mxl needs Node 20.12 or later");
			// A stored archive needs no inflating.
			expect(await readMxl(zip([{ name: "score.xml", data: SCORE, method: 0 }]))).toBe(SCORE);
		} finally {
			g.DecompressionStream = real;
		}
	});
});
