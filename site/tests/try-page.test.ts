import { beforeAll, describe, expect, test } from "bun:test";
import { ROWS } from "../src/lib/guide/rows.ts";
import { page } from "./built.ts";

let doc: Document;
beforeAll(() => {
	doc = page("try.html");
}, 120_000);

describe("/try, prerendered", () => {
	test("opens on Cø, read in full", () => {
		expect(doc.querySelector("textarea")?.textContent).toBe("Cø");
		const reading = doc.querySelector("[data-reading]")?.textContent ?? "";
		expect(reading).toContain("Cm7(b5)");
		expect(reading).toContain("C minor seven flat five");
		expect(reading).toContain("C:hdim7");
	});
	test("draws the chord as one bar, without a bar number", () => {
		const chart = doc.querySelector("[data-reading] barmark-chart");
		expect(chart?.getAttribute("bar-numbers")).toBe("off");
		expect(chart?.querySelector("template[shadowrootmode=open]")).not.toBeNull();
	});
	test("shows the chords rows of the guide, and no others", () => {
		const shown = [...doc.querySelectorAll("[data-row]")]
			.filter((r) => !r.hasAttribute("hidden"))
			.map((r) => r.getAttribute("data-row"));
		expect(shown.sort()).toEqual(
			ROWS.filter((r) => r.category === "chords")
				.map((r) => r.id)
				.sort(),
		);
	});
	test("offers the example chips", () => {
		const chips = [...doc.querySelectorAll("[data-example]")].map((b) => b.textContent?.trim());
		expect(chips).toEqual(["Cø", "C7b9/E", "{C E G}", "C:maj7", "| D | % | x2"]);
	});
});

describe("the nav", () => {
	test("links to Try it, after Syntax", () => {
		const links = [...page("index.html").querySelectorAll("nav a")].map((a) => [
			a.getAttribute("href"),
			a.textContent?.trim(),
		]);
		const syntax = links.findIndex(([href]) => href === "/syntax");
		expect(links[syntax + 1]).toEqual(["/try", "Try it"]);
	});
});
