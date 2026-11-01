/**
 * `<barmark-chart>`: renders itself from its `text` property, a `src` URL
 * or a child `<script type="text/barmark">`, and again whenever one
 * changes. A shadow root rendered on the server is reused. Importing this
 * module registers the element (once) and the font (once per document).
 */
import { FONT_FAMILY, fontFaceCss } from "./font.js";
import { loadErrorContent, type RenderOptions, shadowContent, THEMES } from "./html.js";

type Attributes = {
	getAttribute(name: string): string | null;
	hasAttribute(name: string): boolean;
};

export function optionsFromAttributes(el: Attributes): RenderOptions {
	const theme = el.getAttribute("theme");
	return {
		theme: THEMES.find((t) => t === theme) ?? "auto",
		barNumbers: el.getAttribute("bar-numbers") !== "off",
		rehearsalLetters: el.hasAttribute("rehearsal-letters"),
	};
}

export type ChartSource = "text" | "src" | "script" | "none";

/** What a chart draws: its `text` while that is a string, else `src`, else its script child. */
export function chartSource(from: {
	text: string | null;
	src: string;
	script: boolean;
}): ChartSource {
	if (from.text !== null) return "text";
	if (from.src) return "src";
	return from.script ? "script" : "none";
}

/** Chart text from a script element: blank edges and common indentation removed. */
export function inlineChartText(text: string): string {
	const lines = text.replace(/^\s*\n|\n\s*$/g, "").split("\n");
	const indents = lines.filter((l) => l.trim()).map((l) => /^[ \t]*/.exec(l)?.[0].length ?? 0);
	const cut = Math.min(...indents, Number.POSITIVE_INFINITY);
	return lines.map((l) => l.slice(Number.isFinite(cut) ? cut : 0).trimEnd()).join("\n");
}

function registerFont(doc: Document): void {
	if (doc.querySelector("style[data-barmark-font]")) return;
	const style = doc.createElement("style");
	style.dataset.barmarkFont = FONT_FAMILY;
	style.textContent = fontFaceCss(new URL("../fonts/Edwin-Roman.otf", import.meta.url).href);
	doc.head.append(style);
}

async function fetchText(src: string): Promise<string> {
	const response = await fetch(src);
	if (!response.ok) throw new Error(`${response.status} ${response.statusText}`.trim());
	return response.text();
}

function defineElement(): void {
	class BarmarkChart extends HTMLElement {
		static observedAttributes = ["src", "theme", "bar-numbers", "rehearsal-letters"];
		#observer = new MutationObserver(() => this.#schedule());
		#renders = 0;
		#scheduled = false;
		/** The text fetched for `src`, kept so a change of options does not fetch again. */
		#fetched: { src: string; text: Promise<string> } | null = null;
		#text: string | null = null;

		connectedCallback() {
			// Text set before the element was defined landed on the instance: route it through the setter.
			if (Object.hasOwn(this, "text")) {
				const text = (this as { text?: string | null }).text ?? null;
				delete (this as { text?: string | null }).text;
				this.text = text;
			}
			registerFont(this.ownerDocument);
			this.#observer.observe(this, { childList: true, subtree: true, characterData: true });
			this.#schedule();
		}
		disconnectedCallback() {
			this.#observer.disconnect();
		}
		attributeChangedCallback() {
			if (this.isConnected) this.#schedule();
		}

		/** Chart text to draw; while it is a string it wins over `src` and a script child. */
		get text(): string | null {
			return this.#text;
		}
		set text(v: string | null) {
			this.#text = v === null || v === undefined ? null : String(v);
			if (this.isConnected) this.#schedule();
		}
		get src() {
			return this.getAttribute("src") ?? "";
		}
		set src(v: string) {
			this.setAttribute("src", v);
		}
		get theme() {
			return optionsFromAttributes(this).theme ?? "auto";
		}
		set theme(v: string) {
			this.setAttribute("theme", v);
		}
		get barNumbers() {
			return optionsFromAttributes(this).barNumbers ?? true;
		}
		set barNumbers(v: boolean) {
			if (v) this.removeAttribute("bar-numbers");
			else this.setAttribute("bar-numbers", "off");
		}
		get rehearsalLetters() {
			return this.hasAttribute("rehearsal-letters");
		}
		set rehearsalLetters(v: boolean) {
			this.toggleAttribute("rehearsal-letters", v);
		}

		/** Every change in one task (an upgrade sets each attribute in turn) renders once. */
		#schedule() {
			if (this.#scheduled) return;
			this.#scheduled = true;
			queueMicrotask(() => {
				this.#scheduled = false;
				void this.#render();
			});
		}

		async #render() {
			const script = this.querySelector('script[type="text/barmark"]');
			const options = optionsFromAttributes(this);
			const source = chartSource({ text: this.#text, src: this.src, script: script !== null });
			// With no source of its own, a server-rendered chart keeps its music and takes the options it can.
			if (source === "none") return this.#restyle(options);
			const render = ++this.#renders;
			const content = await this.#content(source, script, options);
			if (render !== this.#renders) return;
			(this.shadowRoot ?? this.attachShadow({ mode: "open" })).innerHTML = content;
		}

		async #content(
			source: ChartSource,
			script: Element | null,
			options: RenderOptions,
		): Promise<string> {
			if (source === "text") return shadowContent(this.#text ?? "", options);
			if (source !== "src")
				return shadowContent(inlineChartText(script?.textContent ?? ""), options);
			try {
				return shadowContent(await this.#fetch(this.src), options);
			} catch (e) {
				this.#fetched = null;
				return loadErrorContent(`Could not load ${this.src}: ${(e as Error).message}`, options);
			}
		}

		#fetch(src: string): Promise<string> {
			if (this.#fetched?.src !== src) this.#fetched = { src, text: fetchText(src) };
			return this.#fetched.text;
		}

		#restyle(options: RenderOptions): void {
			const chart = this.shadowRoot?.querySelector(".bm-chart");
			chart?.setAttribute("data-theme", options.theme ?? "auto");
			if (options.barNumbers === false) chart?.setAttribute("data-bar-numbers", "off");
			else chart?.removeAttribute("data-bar-numbers");
		}
	}
	customElements.define("barmark-chart", BarmarkChart);
}

if (typeof customElements !== "undefined" && !customElements.get("barmark-chart")) defineElement();
