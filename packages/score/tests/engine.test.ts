import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { VerovioToolkit } from "verovio/esm";
import createVerovioModule from "verovio/wasm";
import {
	createEngine,
	type EngineStatus,
	JOB_DEADLINE_MS,
	LOAD_DEADLINE_MS,
	type LoadStatus,
	type Request,
	SUPERSEDED_GRACE_MS,
	type WorkerLike,
	type WorkerMessage,
} from "../src/engine.js";
import { handle, loadOnce, toolkitLoader, withReady } from "../src/worker.js";

class FakeWorker implements WorkerLike {
	posted: Request[] = [];
	terminated = false;
	onmessage: ((e: MessageEvent<WorkerMessage>) => void) | null = null;
	onerror: ((e: ErrorEvent) => void) | null = null;
	postMessage(request: Request) {
		this.posted.push(request);
	}
	terminate() {
		this.terminated = true;
	}
	send(data: WorkerMessage) {
		this.onmessage?.({ data } as MessageEvent<WorkerMessage>);
	}
	reply(id: number, svg = `svg${id}`) {
		this.send({ id, ok: true, svg, pages: 1 });
	}
	/** The id of the job it is on: the last request posted. */
	get current() {
		return this.posted[this.posted.length - 1]?.id as number;
	}
	/** Says its Verovio is loaded, for the job it is on. */
	ready(loaded: { verovioUrl?: string; verovioIntegrity?: string } = {}) {
		this.send({ id: this.current, loaded });
	}
	/** Answers the job it is on. */
	answer(svg?: string) {
		const id = this.current;
		this.reply(id, svg ?? `svg${id}`);
		return id;
	}
}

const fake = () => {
	const workers: FakeWorker[] = [];
	const engine = createEngine(() => {
		const w = new FakeWorker();
		workers.push(w);
		return w;
	});
	return { workers, engine };
};

const texts = (w: FakeWorker | undefined) => w?.posted.map((p) => p.text);

