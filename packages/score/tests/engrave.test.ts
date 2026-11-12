import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { exportMusicXml } from "@barmark/musicxml";
import { parseChart } from "barmark";
import type { VerovioToolkit } from "verovio/esm";
import { growth, TIMING_TIMEOUT } from "../../../test-support/growth.js";
import { engraveChart, MAX_SCORE_COST, MAX_XML_LENGTH, scoreCost } from "../src/index.js";
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

	test("a repeat's ×N is drawn in the bar it ends, not the next", () => {
		engraveChart(vrv, "|: G | C :| x5\n| D |", { width: 800 });
		const mei = vrv.getMEI();
		const bars = mei.split("<measure ").slice(1);
		expect(bars[1]).toContain("×5");
		expect(bars[2]).not.toContain("×5");
		const tstamp = Number(
			/<dir [^>]*tstamp="([\d.]+)"[^>]*>(?:(?!<\/dir>)[\s\S])*×5/.exec(bars[1] ?? "")?.[1],
		);
		expect(tstamp).toBe(4);
	});

	test("a part after a slashed one draws its own whole-bar rest, not slashes", () => {
		// Verovio carries slash style on from the part before.
		const r = engraveChart(vrv, "part: Gtr = Guitar\npart: Bs = Bass\nGtr | G | C |\n| D | G |", {
			width: 800,
		});
		if (!r.ok) throw new Error(r.reason);
		const system = r.svg.split('class="system"')[1] ?? "";
		const measure = system.split('class="measure"')[1] ?? "";
		const [, bass = ""] = measure.split('class="staff"').slice(1);
		expect(count(bass, /class="beatRpt"/g)).toBe(0);
		expect(count(bass, /class="(mRest|rest)"/g)).toBe(1);
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

	test("a score too large to draw is refused, with the element's reason", () => {
		const text = "| C D_E |\n";
		const cost = scoreCost(parseChart(text));
		const r = engraveChart(vrv, text, { width: 800, maxCost: cost - 1 });
		expect(r).toMatchObject({ ok: false, reason: "The score is too large to draw" });
		expect(engraveChart(vrv, text, { width: 800, maxCost: cost }).ok).toBe(true);
	});

	test(
		"the export stops at the length limit: a score past it is never written whole",
		() => {
			const text = `## A x500\n|: "${"&".repeat(1800)}" C :| x2\n`;
			const early = () =>
				engraveChart(vrv, text, { width: 800, maxCost: Infinity, maxXmlLength: 100_000 });
			expect(early()).toMatchObject({ ok: false, reason: "The score is too large to draw" });
			// The whole export writes 9 MB; the cut one stops after 100 KB, in under half the time.
			expect(growth(early, () => exportMusicXml(text))).toBeGreaterThan(2);
		},
		TIMING_TIMEOUT,
	);

	test("MusicXML too long to draw is refused too", () => {
		expect(MAX_XML_LENGTH).toBe(50_000_000);
		const r = engraveChart(vrv, read("morning-song.chart.md"), { width: 800, maxXmlLength: 100 });
		expect(r).toMatchObject({ ok: false, reason: "The score is too large to draw" });
	});
});

