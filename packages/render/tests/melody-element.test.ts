import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { renderChart } from "../src/index.js";

const LEAD = `part: Vox = Voice, instrument: voice
time: 4/4

Vox       | C | G |
Vox.Mel   | {E4} / {G4} / | {D4} / / / |
lyrics 1: | la / la / | la |
`;

// linkedom stands in for the browser: its window's classes become the globals the element uses.
const window = parseHTML("<!doctype html><html><head></head><body></body></html>");
const { document } = window;
const GLOBALS = ["HTMLElement", "customElements", "MutationObserver", "Event"] as const;
const saved = new Map<string, unknown>(
	GLOBALS.map((k) => [k, (globalThis as Record<string, unknown>)[k]]),
);
type Chart = HTMLElement & { text: string | null; melody: boolean };

beforeAll(async () => {
	Object.assign(globalThis, {
		HTMLElement: window.HTMLElement,
		customElements: window.customElements,
		MutationObserver: window.MutationObserver,
		Event: window.Event,
	});
	// A query string: the module registers the element once, and other files import it with no DOM.
	const element = "../src/element.js?melody";
	await import(element);
});
afterAll(() => {
	for (const [k, v] of saved) {
		if (v === undefined) Reflect.deleteProperty(globalThis, k);
		else Object.assign(globalThis, { [k]: v });
	}
});

const flush = async () => {
	for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};

describe("<barmark-chart> melody", () => {
	test("observes melody", () => {
		const ctor = window.customElements.get("barmark-chart") as unknown as {
			observedAttributes: string[];
		};
		expect(ctor.observedAttributes).toContain("melody");
	});

	test("the property round trips with the attribute", () => {
		const el = document.createElement("barmark-chart") as Chart;
		expect(el.melody).toBe(true);
		el.melody = false;
		expect(el.getAttribute("melody")).toBe("off");
		expect(el.melody).toBe(false);
		el.melody = true;
		expect(el.hasAttribute("melody")).toBe(false);
		expect(el.melody).toBe(true);
		el.setAttribute("melody", "on");
		expect(el.melody).toBe(true);
	});

	test("changing the attribute redraws without the melody, and back", async () => {
		const el = document.createElement("barmark-chart") as Chart;
		el.text = LEAD;
		document.body.append(el);
		await flush();
		const pitches = () => el.shadowRoot?.querySelectorAll(".bm-pitch").length ?? 0;
		expect(pitches()).toBeGreaterThan(0);
		el.setAttribute("melody", "off");
		await flush();
		expect(pitches()).toBe(0);
		expect(el.shadowRoot?.querySelectorAll(".bm-syllable").length).toBeGreaterThan(0);
		el.removeAttribute("melody");
		await flush();
		expect(pitches()).toBeGreaterThan(0);
		el.remove();
	});
});

describe("renderChart writes melody", () => {
	test("melody: false puts melody=off on the tag; the default writes nothing", () => {
		const tag = (html: string) => /<barmark-chart[^>]*>/.exec(html)?.[0] ?? "";
		expect(tag(renderChart(LEAD, { melody: false }))).toContain(' melody="off"');
		expect(tag(renderChart(LEAD))).not.toContain("melody");
		expect(tag(renderChart(LEAD, { melody: true }))).not.toContain("melody");
	});
});
