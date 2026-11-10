import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
	checkIntegrity,
	type Download,
	downloadMeter,
	fetchBytes,
	fetchModule,
	progressText,
} from "../src/download.js";
import {
	VEROVIO_CDN_INTEGRITY,
	VEROVIO_CDN_URL,
	VEROVIO_MODULE_BYTES,
	VEROVIO_VERSION,
} from "../src/verovio.js";

const installed = join(import.meta.dir, "../node_modules/verovio");
const moduleFile = join(installed, "dist/verovio-module.mjs");

const headers = (h: Record<string, string>) => new Headers(h);

describe("the pinned Verovio", () => {
	test("its version, size and digest are the installed module's", () => {
		const pkg = JSON.parse(readFileSync(join(installed, "package.json"), "utf8"));
		expect(VEROVIO_VERSION).toBe(pkg.version);
		expect(VEROVIO_MODULE_BYTES).toBe(statSync(moduleFile).size);
		const digest = createHash("sha384").update(readFileSync(moduleFile)).digest("base64");
		expect(VEROVIO_CDN_INTEGRITY).toBe(`sha384-${digest}`);
		expect(VEROVIO_CDN_URL).toBe(
			`https://cdn.jsdelivr.net/npm/verovio@${pkg.version}/dist/verovio-module.mjs`,
		);
	});

	test("the package pins it exactly", () => {
		const own = JSON.parse(readFileSync(join(import.meta.dir, "../package.json"), "utf8"));
		expect(own.dependencies.verovio).toBe(VEROVIO_VERSION);
	});

	test("the README gives the CDN copy's URL and digest", () => {
		const readme = readFileSync(join(import.meta.dir, "../README.md"), "utf8");
		expect({
			url: readme.includes(VEROVIO_CDN_URL),
			integrity: readme.includes(VEROVIO_CDN_INTEGRITY),
		}).toEqual({ url: true, integrity: true });
	});
});

describe("downloadMeter", () => {
	test("an unencoded response with a length measures bytes against it", () => {
		const meter = downloadMeter(headers({ "content-length": "1000" }), 7000);
		expect(meter(250)).toEqual({
			phase: "download",
			fraction: 0.25,
			bytes: { done: 250, total: 1000 },
		});
		expect(meter(1000).fraction).toBe(1);
	});

	test("identity is no encoding", () => {
		const meter = downloadMeter(
			headers({ "content-length": "1000", "content-encoding": "identity" }),
		);
		expect(meter(500).bytes).toEqual({ done: 500, total: 1000 });
	});

	for (const encoding of ["gzip", "br", "zstd"]) {
		test(`a ${encoding} response never measures decoded bytes against the compressed length`, () => {
			// Content-Length is the compressed size; the reader yields decoded bytes.
			const meter = downloadMeter(
				headers({ "content-length": "2000", "content-encoding": encoding }),
				8000,
			);
			expect(meter(4000)).toEqual({ phase: "download", fraction: 0.5, bytes: null });
			expect(meter(8000).fraction).toBe(1);
		});
	}

	test("an encoded response with no known size is indeterminate", () => {
		const meter = downloadMeter(headers({ "content-length": "2000", "content-encoding": "gzip" }));
		expect(meter(4000)).toEqual({ phase: "download", fraction: null, bytes: null });
	});

	test("no length uses the known size, else is indeterminate", () => {
		expect(downloadMeter(headers({}), 8000)(2000).fraction).toBe(0.25);
		expect(downloadMeter(headers({}))(2000).fraction).toBeNull();
	});

	test("a length the body outgrows was compressed after all (a hidden Content-Encoding)", () => {
		const meter = downloadMeter(headers({ "content-length": "2000" }), 8000);
		expect(meter(1000).bytes).toEqual({ done: 1000, total: 2000 });
		expect(meter(3000)).toEqual({ phase: "download", fraction: 3000 / 8000, bytes: null });
	});

	test("cross-origin, a length short of the known size is a hidden Content-Encoding", () => {
		// Without Access-Control-Expose-Headers, a CORS response hides Content-Encoding but shows Content-Length.
		const meter = downloadMeter(headers({ "content-length": "2000" }), 8000, true);
		expect(meter(1000)).toEqual({ phase: "download", fraction: 1000 / 8000, bytes: null });
		const plain = downloadMeter(headers({ "content-length": "8000" }), 8000, true);
		expect(plain(1000).bytes).toEqual({ done: 1000, total: 8000 });
		// Same-origin headers are all visible: a short length is a smaller file.
		expect(downloadMeter(headers({ "content-length": "2000" }), 8000)(1000).bytes).not.toBeNull();
	});

	test("a body larger than the known size is indeterminate, never past 100%", () => {
		const meter = downloadMeter(headers({ "content-encoding": "br" }), 8000);
		expect(meter(9000).fraction).toBeNull();
	});

	test("a nonsense length is no length", () => {
		expect(downloadMeter(headers({ "content-length": "abc" }))(10).fraction).toBeNull();
		expect(downloadMeter(headers({ "content-length": "0" }))(10).fraction).toBeNull();
	});
});

