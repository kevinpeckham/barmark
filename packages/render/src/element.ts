/**
 * `<barmark-chart>`: renders itself from a `src` URL or from a child
 * `<script type="text/barmark">`, and again whenever either changes. A
 * shadow root rendered on the server is reused. Importing this module
 * registers the element (once) and the font (once per document).
 */
import { FONT_FAMILY, fontFaceCss } from "./font.js";
import { loadErrorContent, type RenderOptions, shadowContent } from "./html.js";

type Attributes = {
	getAttribute(name: string): string | null;
	hasAttribute(name: string): boolean;
};

const THEMES = ["auto", "light", "dark"] as const;

export function optionsFromAttributes(el: Attributes): RenderOptions {
	const theme = el.getAttribute("theme");
	return {
		theme: THEMES.find((t) => t === theme) ?? "auto",
		barNumbers: el.getAttribute("bar-numbers") !== "off",
		rehearsalLetters: el.hasAttribute("rehearsal-letters"),
	};
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

function defineElement(): void {
	class BarmarkChart extends HTMLElement {
		static observedAttributes = ["src", "theme", "bar-numbers", "rehearsal-letters"];
		#observer = new MutationObserver(() => this.#render());
		#renders = 0;

		connectedCallback() {
			registerFont(this.ownerDocument);
			this.#observer.observe(this, { childList: true, subtree: true, characterData: true });
			this.#render();
		}
		disconnectedCallback() {
			this.#observer.disconnect();
		}
		attributeChangedCallback() {
			if (this.isConnected) this.#render();
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

		async #render() {
			const script = this.querySelector('script[type="text/barmark"]');
			// With no source of its own, a server-rendered chart stays as it is.
			if (!this.src && !script) return;
			const render = ++this.#renders;
			const options = optionsFromAttributes(this);
			const content = await this.#content(script, options);
			if (render !== this.#renders) return;
			(this.shadowRoot ?? this.attachShadow({ mode: "open" })).innerHTML = content;
		}

		async #content(script: Element | null, options: RenderOptions): Promise<string> {
			if (!this.src) return shadowContent(inlineChartText(script?.textContent ?? ""), options);
			try {
				const response = await fetch(this.src);
				if (!response.ok) throw new Error(`${response.status} ${response.statusText}`.trim());
				return shadowContent(await response.text(), options);
			} catch (e) {
				return loadErrorContent(`Could not load ${this.src}: ${(e as Error).message}`, options);
			}
		}
	}
	customElements.define("barmark-chart", BarmarkChart);
}

if (typeof customElements !== "undefined" && !customElements.get("barmark-chart")) defineElement();
