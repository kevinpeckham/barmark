import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { layoutChart, renderChartUnwrapped } from "../src/index.js";
import type { BlockItem, ChartModel } from "../src/types.js";

type Row = Extract<BlockItem, { kind: "row" }>;
const numbers = (m: ChartModel) =>
	m.blocks
		.flatMap((b) => b.items.filter((i): i is Row => i.kind === "row"))
		.map((r) => r.barNumber);

// Issue #92: the chart from Stem Shovel's preview, plus a replay.
const LEAD_SHEET = `key: G

## A
|: G | D |
|1 Em | C :|
|2 Em | D |
| Segno |
| Am | D7 |
| To Coda | G | D.S. al Coda |
| Coda |
| C | G |

## Verse
| G | C |
## Chorus
| D | G |
## Verse`;

describe("the margin numbers bars as written (issue #92)", () => {
	test("endings, a jump and a coda: each written bar once", () => {
		expect(numbers(layoutChart(LEAD_SHEET))).toEqual([1, 3, 5, null, 7, 9, null, 10, 12, 14, 12]);
	});
	test("a screen reader hears the written number of each bar", () => {
		const doc = parseHTML(`<body>${renderChartUnwrapped(LEAD_SHEET)}</body>`).document;
		const spoken = [...doc.querySelectorAll(".bm-bar .bm-sr")].map((e) => e.textContent);
		expect(spoken.slice(4, 6)).toEqual(["bar 5: E minor", "bar 6: D"]);
	});
	test("a replay shows the numbers its section was written with", () => {
		const m = layoutChart("## Verse\n| G | C |\n## Chorus\n| D |\n## Verse");
		expect(numbers(m)).toEqual([1, 3, 1]);
	});
	test("bars after an open repeat keep their numbers", () => {
		expect(numbers(layoutChart("## Vamp x ...\n| D | A |\n## Next\n| G |"))).toEqual([1, 3]);
	});
	test("rehearsal marks and directions take no number", () => {
		expect(numbers(layoutChart("| @A | D | A |\n| Segno | @B | G | D | D.S. |"))).toEqual([1, 3]);
	});
});