describe("createEngine", () => {
	beforeEach(() => jest.useFakeTimers());
	afterEach(() => jest.useRealTimers());

	test("only the newest request resolves into view", async () => {
		const { workers, engine } = fake();
		const key = {};
		const a = engine.engrave(key, "a", 800);
		const b = engine.engrave(key, "b", 800);
		const c = engine.engrave(key, "c", 800);
		const w = workers[0] as FakeWorker;
		// The worker takes one job at a time: a superseded request still waiting is never sent.
		expect(texts(w)).toEqual(["a"]);
		expect(await a).toBeNull();
		expect(await b).toBeNull();
		w.answer();
		expect(texts(w)).toEqual(["a", "c"]);
		const i3 = w.answer();
		expect(await c).toEqual({ id: i3, ok: true, svg: `svg${i3}`, pages: 1 });
	});

	test("one worker serves every element, a job at a time", async () => {
		const { workers, engine } = fake();
		const a = engine.engrave({}, "a", 800);
		const b = engine.engrave({}, "b", 800);
		expect(workers.length).toBe(1);
		const w = workers[0] as FakeWorker;
		w.answer("A");
		w.answer("B");
		expect(await a).toMatchObject({ svg: "A" });
		expect(await b).toMatchObject({ svg: "B" });
		expect(workers.length).toBe(1);
	});

	test("the Verovio url travels with the request", () => {
		const { workers, engine } = fake();
		engine.engrave({}, "a", 800, "/v.js");
		expect(workers[0]?.posted[0]).toMatchObject({ text: "a", width: 800, verovioUrl: "/v.js" });
	});

	test("a crashed worker fails its job; the requests still waiting run on a fresh one", async () => {
		const { workers, engine } = fake();
		const a = engine.engrave({}, "a", 800);
		const b = engine.engrave({}, "b", 800);
		workers[0]?.onerror?.({} as ErrorEvent);
		await expect(a).rejects.toThrow("The score engine failed");
		expect(workers[0]?.terminated).toBe(true);
		const w = workers[1] as FakeWorker;
		expect(texts(w)).toEqual(["b"]);
		w.answer("B");
		expect(await b).toMatchObject({ svg: "B" });
		const c = engine.engrave({}, "c", 800);
		w.answer("C");
		expect(await c).toMatchObject({ svg: "C" });
		expect(workers.length).toBe(2);
	});

	test("a superseded job past its grace is cut off, and the newest runs on a fresh worker", async () => {
		const { workers, engine } = fake();
		const key = {};
		const a = engine.engrave(key, "a", 800);
		workers[0]?.ready();
		jest.advanceTimersByTime(SUPERSEDED_GRACE_MS);
		const b = engine.engrave(key, "b", 800);
		expect(await a).toBeNull();
		expect(workers[0]?.terminated).toBe(true);
		expect(workers.length).toBe(2);
		const w = workers[1] as FakeWorker;
		expect(texts(w)).toEqual(["b"]);
		// A reply the old worker sent as it was cut off is not taken for the new one's.
		workers[0]?.reply(w.current, "stale");
		w.answer("B");
		expect(await b).toMatchObject({ svg: "B" });
	});

	test("a superseded job is cut off when its grace runs out, if it is still running", async () => {
		const { workers, engine } = fake();
		const key = {};
		const a = engine.engrave(key, "a", 800);
		workers[0]?.ready();
		const b = engine.engrave(key, "b", 800);
		expect(await a).toBeNull();
		// Most jobs are quick: it may finish, and then the worker (and its Verovio) is kept.
		expect(workers[0]?.terminated).toBe(false);
		jest.advanceTimersByTime(SUPERSEDED_GRACE_MS - 1);
		expect(workers[0]?.terminated).toBe(false);
		jest.advanceTimersByTime(1);
		expect(workers[0]?.terminated).toBe(true);
		const w = workers[1] as FakeWorker;
		expect(texts(w)).toEqual(["b"]);
		w.answer("B");
		expect(await b).toMatchObject({ svg: "B" });
	});

	test("a slow device has three seconds' grace", () => {
		expect(SUPERSEDED_GRACE_MS).toBe(3_000);
	});

	test("a superseded job loading Verovio is not cut: the load serves the next job", async () => {
		const { workers, engine } = fake();
		const key = {};
		engine.engrave(key, "a", 800);
		engine.engrave(key, "b", 800);
		jest.advanceTimersByTime(SUPERSEDED_GRACE_MS * 5);
		expect(workers[0]?.terminated).toBe(false);
		// Loaded: its grace starts now.
		workers[0]?.ready();
		jest.advanceTimersByTime(SUPERSEDED_GRACE_MS);
		expect(workers[0]?.terminated).toBe(true);
	});

	test("a superseded job that finishes within its grace keeps the worker", async () => {
		const { workers, engine } = fake();
		const key = {};
		engine.engrave(key, "a", 800);
		const b = engine.engrave(key, "b", 800);
		const w = workers[0] as FakeWorker;
		w.ready();
		w.answer();
		jest.advanceTimersByTime(SUPERSEDED_GRACE_MS);
		expect(w.terminated).toBe(false);
		expect(texts(w)).toEqual(["a", "b"]);
		w.answer("B");
		expect(await b).toMatchObject({ svg: "B" });
		expect(workers.length).toBe(1);
	});

	test("a cut never loses another element's request: it runs on the fresh worker", async () => {
		const { workers, engine } = fake();
		const one = {};
		engine.engrave(one, "a", 800);
		const x = engine.engrave({}, "x", 800);
		workers[0]?.ready();
		jest.advanceTimersByTime(SUPERSEDED_GRACE_MS);
		const b = engine.engrave(one, "b", 800);
		expect(workers[0]?.terminated).toBe(true);
		const w = workers[1] as FakeWorker;
		expect(texts(w)).toEqual(["x"]);
		w.answer("X");
		w.answer("B");
		expect(await x).toMatchObject({ svg: "X" });
		expect(await b).toMatchObject({ svg: "B" });
	});

	test("a job another element still waits on is not cut when a third request supersedes a queued one", async () => {
		const { workers, engine } = fake();
		const one = {};
		const x = engine.engrave({}, "x", 800);
		engine.engrave(one, "a", 800);
		workers[0]?.ready();
		jest.advanceTimersByTime(SUPERSEDED_GRACE_MS);
		engine.engrave(one, "b", 800);
		const w = workers[0] as FakeWorker;
		expect(w.terminated).toBe(false);
		w.answer("X");
		expect(await x).toMatchObject({ svg: "X" });
		expect(texts(w)).toEqual(["x", "b"]);
	});

	test("a job past its deadline once Verovio is ready is cut off and rejects; the next runs on a fresh worker", async () => {
		const { workers, engine } = fake();
		const a = engine.engrave({}, "a", 800);
		const x = engine.engrave({}, "x", 800);
		workers[0]?.ready();
		jest.advanceTimersByTime(JOB_DEADLINE_MS - 1);
		expect(workers[0]?.terminated).toBe(false);
		jest.advanceTimersByTime(1);
		await expect(a).rejects.toThrow("The score engine failed");
		expect(workers[0]?.terminated).toBe(true);
		const w = workers[1] as FakeWorker;
		expect(texts(w)).toEqual(["x"]);
		// The deadline is the job's own: time spent waiting its turn doesn't count.
		w.ready();
		jest.advanceTimersByTime(JOB_DEADLINE_MS - 1);
		w.answer("X");
		expect(await x).toMatchObject({ svg: "X" });
	});

	test("loading Verovio has its own, longer budget: a slow download is not the job's deadline", async () => {
		const { workers, engine } = fake();
		const a = engine.engrave({}, "a", 800);
		const w = workers[0] as FakeWorker;
		jest.advanceTimersByTime(LOAD_DEADLINE_MS - 1);
		expect(w.terminated).toBe(false);
		w.ready();
		jest.advanceTimersByTime(JOB_DEADLINE_MS - 1);
		expect(w.terminated).toBe(false);
		w.answer("A");
		expect(await a).toMatchObject({ svg: "A" });
	});

	test("a load that never finishes is cut off at its budget and rejects", async () => {
		const { workers, engine } = fake();
		const a = engine.engrave({}, "a", 800);
		jest.advanceTimersByTime(LOAD_DEADLINE_MS);
		await expect(a).rejects.toThrow("The score engine failed");
		expect(workers[0]?.terminated).toBe(true);
	});

	test("a ready for another job, or from an old worker, arms nothing", async () => {
		const { workers, engine } = fake();
		const a = engine.engrave({}, "a", 800);
		const w = workers[0] as FakeWorker;
		w.send({ id: w.current + 1, loaded: {} });
		jest.advanceTimersByTime(LOAD_DEADLINE_MS - 1);
		expect(w.terminated).toBe(false);
		w.answer("A");
		expect(await a).toMatchObject({ svg: "A" });
	});

	test("the deadlines are engine options", async () => {
		const workers: FakeWorker[] = [];
		const engine = createEngine(
			() => {
				const w = new FakeWorker();
				workers.push(w);
				return w;
			},
			{ deadline: 50, loadDeadline: 100 },
		);
		const a = engine.engrave({}, "a", 800);
		jest.advanceTimersByTime(100);
		await expect(a).rejects.toThrow("The score engine failed");
		const b = engine.engrave({}, "b", 800);
		workers[1]?.ready();
		jest.advanceTimersByTime(50);
		await expect(b).rejects.toThrow("The score engine failed");
	});

	test("a fresh worker loads the Verovio the first one loaded, whatever the request asks", async () => {
		const { workers, engine } = fake();
		engine.engrave({}, "a", 800, "/first.js");
		(workers[0] as FakeWorker).ready({ verovioUrl: "/first.js" });
		(workers[0] as FakeWorker).answer("A");
		const b = engine.engrave({}, "b", 800, "/second.js");
		workers[0]?.ready({ verovioUrl: "/first.js" });
		jest.advanceTimersByTime(JOB_DEADLINE_MS);
		await expect(b).rejects.toThrow("The score engine failed");
		engine.engrave({}, "c", 800, "/second.js");
		expect(workers[1]?.posted[0]).toMatchObject({ text: "c", verovioUrl: "/first.js" });
	});

	test("a fresh worker loads the package's own Verovio if the first one did", async () => {
		const { workers, engine } = fake();
		engine.engrave({}, "a", 800);
		(workers[0] as FakeWorker).ready({});
		(workers[0] as FakeWorker).answer("A");
		const b = engine.engrave({}, "b", 800, "/v.js");
		jest.advanceTimersByTime(LOAD_DEADLINE_MS);
		await expect(b).rejects.toThrow("The score engine failed");
		engine.engrave({}, "c", 800, "/v.js");
		expect(workers[1]?.posted[0]).not.toHaveProperty("verovioUrl");
	});

	test("before any Verovio has loaded, a fresh worker takes the request's own url", async () => {
		const { workers, engine } = fake();
		const a = engine.engrave({}, "a", 800, "/slow.js");
		jest.advanceTimersByTime(LOAD_DEADLINE_MS);
		await expect(a).rejects.toThrow("The score engine failed");
		engine.engrave({}, "b", 800, "/other.js");
		expect(workers[1]?.posted[0]).toMatchObject({ verovioUrl: "/other.js" });
	});
});

