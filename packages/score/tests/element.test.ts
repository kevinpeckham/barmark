import { afterEach, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseHTML } from "linkedom";
import type { Engine, EngineStatus, EngraveReply } from "../src/engine.js";
import { renderScoreHtml } from "../src/server.js";

// linkedom stands in for the browser: its window's classes become the globals the element uses.
const window = parseHTML(
	'<!doctype html><html><head><base href="https://example.test/page/"></head><body></body></html>',
);
const { document } = window;
/** linkedom's CustomEvent, keeping `composed`, which it drops. */
const LinkedomCustomEvent = window.CustomEvent as unknown as typeof CustomEvent;
class ComposedCustomEvent extends LinkedomCustomEvent<unknown> {
	constructor(type: string, init?: CustomEventInit) {
		super(type, init);
		Object.defineProperty(this, "composed", { value: init?.composed ?? false });
	}
}
Object.assign(globalThis, {
	HTMLElement: window.HTMLElement,
	customElements: window.customElements,
	MutationObserver: window.MutationObserver,
	CustomEvent: ComposedCustomEvent,
	Event: window.Event,
});

// A ResizeObserver the tests fire by hand.
const resizers: (() => void)[] = [];
class FakeResizeObserver {
	#callback: () => void;
	constructor(callback: () => void) {
		this.#callback = callback;
	}
	observe() {
		resizers.push(this.#callback);
	}
	disconnect() {}
}
Object.assign(globalThis, { ResizeObserver: FakeResizeObserver });

type Call = {
	text: string;
	width: number;
	verovioUrl: string | undefined;
	integrity: string | undefined;
	wasmIntegrity: string | undefined;
	status: (s: EngineStatus) => void;
	resolve: (reply: EngraveReply | null) => void;
	reject: (error: Error) => void;
};

let calls: Call[] = [];
/** Each preload's url and digest, then its wasm digest when it has one. */
let preloads: (string | undefined)[][] = [];
/** Elements a test put in the page, removed after it. */
const mounted: Element[] = [];
let made = 0;
const fakeEngine = (): Engine => {
	made++;
	return {
		engrave: (_key, text, width, verovioUrl, call = {}) =>
			new Promise((resolve, reject) => {
				const status = (s: EngineStatus) => call.onStatus?.(s);
				status({ phase: "download", fraction: null, bytes: null });
				const { integrity, wasmIntegrity } = call;
				calls.push({ text, width, verovioUrl, integrity, wasmIntegrity, status, resolve, reject });
			}),
		preload: (verovioUrl, integrity, wasmIntegrity) => {
			preloads.push([
				verovioUrl,
				integrity,
				...(wasmIntegrity === undefined ? [] : [wasmIntegrity]),
			]);
		},
	};
};

const chart = "# Song\n\n| C | G |\n";
const svg = (label: string) =>
	`<div class="bms-score-page"><svg viewBox="0 0 10 10"><g class="${label}"></g></svg></div>`;

// Server markup in the page before the element is defined, so defining it upgrades this node.
const served = (() => {
	const html = renderScoreHtml(chart, { theme: "dark" });
	const parsed = parseHTML(`<!doctype html><body>${html}`).document;
	const source = parsed.querySelector("barmark-score") as Element;
	const host = document.createElement("barmark-score");
	for (const a of [...source.attributes]) host.setAttribute(a.name, a.value);
	const root = host.attachShadow({ mode: "open" });
	root.innerHTML = source.querySelector("template")?.innerHTML ?? "";
	const script = document.createElement("script");
	script.setAttribute("type", "text/barmark");
	script.textContent = source.querySelector("script")?.textContent ?? "";
	host.append(script);
	document.body.append(host);
	return {
		host,
		grid: root.querySelector(".bms-grid"),
		chart: root.querySelector(".bm-grid"),
	};
})();

let setEngineForTests: (factory: (() => Engine) | null) => void;

beforeAll(async () => {
	({ setEngineForTests } = await import("../src/element.js"));
	setEngineForTests(fakeEngine);
});

afterEach(() => {
	calls = [];
	preloads = [];
	made = 0;
	for (const el of mounted.splice(0)) el.remove();
});

/** Lets microtasks, the dynamic import and timers run. */
const flush = async (ms = 0) => {
	for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, ms));
};

type Score = HTMLElement & { text: string | null; view: string };

const make = async (attrs: Record<string, string> = {}, text: string | null = chart) => {
	const el = document.createElement("barmark-score") as Score;
	for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
	if (text !== null) el.text = text;
	mounted.push(el);
	document.body.append(el);
	await flush();
	return el;
};

const parts = (el: HTMLElement) => {
	const root = el.shadowRoot as ShadowRoot;
	return {
		root,
		grid: root.querySelector(".bms-grid") as HTMLElement,
		pane: root.querySelector(".bms-pane") as HTMLElement,
		radios: [...root.querySelectorAll('[role="radio"]')] as HTMLElement[],
		note: root.querySelector(".bms-note"),
	};
};

