import { expect, test } from "bun:test";
import { engraverCorpus } from "../../../scripts/engraver-corpus.js";
import {
	type Engraving,
	firstDifference,
	gateProblems,
	type Run,
	summary,
} from "../../../scripts/engraver-equivalence-report.js";

test("identical strings have no difference", () =>
	expect(firstDifference("abc", "abc")).toBeNull());
test("the first differing offset, with context", () => {
	expect(firstDifference("<svg a>", "<svg b>")).toEqual({
		offset: 5,
		stock: "<svg a>",
		lite: "<svg b>",
	});
	expect(firstDifference("ab", "abc")?.offset).toBe(2);
});
const run = (n: number, over: Partial<Engraving> = {}): Run => ({
	version: "6.4.1-fbe8f46",
	instantiateMs: 1,
	engravings: Array.from({ length: n }, (_, i) => ({
		name: `c${i >> 1}`,
		width: i % 2 ? 1000 : 375,
		pages: 1,
		bytes: 10,
		ms: 1,
		...over,
	})),
});
/** `r` with engraving `i` changed. */
const changed = (r: Run, i: number, over: Partial<Engraving>): Run => ({
	...r,
	engravings: r.engravings.map((e, j) => (j === i ? { ...e, ...over } : e)),
});
test("passes on 60 identical engravings", () =>
	expect(gateProblems(run(60), run(60), () => "<svg/>")).toEqual([]));
test("an empty pass is a failure: under 60 engravings", () =>
	expect(gateProblems(run(58), run(58), () => "<svg/>")[0]).toContain("58 engravings"));
test("an empty engraving fails", () =>
	expect(
		gateProblems(run(60, { bytes: 0 }), run(60, { bytes: 0 }), () => "").length,
	).toBeGreaterThan(0));
test("a different getVersion() fails", () =>
	expect(gateProblems(run(60), { ...run(60), version: "6.4.0-x" }, () => "<svg/>")[0]).toContain(
		"getVersion",
	));
test("a page-count or byte difference names the chart, the width and the offset", () => {
	const p = gateProblems(run(60), run(60), (e, w) =>
		w === "lite" && e.name === "c3" && e.width === 1000 ? "<svg b>" : "<svg a>",
	);
	expect(p).toEqual([expect.stringMatching(/c3 at 1000: SVG differs at offset 5/)]);
});
test("a page-count difference is named", () => {
	const lite = changed(run(60), 4, { pages: 2 });
	expect(gateProblems(run(60), lite, () => "<svg/>")).toEqual([
		expect.stringMatching(/c2 at 375: 1 pages in stock, 2 in lite/),
	]);
});
test("a chart one run lacks is named", () => {
	const lite = run(62);
	expect(gateProblems(run(60), lite, () => "<svg/>")).toEqual([
		expect.stringMatching(/c30 at 375: only in lite/),
		expect.stringMatching(/c30 at 1000: only in lite/),
	]);
});
test("the summary gives the instantiate times, the total and the slowest width-375 engraving", () => {
	const stock = run(4);
	const lite = changed(run(4), 2, { ms: 120 });
	const s = summary(stock, lite);
	expect(s).toContain("instantiate");
	expect(s).toMatch(/slowest at 375: c1, 120 ms/);
	expect(s).not.toContain("⚠");
});
test("the summary warns, without gating, over 500 ms at 375", () => {
	const lite = changed(run(4), 0, { ms: 501 });
	expect(summary(run(4), lite)).toContain("⚠ over 500 ms: Q1 says ship -Os");
});
test("the corpus has every source and the long chart", () => {
	const names = engraverCorpus().map(([n]) => n);
	expect(names).toContain("peaceful-dreams.chart.md");
	expect(names.some((n) => n.startsWith("import-"))).toBe(true);
	expect(names.some((n) => n.startsWith("grammar block"))).toBe(true);
	expect(names).toContain("long.chart.md");
	expect(new Set(names).size).toBe(names.length);
});
