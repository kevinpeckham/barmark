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
 * package's Verovio (the lighter build), `version` what a downloaded
 * module's toolkit reports. `ownVersion` is what the lighter build's
 * toolkit reports; with `ownHangs`, its instantiate waits for
 * `releaseOwn`; `stockFails` makes stock's import throw. `clock.pass`
 * moves the fake time `after` waits on.
 */
function fakes(
	bodies: Record<string, string | Error>,
	own: Error | null = null,
	version = "6.4.1",
	{
		ownVersion,
		ownHangs = false,
		stockFails,
	}: { ownVersion?: string; ownHangs?: boolean; stockFails?: Error } = {},
) {
	const log: string[] = [];
	const warnings: string[] = [];
	const wasms: (WasmSource | undefined)[] = [];
	let now = 0;
	let timers: { at: number; fire: () => void }[] = [];
	const clock = {
		pass(ms: number) {
			now += ms;
			const due = timers.filter((t) => t.at <= now);
			timers = timers.filter((t) => t.at > now);
			for (const t of due) t.fire();
		},
		/** Timers neither fired nor cancelled. */
		pending: () => timers.length,
	};
	let release: (err?: Error) => void = () => {};
	const hung = new Promise<void>((resolve, reject) => {
		release = (err) => (err ? reject(err) : resolve());
	});
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
		stock: async () => {
			log.push("import stock");
			if (stockFails) throw stockFails;
			return { from: "stock" };
		},
		instantiate: async (m, wasm, report) => {
			log.push("instantiate");
			wasms.push(wasm);
			if (ownHangs && m.from === "own") await hung;
			report({ phase: "prepare" });
			return `toolkit ${m.from}`;
		},
		after: (ms) => {
			let timer: { at: number; fire: () => void } | undefined;
			const done = new Promise<void>((fire) => {
				timer = { at: now + ms, fire };
				timers.push(timer);
			});
			return { done, cancel: () => (timers = timers.filter((t) => t !== timer)) };
		},
		liteDeadlineMs: 20_000,
		versionOf: (t) => {
			if (t === "toolkit own") return ownVersion ?? "6.4.1";
			if (t === "toolkit stock") return "6.4.1";
			return version;
		},
		toolkitVersion: "6.4.1",
		warn: (m) => warnings.push(m),
	};
	return {
		load: verovioLoader(deps),
		log,
		warnings,
		wasms,
		clock,
		releaseOwn: (err?: Error) => release(err),
	};
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

	test("a fallback that fails too is the failure (no further fallback)", async () => {
		const { load, log } = fakes({}, new Error("own is gone"), "6.4.1", {
			stockFails: new Error("stock is gone"),
		});
		await expect(
			load({ verovioUrl: "https://cdn.test/v.mjs", verovioIntegrity: "ok-x" }, () => {}),
		).rejects.toThrow("stock is gone");
		expect(log.filter((l) => l.startsWith("fetch")).length).toBe(1);
		expect(log.filter((l) => l === "import stock").length).toBe(1);
	});

	test("the package's own is the lighter build: stock is never imported", async () => {
		const { load, log } = fakes({});
		expect(await load({}, () => {})).toEqual({ toolkit: "toolkit own", from: {} });
		expect(log).toEqual(["import own", "instantiate"]);
	});

	test("a lighter build that wins leaves no deadline timer pending", async () => {
		const { load, clock } = fakes({});
		expect((await load({}, () => {})).toolkit).toBe("toolkit own");
		expect(clock.pending()).toBe(0);
	});

	test("a lighter build that fails fast leaves no deadline timer pending", async () => {
		const { load, clock } = fakes({}, new Error("no wasm"));
		expect((await load({}, () => {})).toolkit).toBe("toolkit stock");
		expect(clock.pending()).toBe(0);
	});

	test("a lighter build that fails to import falls back to stock, with one warning", async () => {
		const { load, log, warnings } = fakes({}, new Error("404 verovio-module.wasm"));
		expect(await load({}, () => {})).toEqual({ toolkit: "toolkit stock", from: {} });
		expect(log).toEqual(["import own", "import stock", "instantiate"]);
		expect(warnings).toEqual([
			"<barmark-score>: the lighter Verovio was not used (Error: 404 verovio-module.wasm); loading stock Verovio instead",
		]);
	});

	test("a lighter build whose Verovio is not the toolkit's falls back to stock", async () => {
		// `versionOf` answers 6.3.0 for "toolkit own" in this fake.
		const { load, warnings } = fakes({}, null, "6.4.1", { ownVersion: "6.3.0" });
		expect((await load({}, () => {})).toolkit).toBe("toolkit stock");
		expect(warnings[0]).toContain("6.3.0");
	});

	test("a lighter build that has not instantiated by its deadline falls back to stock", async () => {
		const { load, log, clock, warnings } = fakes({}, null, "6.4.1", { ownHangs: true });
		const loading = load({}, () => {});
		clock.pass(20_000);
		expect((await loading).toolkit).toBe("toolkit stock");
		expect(log).toContain("import stock");
		expect(warnings).toEqual([
			"<barmark-score>: the lighter Verovio was not used (no answer in 20 s); loading stock Verovio instead",
		]);
	});

	test("a lighter build just short of its deadline is still waited for", async () => {
		const { load, log, clock, releaseOwn } = fakes({}, null, "6.4.1", { ownHangs: true });
		const loading = load({}, () => {});
		clock.pass(19_999);
		releaseOwn();
		expect((await loading).toolkit).toBe("toolkit own");
		expect(log).not.toContain("import stock");
	});

	test("a lighter build that arrives late is ignored: one toolkit, stock's", async () => {
		const { load, clock, releaseOwn, warnings } = fakes({}, null, "6.4.1", { ownHangs: true });
		const loading = load({}, () => {});
		clock.pass(20_000);
		const loaded = await loading;
		releaseOwn();
		await Promise.resolve();
		expect(loaded.toolkit).toBe("toolkit stock");
		expect(warnings.length).toBe(1);
	});

	test("a lighter build that arrives late reports nothing after the load", async () => {
		const { load, clock, releaseOwn } = fakes({}, null, "6.4.1", { ownHangs: true });
		const seen: LoadStatus[] = [];
		const loading = load({}, (s) => seen.push(s));
		clock.pass(20_000);
		await loading;
		const settled = seen.length;
		releaseOwn();
		await new Promise((r) => setTimeout(r, 0));
		expect(seen.length).toBe(settled);
	});

	test("a lighter build that fails after its deadline is not an unhandled rejection", async () => {
		const unhandled: unknown[] = [];
		const onUnhandled = (reason: unknown) => unhandled.push(reason);
		process.on("unhandledRejection", onUnhandled);
		try {
			const { load, clock, releaseOwn, warnings } = fakes({}, null, "6.4.1", { ownHangs: true });
			const loading = load({}, () => {});
			clock.pass(20_000);
			expect((await loading).toolkit).toBe("toolkit stock");
			releaseOwn(new Error("late failure"));
			await new Promise((r) => setTimeout(r, 0));
			expect(unhandled).toEqual([]);
			expect(warnings.length).toBe(1);
		} finally {
			process.off("unhandledRejection", onUnhandled);
		}
	});

	test("both of the package's copies failing is stock's failure, naming the lighter build's reason too", async () => {
		const { load } = fakes({}, new Error("no wasm"), "6.4.1", {
			stockFails: new Error("stock is gone"),
		});
		await expect(load({}, () => {})).rejects.toThrow(
			/stock is gone.*no wasm|no wasm.*stock is gone/s,
		);
	});

	test("both of the package's copies failing says each reason once, with stock's error as the cause", async () => {
		const stockErr = new Error("stock is gone");
		const { load } = fakes({}, new Error("no wasm"), "6.4.1", { stockFails: stockErr });
		const err = await load({}, () => {}).then(
			() => undefined,
			(e: unknown) => e as Error,
		);
		expect(err?.message.startsWith("stock is gone")).toBe(true);
		expect(err?.message).not.toContain("Error: Error:");
		expect(err?.message).toContain("no wasm");
		expect(err?.cause).toBe(stockErr);
	});

	test("a url that fails, then a lighter build that fails: stock, and two warnings in order", async () => {
		const { load, warnings } = fakes({}, new Error("no wasm"));
		const r = await load(
			{ verovioUrl: "https://cdn.test/v.mjs", verovioIntegrity: "ok-x" },
			() => {},
		);
		expect(r).toEqual({ toolkit: "toolkit stock", from: {} });
		expect(warnings.map((w) => w.includes("https://cdn.test/v.mjs"))).toEqual([true, false]);
		expect(warnings[1]).toContain("the lighter Verovio was not used");
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

	test("a wasm digest without verovio-integrity is reported with the url, so a replacement checks it too", async () => {
		const { load, wasms } = fakes({ [url]: "cdn" });
		const source = { verovioUrl: url, verovioWasmIntegrity: "sha384-W" };
		expect(await load(source, () => {})).toEqual({ toolkit: "toolkit cdn", from: source });
		expect(wasms).toEqual([{ moduleUrl: url, integrity: "sha384-W", required: false }]);
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

	test("the package's own copy gets no wasm source, lighter or stock", async () => {
		const { load, wasms } = fakes({});
		await load({}, () => {});
		expect(wasms).toEqual([undefined]);
		const fallback = fakes({}, null, "6.4.1", { ownVersion: "6.3.0" });
		await fallback.load({}, () => {});
		expect(fallback.wasms).toEqual([undefined, undefined]);
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
