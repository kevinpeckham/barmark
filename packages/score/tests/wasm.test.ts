import { describe, expect, test } from "bun:test";
import { type Download, fetchBytes } from "../src/download.js";
import { ENGRAVER_WASM_BYTES, ENGRAVER_WASM_INTEGRITY } from "../src/verovio.js";
import {
	createWith,
	type InstantiateWasm,
	sameVerovio,
	WASM_FILE,
	WASM_INTEGRITY_NEEDED,
	type WasmDeps,
	type WasmSource,
	wasmHook,
} from "../src/wasm.js";

type FetchOptions = Parameters<WasmDeps["fetchBytes"]>[1];

const fakeInstance = { exports: {} } as WebAssembly.Instance;
const fakeModule = {} as WebAssembly.Module;

/** Fake deps: every fetch answers `body`, or rejects with `fail`; what was fetched and instantiated is kept. */
function deps(fail?: string, body = new Uint8Array([0, 97, 115, 109])) {
	const fetched: { url: string; options: FetchOptions }[] = [];
	const instantiated: { bytes: Uint8Array; imports: WebAssembly.Imports }[] = [];
	const progress: Download[] = [];
	const d: WasmDeps = {
		fetchBytes: async (url, options) => {
			fetched.push({ url, options });
			if (fail !== undefined) throw new Error(fail);
			return body;
		},
		instantiate: async (bytes, imports) => {
			instantiated.push({ bytes, imports });
			return { instance: fakeInstance, module: fakeModule };
		},
		onProgress: (p) => progress.push(p),
	};
	return Object.assign(d, { fetched, instantiated, progress });
}
const depsFailing = (reason: string) => deps(reason);

/** The SRI digest (sha384) of `text`. */
const sri = async (text: string) => {
	const hash = await crypto.subtle.digest("SHA-384", new TextEncoder().encode(text));
	return `sha384-${Buffer.from(hash).toString("base64")}`;
};

const src: WasmSource = {
	moduleUrl: "https://cdn.example/v/verovio-module.mjs",
	integrity: "sha384-A",
	required: true,
};

