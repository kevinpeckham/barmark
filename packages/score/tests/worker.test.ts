import { describe, expect, test } from "bun:test";
import { VerovioToolkit } from "verovio/esm";
import createModule from "verovio/wasm";
import type { LoadStatus, Ready, Reply, WorkerMessage } from "../src/engine.js";
import { VEROVIO_VERSION } from "../src/verovio.js";
import { sameVerovio, type WasmSource } from "../src/wasm.js";
import { answer, type LoaderDeps, toolkitLoader, verovioLoader } from "../src/worker.js";

type Module = { from: string };

/**
 * A loader over fakes: `bodies` are what each URL serves, `own` is the
 * package's Verovio, `version` what a downloaded module's toolkit reports.
 */
function fakes(
	bodies: Record<string, string | Error>,
	own: Error | null = null,
	version = "6.4.1",
) {
	const log: string[] = [];
	const warnings: string[] = [];
	const wasms: (WasmSource | undefined)[] = [];
	const deps: LoaderDeps<Module, string> = {
		fetchModule: async (url, { integrity, onProgress }) => {
			log.push(`fetch ${url}${integrity ? ` ${integrity}` : ""}`);
			const body = bodies[url];
			if (body === undefined || body instanceof Error) throw body ?? new Error("404 Not Found");
			onProgress({ phase: "download", fraction: 0, bytes: null });
			onProgress({ phase: "download", fraction: 1, bytes: null });
			if (integrity && integrity !== `ok-${body}`)
				throw new Error(`${url} does not match its integrity digest`);
			return new Blob([body]);
		},
		importBlob: async (blob) => {
			log.push("import blob");
			return { from: await blob.text() };
		},
		own: async () => {
			log.push("import own");
			if (own) throw own;
			return { from: "own" };
		},
		instantiate: async (m, wasm, report) => {
			log.push("instantiate");
			wasms.push(wasm);
			report({ phase: "prepare" });
			return `toolkit ${m.from}`;
		},
		versionOf: (t) => (t === "toolkit own" ? "6.4.1" : version),
		toolkitVersion: "6.4.1",
		warn: (m) => warnings.push(m),
	};
	return { load: verovioLoader(deps), log, warnings, wasms };
}

const phases = (seen: LoadStatus[]) =>
	seen.map((s) => (s.phase === "download" ? `download ${s.fraction}` : s.phase));

describe("verovioLoader", () => {
	test("the package's own: an unmeasured download, then preparing", async () => {
		const { load, log } = fakes({});
		const seen: LoadStatus[] = [];
		const r = await load({}, (s) => seen.push(s));
		expect(r).toEqual({ toolkit: "toolkit own", from: {} });
		expect(phases(seen)).toEqual(["download null", "prepare"]);
		expect(log).toEqual(["import own", "instantiate"]);
	});

	test("a url: downloaded with progress, imported from a blob, then prepared", async () => {
		const { load, log } = fakes({ "https://cdn.test/v.mjs": "cdn" });
		const seen: LoadStatus[] = [];
		const r = await load({ verovioUrl: "https://cdn.test/v.mjs" }, (s) => seen.push(s));
		expect(r).toEqual({ toolkit: "toolkit cdn", from: { verovioUrl: "https://cdn.test/v.mjs" } });
		expect(phases(seen)).toEqual(["download 0", "download 1", "prepare"]);
		expect(log).toEqual(["fetch https://cdn.test/v.mjs", "import blob", "instantiate"]);
	});

	test("a url with no integrity that fails is a failure: no fallback guessing", async () => {
		const { load, log, warnings } = fakes({});
		await expect(load({ verovioUrl: "https://cdn.test/v.mjs" }, () => {})).rejects.toThrow("404");
		expect(log).toEqual(["fetch https://cdn.test/v.mjs"]);
		expect(warnings).toEqual([]);
	});

	test("a url whose digest matches is kept, and reported with its integrity", async () => {
		const { load } = fakes({ "https://cdn.test/v.mjs": "cdn" });
		const source = { verovioUrl: "https://cdn.test/v.mjs", verovioIntegrity: "ok-cdn" };
		expect(await load(source, () => {})).toEqual({ toolkit: "toolkit cdn", from: source });
	});

	test("a digest mismatch falls back to the package's own, once, with a warning", async () => {
		const { load, log, warnings } = fakes({ "https://cdn.test/v.mjs": "tampered" });
		const seen: LoadStatus[] = [];
		const r = await load(
			{ verovioUrl: "https://cdn.test/v.mjs", verovioIntegrity: "ok-cdn" },
			(s) => seen.push(s),
		);
		expect(r).toEqual({ toolkit: "toolkit own", from: {} });
		expect(log).toEqual(["fetch https://cdn.test/v.mjs ok-cdn", "import own", "instantiate"]);
		expect(warnings.length).toBe(1);
		expect(warnings[0]).toContain("https://cdn.test/v.mjs");
		expect(warnings[0]).toContain("integrity");
		expect(warnings[0]).toContain("the package's own");
		// The fallback starts its own (unmeasured) download.
		expect(phases(seen)).toEqual(["download 0", "download 1", "download null", "prepare"]);
	});

	test("any load failure with integrity falls back, naming the reason", async () => {
		const { load, warnings } = fakes({ "https://cdn.test/v.mjs": new Error("Failed to fetch") });
		const r = await load(
			{ verovioUrl: "https://cdn.test/v.mjs", verovioIntegrity: "ok-x" },
			() => {},
		);
		expect(r.from).toEqual({});
		expect(warnings[0]).toContain("Failed to fetch");
	});

	test("a fallback that fails too is the failure (no second fallback)", async () => {
		const { load, log } = fakes({}, new Error("own is gone"));
		await expect(
			load({ verovioUrl: "https://cdn.test/v.mjs", verovioIntegrity: "ok-x" }, () => {}),
		).rejects.toThrow("own is gone");
		expect(log.filter((l) => l.startsWith("fetch")).length).toBe(1);
	});

	test("integrity without a url is ignored: the package's own loads", async () => {
		const { load, log } = fakes({});
		expect((await load({ verovioIntegrity: "ok-x" }, () => {})).from).toEqual({});
		expect(log[0]).toBe("import own");
	});
});