describe("createEngine: loading", () => {
	beforeEach(() => jest.useFakeTimers());
	afterEach(() => jest.useRealTimers());

	const download = (fraction: number | null): LoadStatus => ({
		phase: "download",
		fraction,
		bytes: null,
	});

	test("a caller hears the load's progress, then engraving", () => {
		const { workers, engine } = fake();
		const seen: EngineStatus[] = [];
		engine.engrave({}, "a", 800, undefined, { onStatus: (s) => seen.push(s) });
		const w = workers[0] as FakeWorker;
		w.send({ id: w.current, status: download(0.5) });
		w.send({ id: w.current, status: { phase: "prepare" } });
		w.ready();
		expect(seen).toEqual([
			download(null),
			download(0.5),
			{ phase: "prepare" },
			{ phase: "engrave" },
		]);
	});

	test("every caller waiting on the load hears it; a caller after it hears engraving at once", () => {
		const { workers, engine } = fake();
		const a: EngineStatus[] = [];
		const b: EngineStatus[] = [];
		engine.engrave({}, "a", 800, undefined, { onStatus: (s) => a.push(s) });
		engine.engrave({}, "b", 800, undefined, { onStatus: (s) => b.push(s) });
		const w = workers[0] as FakeWorker;
		w.send({ id: w.current, status: download(0.25) });
		expect(b.at(-1)).toEqual(download(0.25));
		w.ready();
		w.answer();
		const c: EngineStatus[] = [];
		engine.engrave({}, "c", 800, undefined, { onStatus: (s) => c.push(s) });
		expect(c).toEqual([{ phase: "engrave" }]);
	});

	test("progress from another job or an old worker is ignored", () => {
		const { workers, engine } = fake();
		const seen: EngineStatus[] = [];
		engine.engrave({}, "a", 800, undefined, { onStatus: (s) => seen.push(s) });
		const w = workers[0] as FakeWorker;
		w.send({ id: w.current + 1, status: download(0.5) });
		expect(seen).toEqual([download(null)]);
	});

	test("after a cut, the callers still waiting hear the fresh worker's load from the start", async () => {
		const { workers, engine } = fake();
		const a = engine.engrave({}, "a", 800);
		const seen: EngineStatus[] = [];
		engine.engrave({}, "b", 800, undefined, { onStatus: (s) => seen.push(s) });
		(workers[0] as FakeWorker).ready();
		(workers[0] as FakeWorker).onerror?.({} as ErrorEvent);
		await expect(a).rejects.toThrow("The score engine failed");
		expect(seen).toEqual([download(null), { phase: "engrave" }, download(null)]);
	});

	test("integrity travels with the url", () => {
		const { workers, engine } = fake();
		engine.engrave({}, "a", 800, "https://cdn.test/v.mjs", { integrity: "sha384-x" });
		expect(workers[0]?.posted[0]).toMatchObject({
			verovioUrl: "https://cdn.test/v.mjs",
			verovioIntegrity: "sha384-x",
		});
	});

	test("a fresh worker loads what the first one loaded, integrity and all", async () => {
		const { workers, engine } = fake();
		const loaded = { verovioUrl: "https://cdn.test/v.mjs", verovioIntegrity: "sha384-x" };
		engine.engrave({}, "a", 800, loaded.verovioUrl, { integrity: loaded.verovioIntegrity });
		(workers[0] as FakeWorker).ready(loaded);
		(workers[0] as FakeWorker).answer();
		const b = engine.engrave({}, "b", 800);
		workers[0]?.ready(loaded);
		jest.advanceTimersByTime(JOB_DEADLINE_MS);
		await expect(b).rejects.toThrow("The score engine failed");
		engine.engrave({}, "c", 800);
		expect(workers[1]?.posted[0]).toMatchObject(loaded);
	});

	test("preload loads Verovio with no job, and the next job uses that load", async () => {
		const { workers, engine } = fake();
		engine.preload("https://cdn.test/v.mjs", "sha384-x");
		const w = workers[0] as FakeWorker;
		expect(w.posted).toEqual([
			{
				id: w.current,
				text: "",
				width: 0,
				preload: true,
				verovioUrl: "https://cdn.test/v.mjs",
				verovioIntegrity: "sha384-x",
			},
		]);
		w.ready({ verovioUrl: "https://cdn.test/v.mjs" });
		const a = engine.engrave({}, "a", 800);
		expect(w.posted.at(-1)).toMatchObject({ text: "a", verovioUrl: "https://cdn.test/v.mjs" });
		w.ready({ verovioUrl: "https://cdn.test/v.mjs" });
		const id = w.answer();
		expect(await a).toMatchObject({ id, ok: true });
		expect(workers.length).toBe(1);
	});

	test("preload is idempotent: loading, loaded or busy, it adds nothing", () => {
		const { workers, engine } = fake();
		engine.preload();
		engine.preload();
		const w = workers[0] as FakeWorker;
		expect(w.posted.length).toBe(1);
		w.ready();
		engine.preload();
		expect(w.posted.length).toBe(1);
		engine.engrave({}, "a", 800);
		engine.preload();
		expect(w.posted.length).toBe(2);
	});

	test("a job asked for during a preload waits for it, hearing its progress", () => {
		const { workers, engine } = fake();
		engine.preload();
		const seen: EngineStatus[] = [];
		engine.engrave({}, "a", 800, undefined, { onStatus: (s) => seen.push(s) });
		const w = workers[0] as FakeWorker;
		expect(w.posted.length).toBe(1);
		w.send({ id: w.current, status: download(0.5) });
		w.ready();
		expect(w.posted.at(-1)).toMatchObject({ text: "a" });
		expect(seen).toEqual([download(null), download(0.5), { phase: "engrave" }]);
	});

	test("a failed preload moves on to the job waiting behind it", () => {
		const { workers, engine } = fake();
		engine.preload();
		engine.engrave({}, "a", 800);
		const w = workers[0] as FakeWorker;
		w.send({ id: w.current, ok: false, reason: "no module" });
		expect(w.posted.at(-1)).toMatchObject({ text: "a" });
	});

	test("a preload that never loads is cut off at the load budget", () => {
		const { workers, engine } = fake();
		engine.preload();
		jest.advanceTimersByTime(LOAD_DEADLINE_MS);
		expect(workers[0]?.terminated).toBe(true);
		engine.preload();
		expect(workers.length).toBe(2);
	});
});

