import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { layoutChart, renderChart, renderChartUnwrapped } from "../src/index.js";
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

describe("a tutti bar the parts play differently", () => {
	const SPLIT =
		"part: Gtr = Guitar\npart: Pno = Piano\n\nGtr | D | D |\nPno | Em | Em |\n| % | / C |\n";
	const tutti = () => {
		const rows = layoutChart(SPLIT)
			.blocks.flatMap((b) => b.items)
			.filter((i) => i.kind === "row");
		return rows[rows.length - 1];
	};
	test("draws % as written, not one part's copy", () => {
		expect(tutti()?.cells[0]).toMatchObject({ kind: "slots", slots: [], simile: true });
		const html = renderChartUnwrapped(SPLIT);
		expect(html).toContain('<span class="bm-simile">%</span>');
		expect(html).toContain("bar 3: each part repeats its bar before");
	});
	test("draws a leading / as written", () => {
		const cell = tutti()?.cells[1];
		expect(cell?.kind === "slots" && cell.slots.map((s) => s.kind)).toEqual(["hold", "chord"]);
	});
	test("a tutti bar every part plays alike draws its chords", () => {
		const same = "part: Gtr = Guitar\npart: Pno = Piano\n\nGtr | D |\nPno | D |\n| % |\n";
		const rows = layoutChart(same)
			.blocks.flatMap((b) => b.items)
			.filter((i) => i.kind === "row");
		const cell = rows[rows.length - 1]?.cells[0];
		expect(cell?.kind === "slots" && cell.slots[0]?.kind).toBe("chord");
	});
});

describe("show-part on the element", () => {
	test("renderChart writes the part as show-part, never the global part attribute", () => {
		const html = renderChart(MORNING_SONG, { part: "Pno" });
		expect(html).toContain('<barmark-chart show-part="Pno">');
		expect(html).not.toMatch(/<barmark-chart[^>]* part=/);
	});
});

describe("render minors", () => {
	const THREE = "part: Gtr = Guitar\npart: Pno = Piano\npart: Bs = Bass\n\n";
	test("a system whose first part's line errs numbers its first drawn row", () => {
		const d = doc(`${THREE}Gtr | G | Xq7 |\nPno | Em | C |\nBs | E | C |\n`);
		const numbers = [...d.querySelectorAll(".bm-part-row .bm-bar-number")].map((n) =>
			n.textContent?.replace(/^[A-Za-z]+/, ""),
		);
		expect(numbers).toEqual(["1", ""]);
	});
	test("a system says and shows its repeat, ending and times once, on its first row", () => {
		const d = doc(
			"part: Gtr = Guitar\npart: Pno = Piano\n\nGtr |: G | C :| x3\nPno |: Em | C :| x3\n",
		);
		const rows = [...d.querySelectorAll(".bm-part-row")];
		expect(rows.map((r) => r.querySelector(".bm-repeat")?.textContent ?? "")).toEqual([
			"×3play 3 times",
			"",
		]);
		const said = rows.map((r) =>
			[...r.querySelectorAll(":scope > .bm-sr")].map((s) => s.textContent).join(" | "),
		);
		expect(said).toEqual(["Guitar | repeat start", "Piano"]);
		// Both staves still draw their repeat bar lines.
		expect(rows.every((r) => r.querySelector("[data-repeat-start]"))).toBe(true);
	});
	test("an ending's number shows once per system", () => {
		const text =
			"part: Gtr = Guitar\npart: Pno = Piano\n\nGtr |: G | C |\nPno |: Em | C |\nGtr |1 D :|\nPno |1 D :|\nGtr |2 G |\nPno |2 G |\n";
		const endings = [...doc(text).querySelectorAll(".bm-ending")].map(
			(r) => r.querySelector("[data-ending]")?.getAttribute("data-ending") ?? null,
		);
		expect(endings).toEqual(["1.", null, "2.", null]);
	});
	test("tacet rows carry bm-tacet in a part's own view too", () => {
		const d = parseHTML(
			`<body>${renderChartUnwrapped(MORNING_SONG, { part: "Pno" })}</body>`,
		).document;
		expect(d.querySelectorAll(".bm-row.bm-tacet")).toHaveLength(1);
	});
	test("an undeclared part's warning names no line", () => {
		const m = layoutChart(MORNING_SONG, { part: "Bass" });
		expect(m.diagnostics[0]?.line).toBe(0);
		const html = renderChartUnwrapped(MORNING_SONG, { part: "Bass", diagnostics: true });
		expect(html).toContain('<li class="bm-warning">no part labelled Bass</li>');
	});
	test("a cut tacet row says it is cut", () => {
		const text = "part: Gtr = Guitar\npart: Pno = Piano\n\n## Verse\nGtr | G | C |\n## Verse ->\n";
		const html = renderChartUnwrapped(text);
		expect(html).toContain("bar 2: tacet, cut on this pass");
	});
});

describe("several parts over the timeline", () => {
	test("a replayed section brings back every part's rows, tacets and bar numbers", () => {
		const text = `${MORNING_SONG}\n## Verse\n`;
		const verses = [...doc(text).querySelectorAll(".bm-section")].filter(
			(s) => s.getAttribute("aria-label") === "Verse",
		);
		expect(verses).toHaveLength(2);
		const shape = (s: Element) =>
			[...s.querySelectorAll(".bm-part-row")].map(
				(r) =>
					`${r.querySelector(".bm-bar-number")?.textContent}${r.classList.contains("bm-tacet") ? " tacet" : ""}`,
			);
		expect(shape(verses[1] as Element)).toEqual(shape(verses[0] as Element));
	});
	test("a repeat that opens in a system closes on a tutti ending without errors", () => {
		const text =
			"part: Gtr = Guitar\npart: Pno = Piano\n\nGtr |: G | C |\nPno |: Em | C |\n|1 D :|\n|2 G |\n";
		const m = layoutChart(text);
		expect(m.diagnostics).toEqual([]);
		expect(renderChartUnwrapped(text)).toContain("repeat start");
	});
	test("a chart with no parts draws as it did: no systems, no gutter labels", () => {
		const html = renderChartUnwrapped("key: G\n## A\n|: G | C :| x2\n| D |\n");
		expect(html).not.toContain("bm-system");
		expect(html).not.toContain("data-parts");
		expect(html).not.toContain("bm-part-label");
	});
});
