import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { layoutChart, renderChartUnwrapped } from "../src/index.js";
import { MORNING_SONG } from "./morning-song.js";

const doc = (text: string) => parseHTML(`<body>${renderChartUnwrapped(text)}</body>`).document;
const verse = () => {
	const d = doc(MORNING_SONG);
	return [...d.querySelectorAll(".bm-section")].find(
		(s) => s.getAttribute("aria-label") === "Verse",
	);
};

describe("several parts (grammar 7.4)", () => {
	test("the model groups a system's rows, one per declared part, in score order", () => {
		const m = layoutChart(MORNING_SONG);
		expect(m.parts.map((p) => p.label)).toEqual(["Gtr", "Pno"]);
		const items = m.blocks.find((b) => b.heading === "Verse")?.items ?? [];
		const systems = items.flatMap((i) => (i.kind === "system" ? [i] : []));
		expect(systems).toHaveLength(items.length);
		expect(systems.map((s) => s.barNumber)).toEqual([5, 9]);
		expect(systems[0]?.rows.map((r) => [r.label, r.row.kind])).toEqual([
			["Gtr", "row"],
			["Pno", "row"],
		]);
		const pno = systems[1]?.rows[1]?.row;
		const cells = pno?.kind === "row" ? pno.cells : [];
		expect(cells.map((c) => c.kind === "slots" && c.tacet)).toEqual([true, true, true, true]);
	});
	test("a system draws stacked part rows with labels and one bar number", () => {
		const systems = verse()?.querySelectorAll(".bm-system") ?? [];
		expect(systems).toHaveLength(2);
		const rows = [...(systems[0]?.querySelectorAll(".bm-part-row") ?? [])];
		expect(rows.map((r) => r.querySelector(".bm-part-label")?.textContent)).toEqual(["Gtr", "Pno"]);
		const gutters = rows.map((r) => r.querySelector("[part=bar-number]")?.textContent ?? "");
		expect(gutters[0]).toContain("5");
		expect(gutters[1]).not.toMatch(/\d/);
	});
	test("a tacet part draws an empty row marked tacet, as wide as the system", () => {
		const rows = [
			...(verse()?.querySelectorAll(".bm-system")[1]?.querySelectorAll(".bm-part-row") ?? []),
		];
		const [gtr, pno] = rows;
		expect(pno?.classList.contains("bm-tacet")).toBe(true);
		expect(pno?.querySelectorAll(".bm-bar")).toHaveLength(
			gtr?.querySelectorAll(".bm-bar").length ?? -1,
		);
		expect(pno?.querySelector(".bm-bar .bm-bar-body")?.textContent).toBe("tacet");
	});
	test("a tutti line is one ordinary row", () => {
		const d = doc(MORNING_SONG);
		const intro = [...d.querySelectorAll(".bm-section")].find(
			(s) => s.getAttribute("aria-label") === "Intro",
		);
		expect(intro?.querySelectorAll(".bm-system")).toHaveLength(0);
		expect(intro?.querySelectorAll(".bm-row")).toHaveLength(1);
		expect(intro?.querySelector(".bm-part-label")).toBeNull();
	});
	test("the header lists the parts", () => {
		expect(doc(MORNING_SONG).querySelector("[part=meta]")?.textContent).toBe(
			"Electric Guitar 1, Piano · G major",
		);
	});
	test("each part row is announced once, by name", () => {
		const text = verse()?.querySelectorAll(".bm-system")[0]?.textContent ?? "";
		expect(text.split("Electric Guitar 1")).toHaveLength(2);
		expect(text.split("Piano")).toHaveLength(2);
	});
	test("a part's errored line shows as an error in its row", () => {
		const d = doc("part: Gtr = Guitar\npart: Pno = Piano\nGtr | G | C |\nPno | Em | Xq7 |");
		const rows = d.querySelectorAll(".bm-system > *");
		expect([...rows].map((r) => r.className)).toEqual(["bm-row bm-part-row", "bm-error"]);
	});
});

describe("one part's view", () => {
	const pno = () =>
		parseHTML(`<body>${renderChartUnwrapped(MORNING_SONG, { part: "pno" })}</body>`).document;
	test("draws one part as a single-part chart", () => {
		const d = pno();
		expect(d.querySelector(".bm-system")).toBeNull();
		expect(d.querySelector("[part=meta]")?.textContent).toBe("Piano · G major");
	});
	test("its tacet bars say so", () => {
		const verse = [...pno().querySelectorAll(".bm-section")].find(
			(s) => s.getAttribute("aria-label") === "Verse",
		);
		const rows = verse?.querySelectorAll(".bm-row") ?? [];
		expect(rows).toHaveLength(2);
		expect(rows[0]?.textContent).toContain("G/B");
		expect(rows[1]?.querySelectorAll(".bm-tacet-bar")).toHaveLength(4);
		expect(rows[1]?.querySelector(".bm-bar-body")?.textContent).toBe("tacet");
	});
	test("an undeclared label draws the whole chart, and says so", () => {
		const m = layoutChart(MORNING_SONG, { part: "Bass" });
		expect(m.parts).toHaveLength(2);
		expect(m.diagnostics.map((x) => x.message)).toContain("no part labelled Bass");
	});
});
