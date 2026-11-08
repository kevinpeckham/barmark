import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { exportMusicXml } from "@barmark/musicxml";
import type { VerovioToolkit } from "verovio/esm";
import { engraveChart } from "../src/index.js";
import { loadToolkit } from "./helpers/toolkit.js";

const vrv = await loadToolkit();
const examples = join(import.meta.dir, "../../../examples");
const charts = readdirSync(examples).filter((f) => f.endsWith(".chart.md"));
const read = (f: string) => readFileSync(join(examples, f), "utf8");
const count = (s: string, re: RegExp) => s.match(re)?.length ?? 0;

describe("engraveChart", () => {
	test("finds the example charts", () => expect(charts.length).toBeGreaterThan(0));

	test("engraves every example chart", () => {
		for (const f of charts) {
			const r = engraveChart(vrv, read(f), { width: 800 });
			if (!r.ok) throw new Error(`${f}: ${r.reason}`);
			expect(r.svg.startsWith('<div class="bms-score-page"><svg')).toBe(true);
			expect(r.pages).toBeGreaterThanOrEqual(1);
			expect(count(r.svg, /class="bms-score-page"/g)).toBe(r.pages);
		}
	});

	test("one staff group per exported staff", () => {
		const r = engraveChart(vrv, read("morning-song.chart.md"), { width: 800 });
		if (!r.ok) throw new Error(r.reason);
		const parts = r.xml.split(/<part /).slice(1);
		const first = parts.map((p) => p.split("</measure>")[0] ?? "");
		const staves = first.reduce(
			(n, p) => n + Number(/<staves>(\d+)<\/staves>/.exec(p)?.[1] ?? 1),
			0,
		);
		// Verovio draws a staff group per staff in each measure: read the first system's first measure.
		const system = r.svg.split('class="system"')[1] ?? "";
		const measure = system.split('class="measure"')[1] ?? "";
		expect(count(measure, /class="staff"/g)).toBe(staves);
	});

	test("a piano's slash bar: slashes on the upper staff, a rest on the lower", () => {
		// Verovio slashed both staves of a grand staff from <measure-style number="1">.
		const r = engraveChart(vrv, read("morning-song.chart.md"), { width: 800 });
		if (!r.ok) throw new Error(r.reason);
		const system = r.svg.split('class="system"')[1] ?? "";
		const measure = system.split('class="measure"')[1] ?? "";
		// Guitar, then the piano's two staves; the last runs on to the measure's own marks.
		const [, upper = "", lower = ""] = measure.split('class="staff"').slice(1);
		expect(count(upper, /class="note"/g)).toBe(4);
		expect(count(lower, /class="beatRpt"/g)).toBe(0);
		expect(count(lower, /class="note"/g)).toBe(0);
		expect(count(lower, /class="(mRest|rest)"/g)).toBe(1);
	});

	test("a pickup is drawn as one: no time signature of its own, numbered 0", () => {
		engraveChart(vrv, read("shenandoah.chart.md"), { width: 800 });
		const mei = vrv.getMEI();
		const meters = [...mei.matchAll(/<meterSig [^>]*count="(\d+)" unit="(\d+)"/g)].map(
			(m) => `${m[1]}/${m[2]}`,
		);
		expect(new Set(meters)).toEqual(new Set(["4/4"]));
		expect(mei).toMatch(/<measure [^>]*metcon="false" n="0">/);
	});

	test("as many measures as the export", () => {
		const r = engraveChart(vrv, read("morning-song.chart.md"), { width: 800 });
		if (!r.ok) throw new Error(r.reason);
		const firstPart = r.xml.split(/<part /)[1]?.split("</part>")[0] ?? "";
		expect(count(r.svg, /class="measure"/g)).toBe(count(firstPart, /<measure /g));
	});

	/** Every chord symbol Verovio drew, as its text. */
	const harms = (svg: string) =>
		[...svg.matchAll(/class="harm"[\s\S]*?<\/g>/g)].map((m) =>
			m[0].replace(/<[^>]+>|\s|class="harm">/g, ""),
		);

	test("a degree the export hides is not drawn after the kind text", () => {
		// Verovio 6.4 appends every <degree>, print-object="no" or not: D7sus4(7), G5(7)(no3).
		const r = engraveChart(vrv, read("peaceful-dreams.chart.md"), { width: 800 });
		if (!r.ok) throw new Error(r.reason);
		expect(r.xml).toContain('<degree print-object="no">');
		const drawn = new Set(harms(r.svg));
		expect(drawn).toContain("D7sus4");
		expect(drawn).toContain("G5(7)");
		expect([...drawn].filter((h) => h.includes(")("))).toEqual([]);
		expect([...drawn].filter((h) => h.endsWith("sus4(7)"))).toEqual([]);
	});

	test("refuses a chart that does not export", () => {
		const text = "| C |\n| Xq9 |";
		expect(exportMusicXml(text).ok).toBe(false);
		const r = engraveChart(vrv, text, { width: 800 });
		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(r.diagnostics.length).toBeGreaterThan(0);
		const first = r.diagnostics.find((d) => d.severity === "error") ?? r.diagnostics[0];
		expect(r.reason).toContain(`Line ${first?.line}`);
		expect(engraveChart(vrv, "", { width: 800 }).ok).toBe(false);
	});

	test("a refusal with no line of its own has no line prefix", () => {
		const r = engraveChart(vrv, "", { width: 800 });
		if (r.ok) throw new Error("engraved an empty chart");
		expect(r.diagnostics[0]?.line).toBe(0);
		expect(r.reason).toBe(r.diagnostics[0]?.message ?? "?");
	});

	test("narrow widths clamp to 320", () => {
		const pageWidth = (width: number) => {
			engraveChart(vrv, read("morning-song.chart.md"), { width });
			return (vrv.getOptions() as { pageWidth: number }).pageWidth;
		};
		expect(pageWidth(100)).toBe(pageWidth(320));
		expect(pageWidth(320)).toBe(800);
		expect(pageWidth(800)).toBe(2000);
	});

	/** A toolkit that reads nothing (or reads a score of no pages), as Verovio does on a refusal. */
	const stub = (loads: boolean, pages: number) =>
		({
			setOptions() {},
			loadData: () => loads,
			getPageCount: () => pages,
			renderToSVG: () => "",
		}) as unknown as VerovioToolkit;

	test("a score Verovio cannot read is a refusal, not a throw", () => {
		const r = engraveChart(stub(false, 1), read("morning-song.chart.md"), { width: 800 });
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.reason).toContain("could not read");
	});

	test("a score of no pages is a refusal, not a throw", () => {
		const r = engraveChart(stub(true, 0), read("morning-song.chart.md"), { width: 800 });
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.reason).toContain("no pages");
	});
});
