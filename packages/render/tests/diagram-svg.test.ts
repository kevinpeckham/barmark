import { describe, expect, test } from "bun:test";
import { shapeOf } from "@barmark/fretboard";
import { parseHTML } from "linkedom";
import { diagramSvg } from "../src/diagram.js";

const svgOf = (html: string) => {
	const svg = parseHTML(`<!doctype html><html><body>${html}</body></html>`).document.querySelector(
		"svg",
	);
	if (!svg) throw new Error("no svg");
	return svg;
};
const count = (svg: Element, selector: string) => svg.querySelectorAll(selector).length;
/** Where a `×` is drawn: the first x of its path. */
const xOf = (mark: Element) => Number(/^M([\d.]+)/.exec(mark.getAttribute("d") ?? "")?.[1]);

// The grid, the nut and the marks every first-position diagram shares.
const OPEN = '<svg class="bm-diagram-svg" role="img" aria-label="L" viewBox="0 0 78 75">';
const GRID =
	'<path class="bm-dg-grid" d="M23 13v60M33 13v60M43 13v60M53 13v60M63 13v60M73 13v60M23 13h50M23 25h50M23 37h50M23 49h50M23 61h50M23 73h50"/>';
const NUT = '<rect class="bm-dg-nut" x="22.5" y="9.5" width="51" height="4"/>';
const muted = (x: number) =>
	`<path class="bm-dg-mark" d="M${Math.round((x - 2.8) * 10) / 10} 2.2l5.6 5.6m0-5.6l-5.6 5.6"/>`;
const open = (x: number) => `<circle class="bm-dg-mark" cx="${x}" cy="5" r="2.8"/>`;
const dot = (x: number, y: number) => `<circle class="bm-dg-dot" cx="${x}" cy="${y}" r="3.8"/>`;

describe("diagramSvg: golden drawings", () => {
	test("x02210, an open chord", () => {
		expect(diagramSvg(shapeOf("x02210"), "right", "L")).toBe(
			`${OPEN}${GRID}${NUT}${muted(23)}${open(33)}${open(73)}${dot(43, 31)}${dot(53, 31)}${dot(63, 19)}</svg>`,
		);
	});

	test("577655, a barre at the fifth fret", () => {
		expect(diagramSvg(shapeOf("577655"), "right", "L")).toBe(
			`${OPEN}${GRID}<text class="bm-dg-fret" x="18" y="22.5" font-size="10">5fr</text><rect class="bm-dg-barre" x="19.2" y="15.2" width="57.6" height="7.6" rx="3.8"/>${dot(33, 43)}${dot(43, 43)}${dot(53, 31)}</svg>`,
		);
	});

	test("xx0232, a muted bass", () => {
		expect(diagramSvg(shapeOf("xx0232"), "right", "L")).toBe(
			`${OPEN}${GRID}${NUT}${muted(23)}${muted(33)}${open(43)}${dot(53, 31)}${dot(63, 43)}${dot(73, 31)}</svg>`,
		);
	});

	test("x3x0x0, muted strings inside the shape", () => {
		expect(diagramSvg(shapeOf("x3x0x0"), "right", "L")).toBe(
			`${OPEN}${GRID}${NUT}${muted(23)}${muted(43)}${open(53)}${muted(63)}${open(73)}${dot(33, 43)}</svg>`,
		);
	});

	test("x02210 left-handed: the strings mirror, the low string on the right", () => {
		expect(diagramSvg(shapeOf("x02210"), "left", "L")).toBe(
			`${OPEN}${GRID}${NUT}${muted(73)}${open(63)}${open(23)}${dot(53, 31)}${dot(43, 31)}${dot(33, 19)}</svg>`,
		);
	});
});

describe("diagramSvg: what is drawn", () => {
	test("an open chord: two open marks, one muted, three dots, a nut, no fret number", () => {
		const svg = svgOf(diagramSvg(shapeOf("x02210"), "right", "A minor"));
		expect(count(svg, "circle.bm-dg-mark")).toBe(2);
		expect(count(svg, "path.bm-dg-mark")).toBe(1);
		expect(count(svg, ".bm-dg-dot")).toBe(3);
		expect(count(svg, ".bm-dg-nut")).toBe(1);
		expect(count(svg, ".bm-dg-fret")).toBe(0);
		expect(count(svg, ".bm-dg-barre")).toBe(0);
	});

	test("a barre shape: one barre, a 5fr label, no nut; strings above the barre keep their dots", () => {
		const svg = svgOf(diagramSvg(shapeOf("577655"), "right", "A"));
		expect(count(svg, ".bm-dg-barre")).toBe(1);
		expect(svg.querySelector(".bm-dg-fret")?.textContent).toBe("5fr");
		expect(count(svg, ".bm-dg-nut")).toBe(0);
		expect(count(svg, ".bm-dg-dot")).toBe(3);
	});

	test("left-handed: the same counts, and the muted low string on the right half", () => {
		const right = svgOf(diagramSvg(shapeOf("x02210"), "right", "A minor"));
		const left = svgOf(diagramSvg(shapeOf("x02210"), "left", "A minor"));
		for (const s of ["circle.bm-dg-mark", "path.bm-dg-mark", ".bm-dg-dot", ".bm-dg-nut"])
			expect(count(left, s)).toBe(count(right, s));
		// The strings run from x 23 to x 73: their middle is 48.
		const [lx, rx] = [left, right].map((s) => xOf(s.querySelector("path.bm-dg-mark") as Element));
		expect(lx).toBeGreaterThan(48);
		expect(rx).toBeLessThan(48);
	});

	test("the label is the image's name, escaped; colours come from classes, not attributes", () => {
		const html = diagramSvg(shapeOf("x02210"), "right", 'A "minor" <b>');
		expect(svgOf(html).getAttribute("aria-label")).toBe('A "minor" <b>');
		expect(html).not.toContain("<b>");
		expect(html).not.toMatch(/\s(fill|stroke|stroke-width|style)=/);
		expect(html).not.toMatch(/\sid="/);
	});

	test("a fret number of two digits", () => {
		const svg = svgOf(diagramSvg(shapeOf("x 12 14 14 13 12"), "right", "B"));
		expect(svg.querySelector(".bm-dg-fret")?.textContent).toBe("12fr");
	});
});
