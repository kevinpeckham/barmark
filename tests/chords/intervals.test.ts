import { describe, expect, test } from "bun:test";
import {
	formatInterval,
	intervalBetween,
	intervalKey,
	parseInterval,
	transpose,
} from "../../src/chords/intervals.js";

const iv = (s: string) => {
	const i = parseInterval(s);
	if (!i) throw new Error(`bad interval ${s}`);
	return i;
};

describe("parseInterval", () => {
	test("reads degree and alteration", () => {
		expect(parseInterval("b3")).toEqual({ degree: 3, alter: -1 });
		expect(parseInterval("#11")).toEqual({ degree: 11, alter: 1 });
		expect(parseInterval("bb7")).toEqual({ degree: 7, alter: -2 });
	});
	test("rejects non-intervals", () => {
		expect(parseInterval("x")).toBeNull();
	});
	test("round-trips through formatInterval", () => {
		for (const s of ["1", "b3", "3", "#5", "bb7", "b9", "#11", "13"]) {
			expect(formatInterval(iv(s))).toBe(s);
		}
	});
});

describe("transpose", () => {
	test("spells from the root's letter", () => {
		expect(transpose("C", iv("b3"))).toBe("Eb");
		expect(transpose("Bb", iv("b3"))).toBe("Db");
		expect(transpose("F#", iv("3"))).toBe("A#");
		expect(transpose("D", iv("9"))).toBe("E");
	});
	test("keeps deep accidentals instead of respelling", () => {
		expect(transpose("Cb", iv("bb7"))).toBe("Bbbb");
		expect(transpose("B#", iv("#5"))).toBe("F###");
	});
});

describe("intervalKey", () => {
	test("2 and 9 are the same spelled pitch class", () => {
		expect(intervalKey(iv("9"))).toBe(intervalKey(iv("2")));
	});
	test("b3 and #9 are different spellings", () => {
		expect(intervalKey(iv("b3"))).not.toBe(intervalKey(iv("#9")));
	});
});

describe("intervalBetween", () => {
	test("measures a spelled interval", () => {
		expect(intervalBetween("C", "F#")).toEqual({ degree: 4, alter: 1 });
	});
});
