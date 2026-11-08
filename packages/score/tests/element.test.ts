import { afterEach, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseHTML } from "linkedom";
import type { Engine, EngraveReply } from "../src/engine.js";
import { renderScoreHtml } from "../src/server.js";

// linkedom stands in for the browser: its window's classes become the globals the element uses.
const window = parseHTML(
	'<!doctype html><html><head><base href="https://example.test/page/"></head><body></body></html>',
);
const { document } = window;
Object.assign(globalThis, {
	HTMLElement: window.HTMLElement,
	customElements: window.customElements,
	MutationObserver: window.MutationObserver,
	CustomEvent: window.CustomEvent,
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
	resolve: (reply: EngraveReply | null) => void;
	reject: (error: Error) => void;
};

let calls: Call[] = [];
/** Elements a test put in the page, removed after it. */
const mounted: Element[] = [];
let made = 0;
const fakeEngine = (): Engine => {
	made++;
	return {
		engrave: (_key, text, width, verovioUrl) =>
			new Promise((resolve, reject) => calls.push({ text, width, verovioUrl, resolve, reject })),
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
		expect(pane.textContent).toBe("Loading score…");
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
		expect(pane.textContent).toBe("Loading score…");
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
		expect(pane.textContent).not.toContain("Loading score");
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
