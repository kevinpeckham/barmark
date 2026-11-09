import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { VerovioToolkit } from "verovio/esm";
import createVerovioModule from "verovio/wasm";
import {
	createEngine,
	JOB_DEADLINE_MS,
	type Reply,
	type Request,
	SUPERSEDED_GRACE_MS,
	type WorkerLike,
} from "../src/engine.js";
import { handle, loadOnce, toolkitLoader } from "../src/worker.js";

class FakeWorker implements WorkerLike {
	posted: Request[] = [];
	terminated = false;
	onmessage: ((e: MessageEvent<Reply>) => void) | null = null;
	onerror: ((e: ErrorEvent) => void) | null = null;
	postMessage(request: Request) {
		this.posted.push(request);
	}
	terminate() {
		this.terminated = true;
	}
	reply(id: number, svg = `svg${id}`, loaded?: { verovioUrl?: string }) {
		const data: Reply = { id, ok: true, svg, pages: 1, ...(loaded ? { loaded } : {}) };
		this.onmessage?.({ data } as MessageEvent<Reply>);
	}
	/** Answers the job it is on: the last request posted. */
	answer(svg?: string, loaded?: { verovioUrl?: string }) {
		const id = this.posted[this.posted.length - 1]?.id as number;
		this.reply(id, svg ?? `svg${id}`, loaded);
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
		expect(w.posted.map((p) => p.text)).toEqual(["a"]);
		expect(await a).toBeNull();
		expect(await b).toBeNull();
		w.answer();
		expect(w.posted.map((p) => p.text)).toEqual(["a", "c"]);
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

	test("a crashed worker fails pending requests and restarts", async () => {
		const { workers, engine } = fake();
		const a = engine.engrave({}, "a", 800);
		const b = engine.engrave({}, "b", 800);
		workers[0]?.onerror?.({} as ErrorEvent);
		await expect(a).rejects.toThrow("The score engine failed");
		await expect(b).rejects.toThrow("The score engine failed");
		expect(workers[0]?.terminated).toBe(true);
		const c = engine.engrave({}, "c", 800);
		expect(workers.length).toBe(2);
		const w = workers[1] as FakeWorker;
		w.answer();
		expect(await c).toMatchObject({ ok: true });
	});

	test("a superseded job past its grace is cut off, and the newest runs on a fresh worker", async () => {
		const { workers, engine } = fake();
		const key = {};
		const a = engine.engrave(key, "a", 800);
		jest.advanceTimersByTime(SUPERSEDED_GRACE_MS);
		const b = engine.engrave(key, "b", 800);
		expect(await a).toBeNull();
		expect(workers[0]?.terminated).toBe(true);
		expect(workers.length).toBe(2);
		const w = workers[1] as FakeWorker;
		expect(w.posted.map((p) => p.text)).toEqual(["b"]);
		// A reply the old worker sent as it was cut off is not taken for the new one's.
		workers[0]?.reply(w.posted[0]?.id as number, "stale");
		w.answer("B");
		expect(await b).toMatchObject({ svg: "B" });
	});

	test("a superseded job is cut off when its grace runs out, if it is still running", async () => {
		const { workers, engine } = fake();
		const key = {};
		const a = engine.engrave(key, "a", 800);
		const b = engine.engrave(key, "b", 800);
		expect(await a).toBeNull();
		// Most jobs are quick: it may finish, and then the worker (and its Verovio) is kept.
		expect(workers[0]?.terminated).toBe(false);
		jest.advanceTimersByTime(SUPERSEDED_GRACE_MS - 1);
		expect(workers[0]?.terminated).toBe(false);
		jest.advanceTimersByTime(1);
		expect(workers[0]?.terminated).toBe(true);
		const w = workers[1] as FakeWorker;
		expect(w.posted.map((p) => p.text)).toEqual(["b"]);
		w.answer("B");
		expect(await b).toMatchObject({ svg: "B" });
	});

	test("a superseded job that finishes within its grace keeps the worker", async () => {
		const { workers, engine } = fake();
		const key = {};
		engine.engrave(key, "a", 800);
		const b = engine.engrave(key, "b", 800);
		const w = workers[0] as FakeWorker;
		w.answer();
		jest.advanceTimersByTime(SUPERSEDED_GRACE_MS);
		expect(w.terminated).toBe(false);
		expect(w.posted.map((p) => p.text)).toEqual(["a", "b"]);
		w.answer("B");
		expect(await b).toMatchObject({ svg: "B" });
		expect(workers.length).toBe(1);
	});

	test("a cut never loses another element's request: it runs on the fresh worker", async () => {
		const { workers, engine } = fake();
		const one = {};
		engine.engrave(one, "a", 800);
		const x = engine.engrave({}, "x", 800);
		jest.advanceTimersByTime(SUPERSEDED_GRACE_MS);
		const b = engine.engrave(one, "b", 800);
		expect(workers[0]?.terminated).toBe(true);
		const w = workers[1] as FakeWorker;
		expect(w.posted.map((p) => p.text)).toEqual(["x"]);
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
		jest.advanceTimersByTime(SUPERSEDED_GRACE_MS);
		engine.engrave(one, "b", 800);
		const w = workers[0] as FakeWorker;
		expect(w.terminated).toBe(false);
		w.answer("X");
		expect(await x).toMatchObject({ svg: "X" });
		expect(w.posted.map((p) => p.text)).toEqual(["x", "b"]);
	});

	test("a job past its deadline is cut off and rejects; the next runs on a fresh worker", async () => {
		const { workers, engine } = fake();
		const a = engine.engrave({}, "a", 800);
		const x = engine.engrave({}, "x", 800);
		jest.advanceTimersByTime(JOB_DEADLINE_MS - 1);
		expect(workers[0]?.terminated).toBe(false);
		jest.advanceTimersByTime(1);
		await expect(a).rejects.toThrow("The score engine failed");
		expect(workers[0]?.terminated).toBe(true);
		const w = workers[1] as FakeWorker;
		expect(w.posted.map((p) => p.text)).toEqual(["x"]);
		// The deadline is the job's own: time spent waiting its turn doesn't count.
		jest.advanceTimersByTime(JOB_DEADLINE_MS - 1);
		w.answer("X");
		expect(await x).toMatchObject({ svg: "X" });
	});

	test("the deadline is an engine option", async () => {
		const workers: FakeWorker[] = [];
		const engine = createEngine(
			() => {
				const w = new FakeWorker();
				workers.push(w);
				return w;
			},
			{ deadline: 50 },
		);
		const a = engine.engrave({}, "a", 800);
		jest.advanceTimersByTime(50);
		await expect(a).rejects.toThrow("The score engine failed");
	});

	test("a fresh worker loads the Verovio the first one loaded, whatever the request asks", async () => {
		const { workers, engine } = fake();
		engine.engrave({}, "a", 800, "/first.js");
		(workers[0] as FakeWorker).answer("A", { verovioUrl: "/first.js" });
		const b = engine.engrave({}, "b", 800, "/second.js");
		jest.advanceTimersByTime(JOB_DEADLINE_MS);
		await expect(b).rejects.toThrow("The score engine failed");
		engine.engrave({}, "c", 800, "/second.js");
		expect(workers[1]?.posted[0]).toMatchObject({ text: "c", verovioUrl: "/first.js" });
	});

	test("a fresh worker loads the package's own Verovio if the first one did", async () => {
		const { workers, engine } = fake();
		engine.engrave({}, "a", 800);
		(workers[0] as FakeWorker).answer("A", {});
		const b = engine.engrave({}, "b", 800, "/v.js");
		jest.advanceTimersByTime(JOB_DEADLINE_MS);
		await expect(b).rejects.toThrow("The score engine failed");
		engine.engrave({}, "c", 800, "/v.js");
		expect(workers[1]?.posted[0]).not.toHaveProperty("verovioUrl");
	});

	test("before any Verovio has loaded, a fresh worker takes the request's own url", async () => {
		const { workers, engine } = fake();
		const a = engine.engrave({}, "a", 800, "/slow.js");
		jest.advanceTimersByTime(JOB_DEADLINE_MS);
		await expect(a).rejects.toThrow("The score engine failed");
		engine.engrave({}, "b", 800, "/other.js");
		expect(workers[1]?.posted[0]).toMatchObject({ verovioUrl: "/other.js" });
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

describe("toolkitLoader", () => {
	test("reports the url of the load that succeeded, none before", async () => {
		const tried: (string | undefined)[] = [];
		const loader = toolkitLoader(async (url: string | undefined) => {
			tried.push(url);
			if (url === "/bad.js") throw new Error("no module");
			return `toolkit from ${url ?? "the package"}`;
		});
		expect(loader.loaded()).toBeUndefined();
		await expect(loader.ready("/bad.js")).rejects.toThrow("no module");
		expect(loader.loaded()).toBeUndefined();
		expect(await loader.ready("/good.js")).toBe("toolkit from /good.js");
		expect(loader.loaded()).toEqual({ verovioUrl: "/good.js" });
		// First that loads wins for the worker's life.
		expect(await loader.ready(undefined)).toBe("toolkit from /good.js");
		expect(tried).toEqual(["/bad.js", "/good.js"]);
	});

	test("the package's own Verovio is reported with no url", async () => {
		const loader = toolkitLoader(async () => "toolkit");
		await loader.ready(undefined);
		expect(loader.loaded()).toEqual({});
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
