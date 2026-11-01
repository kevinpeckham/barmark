import { describe, expect, test } from "bun:test";
import { type Key, parseChord } from "barmark";
import { parseHTML } from "linkedom";
import { typesetNumeral } from "../src/chord.js";
import { optionsFromAttributes } from "../src/element.js";
import { layoutChart, renderChart, renderChartUnwrapped } from "../src/index.js";

const D: Key = { tonic: "D", mode: "major" };
const Am: Key = { tonic: "A", mode: "minor" };
const parts = (symbol: string) => {
	const r = parseChord(symbol);
	if (!r.ok || !r.value.parts) throw new Error(`${symbol} did not parse`);
	return r.value.parts;
};
const nashville = (symbol: string, key = D) => typesetNumeral(parts(symbol), key, "nashville");
const roman = (symbol: string, key = D) => typesetNumeral(parts(symbol), key, "roman");

describe("typesetNumeral: Nashville", () => {
	test("the degree, then the chord's own quality and superscript", () => {
		expect(nashville("D")).toEqual({ root: "1", quality: "", superscript: "", bass: null });
		expect(nashville("Bm7")).toEqual({ root: "6", quality: "m", superscript: "7", bass: null });
		expect(nashville("D7sus4")).toEqual({
			root: "1",
			quality: "",
			superscript: "7sus4",
			bass: null,
		});
		expect(nashville("A7(b9)")).toEqual({
			root: "5",
			quality: "",
			superscript: "7(♭9)",
			bass: null,
		});
	});
	test("a slash bass is a degree too", () => {
		expect(nashville("D/F#")).toEqual({ root: "1", quality: "", superscript: "", bass: "3" });
	});
	test("chromatic degrees carry ♭ or ♯", () => {
		expect(nashville("C")?.root).toBe("♭7");
		expect(nashville("G#dim")).toEqual({ root: "♯4", quality: "dim", superscript: "", bass: null });
	});
	test("a minor key counts from its own tonic", () => {
		expect(nashville("Am", Am)).toEqual({ root: "1", quality: "m", superscript: "", bass: null });
		expect(nashville("C", Am)?.root).toBe("♭3");
		expect(nashville("G", Am)?.root).toBe("♭7");
	});
});

describe("typesetNumeral: Roman", () => {
	test("case shows major or minor", () => {
		expect(roman("D")?.root).toBe("I");
		expect(roman("Em")).toEqual({ root: "ii", quality: "", superscript: "", bass: null });
		expect(roman("G")?.root).toBe("IV");
		expect(roman("A7")).toEqual({ root: "V", quality: "", superscript: "7", bass: null });
		expect(roman("Bm7")).toEqual({ root: "vi", quality: "", superscript: "7", bass: null });
		expect(roman("C")?.root).toBe("♭VII");
	});
	test("diminished is lower case with °, augmented upper case with +", () => {
		expect(roman("C#dim")).toEqual({ root: "vii", quality: "°", superscript: "", bass: null });
		expect(roman("Daug")).toEqual({ root: "I", quality: "+", superscript: "", bass: null });
	});
	test("in a minor key: i, ♭III, ♭VII", () => {
		expect(roman("Am", Am)?.root).toBe("i");
		expect(roman("C", Am)?.root).toBe("♭III");
		expect(roman("G", Am)?.root).toBe("♭VII");
	});
	test("a slash bass is a number", () => {
		expect(roman("D/F#")?.bass).toBe("3");
	});
});

const CHART = "key: D\n| D | A7 | Bm | {D4 F#4} |\n| N.C. | ? | -- | G / C |\nkey: E\n| E | B |\n";
const shadowDoc = (html: string) => {
	const tpl = parseHTML(`<!doctype html><html><body>${html}</body></html>`).document.querySelector(
		"template",
	);
	return parseHTML(`<!doctype html><html><body>${tpl?.innerHTML ?? ""}</body></html>`).document;
};
const chords = (html: string) =>
	[...shadowDoc(html).querySelectorAll(".bm-chord")].map((e) => e.textContent ?? "");

describe("the numerals option", () => {
	test("each bar carries its key in the model", () => {
		const rows = layoutChart(CHART).blocks[0]?.items.filter((i) => i.kind === "row") ?? [];
		const keys = rows.flatMap((r) =>
			r.kind === "row" ? r.cells.map((c) => (c.kind === "slots" ? c.key?.tonic : null)) : [],
		);
		expect(keys).toEqual(["D", "D", "D", "D", "D", "D", "D", "D", "E", "E"]);
	});
	test("off by default: chord names", () => {
		expect(chords(renderChart(CHART)).slice(0, 3)).toEqual(["D", "A7", "Bm"]);
	});
	test("nashville: numbers, note sets unchanged, renumbered after a modulation", () => {
		expect(chords(renderChart(CHART, { numerals: "nashville" }))).toEqual([
			"1",
			"57",
			"6m",
			"{D4 F♯4}",
			"4",
			"♭7",
			"1",
			"5",
		]);
	});
	test("roman", () => {
		expect(chords(renderChart(CHART, { numerals: "roman" })).slice(0, 3)).toEqual([
			"I",
			"V7",
			"vi",
		]);
	});
	test("a chart with no key shows chord names", () => {
		expect(chords(renderChart("| D | A |", { numerals: "nashville" }))).toEqual(["D", "A"]);
	});
	test("the numeral is marked, for styling", () => {
		const d = shadowDoc(renderChart(CHART, { numerals: "nashville" }));
		expect(d.querySelector(".bm-chord")?.getAttribute("data-numeral")).toBe("nashville");
	});
	test("a screen reader hears the numeral and the chord", () => {
		const d = shadowDoc(renderChart(CHART, { numerals: "nashville" }));
		const spoken = [...d.querySelectorAll(".bm-bar .bm-sr")].map((e) => e.textContent);
		expect(spoken[1]).toBe("bar 2: five, A seven");
		expect(spoken[7]).toBe("bar 8: four, G, hold, flat seven, C");
		expect(spoken[3]).toBe("bar 4: notes D four, F sharp four");
	});
	test("the wrapper keeps the option as an attribute, and the element reads it back", () => {
		expect(renderChart(CHART, { numerals: "roman" })).toStartWith(
			'<barmark-chart numerals="roman">',
		);
		expect(renderChartUnwrapped(CHART, { numerals: "roman" })).toContain('data-numeral="roman"');
		const el = (attrs: Record<string, string>) => ({
			getAttribute: (n: string) => attrs[n] ?? null,
			hasAttribute: (n: string) => n in attrs,
		});
		expect(optionsFromAttributes(el({ numerals: "nashville" })).numerals).toBe("nashville");
		expect(optionsFromAttributes(el({ numerals: "klingon" })).numerals).toBeUndefined();
	});
	test("an unknown value draws chord names", () => {
		const options = { numerals: "klingon" } as unknown as Parameters<typeof renderChart>[1];
		expect(chords(renderChart(CHART, options)).slice(0, 2)).toEqual(["D", "A7"]);
	});
});
