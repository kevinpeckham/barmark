import { describe, expect, test } from "bun:test";
import { type Shape, shapeOf } from "@barmark/fretboard";
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
// Regenerated on purpose in fix round 1: the strings moved right (x 41 to 91)
// to give a larger fret number room at the left; and in fix round 2: a
// diagram with no fret number (base 1) is a narrow image, its viewBox 5
// units either side of the strings, and one with a fret number the wide one.
const OPEN = '<svg class="bm-diagram-svg" role="img" aria-label="L" viewBox="36 0 60 75">';
const WIDE = '<svg class="bm-diagram-svg bm-dg-fr" role="img" aria-label="L" viewBox="0 0 96 75">';
const GRID =
	'<path class="bm-dg-grid" d="M41 13v60M51 13v60M61 13v60M71 13v60M81 13v60M91 13v60M41 13h50M41 25h50M41 37h50M41 49h50M41 61h50M41 73h50"/>';
const NUT = '<rect class="bm-dg-nut" x="40.5" y="9.5" width="51" height="4"/>';
const muted = (x: number) =>
	`<path class="bm-dg-mark" d="M${Math.round((x - 2.8) * 10) / 10} 2.2l5.6 5.6m0-5.6l-5.6 5.6"/>`;
const open = (x: number) => `<circle class="bm-dg-mark" cx="${x}" cy="5" r="2.8"/>`;
const dot = (x: number, y: number) => `<circle class="bm-dg-dot" cx="${x}" cy="${y}" r="3.8"/>`;