describe("progressText", () => {
	const d = (fraction: number | null, bytes: Download["bytes"] = null): Download => ({
		phase: "download",
		fraction,
		bytes,
	});
	test("a percentage, with megabytes only for the real transfer size", () => {
		expect(progressText(d(0.426))).toBe("42%");
		expect(progressText(d(0.5, { done: 3_700_000, total: 7_400_749 }))).toBe("50% (3.7 of 7.4 MB)");
		expect(progressText(d(null))).toBe("");
	});
});

/** A response whose body arrives in `chunks`, with `h` as its headers. */
const respond = (chunks: string[], h: Record<string, string> = {}, status = 200) =>
	new Response(
		new ReadableStream<Uint8Array>({
			start(c) {
				for (const chunk of chunks) c.enqueue(new TextEncoder().encode(chunk));
				c.close();
			},
		}),
		{ status, headers: h },
	);

const sri = async (text: string, alg = "SHA-384") => {
	const hash = await crypto.subtle.digest(alg, new TextEncoder().encode(text));
	return `${alg.replace("-", "").toLowerCase()}-${Buffer.from(hash).toString("base64")}`;
};

describe("fetchModule", () => {
	test("reads the body, reporting progress as it goes, into a JavaScript blob", async () => {
		const seen: (number | null)[] = [];
		const blob = await fetchModule("https://cdn.test/v.mjs", {
			fetch: async () => respond(["ab", "cd"], { "content-length": "4" }),
			onProgress: (p) => seen.push(p.fraction),
		});
		expect(await blob.text()).toBe("abcd");
		expect(blob.type).toStartWith("text/javascript");
		expect(seen).toEqual([0, 0.5, 1]);
	});

	test("reports a fraction only when its whole percentage moves", async () => {
		const seen: (number | null)[] = [];
		const chunks = Array.from({ length: 1000 }, () => "x");
		await fetchModule("https://cdn.test/v.mjs", {
			fetch: async () => respond(chunks, { "content-length": "1000" }),
			onProgress: (p) => seen.push(p.fraction),
		});
		expect(seen.length).toBe(101);
	});

	test("never reports a lower percentage: a measure that falls back goes indeterminate", async () => {
		// A same-origin proxy that strips Content-Encoding: the length is the compressed size.
		const seen: (number | null)[] = [];
		await fetchModule("https://cdn.test/v.mjs", {
			fetch: async () => respond(["aa", "aa", "aaaa"], { "content-length": "4" }),
			expected: 10,
			onProgress: (p) => seen.push(p.fraction),
		});
		expect(seen).toEqual([0, 0.5, 1, null]);
	});

	test("an HTTP error rejects with its status", async () => {
		await expect(
			fetchModule("https://cdn.test/v.mjs", {
				fetch: async () => respond([], {}, 404),
				onProgress: () => {},
			}),
		).rejects.toThrow("404");
	});

	test("a matching digest passes; a wrong one rejects", async () => {
		const ok = await fetchModule("https://cdn.test/v.mjs", {
			fetch: async () => respond(["abcd"]),
			integrity: await sri("abcd"),
			onProgress: () => {},
		});
		expect(await ok.text()).toBe("abcd");
		await expect(
			fetchModule("https://cdn.test/v.mjs", {
				fetch: async () => respond(["abce"]),
				integrity: await sri("abcd"),
				onProgress: () => {},
			}),
		).rejects.toThrow("integrity");
	});
});

describe("fetchBytes", () => {
	test("fetchBytes returns the checked bytes; fetchModule still returns a text/javascript blob", async () => {
		const options = async () => ({
			fetch: async () => respond(["ab", "cd"]),
			integrity: await sri("abcd"),
			onProgress: () => {},
		});
		const bytes = await fetchBytes("https://cdn.test/v.wasm", await options());
		expect(bytes).toBeInstanceOf(Uint8Array);
		expect(new TextDecoder().decode(bytes)).toBe("abcd");
		await expect(
			fetchBytes("https://cdn.test/v.wasm", {
				fetch: async () => respond(["abce"]),
				integrity: await sri("abcd"),
				onProgress: () => {},
			}),
		).rejects.toThrow("integrity");
		const blob = await fetchModule("https://cdn.test/v.mjs", await options());
		expect(blob.type).toStartWith("text/javascript");
		expect(await blob.text()).toBe("abcd");
	});
});

describe("checkIntegrity", () => {
	const bytes = new TextEncoder().encode("abcd");
	test("sha256, sha384 and sha512", async () => {
		for (const alg of ["SHA-256", "SHA-384", "SHA-512"])
			expect(await checkIntegrity(bytes, await sri("abcd", alg))).toBe(true);
		expect(await checkIntegrity(bytes, await sri("abce"))).toBe(false);
	});
	test("anything not an SRI digest fails", async () => {
		expect(await checkIntegrity(bytes, "md5-abc")).toBe(false);
		expect(await checkIntegrity(bytes, "")).toBe(false);
	});
});