/** The loading status the pane shows: its live text, the bar's value, the amount beside it; null when none. */
const status = (el: HTMLElement) => {
	const box = parts(el).pane.querySelector(".bms-loading");
	if (!box) return null;
	const bar = box.querySelector('[role="progressbar"]');
	const now = bar?.getAttribute("aria-valuenow");
	return {
		text: box.querySelector('[role="status"]')?.textContent,
		now: now == null ? null : Number(now),
		amount: box.querySelector(".bms-amount")?.textContent,
	};
};

const checked = (el: HTMLElement) =>
	parts(el).radios.map((r) => r.getAttribute("aria-checked") === "true");

const press = (target: Element, key: string) => {
	const event = new window.Event("keydown", { bubbles: true, cancelable: true });
	Object.defineProperty(event, "key", { value: key });
	target.dispatchEvent(event);
};
const click = (target: Element) =>
	target.dispatchEvent(new window.Event("click", { bubbles: true, cancelable: true }));

describe("<barmark-score>", () => {
	test("opens on the grid and loads no engine", async () => {
		const el = await make({ "verovio-url": "/vrv/verovio.mjs" });
		const { grid, pane, radios } = parts(el);
		expect(grid.querySelector(".bm-grid")).not.toBeNull();
		expect(grid.hasAttribute("hidden")).toBe(false);
		expect(pane.hasAttribute("hidden")).toBe(true);
		expect(checked(el)).toEqual([true, false]);
		expect(radios.map((r) => r.getAttribute("tabindex"))).toEqual([null, "-1"]);
		expect(el.view).toBe("grid");
		expect(made).toBe(0);

		el.view = "score";
		await flush();
		expect(made).toBe(1);
		expect(calls.map((c) => [c.text, c.width, c.verovioUrl])).toEqual([
			[chart, 0, "https://example.test/vrv/verovio.mjs"],
		]);
		expect(status(el)).toEqual({ text: "Loading the score engine…", now: null, amount: "" });
		expect(pane.getAttribute("aria-busy")).toBe("true");

		calls[0]?.resolve({ id: 1, ok: true, svg: svg("first"), pages: 1 });
		await flush();
		expect(pane.querySelector(".bm-chart[data-theme='auto'] g.first")).not.toBeNull();
		expect(parts(el).root.querySelectorAll(".bms-score")).toHaveLength(1);
		expect(pane.hasAttribute("aria-busy")).toBe(false);
		expect(pane.hasAttribute("hidden")).toBe(false);
		expect(grid.hasAttribute("hidden")).toBe(true);
		expect(checked(el)).toEqual([false, true]);
	});

	test("an unknown view is the grid", async () => {
		const el = await make({ view: "bogus" });
		expect(el.view).toBe("grid");
		expect(checked(el)).toEqual([true, false]);
		expect(made).toBe(0);
	});

	test("view attribute opens on the score and fires viewchange on a switch", async () => {
		const events: string[] = [];
		document.addEventListener("viewchange", (e) =>
			events.push((e as CustomEvent<{ view: string }>).detail.view),
		);
		const el = await make({ view: "score" });
		expect(calls).toHaveLength(1);
		expect(checked(el)).toEqual([false, true]);
		expect(events).toEqual([]);

		click(parts(el).radios[0] as HTMLElement);
		await flush();
		expect(el.getAttribute("view")).toBe("grid");
		expect(events).toEqual(["grid"]);
		expect(parts(el).grid.hasAttribute("hidden")).toBe(false);
		expect(parts(el).pane.hasAttribute("hidden")).toBe(true);

		el.setAttribute("view", "score");
		await flush();
		expect(events).toEqual(["grid", "score"]);
	});

	test("score of a broken chart keeps the grid", async () => {
		const warn = spyOn(console, "warn").mockImplementation(() => {});
		try {
			const el = await make({ view: "score" });
			calls[0]?.resolve({ id: 1, ok: false, reason: "line 3: Xq9 is not a chord" });
			await flush();
			const { grid, pane, radios, note } = parts(el);
			expect(grid.hasAttribute("hidden")).toBe(false);
			expect(pane.hasAttribute("hidden")).toBe(true);
			expect(el.view).toBe("grid");
			expect(note?.textContent).toBe("The score couldn't be drawn");
			expect(note?.getAttribute("role")).toBe("status");
			expect(note?.previousElementSibling?.classList.contains("bms-switch")).toBe(true);
			expect(radios[1]?.getAttribute("aria-disabled")).toBe("true");
			expect(String(warn.mock.calls[0]?.[0])).toContain("Xq9 is not a chord");

			// The Score radio is ignored until the chart changes.
			click(radios[1] as HTMLElement);
			await flush();
			expect(el.view).toBe("grid");
			expect(calls).toHaveLength(1);

			el.text = "| D |";
			await flush();
			expect(parts(el).note).toBeNull();
			expect(radios[1]?.hasAttribute("aria-disabled")).toBe(false);
			click(radios[1] as HTMLElement);
			await flush();
			expect(calls.map((c) => c.text)).toEqual([chart, "| D |"]);
		} finally {
			warn.mockRestore();
		}
	});

	test("an engine that fails to load keeps the grid", async () => {
		const warn = spyOn(console, "warn").mockImplementation(() => {});
		setEngineForTests(() => {
			throw new Error("no worker here");
		});
		try {
			const el = await make({ view: "score" });
			expect(el.view).toBe("grid");
			expect(parts(el).note?.textContent).toBe("The score couldn't be drawn");
			expect(String(warn.mock.calls[0]?.[0])).toContain("no worker here");
		} finally {
			setEngineForTests(fakeEngine);
			warn.mockRestore();
		}
	});

	for (const url of ["data:text/javascript,1", "blob:https://example.test/x", "javascript:1"])
		test(`a verovio-url of ${url.split(":")[0]}: is refused`, async () => {
			const warn = spyOn(console, "warn").mockImplementation(() => {});
			try {
				const el = await make({ view: "score", "verovio-url": url });
				expect(made).toBe(0);
				expect(calls).toHaveLength(0);
				expect(el.view).toBe("grid");
				expect(parts(el).note?.textContent).toBe("The score couldn't be drawn");
				expect(String(warn.mock.calls[0]?.[0])).toContain("verovio-url must be an http(s) URL");
			} finally {
				warn.mockRestore();
			}
		});

	test("switching back to a score still engraving shows it loading", async () => {
		const el = await make({ view: "score" });
		const [grid, score] = parts(el).radios as [HTMLElement, HTMLElement];
		click(grid);
		await flush();
		click(score);
		await flush();
		const { pane, grid: gridPane } = parts(el);
		expect(calls).toHaveLength(1);
		expect(status(el)?.text).toBe("Loading the score engine…");
		expect(pane.getAttribute("aria-busy")).toBe("true");
		expect(pane.hasAttribute("hidden")).toBe(false);
		expect(gridPane.hasAttribute("hidden")).toBe(true);
	});

	test("the score view waits for a chart that has not arrived", async () => {
		const warn = spyOn(console, "warn").mockImplementation(() => {});
		try {
			const el = await make({ view: "score" }, null);
			const { grid, note, radios } = parts(el);
			expect(el.view).toBe("score");
			expect(grid.hasAttribute("hidden")).toBe(false);
			expect(note).toBeNull();
			expect(radios[1]?.hasAttribute("aria-disabled")).toBe(false);
			expect(warn).not.toHaveBeenCalled();
			expect(calls).toHaveLength(0);
			el.text = chart;
			await flush();
			expect(calls.map((c) => c.text)).toEqual([chart]);
		} finally {
			warn.mockRestore();
		}
	});

	test("a grid-only change leaves the shown score alone", async () => {
		const el = await make({ view: "score" });
		calls[0]?.resolve({ id: 1, ok: true, svg: svg("first"), pages: 1 });
		await flush();
		const shown = parts(el).pane.firstElementChild;
		el.setAttribute("bar-numbers", "off");
		await flush();
		expect(parts(el).pane.firstElementChild).toBe(shown);
		expect(calls).toHaveLength(1);
	});

	test("the grid follows a columns attribute", async () => {
		const el = await make();
		const drawn = () => parts(el).grid.querySelector(".bm-chart")?.getAttribute("data-columns");
		expect(drawn()).toBeNull();
		el.setAttribute("columns", "row");
		await flush();
		expect(drawn()).toBe("row");
		el.setAttribute("columns", "sideways");
		await flush();
		expect(drawn()).toBeNull();
	});

	test("the grid follows chord-diagrams and diagram-hand; the score view has no strip", async () => {
		const el = await make();
		const { grid, pane } = parts(el);
		const strip = () => grid.querySelector(".bm-diagrams");
		expect(strip()).toBeNull();
		el.setAttribute("chord-diagrams", "guitar");
		await flush();
		expect(strip()).not.toBeNull();
		const right = strip()?.innerHTML;
		el.setAttribute("diagram-hand", "left");
		await flush();
		expect(strip()?.innerHTML).not.toBe(right);
		expect(pane.querySelector(".bm-diagrams")).toBeNull();
		expect(el.shadowRoot?.querySelector("style")?.textContent).toContain(".bm-diagrams");
		el.removeAttribute("chord-diagrams");
		await flush();
		expect(strip()).toBeNull();
	});

	test("the score view ignores chord-diagrams and diagram-hand: no strip, no new engraving", async () => {
		const el = await make({ view: "score" });
		calls[0]?.resolve({ id: 1, ok: true, svg: svg("first"), pages: 1 });
		await flush();
		const { pane, grid, radios } = parts(el);
		el.setAttribute("chord-diagrams", "guitar");
		el.setAttribute("diagram-hand", "left");
		await flush();
		expect(pane.querySelector(".bm-diagrams")).toBeNull();
		expect(calls).toHaveLength(1);
		click(radios[0] as HTMLElement);
		await flush();
		expect(grid.querySelector(".bm-diagrams")).not.toBeNull();
	});

	test("text changed while engraving shows the new score", async () => {
		const el = await make({ view: "score" });
		el.text = "| D |";
		await flush();
		expect(calls.map((c) => c.text)).toEqual([chart, "| D |"]);
		calls[1]?.resolve({ id: 2, ok: true, svg: svg("newer"), pages: 1 });
		await flush();
		calls[0]?.resolve({ id: 1, ok: true, svg: svg("older"), pages: 1 });
		await flush();
		const { pane } = parts(el);
		expect(pane.querySelector("g.newer")).not.toBeNull();
		expect(pane.querySelector("g.older")).toBeNull();
	});

	test("a new theme reaches the score", async () => {
		const el = await make({ view: "score" });
		calls[0]?.resolve({ id: 1, ok: true, svg: svg("first"), pages: 1 });
		await flush();
		el.setAttribute("theme", "dark");
		await flush();
		expect(parts(el).pane.querySelector(".bm-chart[data-theme='dark'] g.first")).not.toBeNull();
	});

	test("a wider element engraves again, debounced", async () => {
		let width = 400;
		const el = document.createElement("barmark-score") as Score;
		Object.defineProperty(el, "clientWidth", { get: () => width });
		el.setAttribute("view", "score");
		el.text = chart;
		resizers.length = 0;
		mounted.push(el);
		document.body.append(el);
		await flush();
		calls[0]?.resolve({ id: 1, ok: true, svg: svg("first"), pages: 1 });
		await flush();
		expect(calls.map((c) => c.width)).toEqual([400]);

		width = 405;
		for (const fire of resizers) fire();
		await flush(40);
		expect(calls).toHaveLength(1);

		width = 600;
		for (let i = 0; i < 3; i++) for (const fire of resizers) fire();
		await flush(10);
		expect(calls).toHaveLength(1);
		await flush(40);
		expect(calls.map((c) => c.width)).toEqual([400, 600]);
	});

	test("a resize keeps the shown score, busy, until the new one lands", async () => {
		let width = 400;
		const el = document.createElement("barmark-score") as Score;
		Object.defineProperty(el, "clientWidth", { get: () => width });
		el.setAttribute("view", "score");
		el.text = chart;
		resizers.length = 0;
		mounted.push(el);
		document.body.append(el);
		await flush();
		calls[0]?.resolve({ id: 1, ok: true, svg: svg("first"), pages: 1 });
		await flush();
		const { pane, grid } = parts(el);
		expect(pane.hasAttribute("aria-busy")).toBe(false);

		width = 600;
		for (const fire of resizers) fire();
		await flush(40);
		expect(calls.map((c) => c.width)).toEqual([400, 600]);
		expect(status(el)).toBeNull();
		expect(pane.querySelector("g.first")).not.toBeNull();
		expect(pane.getAttribute("aria-busy")).toBe("true");
		expect(pane.hasAttribute("hidden")).toBe(false);
		expect(grid.hasAttribute("hidden")).toBe(true);

		calls[1]?.resolve({ id: 2, ok: true, svg: svg("wider"), pages: 1 });
		await flush();
		expect(pane.querySelector("g.wider")).not.toBeNull();
		expect(pane.querySelector("g.first")).toBeNull();
		expect(pane.hasAttribute("aria-busy")).toBe(false);
	});

	test("the drawn score is an image named for the chart's title", async () => {
		const el = await make({ view: "score" });
		calls[0]?.resolve({ id: 1, ok: true, svg: svg("first"), pages: 1 });
		await flush();
		const score = parts(el).pane.querySelector(".bms-score");
		expect(score?.getAttribute("role")).toBe("img");
		expect(score?.getAttribute("aria-label")).toBe("Song");

		el.text = "| D |";
		await flush();
		calls[1]?.resolve({ id: 2, ok: true, svg: svg("untitled"), pages: 1 });
		await flush();
		expect(parts(el).pane.querySelector(".bms-score")?.getAttribute("aria-label")).toBe("Score");
	});

	test("a new verovio-url clears the failure", async () => {
		const warn = spyOn(console, "warn").mockImplementation(() => {});
		try {
			const el = await make({ view: "score", "verovio-url": "data:text/javascript,1" });
			expect(parts(el).note).not.toBeNull();
			el.setAttribute("verovio-url", "/vrv/verovio.mjs");
			await flush();
			const { note, radios } = parts(el);
			expect(note).toBeNull();
			expect(radios[1]?.hasAttribute("aria-disabled")).toBe(false);
			click(radios[1] as HTMLElement);
			await flush();
			expect(calls.map((c) => c.verovioUrl)).toEqual(["https://example.test/vrv/verovio.mjs"]);
		} finally {
			warn.mockRestore();
		}
	});

	test("a score waiting for its chart checks Grid, the view shown", async () => {
		const el = await make({ view: "score" }, null);
		expect(el.view).toBe("score");
		expect(checked(el)).toEqual([true, false]);
		el.text = chart;
		await flush();
		expect(checked(el)).toEqual([false, true]);
	});

	test("upgrading server markup does not redraw the grid", async () => {
		const host = served.host as Score;
		const root = host.shadowRoot as ShadowRoot;
		await flush();
		expect(root.querySelector(".bms-grid")).toBe(served.grid);
		expect(root.querySelector(".bm-grid")).toBe(served.chart);
		expect(made).toBe(0);
		// It is live: the switch works and new text redraws the grid.
		click(parts(host).radios[1] as HTMLElement);
		await flush();
		expect(calls.map((c) => c.text)).toEqual([chart.replace(/\n$/, "")]);
		host.text = "| D |";
		await flush();
		expect(root.querySelector(".bm-grid")).not.toBe(served.chart);
	});

	test("keyboard: arrow keys move between Grid and Score", async () => {
		const el = await make();
		const [grid, score] = parts(el).radios as [HTMLElement, HTMLElement];
		press(grid, "ArrowRight");
		await flush();
		expect(el.view).toBe("score");
		expect(checked(el)).toEqual([false, true]);
		expect(parts(el).radios.map((r) => r.getAttribute("tabindex"))).toEqual(["-1", null]);
		press(score, "ArrowLeft");
		await flush();
		expect(el.view).toBe("grid");
		press(grid, "ArrowDown");
		await flush();
		expect(el.view).toBe("score");
		press(grid, "Enter");
		await flush();
		expect(el.view).toBe("grid");
		press(score, " ");
		await flush();
		expect(el.view).toBe("score");
	});
});

