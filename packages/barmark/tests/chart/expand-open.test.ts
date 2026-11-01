import { describe, expect, test } from "bun:test";
import { PEACEFUL_DREAMS, play } from "./fixtures.js";

const uneven = (text: string) => play(text).diagnostics.filter((d) => d.message.includes("uneven"));

describe("open repeats", () => {
	test("a bar line marked x ... is one open pass", () => {
		const r = play("| D | A | x ...");
		expect(r.events.map((e) => e.kind)).toEqual(["open"]);
		const open = r.events[0];
		expect(open?.kind === "open" && open.events).toHaveLength(2);
		expect(r.bars).toHaveLength(2);
	});
	test("a section marked x ... may hold counted repeats", () => {
		const r = play("## Out x ...\n| D |\n| D | x2");
		expect(r.events.map((e) => e.kind)).toEqual(["open"]);
		expect(r.bars).toHaveLength(3);
		expect(r.sections[0]?.lastBar).toBe(3);
	});
	test("brackets can be open", () => {
		expect(play("|: D | A :| x ...").events.map((e) => e.kind)).toEqual(["open"]);
	});
	test("a vamp, then the band moves on", () => {
		const r = play("| E7 | / | x ...\n| A |");
		expect(r.events.map((e) => e.kind)).toEqual(["open", "bar"]);
		expect(r.bars.map((b) => b.index)).toEqual([1, 2, 3]);
	});
	test("an open repeat inside another is an error and plays once", () => {
		const r = play("## Out x ...\n| D | x ...");
		expect(r.diagnostics.filter((d) => d.severity === "error").map((d) => d.line)).toEqual([2]);
		expect(r.bars).toHaveLength(1);
	});
	test("elision cuts the last bar of the open pass", () => {
		expect(play("## C\n| G | D |\n## C x ... ->").texts).toEqual(["G", "D", "G"]);
	});
});

describe("fermatas", () => {
	test("a fermata is an event, not a bar", () => {
		const r = play("| D | ... |\n| E |");
		expect(r.events.map((e) => e.kind)).toEqual(["bar", "fermata", "bar"]);
		expect(r.bars.map((b) => [b.index, b.slots.length])).toEqual([
			[1, 1],
			[2, 1],
		]);
	});
	test("elision keeps a final fermata and cuts the bar before it", () => {
		const r = play("## C\n| G | D | ... |\n## C ->");
		expect(r.texts).toEqual(["G", "D", "G"]);
		expect(r.events.at(-1)?.kind).toBe("fermata");
	});
	test("Peaceful Dreams ends on a ring-out", () => {
		const r = play(PEACEFUL_DREAMS);
		expect(r.events.at(-1)?.kind).toBe("fermata");
		expect(r.bars).toHaveLength(153);
	});
});

describe("slot-count warnings", () => {
	test("three slots in 4/4 warn", () => expect(uneven("| C D E |")).toHaveLength(1));
	test("a group is deliberate", () => expect(uneven("| C_D_E |")).toHaveLength(0));
	test("three slots in 6/8 warn", () => expect(uneven("time: 6/8\n| C D E |")).toHaveLength(1));
	test("two slots in 6/8 are beats", () => expect(uneven("time: 6/8\n| C D |")).toHaveLength(0));
	test("six slots in 6/8 are eighths", () =>
		expect(uneven("time: 6/8\n| C D E F G F |")).toHaveLength(0));
	test("a one-bar meter is used", () => expect(uneven("| [3/4] C D E |")).toHaveLength(0));
	test("warned once per written cell, not per pass", () => {
		expect(uneven("| C D E | x4")).toHaveLength(1);
		expect(uneven("## A\n| C D E |\n## A\n## A")).toHaveLength(1);
	});
	test("a simile is not re-checked", () => expect(uneven("| C D E | % |")).toHaveLength(1));
});

describe("the cap bounds work, not just bars", () => {
	for (const chart of [
		"## A x 99999\n| ... | x 99999",
		"## A x 99999\n|: ... :| x 99999",
		"## A x 99999\n| x 99999",
	]) {
		test(JSON.stringify(chart), () => {
			const start = performance.now();
			const r = play(chart);
			expect(performance.now() - start).toBeLessThan(1000);
			expect(r.all.some((d) => d.severity === "error")).toBe(true);
		});
	}
	test("a bar line with no cells is an error", () => {
		expect(play("| x5").all.filter((d) => d.severity === "error")).toHaveLength(1);
	});
});
