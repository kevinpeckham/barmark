import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { layoutChart, renderChartUnwrapped } from "../src/index.js";

const doc = (text: string) => parseHTML(`<body>${renderChartUnwrapped(text)}</body>`).document;

describe("part:", () => {
	test("the model carries the part, and the header still reads its directives", () => {
		const m = layoutChart("# Song\npart: Gtr = Electric Guitar 1\nkey: G, time: 3/4\n| G |");
		expect(m.part).toEqual({ label: "Gtr", name: "Electric Guitar 1" });
		expect(m.header.time).toEqual({ n: 3, d: 4 });
		expect(m.blocks.flatMap((b) => b.items.map((i) => i.kind))).toEqual(["row"]);
	});
	test("the header names the part first", () => {
		expect(
			doc("# Song\npart: Electric Guitar 1\nkey: G\n| G |").querySelector("[part=meta]")
				?.textContent,
		).toBe("Electric Guitar 1 · G major");
	});
	test("a chart with only a part still has a header", () => {
		expect(doc("part: Piano\n| G |").querySelector("[part=meta]")?.textContent).toBe("Piano");
	});
});