describe("<barmark-score> loading", () => {
	test("the phases: downloading with progress, preparing, engraving, then the score", async () => {
		const el = await make({ view: "score" });
		const call = calls[0] as Call;
		const box = parts(el).pane.querySelector(".bms-loading");
		const live = box?.querySelector('[role="status"]');
		const bar = box?.querySelector('[role="progressbar"]');
		expect(bar?.getAttribute("aria-label")).toBe("Loading the score engine");

		call.status({ phase: "download", fraction: 0.426, bytes: null });
		expect(status(el)).toEqual({ text: "Loading the score engine…", now: 42, amount: "42%" });
		expect(bar?.getAttribute("aria-valuetext")).toBe("42%");
		call.status({
			phase: "download",
			fraction: 0.5,
			bytes: { done: 3_700_000, total: 7_400_749 },
		});
		expect(status(el)).toEqual({
			text: "Loading the score engine…",
			now: 50,
			amount: "50% (3.7 of 7.4 MB)",
		});
		// The same region is updated in place: a screen reader hears the phase once, not each percent.
		expect(parts(el).pane.querySelector('[role="status"]')).toBe(live as Element);

		call.status({ phase: "prepare" });
		expect(status(el)).toEqual({ text: "Preparing…", now: null, amount: "" });
		expect(bar?.getAttribute("aria-label")).toBe("Preparing");
		call.status({ phase: "engrave" });
		expect(status(el)).toEqual({ text: "Engraving…", now: null, amount: "" });

		call.resolve({ id: 1, ok: true, svg: svg("first"), pages: 1 });
		await flush();
		expect(status(el)).toBeNull();
		expect(parts(el).pane.querySelector("g.first")).not.toBeNull();
	});

	test("progress while the grid is shown leaves the grid shown", async () => {
		const el = await make({ view: "score" });
		el.view = "grid";
		await flush();
		calls[0]?.status({ phase: "download", fraction: 0.3, bytes: null });
		const { grid, pane } = parts(el);
		expect(grid.hasAttribute("hidden")).toBe(false);
		expect(pane.hasAttribute("hidden")).toBe(true);
		el.view = "score";
		await flush();
		expect(status(el)?.now).toBe(30);
	});

	test("a status for a superseded request is not shown", async () => {
		const el = await make({ view: "score" });
		const first = calls[0] as Call;
		el.text = "# Other\n\n| D |\n";
		await flush();
		first.status({ phase: "prepare" });
		expect(status(el)?.text).toBe("Loading the score engine…");
	});

	test("a failure after progress shows the note, no status", async () => {
		const warn = spyOn(console, "warn").mockImplementation(() => {});
		try {
			const el = await make({ view: "score" });
			calls[0]?.status({ phase: "download", fraction: 0.9, bytes: null });
			calls[0]?.reject(new Error("The score engine failed"));
			await flush();
			expect(status(el)).toBeNull();
			expect(parts(el).note?.textContent).toBe("The score couldn't be drawn");
		} finally {
			warn.mockRestore();
		}
	});

	test("the bar honours reduced motion", () => {
		const styles = parts(served.host as HTMLElement).root.querySelector("style")?.textContent ?? "";
		expect(styles).toContain("prefers-reduced-motion");
	});
});

