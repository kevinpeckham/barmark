/** A chart's credits (barmark grammar 7.5), set as a score sets them. */
import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { creditsText, layoutChart, renderChartUnwrapped } from "../src/index.js";

const none = { composer: [], lyricist: [], arranger: [], copyright: [] };
const doc = (html: string) =>
	parseHTML(`<!doctype html><html><body>${html}</body></html>`).document;

describe("creditsText", () => {
	test("the same people wrote words and music", () => {
		expect(
			creditsText({ ...none, composer: ["Kevin Peckham"], lyricist: ["Kevin Peckham"] }),
		).toEqual(["Words and music by Kevin Peckham"]);
	});
	test("different people", () => {
		expect(creditsText({ ...none, composer: ["A"], lyricist: ["B"] })).toEqual([
			"Music by A",
			"Words by B",
		]);
	});
	test("several names", () => {
		expect(creditsText({ ...none, composer: ["A", "B"] })).toEqual(["Music by A and B"]);
		expect(creditsText({ ...none, composer: ["A", "B", "C"] })).toEqual(["Music by A, B and C"]);
	});
	test("words only, and an arranger only", () => {
		expect(creditsText({ ...none, lyricist: ["B"] })).toEqual(["Words by B"]);
		expect(creditsText({ ...none, arranger: ["Z"] })).toEqual(["Arranged by Z"]);
	});
	test("none", () => {
		expect(creditsText(none)).toEqual([]);
	});
	test("a Traditional composer prints as written, without Music by", () => {
		for (const written of ["Traditional", "traditional", "Trad.", "Traditional, 16th century"])
			expect(creditsText({ ...none, composer: [written] })).toEqual([written]);
	});
	test("the same Traditional name for words and music prints once, as written", () => {
		expect(creditsText({ ...none, composer: ["Traditional"], lyricist: ["Traditional"] })).toEqual([
			"Traditional",
		]);
		expect(
			creditsText({
				...none,
				composer: ["Trad., 1600"],
				lyricist: ["Trad., 1600"],
				arranger: ["Z"],
			}),
		).toEqual(["Trad., 1600", "Arranged by Z"]);
	});
	test("a Traditional composer keeps the other lines", () => {
		expect(
			creditsText({ ...none, composer: ["Traditional"], lyricist: ["B"], arranger: ["Z"] }),
		).toEqual(["Traditional", "Words by B", "Arranged by Z"]);
	});
	test("a real name, or one that merely starts with Trad, keeps Music by", () => {
		expect(creditsText({ ...none, composer: ["Kevin Peckham"] })).toEqual([
			"Music by Kevin Peckham",
		]);
		expect(creditsText({ ...none, composer: ["Tradd Smith"] })).toEqual(["Music by Tradd Smith"]);
		expect(creditsText({ ...none, composer: ["Traditional", "A"] })).toEqual([
			"Music by Traditional and A",
		]);
	});
});

describe("rendered credits", () => {
	const chart =
		"# Song\ncomposer: A & <B>\nlyricist: A & <B>\narranger: Z\nkey: G\n| G |\ncopyright: © K\ncopyright: All rights reserved.";
	const page = doc(renderChartUnwrapped(chart));
	test("the credits sit in the header, under the title", () => {
		const header = page.querySelector(".bm-header");
		const lines = [...(header?.querySelectorAll(".bm-credits") ?? [])].map((p) => p.textContent);
		expect(lines).toEqual(["Words and music by A & <B>", "Arranged by Z"]);
		expect(header?.firstElementChild?.className).toBe("bm-title");
		expect(header?.querySelector(".bm-credits")?.getAttribute("part")).toBe("credits");
	});
	test("credit text is escaped", () => {
		expect(renderChartUnwrapped(chart)).toContain("A &amp; &lt;B&gt;");
	});
	test("the copyright lines are a foot of their own", () => {
		const foot = page.querySelector("footer.bm-copyright");
		expect(foot?.getAttribute("part")).toBe("copyright");
		expect([...(foot?.querySelectorAll("p") ?? [])].map((p) => p.textContent)).toEqual([
			"© K",
			"All rights reserved.",
		]);
		expect(page.querySelector(".bm-chart")?.lastElementChild).toBe(foot);
	});
	test("no credit is drawn in the body as text", () => {
		expect(page.querySelectorAll(".bm-text")).toHaveLength(0);
	});
	test("a credit before the directives keeps them in the header", () => {
		expect(layoutChart("composer: A\nkey: G\n| G |").header.key).toMatchObject({ tonic: "G" });
	});
	test("the model carries the credits", () => {
		expect(layoutChart(chart).credits.arranger).toEqual(["Z"]);
	});
	test("a chart without credits has neither", () => {
		const plain = doc(renderChartUnwrapped("# Song\n| G |"));
		expect(plain.querySelector(".bm-credits")).toBeNull();
		expect(plain.querySelector(".bm-copyright")).toBeNull();
	});
});
