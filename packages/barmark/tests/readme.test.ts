import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { harteToBarmark, parseChart, parseChord } from "../src/index.js";

const readme = readFileSync(join(import.meta.dir, "../README.md"), "utf8");

describe("the README's claims hold", () => {
	test("its example chart reads cleanly", () => {
		const chart = /```\n(# Example Song[\s\S]*?)```/.exec(readme)?.[1] ?? "";
		const r = parseChart(chart);
		expect(r.title).toBe("Example Song");
		expect(r.diagnostics).toEqual([]);
	});
	test("its API comments", () => {
		const c = parseChord("Bm7(b5)");
		expect(c.ok && c.value.pitches).toEqual(["B", "D", "F", "A"]);
		expect(c.ok && c.value.harte).toBe("B:hdim7");
		expect(harteToBarmark("A:sus4(b7,9)")).toBe("A9sus4");
	});
});