/** Every `scoreerror` reaching the document, while `catching` runs, with a console.warn silenced. */
async function scoreErrors(catching: (seen: ScoreError[]) => Promise<void>) {
	const seen: ScoreError[] = [];
	const listen = (e: Event) => {
		const { detail, bubbles, composed, target } = e as CustomEvent<{ reason: string }>;
		seen.push({ reason: detail.reason, bubbles, composed, target });
	};
	const warn = spyOn(console, "warn").mockImplementation(() => {});
	document.addEventListener("scoreerror", listen);
	try {
		await catching(seen);
		// The reason is the one the warning gives.
		for (const [i, e] of seen.entries())
			expect(String(warn.mock.calls[i]?.[0])).toBe(
				`<barmark-score>: the score couldn't be drawn: ${e.reason}`,
			);
		expect(warn.mock.calls).toHaveLength(seen.length);
	} finally {
		document.removeEventListener("scoreerror", listen);
		warn.mockRestore();
	}
}
type ScoreError = {
	reason: string;
	bubbles: boolean;
	composed: boolean;
	target: EventTarget | null;
};

describe("<barmark-score> scoreerror", () => {
	test("a chart the engine refuses: bubbling, composed, from the element, with the reason", () =>
		scoreErrors(async (seen) => {
			const el = await make({ view: "score" });
			calls[0]?.resolve({ id: 1, ok: false, reason: "line 3: Xq9 is not a chord" });
			await flush();
			expect(parts(el).note?.textContent).toBe("The score couldn't be drawn");
			expect(seen).toEqual([
				{ reason: "line 3: Xq9 is not a chord", bubbles: true, composed: true, target: el },
			]);
		}));

	test("an engine that fails to load", () =>
		scoreErrors(async (seen) => {
			setEngineForTests(() => {
				throw new Error("no worker here");
			});
			try {
				await make({ view: "score" });
			} finally {
				setEngineForTests(fakeEngine);
			}
			expect(seen.map((e) => e.reason)).toEqual(["no worker here"]);
		}));

	test("an engine that fails while engraving", () =>
		scoreErrors(async (seen) => {
			await make({ view: "score" });
			calls[0]?.reject(new Error("The score engine failed"));
			await flush();
			expect(seen.map((e) => e.reason)).toEqual(["The score engine failed"]);
		}));

	test("a refused verovio-url, and a refused verovio-integrity", () =>
		scoreErrors(async (seen) => {
			await make({ view: "score", "verovio-url": "data:text/javascript,1" });
			await make({
				view: "score",
				"verovio-url": "https://cdn.test/verovio.mjs",
				"verovio-integrity": "md5-x",
			});
			expect(seen.map((e) => e.reason)).toEqual([
				"verovio-url must be an http(s) URL",
				"verovio-integrity must be one sha256-, sha384- or sha512- digest",
			]);
		}));

	test("a src that could not be loaded leaves no chart to engrave", () =>
		scoreErrors(async (seen) => {
			const offline = () => Promise.reject(new Error("offline"));
			const fetching = spyOn(globalThis, "fetch").mockImplementation(
				Object.assign(offline, { preconnect: () => {} }),
			);
			try {
				const el = await make({ src: "https://example.test/song.chart" }, null);
				el.view = "score";
				await flush();
				expect(parts(el).note?.textContent).toBe("The score couldn't be drawn");
			} finally {
				fetching.mockRestore();
			}
			expect(seen.map((e) => e.reason)).toEqual(["there is no chart to engrave"]);
		}));

	test("an engraving that is not clean SVG", () =>
		scoreErrors(async (seen) => {
			const el = await make({ view: "score" });
			calls[0]?.resolve({ id: 1, ok: true, svg: "<svg viewBox=0></svg>", pages: 1 });
			await flush();
			expect(parts(el).note?.textContent).toBe("The score couldn't be drawn");
			expect(seen.map((e) => e.reason)).toEqual([
				"The score markup is not clean SVG: an unquoted attribute value",
			]);
		}));

	test("once per failure: the disabled Score radio fires none; a retry that fails fires again", () =>
		scoreErrors(async (seen) => {
			const el = await make({ view: "score" });
			calls[0]?.resolve({ id: 1, ok: false, reason: "first" });
			await flush();
			click(parts(el).radios[1] as HTMLElement);
			el.view = "score";
			await flush();
			expect(seen.map((e) => e.reason)).toEqual(["first"]);

			el.text = "| D |";
			await flush();
			click(parts(el).radios[1] as HTMLElement);
			await flush();
			calls[1]?.resolve({ id: 2, ok: false, reason: "second" });
			await flush();
			expect(seen.map((e) => e.reason)).toEqual(["first", "second"]);
		}));

	test("a score drawn fires none", () =>
		scoreErrors(async (seen) => {
			await make({ view: "score" });
			calls[0]?.resolve({ id: 1, ok: true, svg: svg("first"), pages: 1 });
			await flush();
			expect(seen).toEqual([]);
		}));
});

