/**
 * `<barmark-score>`: a chart as barmark's bar grid or as a full score, with a
 * Grid / Score switch. Its chart comes from the `text` property, a `src` URL or
 * a child `<script type="text/barmark">`, as `<barmark-chart>`'s does. A shadow
 * root drawn by `renderScoreHtml` is reused. The score engine (Verovio, in a
 * worker) loads on the first switch to the score, or earlier as `preload`
 * asks, showing its progress while it loads. Importing
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
import { parseChart } from "barmark";
import { isIntegrity } from "./download.js";
import type { Engine, EngineStatus, EngraveReply } from "./engine.js";
import { showStatus, UNMEASURED } from "./loading.js";
import { isLeipzigFace, scorePane } from "./markup.js";
import { decodeCarried, gridError, scoreShell } from "./shell.js";
import { type ScoreView, viewOf } from "./switch.js";

type EngineFactory = () => Engine | Promise<Engine>;

let testEngine: EngineFactory | null = null;

/** For tests only: an engine to use in place of the worker's, or null for the real one. */
export function setEngineForTests(factory: EngineFactory | null): void {
	testEngine = factory;
}

let loading: Promise<Engine> | null = null;
/** The page's engine once imported. */
let loaded: Engine | null = null;

/** The page's engine, imported on first use; a failed import is tried again next time. */
function loadEngine(): Promise<Engine> {
	const factory = testEngine;
	if (factory) return Promise.resolve().then(factory);
	loading ??= import("./engine.js").then(
		(m) => {
			loaded = m.engine();
			return loaded;
		},
		(e: unknown) => {
			loading = null;
			throw e;
		},
	);
	return loading;
}

/** The score's accessible name when the chart has no title. */
const UNTITLED = "Score";
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

/**
 * Verovio's Leipzig face (the ♯, ♭ and ♩ of chord symbols and tempo marks), once per
 * document. Verovio declares it in a `<style>` inside the score's SVG, in the shadow
 * root, where Chromium never registers a font face, so "C♯m7" drew as "C m7". The
 * copy is the face `cleanSvg` already let through, checked again here.
 */
function addScoreFont(doc: Document, pane: Element): void {
	if (doc.querySelector("style[data-barmark-score-font]") !== null) return;
	const css = [...pane.querySelectorAll("style")]
		.map((s) => s.textContent ?? "")
		.find(isLeipzigFace);
	if (!css) return;
	const font = Object.assign(doc.createElement("style"), { textContent: css });
	font.setAttribute("data-barmark-score-font", "Leipzig");
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
	"columns",
	...["view", "verovio-url", "verovio-integrity", "preload"],
];

/** With no `requestIdleCallback`, how long after connecting `preload="idle"` starts the load. */
const IDLE_FALLBACK_MS = 500;

/** Whether the reader asked to save data, or is on a 2G line: `preload="idle"` waits for intent there. */
function sparing(): boolean {
	const c = (
		globalThis.navigator as { connection?: { saveData?: boolean; effectiveType?: string } }
	)?.connection;
	return c?.saveData === true || c?.effectiveType === "2g" || c?.effectiveType === "slow-2g";
}

/** The pointer, focus or touch on the Score radio that says a reader may want the score. */
const INTENT = ["pointerenter", "focus", "touchstart"];

type Preload = "none" | "intent" | "idle";

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The radio a click or key landed on. */
const radioOf = (target: EventTarget | null) =>
	(target as Element | null)?.closest?.("[data-view]") ?? null;

/** A chart to engrave at a width; two at nearly the same width are the same score. */
type Engraving = { text: string; width: number };
const same = (a: Engraving | null, b: Engraving) =>
	a !== null && a.text === b.text && Math.abs(a.width - b.width) <= SLACK;

/**
 * What the grid draws: the chart text (null when it could not be loaded,
 * undefined while there is no source yet) and its markup.
 */
type Grid = { text: string | null | undefined; html: string | null };

const URL_REASON = "verovio-url must be an http(s) URL";
const INTEGRITY_REASON = "verovio-integrity must be one sha256-, sha384- or sha512- digest";

