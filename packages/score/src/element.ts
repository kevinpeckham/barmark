/**
 * `<barmark-score>`: a chart as barmark's bar grid or as a full score, with a
 * Grid / Score switch. Its chart comes from the `text` property, a `src` URL or
 * a child `<script type="text/barmark">`, as `<barmark-chart>`'s does. A shadow
 * root drawn by `renderScoreHtml` is reused. The score engine (Verovio, in a
 * worker) loads on the first switch to the score, never before. Importing
 * this module registers the element (once) and the font (once per document).
 */

import {
	FONT_FAMILY,
	fontFaceCss,
	type RenderOptions,
	renderChartUnwrapped,
} from "@barmark/render";
import {
	type ChartSource,
	chartSource,
	inlineChartText,
	optionsFromAttributes,
} from "@barmark/render/element";
import type { Engine, EngraveReply } from "./engine.js";
import { scorePane } from "./markup.js";
import { decodeCarried, gridError, scoreShell } from "./shell.js";
import { type ScoreView, viewOf } from "./switch.js";

type EngineFactory = () => Engine | Promise<Engine>;

let testEngine: EngineFactory | null = null;

/** For tests only: an engine to use in place of the worker's, or null for the real one. */
export function setEngineForTests(factory: EngineFactory | null): void {
	testEngine = factory;
}

let loading: Promise<Engine> | null = null;

/** The page's engine, imported on first use; a failed import is tried again next time. */
function loadEngine(): Promise<Engine> {
	const factory = testEngine;
	if (factory) return Promise.resolve().then(factory);
	loading ??= import("./engine.js").then(
		(m) => m.engine(),
		(e: unknown) => {
			loading = null;
			throw e;
		},
	);
	return loading;
}

const LOADING = "Loading score…";
const NOTE = "The score couldn't be drawn";
/** A width change smaller than this keeps the score as engraved. */
const SLACK = 8;
const RESIZE_DELAY = 150;
const ARROWS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]);

/** Edwin, once per document, under the same marker `<barmark-chart>` uses, so either element adds it once. */
function addFont(doc: Document): void {
	if (doc.querySelector("style[data-barmark-font]") !== null) return;
	// From dist/ (or src/), ../../render is @barmark/render, in the workspace and under node_modules/@barmark/.
	const url = new URL("../../render/fonts/Edwin-Roman.otf", import.meta.url);
	const font = Object.assign(doc.createElement("style"), { textContent: fontFaceCss(url.href) });
	font.setAttribute("data-barmark-font", FONT_FAMILY);
	doc.head.append(font);
}

const load = (src: string): Promise<string> =>
	fetch(src).then((r) =>
		r.ok ? r.text() : Promise.reject(new Error(`${r.status} ${r.statusText}`.trim())),
	);

/** Text set on the element before it was defined is an own property; it is taken off and returned. */
function takeEarlyText(el: object): { text: string | null } | null {
	if (!Object.hasOwn(el, "text")) return null;
	const early = (el as { text?: unknown }).text;
	Reflect.deleteProperty(el, "text");
	return { text: early === null || early === undefined ? null : String(early) };
}

/** The grid's attributes, as `<barmark-chart>` observes them, then the score's own. */
const OBSERVED = [
	...["src", "theme", "bar-numbers", "rehearsal-letters", "numerals", "wrap", "show-part"],
	...["view", "verovio-url"],
];

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The radio a click or key landed on. */
const radioOf = (target: EventTarget | null) =>
	(target as Element | null)?.closest?.("[data-view]") ?? null;

/** A chart to engrave at a width; two at nearly the same width are the same score. */
type Engraving = { text: string; width: number };
const same = (a: Engraving | null, b: Engraving) =>
	a !== null && a.text === b.text && Math.abs(a.width - b.width) <= SLACK;

/** What the grid draws: the chart text (null when there is none to engrave) and its markup. */
type Grid = { text: string | null; html: string | null };