describe("<barmark-score verovio-integrity>", () => {
	const url = "https://cdn.test/verovio.mjs";
	const digest = "sha384-iGNyhtxpKLNw90cjbI9ES538TJtbNZjLxsFVUuI8PwE2TTNQ+i2j9CjQnRMhZXHk";

	test("travels with verovio-url to the engine", async () => {
		await make({ view: "score", "verovio-url": url, "verovio-integrity": digest });
		expect(calls.map((c) => [c.verovioUrl, c.integrity])).toEqual([[url, digest]]);
	});

	test("without verovio-url it is unused", async () => {
		await make({ view: "score", "verovio-integrity": digest });
		expect(calls.map((c) => [c.verovioUrl, c.integrity])).toEqual([[undefined, undefined]]);
	});

	test("a malformed digest is refused and the score is not drawn", async () => {
		const warn = spyOn(console, "warn").mockImplementation(() => {});
		try {
			const el = await make({ view: "score", "verovio-url": url, "verovio-integrity": "md5-x" });
			expect(calls).toHaveLength(0);
			expect(el.view).toBe("grid");
			expect(String(warn.mock.calls[0]?.[0])).toContain("verovio-integrity");
		} finally {
			warn.mockRestore();
		}
	});

	test("a new digest clears the failure", async () => {
		const warn = spyOn(console, "warn").mockImplementation(() => {});
		try {
			const el = await make({ "verovio-url": url, "verovio-integrity": "md5-x" });
			el.view = "score";
			await flush();
			expect(parts(el).note).not.toBeNull();
			el.setAttribute("verovio-integrity", digest);
			expect(parts(el).note).toBeNull();
		} finally {
			warn.mockRestore();
		}
	});
});

