import type { Download } from "./download.js";

/**
 * Where a worker loads Verovio from: no `verovioUrl`, the package's own;
 * with `verovioIntegrity`, a copy that must have that digest (or the
 * package's own is loaded in its place).
 */
export type VerovioSource = { verovioUrl?: string; verovioIntegrity?: string };

/**
 * What a page asks the worker for: one chart, laid out for a width; or,
 * with `preload`, only to load Verovio (`text` and `width` unused).
 */
export type Request = VerovioSource & {
	id: number;
	text: string;
	width: number;
	preload?: true;
};

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
export type Ready = { id: number; loaded: VerovioSource };

/** How a worker's Verovio load is going: downloading (as far as it can be measured), then preparing. */
export type LoadStatus = Download | { phase: "prepare" };

/** What the worker says while it loads Verovio for job `id`. */
export type Progress = { id: number; status: LoadStatus };

/** Every message a worker sends: a job's `Progress` while it loads, its `Ready`, then its `Reply`. */
export type WorkerMessage = Reply | Ready | Progress;

/** What a caller hears while it waits: the engine's load, then its engraving. */
export type EngineStatus = LoadStatus | { phase: "engrave" };

export type EngraveCall = {
	/** The SRI digest (`sha384-…`) the `verovioUrl` copy must have; on a mismatch the package's own loads. */
	integrity?: string;
	/** Hears the engine's status now, and as it changes, until the request settles. */
	onStatus?: (status: EngineStatus) => void;
};

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
		call?: EngraveCall,
	): Promise<EngraveReply | null>;
	/**
	 * Starts loading Verovio (from `verovioUrl`, checked against `integrity`
	 * when given) with no job, so a first score is quicker. Does nothing if
	 * a worker has Verovio loaded or is busy: there is one load to share.
	 */
	preload(verovioUrl?: string, integrity?: string): void;
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
	onStatus: ((status: EngineStatus) => void) | undefined;
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

const isReady = (m: WorkerMessage): m is Ready => "loaded" in m;
const isProgress = (m: WorkerMessage): m is Progress => "status" in m;

const UNMEASURED: EngineStatus = { phase: "download", fraction: null, bytes: null };
const ENGRAVING: EngineStatus = { phase: "engrave" };

/** `source` without its absent fields (so a request carries no `verovioUrl: undefined`). */
const present = ({
	verovioUrl,
	verovioIntegrity,
}: {
	verovioUrl?: string | undefined;
	verovioIntegrity?: string | undefined;
}): VerovioSource => ({
	...(verovioUrl === undefined ? {} : { verovioUrl }),
	...(verovioUrl === undefined || verovioIntegrity === undefined ? {} : { verovioIntegrity }),
});

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
	let loaded: VerovioSource | undefined;
	/** Whether the current worker has its Verovio loaded. */
	let warm = false;
	/** The engine's status, as a new caller first hears it. */
	let status: EngineStatus = UNMEASURED;
	let nextId = 0;
	const waiting: Request[] = [];
	const pending = new Map<number, Pending>();
	const newest = new WeakMap<object, number>();
	/** Preload jobs: no one waits on them, and they end at `Ready`. */
	const preloads = new Set<number>();

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
		warm = false;
		preloads.delete(id);
		w?.terminate();
		if (reason !== null) settle(id)?.reject(new Error(reason));
		// A fresh worker loads Verovio again: the callers still waiting hear it from the start.
		tell(UNMEASURED);
		next();
	};

	const overdue = (id: number, what: string) => () => cut(id, `${FAILED}: ${what} took too long`);

	/** Tells every waiting caller the engine's new status. */
	const tell = (now: EngineStatus) => {
		status = now;
		for (const p of pending.values()) p.onStatus?.(now);
	};

	/** Verovio is ready: the job's engraving deadline and its grace start now; a preload is done. */
	const onReady = (job: Running, ready: Ready) => {
		loaded ??= ready.loaded;
		warm = true;
		// A preload's Ready engraves nothing: the job behind it hears "engrave" at its own Ready.
		if (preloads.has(job.id)) {
			finish(job);
			return next();
		}
		tell(ENGRAVING);
		clear(job);
		job.timers = [
			setTimeout(overdue(job.id, "engraving"), deadline),
			setTimeout(() => {
				job.graceOver = true;
				if (job.superseded) cut(job.id, null);
			}, grace),
		];
	};

	/** The worker is done with `job`. */
	const finish = (job: Running) => {
		clear(job);
		running = null;
		preloads.delete(job.id);
	};

	const onReply = (job: Running, reply: Reply) => {
		finish(job);
		settle(reply.id)?.resolve(reply);
		next();
	};

	const start = (): WorkerLike => {
		if (worker) return worker;
		const w = makeWorker();
		w.onmessage = ({ data }) => {
			const job = running;
			if (worker !== w || job?.id !== data.id) return;
			if (isProgress(data)) tell(data.status);
			else if (isReady(data)) onReady(job, data);
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
		const { verovioUrl, verovioIntegrity, ...rest } = request;
		const id = rest.id;
		running = { id, superseded: false, graceOver: false, timers: [] };
		running.timers = [setTimeout(overdue(id, "loading Verovio"), loadDeadline)];
		start().postMessage({ ...rest, ...present(loaded ?? { verovioUrl, verovioIntegrity }) });
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
		engrave(key, text, width, verovioUrl, call = {}) {
			const id = ++nextId;
			const before = newest.get(key);
			newest.set(key, id);
			return new Promise((resolve, reject) => {
				pending.set(id, { resolve, reject, onStatus: call.onStatus });
				call.onStatus?.(warm ? ENGRAVING : status);
				if (before !== undefined) supersede(before);
				waiting.push({
					id,
					text,
					width,
					...present({ verovioUrl, verovioIntegrity: call.integrity }),
				});
				next();
			});
		},
		preload(verovioUrl, integrity) {
			if (warm || running || waiting.length > 0) return;
			const id = ++nextId;
			preloads.add(id);
			waiting.push({
				id,
				text: "",
				width: 0,
				preload: true,
				...present({ verovioUrl, verovioIntegrity: integrity }),
			});
			next();
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
