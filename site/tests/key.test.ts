import { describe, expect, test } from "bun:test";
import { chartKey, keyChoices, keyLabel, normalize, transposed } from "../src/lib/key.ts";

describe("normalize", () => {
	test("brings any number of semitones into −5..+6, the shorter way round", () => {
		expect([0, 1, 6, 7, 11, 12, -1, -5, -6, -7, 13].map(normalize)).toEqual([
			0, 1, 6, -5, -1, 0, -1, -5, 6, 5, 1,
		]);
	});
});

describe("chartKey", () => {
	test("is the key of the chart's first bar", () => {
		expect(chartKey("key: G\n| G | C |")).toEqual({ tonic: "G", mode: "major" });
		expect(chartKey("key: Bbm\n| Bbm |")).toEqual({ tonic: "Bb", mode: "minor" });
	});
	test("a pipe in a title or a text line before the bars doesn't hide the key", () => {
		expect(chartKey("# Song | live\nkey: A\n| A | D |")).toEqual({ tonic: "A", mode: "major" });
		expect(chartKey("Intro: guitar | bass\nkey: Eb\n| Eb |")).toEqual({
			tonic: "Eb",
			mode: "major",
		});
	});
	test("a labelled bar line is a bar line too", () => {
		const parts =
			"part: Gtr = Guitar\npart: Bs = Bass\nkey: F\n\nGtr | F | C |\nBs  | {F2} | {C2} |";
		expect(chartKey(parts)).toEqual({ tonic: "F", mode: "major" });
		expect(chartKey("part: Gtr = Guitar\nkey: Bm\nGtr | Bm |")).toEqual({
			tonic: "B",
			mode: "minor",
		});
	});
	test("a line that only looks like a bar line (an undeclared label) is passed over", () => {
		expect(chartKey("Bass | E | A |\nkey: G\n| G |")).toEqual({ tonic: "G", mode: "major" });
	});
	test("is null for a chart that names no key, or has no bars", () => {
		expect(chartKey("| D | A |")).toBeNull();
		expect(chartKey("key: D")).toBeNull();
		expect(chartKey("")).toBeNull();
	});
	test("reads only up to the first bar line, so a long chart costs no more than a short one", () => {
		const long = `key: E\n${"| E | A |\n".repeat(5000)}`;
		const start = performance.now();
		expect(chartKey(long)).toEqual({ tonic: "E", mode: "major" });
		expect(performance.now() - start).toBeLessThan(50);
	});
});

describe("keyLabel", () => {
	const g = { tonic: "G", mode: "major" };
	test("names the key the chart is shown in", () => {
		expect(keyLabel(g, 0)).toBe("G");
		expect(keyLabel(g, 2)).toBe("A");
		expect(keyLabel(g, -1)).toBe("F#");
		expect(keyLabel(g, 1)).toBe("Ab");
	});
	test("keeps the original's own spelling, and spells moved keys from the fixed list", () => {
		expect(keyLabel({ tonic: "A#", mode: "major" }, 0)).toBe("A#");
		expect(keyLabel({ tonic: "A#", mode: "major" }, 12)).toBe("A#");
		expect(keyLabel({ tonic: "Gb", mode: "major" }, 2)).toBe("Ab");
		expect(keyLabel({ tonic: "C#", mode: "minor" }, 0)).toBe("C#m");
		expect(keyLabel({ tonic: "C#", mode: "minor" }, 1)).toBe("Dm");
		expect(keyLabel({ tonic: "D", mode: "minor" }, 1)).toBe("Ebm");
	});
	test("with no key, says how far the chart moved", () => {
		expect(keyLabel(null, 0)).toBe("Original");
		expect(keyLabel(null, 3)).toBe("+3");
		expect(keyLabel(null, -2)).toBe("−2");
	});
});

describe("keyChoices", () => {
	test("lists the twelve keys from the chart's own, the original first, the current one checked", () => {
		const choices = keyChoices({ tonic: "G", mode: "major" }, 2);
		expect(choices.map((c) => c.label)).toEqual([
			"G (original)",
			"Ab",
			"A",
			"Bb",
			"B",
			"C",
			"Db",
			"D",
			"Eb",
			"E",
			"F",
			"F#",
		]);
		expect(choices.map((c) => c.semitones)).toEqual([0, 1, 2, 3, 4, 5, 6, -5, -4, -3, -2, -1]);
		expect(choices.filter((c) => c.checked).map((c) => c.label)).toEqual(["A"]);
	});
	test("with no key, lists the distances", () => {
		const choices = keyChoices(null, -3);
		expect(choices.map((c) => c.label)).toEqual([
			"Original",
			"Up 1",
			"Up 2",
			"Up 3",
			"Up 4",
			"Up 5",
			"Up 6",
			"Down 1",
			"Down 2",
			"Down 3",
			"Down 4",
			"Down 5",
		]);
		expect(choices.find((c) => c.checked)?.label).toBe("Down 3");
	});
});

describe("transposed", () => {
	test("is the source itself at 0, else barmark's transposition", () => {
		const text = "key: G\n| G | C |";
		expect(transposed(text, 0)).toBe(text);
		expect(transposed(text, 2)).toBe("key: A\n| A | D |\n");
	});
});