describe("<barmark-score verovio-wasm-integrity>", () => {
	const url = "https://cdn.test/verovio-module.mjs";
	const digest = "sha384-iGNyhtxpKLNw90cjbI9ES538TJtbNZjLxsFVUuI8PwE2TTNQ+i2j9CjQnRMhZXHk";
	const wasm = "sha384-r8Y3uvlFDnTtYrw4dJTQ6xVKQSFb0lrDlZNLAEzEAbW01Mbw0sDmlH0Vf8F0Muug";
	const reason = "verovio-wasm-integrity must be one sha256-, sha384- or sha512- digest";

	test("a malformed verovio-wasm-integrity keeps the grid with a note", () =>
		scoreErrors(async (seen) => {
			const el = await make({
				view: "score",
				"verovio-url": url,
				"verovio-integrity": digest,
				"verovio-wasm-integrity": "md5-x",
			});
			expect(calls).toHaveLength(0);
			expect(el.view).toBe("grid");
			expect(parts(el).note).not.toBeNull();
			expect(seen.map((e) => e.reason)).toEqual([reason]);
		}));

	test("the wasm digest reaches the engine with the URL and module digest", async () => {
		await make({
			view: "score",
			"verovio-url": url,
			"verovio-integrity": digest,
			"verovio-wasm-integrity": ` ${wasm} `,
		});
		expect(calls.map((c) => [c.verovioUrl, c.integrity, c.wasmIntegrity])).toEqual([
			[url, digest, wasm],
		]);
	});

	test("changing verovio-wasm-integrity clears a failure", async () => {
		const warn = spyOn(console, "warn").mockImplementation(() => {});
		try {
			const el = await make({ "verovio-url": url, "verovio-wasm-integrity": "md5-x" });
			el.view = "score";
			await flush();
			expect(parts(el).note).not.toBeNull();
			el.setAttribute("verovio-wasm-integrity", wasm);
			expect(parts(el).note).toBeNull();
		} finally {
			warn.mockRestore();
		}
	});

	test("verovio-wasm-integrity without verovio-url is ignored", async () => {
		await make({ view: "score", "verovio-wasm-integrity": "md5-x" });
		expect(calls.map((c) => [c.verovioUrl, c.integrity, c.wasmIntegrity])).toEqual([
			[undefined, undefined, undefined],
		]);
	});

	test("preload passes the wasm digest", async () => {
		const el = await make({
			preload: "intent",
			"verovio-url": url,
			"verovio-integrity": digest,
			"verovio-wasm-integrity": wasm,
		});
		parts(el).radios[1]?.dispatchEvent(new window.Event("pointerenter"));
		await flush();
		expect(preloads).toEqual([[url, digest, wasm]]);
	});
});