describe("diagramSvg: golden drawings", () => {
	test("x02210, an open chord", () => {
		expect(diagramSvg(shapeOf("x02210"), "right", "L")).toBe(
			`${OPEN}${GRID}${NUT}${muted(41)}${open(51)}${open(91)}${dot(61, 31)}${dot(71, 31)}${dot(81, 19)}</svg>`,
		);
	});

	test("577655, a barre at the fifth fret", () => {
		expect(diagramSvg(shapeOf("577655"), "right", "L")).toBe(
			`${WIDE}${GRID}<text class="bm-dg-fret" x="35.2" y="23.5" font-size="13">5fr</text><rect class="bm-dg-barre" x="37.2" y="15.2" width="57.6" height="7.6" rx="3.8"/>${dot(51, 43)}${dot(61, 43)}${dot(71, 31)}</svg>`,
		);
	});

	test("xx0232, a muted bass", () => {
		expect(diagramSvg(shapeOf("xx0232"), "right", "L")).toBe(
			`${OPEN}${GRID}${NUT}${muted(41)}${muted(51)}${open(61)}${dot(71, 31)}${dot(81, 43)}${dot(91, 31)}</svg>`,
		);
	});

	test("x3x0x0, muted strings inside the shape", () => {
		expect(diagramSvg(shapeOf("x3x0x0"), "right", "L")).toBe(
			`${OPEN}${GRID}${NUT}${muted(41)}${muted(61)}${open(71)}${muted(81)}${open(91)}${dot(51, 43)}</svg>`,
		);
	});

	test("x02210 left-handed: the strings mirror, the low string on the right", () => {
		expect(diagramSvg(shapeOf("x02210"), "left", "L")).toBe(
			`${OPEN}${GRID}${NUT}${muted(91)}${open(81)}${open(41)}${dot(71, 31)}${dot(61, 31)}${dot(51, 19)}</svg>`,
		);
	});

	test("x24432, a barre that starts on the second string", () => {
		expect(diagramSvg(shapeOf("x24432"), "right", "L")).toBe(
			`${OPEN}${GRID}${NUT}${muted(41)}<rect class="bm-dg-barre" x="47.2" y="27.2" width="47.6" height="7.6" rx="3.8"/>${dot(61, 55)}${dot(71, 55)}${dot(81, 43)}</svg>`,
		);
	});

	test("x24432 left-handed: the barre and the dots mirror", () => {
		expect(diagramSvg(shapeOf("x24432"), "left", "L")).toBe(
			`${OPEN}${GRID}${NUT}${muted(91)}<rect class="bm-dg-barre" x="37.2" y="27.2" width="47.6" height="7.6" rx="3.8"/>${dot(71, 55)}${dot(61, 55)}${dot(51, 43)}</svg>`,
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
		// The strings run from x 41 to x 91: their middle is 66.
		const [lx, rx] = [left, right].map((s) => xOf(s.querySelector("path.bm-dg-mark") as Element));
		expect(lx).toBeGreaterThan(66);
		expect(rx).toBeLessThan(66);
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

/** The left edge of everything drawn that reaches into the band from `top` to `bottom`: dots, the barre, the nut and the first string. */
function leftmostIn(svg: Element, top: number, bottom: number): number {
	const edges: number[] = [];
	const num = (e: Element, a: string) => Number(e.getAttribute(a));
	for (const c of svg.querySelectorAll("circle")) {
		const [cx, cy, r] = [num(c, "cx"), num(c, "cy"), num(c, "r")];
		if (cy + r > top && cy - r < bottom) edges.push(cx - r);
	}
	for (const r of svg.querySelectorAll("rect")) {
		const [x, y, h] = [num(r, "x"), num(r, "y"), num(r, "height")];
		if (y + h > top && y < bottom) edges.push(x);
	}
	const grid = svg.querySelector(".bm-dg-grid")?.getAttribute("d") ?? "";
	// The first string's x, less half a generous stroke.
	edges.push(Math.min(...[...grid.matchAll(/M([\d.]+) [\d.]+v/g)].map((m) => Number(m[1]))) - 1);
	return Math.min(...edges);
}

describe("the fret number has room", () => {
	/** A six-string barre at the base fret: the widest thing beside the label. */
	const barreAt = (base: number): Shape => ({
		frets: [base, base + 2, base + 2, base + 1, base, base],
		base,
		barre: { fret: base, from: 0, to: 5 },
	});

	for (const base of [2, 5, 10, 12, 15])
		for (const hand of ["right", "left"] as const)
			test(`${base}fr, ${hand}-handed: inside the viewBox and clear of the drawing, 2 units each side`, () => {
				const svg = svgOf(diagramSvg(barreAt(base), hand, "L"));
				const label = svg.querySelector(".bm-dg-fret") as Element;
				expect(label.textContent).toBe(`${base}fr`);
				const size = Number(label.getAttribute("font-size"));
				const [end, baseline] = [Number(label.getAttribute("x")), Number(label.getAttribute("y"))];
				// A generous estimate of the text's width: 0.62 of the size a character.
				const start = end - 0.62 * size * (label.textContent ?? "").length;
				expect(start).toBeGreaterThanOrEqual(2);
				expect(leftmostIn(svg, baseline - size, baseline) - end).toBeGreaterThanOrEqual(2);
			});

	test("the fret number is at least 12 units tall, so about 9 px at the default size", () => {
		const label = svgOf(diagramSvg(barreAt(5), "right", "L")).querySelector(".bm-dg-fret");
		expect(Number(label?.getAttribute("font-size"))).toBeGreaterThanOrEqual(12);
	});
});

/** The viewBox's left edge and width. */
const viewBoxOf = (svg: Element) => {
	const [x, , w] = (svg.getAttribute("viewBox") ?? "").split(" ").map(Number);
	return { x: x ?? Number.NaN, w: w ?? Number.NaN };
};

describe("narrow and wide drawings", () => {
	test("a base 1 shape is the narrow image: no fret number, no label class", () => {
		const svg = svgOf(diagramSvg(shapeOf("x02210"), "right", "L"));
		expect(svg.getAttribute("class")).toBe("bm-diagram-svg");
		expect(svg.getAttribute("viewBox")).toBe("36 0 60 75");
		expect(count(svg, ".bm-dg-fret")).toBe(0);
	});

	test("a base 5 shape is the wide image, with the label class and its fret number", () => {
		const svg = svgOf(diagramSvg(shapeOf("577655"), "left", "L"));
		expect(svg.getAttribute("class")).toBe("bm-diagram-svg bm-dg-fr");
		expect(svg.getAttribute("viewBox")).toBe("0 0 96 75");
		expect(count(svg, ".bm-dg-fret")).toBe(1);
	});

	/** Shapes in first position and above it, open, muted, barred and partly barred. */
	const SHAPES = [
		"x02210",
		"x32010",
		"133211",
		"x24432",
		"xx0232",
		"x3x0x0",
		"577655",
		"x 12 14 14 13 12",
		"x x 7 9 10 9",
	];
	const STRINGS = [41, 51, 61, 71, 81, 91];

	for (const text of SHAPES)
		test(`${text}: dots on their strings and in their fret spaces, inside the viewBox, mirrored exactly`, () => {
			const shape = shapeOf(text);
			const drawn = (hand: "right" | "left") => svgOf(diagramSvg(shape, hand, "L"));
			const right = drawn("right");
			const left = drawn("left");
			for (const [hand, svg] of [
				["right", right],
				["left", left],
			] as const) {
				const { x, w } = viewBoxOf(svg);
				// Everything drawn lies inside the viewBox: dots, marks, the barre.
				for (const c of svg.querySelectorAll("circle")) {
					const [cx, r] = [Number(c.getAttribute("cx")), Number(c.getAttribute("r"))];
					expect(cx - r).toBeGreaterThanOrEqual(x);
					expect(cx + r).toBeLessThanOrEqual(x + w);
				}
				for (const r of svg.querySelectorAll("rect")) {
					expect(Number(r.getAttribute("x"))).toBeGreaterThanOrEqual(x);
					expect(Number(r.getAttribute("x")) + Number(r.getAttribute("width"))).toBeLessThanOrEqual(
						x + w,
					);
				}
				// Each dot sits on a fretted string, in the space fret - base + 1.
				const want = shape.frets.flatMap((f, i) =>
					f > 0 &&
					!(shape.barre && f === shape.barre.fret && i >= shape.barre.from && i <= shape.barre.to)
						? [`${STRINGS[hand === "left" ? 5 - i : i]},${13 + (f - shape.base + 1) * 12 - 6}`]
						: [],
				);
				const dots = [...svg.querySelectorAll(".bm-dg-dot")].map(
					(d) => `${d.getAttribute("cx")},${d.getAttribute("cy")}`,
				);
				expect(dots).toEqual(want);
			}
			// The mirror is exact about the strings' middle, x 66.
			const xs = (svg: Element) =>
				[...svg.querySelectorAll("circle")].map((c) => Number(c.getAttribute("cx")));
			expect(xs(left).map((v) => 132 - v)).toEqual(xs(right));
			expect(viewBoxOf(left)).toEqual(viewBoxOf(right));
		});
});