/** `verovio-url` resolved against the page: undefined when absent, null unless http(s). */
function verovioHref(value: string | null, base: string | undefined): string | null | undefined {
	if (value === null) return undefined;
	try {
		const url = new URL(value, base);
		return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
	} catch {
		return null;
	}
}

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
		/** The chart the grid shows: null when it could not be loaded, undefined until there is a source. */
		#chart: string | null | undefined;
		/** Whether the shadow root has been drawn (or a server-drawn one taken over). */
		#drawn = false;
		/** The view last shown, null before the first: a change from it fires `viewchange`. */
		#shown: ScoreView | null = null;
		#failed = false;
		#engraved: (Engraving & { svg: string; label: string }) | null = null;
		/** The engraving and theme the pane holds, so an unchanged one is not written again. */
		#revealed: { svg: string; theme: string } | null = null;
		#asked: Engraving | null = null;
		/** What the engine last said about the request being waited on. */
		#status: EngineStatus = UNMEASURED;
		/** Whether this element has asked the engine to preload. */
		#preloaded = false;
		/** The pending idle preload's cancel, if one is armed. */
		#idle: (() => void) | null = null;

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
			this.#armIdle();
		}
		disconnectedCallback() {
			this.#idle?.();
			this.#idle = null;
			this.#observer.disconnect();
			this.#resize?.disconnect();
			this.#resize = null;
			clearTimeout(this.#resizeTimer);
		}
		attributeChangedCallback(name: string, old: string | null, value: string | null) {
			if (!this.isConnected || old === value) return;
			// A new URL may be the fix: the Score radio works again, as after a new chart.
			if (name === "verovio-url" || name === "verovio-integrity") this.#clearFailure();
			else if (name === "preload") this.#preloadChanged();
			else if (name === "view") this.#applyView();
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
			if (source === "none") return { text: undefined, html: null };
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
				// Grid is checked, as the server draws it: #applyView checks the view actually shown.
				root.innerHTML = scoreShell(grid.html ?? renderChartUnwrapped("", options), "grid");
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
				pane: root?.querySelector(".bms-pane") ?? null,
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
			const score = switcher.querySelector('[data-view="score"]');
			for (const type of INTENT)
				score?.addEventListener(type, () => this.#intent(), { passive: true });
		}

		/** `preload`: "none" unless "intent" or "idle"; "idle" is "intent" on a sparing connection. */
		#preloadMode(): Preload {
			const v = this.getAttribute("preload");
			if (v === "idle") return sparing() ? "intent" : "idle";
			return v === "intent" ? "intent" : "none";
		}

		/** A reader reaching for Score: any preload but "none" starts now. */
		#intent() {
			if (this.#preloadMode() !== "none") this.#preload();
		}

		/** A new `preload`: an idle load armed for "idle" is cancelled unless it is still "idle". */
		#preloadChanged() {
			if (this.#preloadMode() !== "idle") {
				this.#idle?.();
				this.#idle = null;
			}
			this.#armIdle();
		}

		/** `preload="idle"`: start the load when the page is idle (or shortly, without requestIdleCallback). */
		#armIdle() {
			if (this.#idle || this.#preloaded || this.#preloadMode() !== "idle") return;
			const run = () => {
				this.#idle = null;
				this.#preload();
			};
			const g = globalThis as {
				requestIdleCallback?: (cb: () => void) => number;
				cancelIdleCallback?: (id: number) => void;
			};
			if (g.requestIdleCallback) {
				const id = g.requestIdleCallback(run);
				this.#idle = () => g.cancelIdleCallback?.(id);
			} else {
				const t = setTimeout(run, IDLE_FALLBACK_MS);
				this.#idle = () => clearTimeout(t);
			}
		}

		/** Loads the engine with no job, once per element; the engine shares the one load. */
		#preload() {
			if (this.#preloaded) return;
			const source = this.#source();
			if (source === null) return;
			this.#preloaded = true;
			loadEngine().then(
				(e) => e.preload(source.url, source.integrity),
				() => {},
			);
		}

		/** Where Verovio comes from, or null (and why) when `verovio-url` or `verovio-integrity` is refused. */
		#verovio(): { url: string | undefined; integrity: string | undefined } | { refused: string } {
			const url = verovioHref(this.getAttribute("verovio-url"), this.ownerDocument.baseURI);
			if (url === null) return { refused: URL_REASON };
			const integrity = url === undefined ? null : this.getAttribute("verovio-integrity");
			if (integrity === null) return { url, integrity: undefined };
			return isIntegrity(integrity)
				? { url, integrity: integrity.trim() }
				: { refused: INTEGRITY_REASON };
		}

		#source() {
			const v = this.#verovio();
			return "refused" in v ? null : v;
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
			// A score waiting for its chart shows the grid, so Grid is the radio checked.
			this.#check(view === "score" && this.#chart === undefined ? "grid" : view);
			const was = this.#shown;
			this.#shown = view;
			if (was !== null && was !== view)
				this.dispatchEvent(
					new CustomEvent("viewchange", { detail: { view }, bubbles: true, composed: true }),
				);
			if (view === "score") this.#showScore();
			else this.#showGrid();
		}

		/** Checks the radio for `view` and makes it the one Tab reaches. */
		#check(view: ScoreView) {
			for (const r of this.#parts().radios) {
				const on = r.getAttribute("data-view") === view;
				r.setAttribute("aria-checked", String(on));
				if (on) r.removeAttribute("tabindex");
				else r.setAttribute("tabindex", "-1");
			}
		}

		#showGrid() {
			const { grid, pane } = this.#parts();
			pane?.toggleAttribute("hidden", true);
			grid?.toggleAttribute("hidden", false);
		}

		/** Shows the score, engraving it first unless the one in hand is for this chart and width. */
		#showScore() {
			// No source yet: the grid stays and the score is engraved once the chart arrives.
			if (this.#chart === undefined) return this.#showGrid();
			if (this.#chart === null) return this.#fail("there is no chart to engrave");
			const want = { text: this.#chart, width: this.clientWidth || 0 };
			if (this.#engraved && same(this.#engraved, want)) return this.#reveal(this.#engraved);
			if (same(this.#asked, want)) return this.#busy();
			const verovio = this.#verovio();
			if ("refused" in verovio) return this.#fail(verovio.refused);
			void this.#engrave(want, verovio);
		}

		/** Engraves `want`; only the newest request this element made is shown, with its status while it waits. */
		async #engrave(
			want: Engraving,
			verovio: { url: string | undefined; integrity: string | undefined },
		) {
			this.#asked = want;
			const ask = ++this.#engraves;
			this.#status = UNMEASURED;
			const onStatus = (s: EngineStatus) => {
				if (ask !== this.#engraves) return;
				this.#status = s;
				const { pane } = this.#parts();
				if (pane && this.#revealed === null) showStatus(pane, s);
			};
			const call =
				verovio.integrity === undefined ? { onStatus } : { onStatus, integrity: verovio.integrity };
			const run = (e: Engine) => e.engrave(this, want.text, want.width, verovio.url, call);
			// A loaded engine is asked at once, so its status (not a provisional one) is the first drawn.
			const request = loaded ? run(loaded) : loadEngine().then(run);
			this.#busy();
			let reply: EngraveReply | null;
			try {
				reply = await request;
			} catch (e) {
				reply = { id: 0, ok: false, reason: messageOf(e) };
			}
			if (reply === null || ask !== this.#engraves) return;
			this.#asked = null;
			if (!reply.ok) return this.#fail(reply.reason);
			const label = parseChart(want.text).title ?? UNTITLED;
			this.#engraved = { ...want, svg: reply.svg, label };
			if (this.view === "score") this.#reveal(this.#engraved);
		}

		/** A score on its way: a shown one stays (busy) until the new one lands, else its loading status. */
		#busy() {
			const { grid, pane } = this.#parts();
			if (!pane) return;
			if (this.#revealed === null) showStatus(pane, this.#status);
			pane.setAttribute("aria-busy", "true");
			pane.toggleAttribute("hidden", false);
			grid?.toggleAttribute("hidden", true);
		}

		#reveal({ svg, label }: { svg: string; label: string }) {
			const { grid, pane } = this.#parts();
			if (!pane) return;
			const theme = optionsFromAttributes(this).theme ?? "auto";
			if (this.#revealed?.svg !== svg || this.#revealed.theme !== theme) {
				try {
					pane.innerHTML = scorePane(svg, theme, label);
					addScoreFont(this.ownerDocument, pane);
				} catch (e) {
					return this.#fail(messageOf(e));
				}
				this.#revealed = { svg, theme };
			}
			pane.removeAttribute("aria-busy");
			pane.toggleAttribute("hidden", false);
			grid?.toggleAttribute("hidden", true);
		}

		/**
		 * The score could not be drawn: the grid again, a note by the switch, Score
		 * disabled, and a `scoreerror` event saying why, once per failure.
		 */
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
			this.#revealed = null;
			pane?.replaceChildren();
			pane?.removeAttribute("aria-busy");
			this.#showGrid();
			if (this.view === "score") this.view = "grid";
			this.dispatchEvent(
				new CustomEvent("scoreerror", { detail: { reason }, bubbles: true, composed: true }),
			);
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