describe("wasmHook", () => {
	test("the hook throws synchronously when the wasm digest is required and missing", () => {
		const { instantiateWasm } = wasmHook(
			{ moduleUrl: "https://cdn.example/v/verovio-module.mjs", required: true },
			deps(),
		);
		expect(() => instantiateWasm({}, () => {})).toThrow(WASM_INTEGRITY_NEEDED);
		expect(WASM_INTEGRITY_NEEDED).toBe(
			"verovio-wasm-integrity is needed for a Verovio that loads a separate .wasm",
		);
	});

	test("resolves the wasm beside the module URL, never against a blob", () => {
		const d = deps();
		wasmHook(
			{
				moduleUrl: "https://cdn.example/v/verovio-module.mjs?v=2#x",
				integrity: "sha384-A",
				required: true,
			},
			d,
		).instantiateWasm({}, () => {});
		expect(d.fetched[0]?.url).toBe("https://cdn.example/v/verovio-module.wasm");
		expect(WASM_FILE).toBe("verovio-module.wasm");
	});

	test("passes the digest on, instantiates with Emscripten's imports, receives, and returns {}", async () => {
		const d = deps();
		const imports = { env: { memory: 1 } } as unknown as WebAssembly.Imports;
		const received: unknown[][] = [];
		let done!: () => void;
		const receivedOnce = new Promise<void>((r) => {
			done = r;
		});
		const returned = wasmHook(src, d).instantiateWasm(imports, (instance, module) => {
			received.push([instance, module]);
			done();
		});
		expect(returned).toEqual({});
		await receivedOnce;
		expect(d.fetched[0]?.options.integrity).toBe("sha384-A");
		expect(d.instantiated[0]?.imports).toBe(imports);
		expect(received).toEqual([[fakeInstance, fakeModule]]);
	});

	test("an encoded wasm response is measured against the known wasm size", async () => {
		const seen: Download[] = [];
		const expectedSeen: (number | undefined)[] = [];
		const d = deps();
		// The real fetchBytes over a fake fetch: brotli-encoded, Content-Length the compressed size.
		// The fake body is not the real build, so the digest is left to the other tests.
		d.fetchBytes = (url, o) => {
			expectedSeen.push(o.expected);
			return fetchBytes(url, {
				...o,
				integrity: undefined,
				fetch: async () =>
					new Response(new Uint8Array(ENGRAVER_WASM_BYTES), {
						headers: { "content-encoding": "br", "content-length": "1000000" },
					}),
			});
		};
		d.onProgress = (p) => seen.push(p);
		let done!: () => void;
		const receivedOnce = new Promise<void>((r) => {
			done = r;
		});
		wasmHook({ ...src, integrity: ENGRAVER_WASM_INTEGRITY }, d).instantiateWasm({}, () => done());
		await receivedOnce;
		expect(expectedSeen).toEqual([ENGRAVER_WASM_BYTES]);
		expect(seen.at(-1)?.fraction).toBe(1);
		expect(seen.every((p) => p.bytes === null)).toBe(true);
	});

	test("a failed download rejects `failed` and never calls receive", async () => {
		const hook = wasmHook(src, depsFailing("404 Not Found"));
		let received = false;
		hook.instantiateWasm({}, () => {
			received = true;
		});
		await expect(hook.failed).rejects.toThrow("404");
		expect(received).toBe(false);
	});

	test("a wasm that does not match its digest rejects `failed` and is never instantiated", async () => {
		const d = deps();
		// The real fetchBytes, so the digest is checked as the worker checks it.
		d.fetchBytes = (url, o) => fetchBytes(url, { ...o, fetch: async () => new Response("abcd") });
		const hook = wasmHook({ ...src, integrity: await sri("abce") }, d);
		let received = false;
		hook.instantiateWasm({}, () => {
			received = true;
		});
		await expect(hook.failed).rejects.toThrow("integrity");
		expect(d.instantiated).toEqual([]);
		expect(received).toBe(false);
	});
});

describe("createWith", () => {
	test("createWith settles when the hook fails and the factory hangs", async () => {
		const hook = wasmHook(src, depsFailing("404 Not Found"));
		const hung = (arg: { instantiateWasm: InstantiateWasm }) => {
			arg.instantiateWasm({}, () => {});
			return new Promise<never>(() => {});
		};
		await expect(createWith(hung, hook)).rejects.toThrow("404");
	});

	test("a synchronous throw from the hook rejects the factory directly", async () => {
		const hook = wasmHook({ moduleUrl: src.moduleUrl, required: true }, deps());
		const glue = async (arg: { instantiateWasm: InstantiateWasm }) => {
			arg.instantiateWasm({}, () => {});
			return "never";
		};
		await expect(createWith(glue, hook)).rejects.toThrow(WASM_INTEGRITY_NEEDED);
	});

	test("a factory that ignores the hook resolves, with no unhandled rejection", async () => {
		const seen: unknown[] = [];
		const onRejection = (e: unknown) => seen.push(e);
		process.on("unhandledRejection", onRejection);
		try {
			await expect(createWith(async () => "stock", wasmHook(src, depsFailing("x")))).resolves.toBe(
				"stock",
			);
			await Bun.sleep(0);
			expect(seen).toEqual([]);
		} finally {
			process.off("unhandledRejection", onRejection);
		}
	});
});

describe("sameVerovio", () => {
	test("sameVerovio: equal, or the version then a dash", () => {
		expect(sameVerovio("6.4.1", "6.4.1")).toBe(true);
		expect(sameVerovio("6.4.1-fbe8f46", "6.4.1")).toBe(true);
		expect(sameVerovio("6.4.10", "6.4.1")).toBe(false);
		expect(sameVerovio("6.4.0-abc", "6.4.1")).toBe(false);
	});
});
