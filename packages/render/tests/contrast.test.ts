import { describe, expect, test } from "bun:test";
import { PALETTES, stylesheet } from "../src/styles.js";

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
	test("stops inherited styles at the shadow boundary", () => {
		expect(stylesheet).toContain(":host{all:initial;display:block}");
	});
	test("exposes every public custom property, with a palette fallback", () => {
		for (const v of ["font", "size", "ink", "paper", "muted", "rule", "accent"])
			expect(stylesheet).toContain(`var(--barmark-${v},`);
	});
	test("dark follows the system in auto, print is always light, forced colours are respected", () => {
		expect(stylesheet).toContain("@media (prefers-color-scheme:dark)");
		expect(stylesheet).toContain("@media print");
		expect(stylesheet).toContain("@media (forced-colors:active)");
	});
	test("sizes are relative: no px lengths outside the visually hidden screen-reader text", () => {
		expect(stylesheet.replace(/\.bm-sr\{[^}]*\}/, "")).not.toMatch(/\d+px/);
	});
});