describe("<barmark-score preload>", () => {
	type Idle = (cb: () => void) => number;
	const g = globalThis as unknown as {
		requestIdleCallback?: Idle | undefined;
		cancelIdleCallback?: ((id: number) => void) | undefined;
		navigator: { connection?: unknown };
	};
	let idle: (() => void)[] = [];
	const connection = (value: unknown) =>
		Object.defineProperty(g.navigator, "connection", { value, configurable: true });

	beforeAll(() => {
		g.requestIdleCallback = (cb) => idle.push(cb);
		g.cancelIdleCallback = () => {};
	});
	afterEach(() => {
		idle = [];
		connection(undefined);
	});

	const scoreRadio = (el: HTMLElement) => parts(el).radios[1] as HTMLElement;
	const fire = (target: Element, type: string) => target.dispatchEvent(new window.Event(type));

	test("none (the default) loads nothing before a press", async () => {
		const el = await make({ "verovio-url": "/v.mjs" });
		fire(scoreRadio(el), "pointerenter");
		for (const cb of idle) cb();
		await flush();
		expect(made).toBe(0);
		expect(preloads).toEqual([]);
	});

	test("idle starts the load when the page is idle, with the element's url and digest", async () => {
		const digest = "sha384-iGNyhtxpKLNw90cjbI9ES538TJtbNZjLxsFVUuI8PwE2TTNQ+i2j9CjQnRMhZXHk";
		await make({ preload: "idle", "verovio-url": "/v.mjs", "verovio-integrity": digest });
		expect(preloads).toEqual([]);
		expect(idle).toHaveLength(1);
		for (const cb of idle) cb();
		await flush();
		expect(preloads).toEqual([["https://example.test/v.mjs", digest]]);
		expect(calls).toHaveLength(0);
	});

	test("changing preload away from idle cancels the armed idle load", async () => {
		const cancelled: number[] = [];
		const cancel = g.cancelIdleCallback;
		g.cancelIdleCallback = (id) => cancelled.push(id);
		try {
			const el = await make({ preload: "idle" });
			expect(idle).toHaveLength(1);
			el.setAttribute("preload", "none");
			expect(cancelled).toEqual([1]);
			el.setAttribute("preload", "idle");
			expect(idle).toHaveLength(2);
		} finally {
			g.cancelIdleCallback = cancel;
		}
	});

	test("idle falls back to setTimeout without requestIdleCallback", async () => {
		const ric = g.requestIdleCallback;
		g.requestIdleCallback = undefined;
		try {
			await make({ preload: "idle" });
			expect(preloads).toEqual([]);
			await flush(120);
			expect(preloads).toEqual([[undefined, undefined]]);
		} finally {
			g.requestIdleCallback = ric;
		}
	});

	for (const [name, value] of [
		["Save-Data", { saveData: true, effectiveType: "4g" }],
		["a 2g line", { saveData: false, effectiveType: "2g" }],
		["a slow-2g line", { effectiveType: "slow-2g" }],
	] as const)
		test(`idle on ${name} waits for intent instead`, async () => {
			connection(value);
			const el = await make({ preload: "idle" });
			expect(idle).toHaveLength(0);
			await flush(5);
			expect(preloads).toEqual([]);
			fire(scoreRadio(el), "pointerenter");
			await flush();
			expect(preloads).toHaveLength(1);
		});

	for (const type of ["pointerenter", "focus", "touchstart"])
		test(`intent starts the load on ${type} on the Score switch, once`, async () => {
			const el = await make({ preload: "intent" });
			expect(idle).toHaveLength(0);
			fire(parts(el).radios[0] as HTMLElement, type);
			await flush();
			expect(preloads).toEqual([]);
			fire(scoreRadio(el), type);
			fire(scoreRadio(el), type);
			await flush();
			expect(preloads).toEqual([[undefined, undefined]]);
		});

	test("a refused verovio-url preloads nothing", async () => {
		const el = await make({ preload: "intent", "verovio-url": "javascript:1" });
		fire(scoreRadio(el), "pointerenter");
		await flush();
		expect(preloads).toEqual([]);
	});
});

describe("the element module", () => {
	test("loads the engine only through a dynamic import", () => {
		const source = readFileSync(join(import.meta.dir, "../src/element.ts"), "utf8");
		const imports = new Bun.Transpiler({ loader: "ts" }).scanImports(source);
		const engine = imports.filter((i) => /engine|worker|verovio/.test(i.path));
		expect(engine.map((i) => i.kind)).toEqual(["dynamic-import"]);
	});

	test("importing the package root registers no element", async () => {
		const index = readFileSync(join(import.meta.dir, "../src/index.ts"), "utf8");
		expect(index).not.toContain("element");
	});
});
