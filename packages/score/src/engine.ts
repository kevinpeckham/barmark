/** What a page asks the worker for: one chart, laid out for a width. */
export type Request = { id: number; text: string; width: number; verovioUrl?: string };

/**
 * What the worker answers. No `xml` or `diagnostics` cross the boundary.
 * `loaded`, once the worker has a Verovio, says where it came from (no
 * `verovioUrl`: the package's own), so a replacement worker loads the same.
 */
export type Reply = (
	| { id: number; ok: true; svg: string; pages: number }
	| { id: number; ok: false; reason: string }
) & { loaded?: { verovioUrl?: string } };

/** An `EngraveReply` is a reply a page may show. */
export type EngraveReply = Reply;

/**
 * The part of a `Worker` the engine uses, so a test can pass a fake. It is
 * driven by the `onmessage` and `onerror` properties (a real `Worker`
 * satisfies this), not by `addEventListener`.
 */
export interface WorkerLike {
	postMessage(request: Request): void;
	terminate(): void;
	onmessage: ((e: MessageEvent<Reply>) => void) | null;
	onerror: ((e: ErrorEvent) => void) | null;
}

export type Engine = {
	/**
	 * Engrave `text` for `width`. Per `key` (the element) only the newest
	 * request resolves with a reply; an older one resolves `null`. Rejects
	 * with "The score engine failed" if the worker crashes or the job runs
	 * past its deadline.
	 */
	engrave(
		key: object,
		text: string,
		width: number,
		verovioUrl?: string,
	): Promise<EngraveReply | null>;
};

/** How long one job may run (Verovio's load included) before its worker is cut off and the request rejects. */
export const JOB_DEADLINE_MS = 20_000;

/**
 * How long a job no one waits for any more (a newer request from its
 * element superseded it) may run before its worker is cut off. Most jobs
 * finish well within it, and keeping the worker keeps its loaded Verovio.
 */
export const SUPERSEDED_GRACE_MS = 1_000;

export type EngineOptions = { deadline?: number; grace?: number };

type Pending = {
	resolve: (reply: EngraveReply | null) => void;
	reject: (error: Error) => void;
};

/**
 * The job the worker is on: the worker takes one at a time, so a waiting
 * one can still be dropped. `superseded`: no one waits for it; `graceOver`:
 * it has run past its grace.
 */
type Running = {
	id: number;
	superseded: boolean;
	graceOver: boolean;
	timers: ReturnType<typeof setTimeout>[];
};

const FAILED = "The score engine failed";

/**
 * An engine over one worker made on first use, given one job at a time. A
 * crashed worker is replaced on the next call. A job past its deadline, or
 * superseded and past its grace, is cut off: the worker is terminated and
 * a fresh one (loading the Verovio the first one loaded) takes the
 * requests still waiting.
 */
export function createEngine(makeWorker: () => WorkerLike, options: EngineOptions = {}): Engine {
	const deadline = options.deadline ?? JOB_DEADLINE_MS;
	const grace = options.grace ?? SUPERSEDED_GRACE_MS;
	let worker: WorkerLike | null = null;
	let running: Running | null = null;
	let loaded: { verovioUrl?: string } | undefined;
	let nextId = 0;
	const waiting: Request[] = [];
	const pending = new Map<number, Pending>();
	const newest = new WeakMap<object, number>();

	/** Ends the worker and the job it is on; the requests still waiting go to the next worker. */
	const stop = () => {
		for (const t of running?.timers ?? []) clearTimeout(t);
		running = null;
		const w = worker;
		worker = null;
		w?.terminate();
	};

	const settle = (id: number) => {
		const p = pending.get(id);
		pending.delete(id);
		return p;
	};

	const fail = (w: WorkerLike) => {
		if (worker !== w) return;
		stop();
		waiting.length = 0;
		const all = [...pending.values()];
		pending.clear();
		for (const p of all) p.reject(new Error(FAILED));
	};

	/** Cuts off the job `id` if the worker is still on it, and moves on to the next. */
	const cut = (id: number, reason: string | null) => {
		if (running?.id !== id) return;
		stop();
		if (reason !== null) settle(id)?.reject(new Error(reason));
		next();
	};

	const start = (): WorkerLike => {
		if (worker) return worker;
		const w = makeWorker();
		w.onmessage = (e) => {
			if (worker !== w || running?.id !== e.data.id) return;
			for (const t of running.timers) clearTimeout(t);
			running = null;
			loaded ??= e.data.loaded;
			settle(e.data.id)?.resolve(e.data);
			next();
		};
		w.onerror = () => fail(w);
		worker = w;
		return w;
	};

	/** Gives the worker the next job, if it is free: the Verovio it loaded first, whatever the request asks. */
	const next = () => {
		const request = running ? undefined : waiting.shift();
		if (!request) return;
		const { verovioUrl, ...rest } = request;
		const url = loaded ? loaded.verovioUrl : verovioUrl;
		const id = rest.id;
		const job: Running = { id, superseded: false, graceOver: false, timers: [] };
		job.timers = [
			setTimeout(() => cut(id, `${FAILED}: it took too long`), deadline),
			setTimeout(() => {
				job.graceOver = true;
				if (job.superseded) cut(id, null);
			}, grace),
		];
		running = job;
		start().postMessage(url === undefined ? rest : { ...rest, verovioUrl: url });
	};

	/** No one waits for `id` any more: drop it if it waits its turn, cut it off past its grace if it runs. */
	const supersede = (id: number) => {
		settle(id)?.resolve(null);
		const at = waiting.findIndex((r) => r.id === id);
		if (at >= 0) waiting.splice(at, 1);
		if (running?.id !== id) return;
		running.superseded = true;
		if (running.graceOver) cut(id, null);
	};

	return {
		engrave(key, text, width, verovioUrl) {
			const id = ++nextId;
			const before = newest.get(key);
			newest.set(key, id);
			return new Promise((resolve, reject) => {
				pending.set(id, { resolve, reject });
				if (before !== undefined) supersede(before);
				waiting.push(
					verovioUrl === undefined ? { id, text, width } : { id, text, width, verovioUrl },
				);
				next();
			});
		},
	};
}

let shared: Engine | undefined;

/** The page's single shared engine, over one real module `Worker` made on first use. */
export function engine(): Engine {
	shared ??= createEngine(
		() => new Worker(new URL("./worker.js", import.meta.url), { type: "module" }),
	);
	return shared;
}
