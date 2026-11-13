import { describe, expect, test } from "bun:test";
import { DIAGRAMS_CSS, PALETTES, stylesheet } from "../src/styles.js";

/** WCAG 2 relative luminance of a #rrggbb colour. */
function luminance(hex: string): number {
	const [r, g, b] = [1, 3, 5].map((i) => {
		const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}
const ratio = (a: string, b: string) => {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
};

describe("palettes meet WCAG AA", () => {
	for (const [name, p] of Object.entries(PALETTES)) {
		test(`${name}: text colours at least 4.5:1 on paper`, () => {
			for (const colour of [p.ink, p.muted, p.accent])
				expect(ratio(colour, p.paper)).toBeGreaterThanOrEqual(4.5);
		});
		test(`${name}: bar lines at least 3:1 on paper`, () => {
			expect(ratio(p.rule, p.paper)).toBeGreaterThanOrEqual(3);
		});
	}
});

describe("the stylesheet", () => {
	test("a beat note names the symbol fonts that hold 𝅗𝅥 and 𝅘𝅥𝅯 before the label's", () => {
		expect(stylesheet).toMatch(
			/\.bm-beat\{font-family:"Apple Symbols","Segoe UI Symbol","Noto Music",Symbola,var\(--barmark-label-font,/,
		);
	});
	test("stops inherited styles at the shadow boundary", () => {
		expect(stylesheet).toContain(":host{all:initial;display:block}");
	});
	test("exposes every public custom property, with a palette fallback", () => {
		for (const v of [
			"font",
			"text-font",
			"label-font",
			"size",
			"ink",
			"paper",
			"muted",
			"rule",
			"accent",
			"directive",
			"note",
		])
			expect(stylesheet).toContain(`var(--barmark-${v},`);
	});
	test("dark follows the system in auto, print is always light, forced colours are respected", () => {
		expect(stylesheet).toContain("@media (prefers-color-scheme:dark)");
		expect(stylesheet).toContain("@media print");
		expect(stylesheet).toContain("@media (forced-colors:active)");
	});
	test("a chord diagram never breaks across a printed page", () => {
		expect(stylesheet).toMatch(/\.bm-diagram\{[^}]*break-inside:avoid/);
	});
	test("forced colours draw a chord diagram in the system text colour", () => {
		const forced = [
			...stylesheet.matchAll(/@media \(forced-colors:active\)\{((?:[^{}]*\{[^}]*\})*)\}/g),
		]
			.map((m) => m[1])
			.join("");
		// Everything in the strip draws from these three colours, so forcing them forces the strip.
		for (const name of ["rule", "muted", "ink"])
			expect(forced).toMatch(new RegExp(`\\.bm-diagrams\\{[^}]*--bm-${name}:CanvasText`));
		const draws = (selector: string, rule: string) =>
			expect(stylesheet).toMatch(new RegExp(`\\.${selector}\\{[^}]*${rule}`));
		draws("bm-dg-grid", "stroke:var\\(--bm-rule\\)");
		draws("bm-dg-mark", "stroke:var\\(--bm-muted\\)");
		draws("bm-dg-fret", "fill:var\\(--bm-muted\\)");
		draws("bm-diagram-svg", "fill:var\\(--bm-ink\\)");
	});
	test("the not-playable frame stands as tall as a drawing", () => {
		const svg = Number(/\.bm-diagram-svg\{[^}]*;height:([\d.]+)em/.exec(stylesheet)?.[1]);
		const frame = Number(/\.bm-diagram-none\{[^}]*;height:([\d.]+)em/.exec(stylesheet)?.[1]);
		const font = Number(/\.bm-diagram-none[^{]*\{font:([\d.]+)em/.exec(stylesheet)?.[1]);
		expect(svg).toBeGreaterThan(0);
		expect(frame * font).toBeCloseTo(svg, 2);
	});
	test("the narrow and the wide drawing share a string pitch: widths in the ratio of their viewBoxes (60 and 96)", () => {
		const narrow = Number(/\.bm-diagram-svg\{[^}]*[{;]width:([\d.]+)em/.exec(DIAGRAMS_CSS)?.[1]);
		const wide = Number(/\.bm-dg-fr\{[^}]*?\bwidth:([\d.]+)em/.exec(DIAGRAMS_CSS)?.[1]);
		expect(narrow).toBeGreaterThan(0);
		expect(wide / narrow).toBeCloseTo(96 / 60, 2);
	});
	test("the strip's rules use no :has()", () => {
		expect(DIAGRAMS_CSS).not.toContain(":has(");
	});
	test("the strip's rules select only the strip's own classes", () => {
		// Each rule's selector, inside media blocks too: the text before each `{` that opens a declaration block.
		const selectors = [
			...DIAGRAMS_CSS.replace(/@media[^{]*\{/g, "").matchAll(/(?:^|[{}])([^{}@]+)\{/g),
		].map((m) => m[1] ?? "");
		expect(selectors.length).toBeGreaterThan(5);
		for (const selector of selectors) {
			const classes = [...selector.matchAll(/\.([\w-]+)/g)].map((m) => m[1] ?? "");
			expect(classes.length).toBeGreaterThan(0);
			for (const c of classes) expect(c).toMatch(/^(bm-diagram|bm-dg-)/);
			// Beyond classes, only the list's element and the drawing's.
			expect(
				selector.replace(/\.[\w-]+/g, "").replace(/[\s,>:()]|\bis\b|\bul\b|\bsvg\b/g, ""),
			).toBe("");
		}
	});
	test("a note set's name may wrap; a chord name stays on one line", () => {
		expect(stylesheet).toMatch(/\.bm-diagram-set\{[^}]*white-space:normal/);
		expect(stylesheet).toContain(".bm-chord{white-space:nowrap}");
	});
	test("sizes are relative: no px lengths outside the visually hidden screen-reader text", () => {
		expect(stylesheet.replace(/\.bm-sr\{[^}]*\}/, "")).not.toMatch(/\d+px/);
	});
});