const vrv = new VerovioToolkit(await createVerovioModule());

describe("handle", () => {
	const ready = async () => vrv;
	const chart = readFileSync(
		join(import.meta.dir, "../../../examples/morning-song.chart.md"),
		"utf8",
	);

	test("a good chart is engraved", async () => {
		const r = await handle({ id: 7, text: chart, width: 800 }, ready);
		expect(r).toMatchObject({ id: 7, ok: true });
		if (r.ok) expect(r.svg).toContain("bms-score-page");
	});

	test("a broken chart is a reason, never a throw", async () => {
		const r = await handle({ id: 8, text: "| C |\n| Xq9 |", width: 800 }, ready);
		expect(r).toMatchObject({ id: 8, ok: false });
		if (!r.ok) expect(r.reason).toContain("Line");
	});

	test("a toolkit that fails to load is a reason too", async () => {
		const r = await handle({ id: 9, text: chart, width: 800 }, () =>
			Promise.reject(new Error("no wasm")),
		);
		expect(r).toEqual({ id: 9, ok: false, reason: "Error: no wasm" });
	});
});

const none = () => {};

describe("toolkitLoader", () => {
	test("reports where the load that succeeded came from, nothing before", async () => {
		const tried: (string | undefined)[] = [];
		const loader = toolkitLoader(async ({ verovioUrl }) => {
			tried.push(verovioUrl);
			if (verovioUrl === "/bad.js") throw new Error("no module");
			return {
				toolkit: `toolkit from ${verovioUrl ?? "the package"}`,
				from: verovioUrl ? { verovioUrl } : {},
			};
		});
		expect(loader.loaded()).toBeUndefined();
		await expect(loader.ready({ verovioUrl: "/bad.js" }, none)).rejects.toThrow("no module");
		expect(loader.loaded()).toBeUndefined();
		expect(await loader.ready({ verovioUrl: "/good.js" }, none)).toBe("toolkit from /good.js");
		expect(loader.loaded()).toEqual({ verovioUrl: "/good.js" });
		// First that loads wins for the worker's life.
		expect(await loader.ready({}, none)).toBe("toolkit from /good.js");
		expect(tried).toEqual(["/bad.js", "/good.js"]);
	});

	test("a load that fell back is reported as where it fell back to", async () => {
		const loader = toolkitLoader(async () => ({ toolkit: "toolkit", from: {} }));
		await loader.ready({ verovioUrl: "/v.js", verovioIntegrity: "sha384-x" }, none);
		expect(loader.loaded()).toEqual({});
	});
});