function defineElement(): void {
	class BarmarkScore extends HTMLElement {
		static observedAttributes = OBSERVED;
		// Only the children are observed; some DOMs report attribute changes anyway, which are not the chart's.
		#observer = new MutationObserver((records) => {
			if (records.some((r) => r.type !== "attributes")) this.#chartChanged();
		});
		#resize: ResizeObserver | null = null;
		#resizeTimer: ReturnType<typeof setTimeout> | undefined;
		#queued: Promise<void> | null = null;
		#renders = 0;
		#engraves = 0;
		#fetched: { src: string; text: Promise<string> } | null = null;
		#text: string | null = null;
		/** The chart the grid shows, or null when there is nothing to engrave. */
		#chart: string | null = null;
		/** Whether the shadow root has been drawn (or a server-drawn one taken over). */
		#drawn = false;
		/** The view last shown, null before the first: a change from it fires `viewchange`. */
		#shown: ScoreView | null = null;
		#failed = false;
		#engraved: (Engraving & { svg: string }) | null = null;
		#asked: Engraving | null = null;

		connectedCallback() {
			const early = takeEarlyText(this);
			if (early) this.#text = early.text;
			addFont(this.ownerDocument);
			this.#observer.observe(this, { childList: true, subtree: true, characterData: true });
			if (typeof ResizeObserver !== "undefined") {
				this.#resize = new ResizeObserver(() => this.#resized());
				this.#resize.observe(this);
			}
			this.#schedule();
		}
		disconnectedCallback() {
			this.#observer.disconnect();
			this.#resize?.disconnect();
			this.#resize = null;
			clearTimeout(this.#resizeTimer);
		}
		attributeChangedCallback(name: string, old: string | null, value: string | null) {
			if (!this.isConnected || old === value || name === "verovio-url") return;
			if (name === "view") this.#applyView();
			else if (name === "src") this.#chartChanged();
			else this.#schedule();
		}

		/** Chart text to draw; while it is a string it wins over `src` and a script child. */
		get text(): string | null {
			return this.#text;
		}
		set text(value: string | null) {
			this.#text = value == null ? null : `${value}`;
			if (this.isConnected) this.#chartChanged();
		}
		/** "grid" or "score"; anything else is the grid. */
		get view(): ScoreView {
			return viewOf(this.getAttribute("view"));
		}
		set view(v: ScoreView) {
			this.setAttribute("view", viewOf(v));
		}

		#chartChanged() {
			this.#clearFailure();
			this.#schedule();
		}

		/** The `src` attribute, "" when absent. */
		#src() {
			return this.getAttribute("src") ?? "";
		}

		/** Changes made in one task (an upgrade sets each attribute in turn) draw once, in a microtask. */
		#schedule() {
			this.#queued ??= Promise.resolve().then(() => {
				this.#queued = null;
				return this.#render();
			});
		}

		async #render() {
			const ticket = ++this.#renders;
			const options = optionsFromAttributes(this);
			const script = this.querySelector('script[type="text/barmark"]');
			const from = { text: this.#text, src: this.#src(), script: script !== null };
			const source = chartSource(from);
			const grid = await this.#grid(source, script, options);
			if (ticket === this.#renders) {
				this.#draw(source, grid, options);
				this.#chart = grid.text;
				this.#applyView();
			}
		}

		async #grid(
			source: ChartSource,
			script: Element | null,
			options: RenderOptions,
		): Promise<Grid> {
			if (source === "none") return { text: null, html: null };
			try {
				const text = await this.#chartText(source, script);
				return { text, html: renderChartUnwrapped(text, options) };
			} catch (e) {
				this.#fetched = null;
				const message = `Could not load ${this.#src()}: ${messageOf(e)}`;
				return { text: null, html: gridError(message, options.theme ?? "auto") };
			}
		}

		#chartText(source: ChartSource, script: Element | null): Promise<string> | string {
			if (source === "text") return this.#text ?? "";
			if (source === "script") return inlineChartText(decodeCarried(script?.textContent ?? ""));
			const src = this.#src();
			if (this.#fetched?.src !== src) this.#fetched = { src, text: load(src) };
			return this.#fetched.text;
		}

		/** Draws the grid, keeping a server-drawn one on upgrade (its script child is what it drew). */
		#draw(source: ChartSource, grid: Grid, options: RenderOptions) {
			const hydrating = !this.#drawn && source === "script";
			this.#drawn = true;
			const { switcher, grid: pane, pane: score } = this.#parts();
			if (pane && switcher && score) {
				if (!hydrating) this.#redraw(pane, grid.html, options);
			} else {
				const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
				root.innerHTML = scoreShell(grid.html ?? renderChartUnwrapped("", options), this.view);
			}
			this.#wire();
		}

		/** New grid markup, or with no source of its own, the drawn grid takes the theme. */
		#redraw(pane: Element, html: string | null, options: RenderOptions) {
			if (html !== null) pane.innerHTML = html;
			else pane.querySelector(".bm-chart")?.setAttribute("data-theme", options.theme ?? "auto");
		}

		#parts() {
			const root = this.shadowRoot;
			return {
				switcher: root?.querySelector(".bms-switch") ?? null,
				grid: root?.querySelector(".bms-grid") ?? null,
				pane: root?.querySelector(".bms-score") ?? null,
				radios: [...(root?.querySelectorAll(".bms-switch [data-view]") ?? [])],
			};
		}

		#wired: Element | null = null;

		#wire() {
			const { switcher } = this.#parts();
			if (!switcher || switcher === this.#wired) return;
			this.#wired = switcher;
			switcher.addEventListener("click", (e) => this.#pick(radioOf(e.target)));
			switcher.addEventListener("keydown", (e) => this.#key(e as KeyboardEvent));
		}

		#pick(radio: Element | null) {
			if (!radio || radio.getAttribute("aria-disabled") === "true") return;
			this.view = viewOf(radio.getAttribute("data-view"));
		}

		/** The radio-group keys: an arrow moves to the other view and selects it; Space and Enter select. */
		#key(e: KeyboardEvent) {
			const radio = radioOf(e.target);
			if (!radio) return;
			if (e.key === " " || e.key === "Enter") {
				e.preventDefault();
				this.#pick(radio);
			} else if (ARROWS.has(e.key)) {
				e.preventDefault();
				const other = this.#parts().radios.find((r) => r !== radio) ?? null;
				(other as HTMLElement | null)?.focus?.();
				this.#pick(other);
			}
		}

		/** Shows the view the attribute names, firing `viewchange` when it differs from the last. */
		#applyView() {
			if (!this.#drawn) return;
			const view = this.view;
			if (view === "score" && this.#failed) {
				this.view = "grid";
				return;
			}
			for (const r of this.#parts().radios) {
				const on = r.getAttribute("data-view") === view;
				r.setAttribute("aria-checked", String(on));
				if (on) r.removeAttribute("tabindex");
				else r.setAttribute("tabindex", "-1");
			}
			const was = this.#shown;
			this.#shown = view;
			if (was !== null && was !== view)
				this.dispatchEvent(
					new CustomEvent("viewchange", { detail: { view }, bubbles: true, composed: true }),
				);
			if (view === "score") this.#showScore();
			else this.#showGrid();
		}

		#showGrid() {
			const { grid, pane } = this.#parts();
			pane?.toggleAttribute("hidden", true);
			grid?.toggleAttribute("hidden", false);
		}

		/** Shows the score, engraving it first unless the one in hand is for this chart and width. */
		#showScore() {
			if (this.#chart === null) return this.#fail("there is no chart to engrave");
			const want = { text: this.#chart, width: this.clientWidth || 0 };
			if (this.#engraved && same(this.#engraved, want)) return this.#reveal(this.#engraved.svg);
			if (!same(this.#asked, want)) void this.#engrave(want);
		}

		/** Engraves `want`; only the newest request this element made is shown. */
		async #engrave(want: Engraving) {
			this.#busy();
			this.#asked = want;
			const ask = ++this.#engraves;
			const url = this.getAttribute("verovio-url") ?? undefined;
			let reply: EngraveReply | null;
			try {
				reply = await (await loadEngine()).engrave(this, want.text, want.width, url);
			} catch (e) {
				reply = { id: 0, ok: false, reason: messageOf(e) };
			}
			if (reply === null || ask !== this.#engraves) return;
			this.#asked = null;
			if (!reply.ok) return this.#fail(reply.reason);
			this.#engraved = { ...want, svg: reply.svg };
			if (this.view === "score") this.#reveal(reply.svg);
		}

		#busy() {
			const { grid, pane } = this.#parts();
			if (!pane) return;
			pane.textContent = LOADING;
			pane.setAttribute("aria-busy", "true");
			pane.toggleAttribute("hidden", false);
			grid?.toggleAttribute("hidden", true);
		}

		#reveal(svg: string) {
			const { grid, pane } = this.#parts();
			if (!pane) return;
			let html: string;
			try {
				html = scorePane(svg, optionsFromAttributes(this).theme ?? "auto");
			} catch (e) {
				return this.#fail(messageOf(e));
			}
			pane.innerHTML = html;
			pane.removeAttribute("aria-busy");
			pane.toggleAttribute("hidden", false);
			grid?.toggleAttribute("hidden", true);
		}

		/** The score could not be drawn: the grid again, a note by the switch, Score disabled. */
		#fail(reason: string) {
			console.warn(`<barmark-score>: the score couldn't be drawn: ${reason}`);
			this.#failed = true;
			this.#asked = null;
			this.#engraved = null;
			this.#engraves++;
			const { switcher, pane, radios } = this.#parts();
			if (switcher && !this.shadowRoot?.querySelector(".bms-note")) {
				const note = this.ownerDocument.createElement("p");
				note.className = "bms-note";
				note.setAttribute("role", "status");
				note.textContent = NOTE;
				switcher.after(note);
			}
			radios
				.find((r) => r.getAttribute("data-view") === "score")
				?.setAttribute("aria-disabled", "true");
			pane?.replaceChildren();
			pane?.removeAttribute("aria-busy");
			this.#showGrid();
			if (this.view === "score") this.view = "grid";
		}

		#clearFailure() {
			if (!this.#failed) return;
			this.#failed = false;
			this.shadowRoot?.querySelector(".bms-note")?.remove();
			for (const r of this.#parts().radios) r.removeAttribute("aria-disabled");
		}

		/** A resize engraves again (if the width moved more than SLACK) once it settles. */
		#resized() {
			clearTimeout(this.#resizeTimer);
			this.#resizeTimer = setTimeout(() => {
				if (this.#shown === "score") this.#showScore();
			}, RESIZE_DELAY);
		}
	}
	customElements.define("barmark-score", BarmarkScore);
}

if (typeof customElements !== "undefined" && !customElements.get("barmark-score")) defineElement();
