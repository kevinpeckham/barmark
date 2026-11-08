import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { VerovioToolkit } from "verovio/esm";
import createVerovioModule from "verovio/wasm";
import { createEngine, type Reply, type Request, type WorkerLike } from "../src/engine.js";
import { handle, loadOnce } from "../src/worker.js";

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
	reply(id: number, svg = `svg${id}`) {
		this.onmessage?.({ data: { id, ok: true, svg, pages: 1 } } as MessageEvent<Reply>);
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
	test("only the newest request resolves into view", async () => {
		const { workers, engine } = fake();
		const key = {};
		const a = engine.engrave(key, "a", 800);
		const b = engine.engrave(key, "b", 800);
		const c = engine.engrave(key, "c", 800);
		const w = workers[0] as FakeWorker;
		const [i1, i2, i3] = w.posted.map((p) => p.id) as [number, number, number];
		w.reply(i1);
		w.reply(i3);
		w.reply(i2);
		expect(await a).toBeNull();
		expect(await b).toBeNull();
		expect(await c).toEqual({ id: i3, ok: true, svg: `svg${i3}`, pages: 1 });
	});

	test("one worker serves every element", async () => {
		const { workers, engine } = fake();
		const a = engine.engrave({}, "a", 800);
		const b = engine.engrave({}, "b", 800);
		expect(workers.length).toBe(1);
		const w = workers[0] as FakeWorker;
		w.reply(w.posted[1]?.id as number, "B");
		w.reply(w.posted[0]?.id as number, "A");
		expect(await a).toMatchObject({ svg: "A" });
		expect(await b).toMatchObject({ svg: "B" });
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
		w.reply(w.posted[0]?.id as number);
		expect(await c).toMatchObject({ ok: true });
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
