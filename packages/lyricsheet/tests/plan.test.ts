import { describe, expect, test } from "bun:test";
import { parseChart } from "barmark";
import { type Occurrence, occurrences } from "../src/export/plan.js";

function plan(chart: string): Occurrence[] {
	const parse = parseChart(chart);
	const errors = parse.diagnostics.filter((d) => d.severity === "error");
	if (errors.length) throw new Error(JSON.stringify(errors));
	return occurrences(parse);
}

/** What a test reads of an occurrence: its name, its bars' written numbers, and the flags. */
const brief = (o: Occurrence) => ({
	name: o.name,
	written: o.bars.map((b) => b.written),
	sung: o.sung,
	replay: o.replay,
	verse: o.verse,
});

/** The words each bar of an occurrence sings, by verse. */
const words = (o: Occurrence) =>
	o.bars.map((b) =>
		(b.lyrics ?? []).map(
			(l) =>
				`${l.verse}:${l.syllables.map((s) => (s.syllable.kind === "sung" ? s.syllable.parts.join("~") : "/")).join(" ")}`,
		),
	);

describe("occurrences", () => {
	test("a repeat whose passes sing verses 1 and 2 is two occurrences", () => {
		const o = plan("## Verse\n|: C | G :|\nlyrics 1: | one | two |\nlyrics 2: | three | four |\n");
		expect(o.map(brief)).toEqual([
			{ name: "Verse", written: [1, 2], sung: true, replay: false, verse: 1 },
			{ name: "Verse", written: [1, 2], sung: true, replay: false, verse: 2 },
		]);
	});

	test("bars before the first heading are one unnamed occurrence", () => {
		const o = plan("| C | G |\nlyrics: | la | la |\n## Verse\n| F |\nlyrics: | lo |\n");
		expect(o.map(brief)).toEqual([
			{ name: null, written: [1, 2], sung: true, replay: false, verse: 1 },
			{ name: "Verse", written: [3], sung: true, replay: false, verse: 1 },
		]);
	});

	test("a replayed chorus is a replay", () => {
		const o = plan(
			"## Chorus\n| C | G |\nlyrics: | la | la |\n## Verse\n| Am |\nlyrics: | lo |\n## Chorus\n",
		);
		expect(o.map((x) => [x.name, x.replay])).toEqual([
			["Chorus", false],
			["Verse", false],
			["Chorus", true],
		]);
	});

	test("a D.S. return is unfolded as played", () => {
		const o = plan(
			"## Verse\n| Segno | C | G | To Coda | F |\nlyrics: | one | two | three |\n| Am | D.S. al Coda |\n## Coda\n| Coda | G | C |\nlyrics: | end | now |\n",
		);
		expect(o.map(brief)).toEqual([
			{ name: "Verse", written: [1, 2, 3, 4], sung: true, replay: false, verse: 1 },
			{ name: "Verse", written: [1, 2], sung: true, replay: true, verse: 1 },
			{ name: "Coda", written: [5, 6], sung: true, replay: false, verse: 1 },
		]);
	});

	test("a -> cut plays the replay short", () => {
		const o = plan(
			"## Chorus\n| C | G | F | G |\nlyrics: | a | b | c | d |\n## Chorus ->\n## Outro\n| C |\n",
		);
		expect(o.map((x) => x.bars.map((b) => b.written))).toEqual([[1, 2, 3, 4], [1, 2, 3], [5]]);
		expect(o.map((x) => x.sung)).toEqual([true, true, false]);
	});

	test("a section with words only on its second pass sings only there", () => {
		const o = plan("## Verse\n|: C | G :|\nlyrics 2: | one | two |\n");
		expect(o.map(brief)).toEqual([
			{ name: "Verse", written: [1, 2], sung: false, replay: false, verse: null },
			{ name: "Verse", written: [1, 2], sung: true, replay: false, verse: 2 },
		]);
	});

	test("stacked verses on bars that play once are one occurrence per verse", () => {
		const o = plan(
			"## Verse\n| C | G |\nlyrics 1: | one | two |\nlyrics 2: | three | four |\n| F |\nlyrics 1: | five |\n",
		);
		expect(o.map(brief)).toEqual([
			{ name: "Verse", written: [1, 2, 3], sung: true, replay: false, verse: 1 },
			{ name: "Verse", written: [1, 2, 3], sung: true, replay: false, verse: 2 },
		]);
		expect(o.map((x) => x.stacked)).toEqual([true, true]);
		expect(o.map(words)).toEqual([
			[["1:one"], ["1:two"], ["1:five"]],
			[["2:three"], ["2:four"], []],
		]);
	});

	test("a repeat that sings the same words again is one occurrence, its bars in played order", () => {
		const o = plan(
			"## Chorus\n| G | D |\nlyrics: | Two | run |\n| A | D | x2\nlyrics: | to | home |\n",
		);
		expect(o.map(brief)).toEqual([
			{ name: "Chorus", written: [1, 2, 3, 4, 3, 4], sung: true, replay: false, verse: 1 },
		]);
	});

	test("x3 with one row is one occurrence", () => {
		const o = plan("## Verse\n| C | G | x3\nlyrics: | la | lo |\n");
		expect(o.map((x) => x.bars.map((b) => b.written))).toEqual([[1, 2, 1, 2, 1, 2]]);
	});

	test("an inner repeat of the same words does not split its section", () => {
		const o = plan(
			"## Verse\n| C |\nlyrics: | a |\n|: G | D :|\nlyrics: | b | c |\n| F |\nlyrics: | d |\n",
		);
		expect(o.map((x) => x.bars.map((b) => b.written))).toEqual([[1, 2, 3, 2, 3, 4]]);
	});

	test("a section with a verse-changing repeat and an inner same-words repeat", () => {
		const o = plan(
			"## Verse x2\n| C | G |\nlyrics 1: | a | b |\nlyrics 2: | c | d |\n|: F | E :|\nlyrics: | e | f |\n",
		);
		expect(o.map((x) => [x.verse, x.bars.map((b) => b.written)])).toEqual([
			[1, [1, 2, 3, 4, 3, 4]],
			[null, [1, 2, 3, 4, 3, 4]],
		]);
	});

	test("an occurrence knows its written section and its heading's line", () => {
		const o = plan("## Chorus\n| C |\nlyrics: | a |\n## chorus\n");
		expect(o.map((x) => [x.form, x.heading])).toEqual([
			[0, 1],
			[0, 4],
		]);
		expect(plan("| C |\nlyrics: | a |\n").map((x) => [x.form, x.heading])).toEqual([[null, null]]);
	});

	test("a section with no words is not sung", () => {
		const o = plan("## Intro\n| C | G |\n");
		expect(o.map(brief)).toEqual([
			{ name: "Intro", written: [1, 2], sung: false, replay: false, verse: null },
		]);
	});

	test("a section that sings in some bars and not others is one sung occurrence", () => {
		const o = plan("## Verse\n| C | G |\nlyrics: | la | la |\n| F | C |\n");
		expect(o.map(brief)).toEqual([
			{ name: "Verse", written: [1, 2, 3, 4], sung: true, replay: false, verse: 1 },
		]);
	});
});