describe("the separate .wasm and the version check", () => {
	const url = "https://cdn.test/v/verovio-module.mjs";

	test("a module whose Verovio is not the toolkit's falls back with integrity, with a warning", async () => {
		const { load, warnings } = fakes({ [url]: "cdn" }, null, "6.3.0");
		const r = await load({ verovioUrl: url, verovioIntegrity: "ok-cdn" }, () => {});
		expect(r).toEqual({ toolkit: "toolkit own", from: {} });
		expect(warnings.length).toBe(1);
		expect(warnings[0]).toContain(url);
		expect(warnings[0]).toContain("6.3.0");
		expect(warnings[0]).toContain("6.4.1");
	});

	test("without verovio-integrity, a version mismatch is the failure", async () => {
		const { load } = fakes({ [url]: "cdn" }, null, "6.3.0");
		await expect(load({ verovioUrl: url }, () => {})).rejects.toThrow(
			"Verovio 6.3.0 does not match this package's toolkit (6.4.1)",
		);
	});

	test("a version with the toolkit's version then a dash is the same Verovio", async () => {
		const { load } = fakes({ [url]: "cdn" }, null, "6.4.1-fbe8f46");
		expect((await load({ verovioUrl: url }, () => {})).toolkit).toBe("toolkit cdn");
	});

	test("verovio-url with a wasm digest passes the wasm source to instantiate", async () => {
		const { load, wasms } = fakes({ [url]: "cdn" });
		const source = {
			verovioUrl: url,
			verovioIntegrity: "ok-cdn",
			verovioWasmIntegrity: "sha384-W",
		};
		expect(await load(source, () => {})).toEqual({ toolkit: "toolkit cdn", from: source });
		expect(wasms).toEqual([{ moduleUrl: url, integrity: "sha384-W", required: true }]);
	});

	test("without verovio-integrity, the wasm digest is not required", async () => {
		const { load, wasms } = fakes({ [url]: "cdn" });
		await load({ verovioUrl: url }, () => {});
		expect(wasms).toEqual([{ moduleUrl: url, required: false }]);
	});

	test("with a wasm digest, the glue's download is reported unmeasured", async () => {
		const { load } = fakes({ [url]: "cdn" });
		const seen: LoadStatus[] = [];
		await load(
			{ verovioUrl: url, verovioIntegrity: "ok-cdn", verovioWasmIntegrity: "sha384-W" },
			(s) => seen.push(s),
		);
		expect(phases(seen)).toEqual(["download null", "prepare"]);
	});

	test("the package's own copy gets no wasm source", async () => {
		const { load, wasms } = fakes({});
		await load({}, () => {});
		expect(wasms).toEqual([undefined]);
	});

	test("sameVerovio accepts the stock module's own getVersion()", async () => {
		expect(
			sameVerovio(new VerovioToolkit(await createModule()).getVersion(), VEROVIO_VERSION),
		).toBe(true);
	});
});

describe("answer", () => {
	const loader = (fail = false) =>
		toolkitLoader(async (_source, report) => {
			report({ phase: "prepare" });
			if (fail) throw new Error("no module");
			return { toolkit: "tk", from: {} };
		});

	test("a preload loads, says Ready, and sends no reply", async () => {
		const posted: WorkerMessage[] = [];
		await answer(
			{ id: 3, text: "", width: 0, preload: true },
			loader(),
			(m) => posted.push(m),
			async () => {
				throw new Error("never engraved");
			},
		);
		expect(posted).toEqual([
			{ id: 3, status: { phase: "prepare" } },
			{ id: 3, loaded: {} } satisfies Ready,
		]);
	});

	test("a preload whose load fails replies with the reason, so the engine moves on", async () => {
		const posted: WorkerMessage[] = [];
		await answer(
			{ id: 3, text: "", width: 0, preload: true },
			loader(true),
			(m) => posted.push(m),
			async () => {
				throw new Error("never engraved");
			},
		);
		expect(posted.at(-1)).toEqual({ id: 3, ok: false, reason: "Error: no module" } satisfies Reply);
	});

	test("a job posts its load's progress, Ready, then its reply", async () => {
		const posted: WorkerMessage[] = [];
		await answer(
			{ id: 4, text: "x", width: 800 },
			loader(),
			(m) => posted.push(m),
			async (_r, ready) => {
				await ready();
				return { id: 4, ok: true, svg: "s", pages: 1 };
			},
		);
		expect(posted).toEqual([
			{ id: 4, status: { phase: "prepare" } },
			{ id: 4, loaded: {} },
			{ id: 4, ok: true, svg: "s", pages: 1 },
		]);
	});
});