describe("withReady", () => {
	test("posts the load's progress, then says the toolkit is ready and where it came from", async () => {
		const posted: unknown[] = [];
		const loader = toolkitLoader(async ({ verovioUrl }, report) => {
			report({ phase: "prepare" });
			return { toolkit: `toolkit from ${verovioUrl}`, from: verovioUrl ? { verovioUrl } : {} };
		});
		const ready = withReady(loader, { id: 4, text: "x", width: 800, verovioUrl: "/v.js" }, (m) =>
			posted.push(m),
		);
		expect(await ready()).toBe("toolkit from /v.js");
		expect(posted).toEqual([
			{ id: 4, status: { phase: "prepare" } },
			{ id: 4, loaded: { verovioUrl: "/v.js" } },
		]);
	});

	test("a load that fails says nothing", async () => {
		const posted: unknown[] = [];
		const loader = toolkitLoader(async () => {
			throw new Error("no module");
		});
		const ready = withReady(loader, { id: 5, text: "x", width: 800 }, (m) => posted.push(m));
		await expect(ready()).rejects.toThrow("no module");
		expect(posted).toEqual([]);
	});
});

describe("loadOnce", () => {
	test("a failed load is retried, a good one kept", async () => {
		let calls = 0;
		const load = loadOnce(async (n: number) => {
			calls++;
			if (calls === 1) throw new Error("fetch failed");
			return n;
		});
		const flaky = async () => (await load(1)) as unknown as never;
		const first = await handle({ id: 1, text: "x", width: 800 }, flaky);
		expect(first).toMatchObject({ ok: false });
		expect(await load(2)).toBe(2);
		expect(await load(3)).toBe(2);
		expect(calls).toBe(2);
	});
});
