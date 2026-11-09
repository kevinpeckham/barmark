/** What a page asks the worker for: one chart, laid out for a width. */
export type Request = { id: number; text: string; width: number; verovioUrl?: string };

/** What the worker answers. No `xml` or `diagnostics` cross the boundary. */
export type Reply =
	| { id: number; ok: true; svg: string; pages: number }
	| { id: number; ok: false; reason: string };

/** An `EngraveReply` is a reply a page may show. */
export type EngraveReply = Reply;

/**
 * What the worker says before it engraves job `id`: its Verovio is loaded,
 * and from where (no `verovioUrl`: the package's own), so the engine can
 * start the job's deadline and give a replacement worker the same Verovio.
 */
export type Ready = { id: number; loaded: { verovioUrl?: string } };

/** Every message a worker sends: a job's `Ready`, then its `Reply`. */
export type WorkerMessage = Reply | Ready;

/**
 * The part of a `Worker` the engine uses, so a test can pass a fake. It is
 * driven by the `onmessage` and `onerror` properties (a real `Worker`
 * satisfies this), not by `addEventListener`.
 */
export interface WorkerLike {
	postMessage(request: Request): void;
	terminate(): void;
	onmessage: ((e: MessageEvent<WorkerMessage>) => void) | null;
	onerror: ((e: ErrorEvent) => void) | null;
}

export type Engine = {
	/**
	 * Engrave `text` for `width`. Per `key` (the element) only the newest
	 * request resolves with a reply; an older one resolves `null`. Rejects
	 * with "The score engine failed" if the worker crashes on it, or its
	 * Verovio load or its engraving runs past its deadline.
	 */
	engrave(
		key: object,
		text: string,
		width: number,
		verovioUrl?: string,
	): Promise<EngraveReply | null>;
};

/** How long one job may engrave, from its worker's Verovio being ready, before the worker is cut off and the request rejects. */
export const JOB_DEADLINE_MS = 20_000;

/** How long a worker may take to load Verovio for a job (a 7 MB download and compile on a slow line) before it is cut off. */
export const LOAD_DEADLINE_MS = 60_000;

/**
 * How long a job no one waits for any more (a newer request from its
 * element superseded it) may engrave before its worker is cut off. Most
 * jobs finish well within it, even on a slow device, and keeping the
 * worker keeps its loaded Verovio. A job still loading Verovio is never
 * cut for this: the load serves the next job.
 */
export const SUPERSEDED_GRACE_MS = 3_000;

export type EngineOptions = { deadline?: number; loadDeadline?: number; grace?: number };

type Pending = {
	resolve: (reply: EngraveReply | null) => void;
	reject: (error: Error) => void;
};

/**
 * The job the worker is on: the worker takes one at a time, so a waiting
 * one can still be dropped. `superseded`: no one waits for it; `graceOver`:
 * it has engraved past its grace.
 */
type Running = {
	id: number;
	superseded: boolean;
	graceOver: boolean;
	timers: ReturnType<typeof setTimeout>[];
};

const FAILED = "The score engine failed";

const isReady = (m: WorkerMessage): m is Ready => !("ok" in m);

const clear = (job: Running) => {
	for (const t of job.timers) clearTimeout(t);
	job.timers = [];
};

/**
 * An engine over one worker made on first use, given one job at a time. A
 * job whose worker crashes, or whose Verovio load or engraving runs past
 * its deadline, rejects; one superseded and past its grace is dropped.
 * Either way the worker is terminated and a fresh one (loading the
 * Verovio the first one loaded) takes the requests still waiting.
 */
export function createEngine(makeWorker: () => WorkerLike, options: EngineOptions = {}): Engine {
	const deadline = options.deadline ?? JOB_DEADLINE_MS;
	const loadDeadline = options.loadDeadline ?? LOAD_DEADLINE_MS;
	const grace = options.grace ?? SUPERSEDED_GRACE_MS;
	let worker: WorkerLike | null = null;
	let running: Running | null = null;
	let loaded: { verovioUrl?: string } | undefined;
	let nextId = 0;
	const waiting: Request[] = [];
	const pending = new Map<number, Pending>();
	const newest = new WeakMap<object, number>();

	const settle = (id: number) => {
		const p = pending.get(id);
		pending.delete(id);
		return p;
	};

	/** Cuts off the job `id` if the worker is still on it (rejecting it for `reason`, if given), and moves on to the next. */
	const cut = (id: number, reason: string | null) => {
		if (running?.id !== id) return;
		clear(running);
		running = null;
		const w = worker;
		worker = null;
		w?.terminate();
		if (reason !== null) settle(id)?.reject(new Error(reason));
		next();
	};

	const overdue = (id: number, what: string) => () => cut(id, `${FAILED}: ${what} took too long`);

	/** Verovio is ready: the job's engraving deadline and its grace start now. */
	const onReady = (job: Running, ready: Ready) => {
		loaded ??= ready.loaded;
		clear(job);
		job.timers = [
			setTimeout(overdue(job.id, "engraving"), deadline),
			setTimeout(() => {
				job.graceOver = true;
				if (job.superseded) cut(job.id, null);
			}, grace),
		];
	};

	const onReply = (job: Running, reply: Reply) => {
		clear(job);
		running = null;
		settle(reply.id)?.resolve(reply);
		next();
	};

	const start = (): WorkerLike => {
		if (worker) return worker;
		const w = makeWorker();
		w.onmessage = ({ data }) => {
			const job = running;
			if (worker !== w || job?.id !== data.id) return;
			if (isReady(data)) onReady(job, data);
			else onReply(job, data);
		};
		w.onerror = () => {
			if (worker === w && running) cut(running.id, FAILED);
		};
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
		running = { id, superseded: false, graceOver: false, timers: [] };
		running.timers = [setTimeout(overdue(id, "loading Verovio"), loadDeadline)];
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
