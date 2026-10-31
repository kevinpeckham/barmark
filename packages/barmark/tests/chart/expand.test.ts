import { describe, expect, test } from "bun:test";
import { MAX_EXPANDED_BARS } from "../../src/chart/expand.js";
import { play } from "./fixtures.js";

const errors = (text: string) => play(text).diagnostics.filter((d) => d.severity === "error");

describe("replays", () => {
	const r = play("## V\n| D | A |\n## C\n| G |\n## V");
	test("an empty section replays the most recent one with its name", () => {
		expect(r.texts).toEqual(["D", "A", "G", "D", "A"]);
	});
	test("occurrences record where they came from", () => {
		expect(r.sections.map((s) => [s.name, s.line, s.replayOf, s.firstBar, s.lastBar])).toEqual([
			["V", 1, null, 1, 2],
			["C", 3, null, 3, 3],
			["V", 5, 1, 4, 5],
		]);
	});
	test("bars are numbered in play order and carry their section", () => {
		expect(r.bars.map((b) => b.index)).toEqual([1, 2, 3, 4, 5]);
		expect(r.bars.map((b) => b.section)).toEqual(["V", "V", "C", "V", "V"]);
	});
	test("names match case-insensitively with whitespace collapsed", () => {
		expect(play("## Verse  One\n| D |\n## verse one").texts).toEqual(["D", "D"]);
	});
	test("the most recent definition wins", () => {
		expect(play("## V\n| D |\n## V\n| E |\n## V").texts).toEqual(["D", "E", "E"]);
	});
	test("a replay that matches nothing is an error", () => {
		const e = errors("## Verse\n| D |\n## Verse 2");
		expect(e.map((d) => d.line)).toEqual([3]);
	});
	test("lyrics alone still replay", () => {
		expect(play("## V\n| D |\n## V\nsecond verse words").texts).toEqual(["D", "D"]);
	});
});

describe("repeats", () => {
	test("a line repeat", () => expect(play("| D | A | x2").texts).toEqual(["D", "A", "D", "A"]));
	test("a section repeat", () => expect(play("## C x2\n| G |").texts).toEqual(["G", "G"]));
	test("a replay repeat", () =>
		expect(play("## C\n| G |\n## C x2").texts).toEqual(["G", "G", "G"]));
	test("brackets across lines", () => {
		expect(play("|: D |\n| A :| x3").texts).toEqual(["D", "A", "D", "A", "D", "A"]);
	});
	test("brackets default to two passes", () => {
		expect(play("| E |\n|: D | A :|").texts).toEqual(["E", "D", "A", "D", "A"]);
	});
	test("an unpaired close is an error and plays once", () => {
		const r = play("| A :|");
		expect(r.texts).toEqual(["A"]);
		expect(errors("| A :|")).toHaveLength(1);
	});
	test("an unclosed open is an error and plays once", () => {
		expect(play("|: D |\n## B\n| E |").texts).toEqual(["D", "E"]);
		expect(errors("|: D |\n## B\n| E |").map((d) => d.line)).toEqual([1]);
	});
	test("a line repeat inside brackets", () => {
		expect(play("|: D | x2\n| A :|").texts).toEqual(["D", "D", "A", "D", "D", "A"]);
	});
});

describe("directives", () => {
	test("a change takes effect at the next bar", () => {
		const r = play("time: 4/4\n| D |\ntime: 2/4\n| G |");
		expect(r.bars.map((b) => b.meter)).toEqual([
			{ n: 4, d: 4 },
			{ n: 2, d: 4 },
		]);
	});
	test("a one-bar meter applies to that bar only", () => {
		expect(play("| D | [2/4] A | G |").bars.map((b) => b.meter.n)).toEqual([4, 2, 4]);
	});
	test("defaults", () => {
		const b = play("| D |").bars[0];
		expect([b?.meter, b?.key, b?.tempo, b?.feel]).toEqual([{ n: 4, d: 4 }, null, null, "straight"]);
	});
	test("a directive under a replay heading takes effect after the replay", () => {
		// The heading stands for its bars, so the directive comes after them.
		const r = play("key: D\n## C\n| G |\n## C\nkey: E\n## Outro\n| E |");
		expect(r.bars.map((b) => b.key?.tonic)).toEqual(["D", "D", "E"]);
	});
	test("a key change before a replay heading changes the replay", () => {
		const r = play("key: D\n## C\n| G |\n## B\n| A |\nkey: E\n## C");
		expect(r.bars.map((b) => b.key?.tonic)).toEqual(["D", "D", "E"]);
	});
	test("a replay after the change keeps the new key, and an elided replay too", () => {
		const r = play("key: D\n## C\n| G | A |\n## C ->\ntempo: 90\n## O\n| E |");
		expect(r.bars.map((b) => b.tempo)).toEqual([null, null, null, 90]);
	});
	test("directives inside a repeated section replay with it", () => {
		const r = play("## A x2\n| D |\nkey: E\n| G |");
		expect(r.bars.map((b) => b.key?.tonic ?? "-")).toEqual(["-", "E", "E", "E"]);
	});
});

describe("simile", () => {
	test("% copies the previous bar's slots", () => {
		expect(play("| C G | % |").texts).toEqual(["C G", "C G"]);
	});
	test("% resolves where its section is written", () => {
		expect(play("## A\n| D |\n## B\n| % |\n## C\n| E |\n## B").texts).toEqual(["D", "D", "E", "D"]);
	});
	test("% or a leading / with nothing before is an error", () => {
		expect(errors("| % |")).toHaveLength(1);
		expect(errors("| / |")).toHaveLength(1);
	});
});

describe("elision", () => {
	const r = play("## C\n| G | D |\n## C ->\n## O\n| A |");
	test("cuts the replay's last bar", () => expect(r.texts).toEqual(["G", "D", "G", "A"]));
	test("is recorded on the occurrence", () =>
		expect(r.sections.map((s) => s.elided)).toEqual([false, true, false]));
	test("with x2, only the last pass is cut", () => {
		expect(play("## C\n| G | D |\n## C x2 ->").texts).toEqual(["G", "D", "G", "D", "G"]);
	});
	test("-> on a written-out section is an error", () => {
		expect(errors("## C ->\n| G |")).toHaveLength(1);
	});
});

describe("the expansion cap", () => {
	test("a runaway repeat stops at the cap with one error", () => {
		const start = performance.now();
		const r = play("## A x 99999\n| D | x 99999");
		expect(performance.now() - start).toBeLessThan(1000);
		expect(r.bars).toHaveLength(MAX_EXPANDED_BARS);
		expect(r.diagnostics.filter((d) => d.severity === "error")).toHaveLength(1);
	});
});