describe("scoreCost", () => {
	const cost = (text: string) => scoreCost(parseChart(text));
	const many = (n: number, slot: string) => Array.from({ length: n }, () => slot).join(" ");
	/** The site's home charts, which a reader flips through. */
	const homeDir = join(import.meta.dir, "../../../site/src/lib/examples");
	const home = readdirSync(homeDir)
		.filter((f) => f.endsWith(".chart.md"))
		.map((f) => readFileSync(join(homeDir, f), "utf8"));
	const gtrPno =
		"part: Gtr = Guitar\npart: Pno = Piano\n\n| G | C |\nGtr | G | C | D | G |\nPno | G/B | C | D | G |\nGtr | Em | C | D | G |\n| C | G |";

	// Exports every example and shape: a second or two alone, more under load.
	test(
		"is never less than the MusicXML the export writes",
		() => {
			const shapes = [
				...charts.map(read),
				...home,
				gtrPno,
				`## A x10\n|: C :| x2\nlyrics: | ${many(200, "la")} |\n`,
				`part: Vo = Voice, instrument: voice\n## A x10\nVo |: ${many(200, '"w" {C4}:la')} :| x2\n`,
				`## A x50\n|: "${"x".repeat(1500)}" C :| x2\n`,
				`## A x50\n|: "${"&".repeat(1500)}" C :| x2\n`,
				`## ${"x".repeat(1500)} x50\n|: C :| x2\n`,
				`## A x50\n|: C :| x2\nlyrics: | ${"x".repeat(1500)} |\n`,
				`${Array.from({ length: 30 }, (_, i) => `part: P${i} = Piano`).join("\n")}\nP0 | C | D |\n`,
				`## A x50\n|: ${many(8, "{C4 E4 G4 B4 D5 F5 A5 C6}")} :| x2\n`,
				`## A x50\n|: ${many(8, "Cmaj13#11/G")} :| x2\n`,
				// A part's declared lines rest where only one plays.
				"part: P = Piano\nP.A | {C4} |\nP.B | {C3} |\nP.C | {C2} |\nP.D | {C1} |\n## B x50\nP.A |: {C4} :| x2\n",
			];
			for (const text of shapes) {
				const r = exportMusicXml(text);
				if (!r.ok) throw new Error(r.diagnostics[0]?.message);
				expect(cost(text)).toBeGreaterThanOrEqual(r.xml.length);
			}
		},
		TIMING_TIMEOUT,
	);

	test("counts every declared part's measure in every bar, a tacet part's rests too", () => {
		const declared = (n: number) =>
			`${Array.from({ length: n }, (_, i) => `part: P${i} = Piano`).join("\n")}\nP0 | C | x300\n`;
		expect(cost(declared(30)) - cost(declared(1))).toBeGreaterThanOrEqual(29 * 300 * 500);
		const r = engraveChart(vrv, declared(30), { width: 800, maxCost: cost(declared(1)) * 5 });
		expect(r).toMatchObject({ ok: false, reason: "The score is too large to draw" });
	});

	test("counts the length of what is written, escaped, as many times as it is played", () => {
		const words = (w: string) => cost(`## A x100\n|: "${w}" C :| x2\n`);
		expect(words("x".repeat(1001)) - words("x")).toBe(200 * 1000);
		expect(words("&".repeat(1001)) - words("&")).toBe(200 * 6000);
		const heading = (h: string) => cost(`## ${h} x100\n|: C :| x2\n`);
		expect(heading("x".repeat(1001)) - heading("x")).toBe(200 * 1000);
		const sung = (t: string) => cost(`## A x100\n|: C :| x2\nlyrics: | ${t} |\n`);
		expect(sung("x".repeat(1001)) - sung("x")).toBe(200 * 1000);
	});

	test("the examples, the site's home chart and Try It's are far under the budget", () => {
		for (const text of [...charts.map(read), ...home, gtrPno])
			expect(cost(text)).toBeLessThan(MAX_SCORE_COST / 50);
		expect(MAX_SCORE_COST).toBe(50_000_000);
	});

	/**
	 * Engraves `text` with no limit on the MusicXML's length, so only the cost
	 * check stands between it and the whole export (the length limit would
	 * cut a late refusal short and hide it).
	 */
	const costOnly = (text: string) =>
		engraveChart(vrv, text, { width: 800, maxXmlLength: Infinity });
	const refused = (text: string) => {
		expect(text.length).toBeLessThan(2_000);
		const r = costOnly(text);
		expect(r).toMatchObject({ ok: false, reason: "The score is too large to draw" });
	};

	test(
		"the finding's chart is refused before its export, in a moment",
		() => {
			// Its export alone takes some twenty seconds and writes 370 MB; a refusal takes well under one,
			// so five seconds is far from both, and a loaded machine can't fail it.
			const text = `## A x500\n|: C :| x2\nlyrics: | ${many(500, "la")} |\n`;
			const start = performance.now();
			refused(text);
			expect(performance.now() - start).toBeLessThan(5_000);
		},
		TIMING_TIMEOUT,
	);

	test(
		"a link of few notes and long escaped words is refused before its export",
		() => {
			// About 9,000 bytes of words a bar, written out 10,000 times: some 90 MB, in 3.5 to 4.5 s, while
			// the refusal takes about 0.8 s. A refusal that came after the export would take longer than the
			// export, so it is timed against it: four refusals a run against one export, alternated.
			const text = `## A x5000\n|: "${"&".repeat(1800)}" C :| x2\n`;
			refused(text);
			expect(
				growth(
					() => costOnly(text),
					() => exportMusicXml(text),
					{ runs: 2, balance: 4 },
				),
			).toBeGreaterThan(2);
		},
		TIMING_TIMEOUT,
	);
});
