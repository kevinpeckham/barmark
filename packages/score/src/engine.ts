/** What a page asks the worker for: one chart, laid out for a width. */
export type Request = { id: number; text: string; width: number; verovioUrl?: string };

/** What the worker answers. No `xml` or `diagnostics` cross the boundary. */
export type Reply =
	| { id: number; ok: true; svg: string; pages: number }
	| { id: number; ok: false; reason: string };

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
	 * with "The score engine failed" if the worker crashes.
	 */
	engrave(
		key: object,
		text: string,
		width: number,
		verovioUrl?: string,
	): Promise<EngraveReply | null>;
};

type Pending = {
	key: object;
	resolve: (reply: EngraveReply | null) => void;
	reject: (error: Error) => void;
};

/** An engine over one worker made on first use; a crashed worker is replaced on the next call. */
export function createEngine(makeWorker: () => WorkerLike): Engine {
	let worker: WorkerLike | null = null;
	let nextId = 0;
	const pending = new Map<number, Pending>();
	const newest = new WeakMap<object, number>();

	const fail = (w: WorkerLike) => {
		if (worker !== w) return;
		worker = null;
		w.terminate();
		const all = [...pending.values()];
		pending.clear();
		for (const p of all) p.reject(new Error("The score engine failed"));
	};

	const start = (): WorkerLike => {
		if (worker) return worker;
		const w = makeWorker();
		w.onmessage = (e) => {
			const p = pending.get(e.data.id);
			if (!p) return;
			pending.delete(e.data.id);
			p.resolve(newest.get(p.key) === e.data.id ? e.data : null);
		};
		w.onerror = () => fail(w);
		worker = w;
		return w;
	};

	return {
		engrave(key, text, width, verovioUrl) {
			const w = start();
			const id = ++nextId;
			const before = newest.get(key);
			if (before !== undefined) {
				pending.get(before)?.resolve(null);
				pending.delete(before);
			}
			newest.set(key, id);
			return new Promise((resolve, reject) => {
				pending.set(id, { key, resolve, reject });
				w.postMessage(
					verovioUrl === undefined ? { id, text, width } : { id, text, width, verovioUrl },
				);
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
