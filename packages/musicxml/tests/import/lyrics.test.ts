import { expect, test } from "bun:test";
import { Losses } from "../../src/import/losses.js";
import { importLyrics, lyricLines, verseText } from "../../src/import/lyrics.js";
import { attributes, measure, measuresOf, note, partOf, xml } from "./helpers.js";

const base = attributes(
	"<divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time>",
);
const lyric = (text: string, syllabic = "single", verse = 1) =>
	`<lyric number="${verse}"><syllabic>${syllabic}</syllabic><text>${text}</text></lyric>`;
const sung = (extra: string) => note("C", 4, 1, extra);
const bar = (n: number, ...notes: string[]) => measure(n, (n === 1 ? base : "") + notes.join(""));

test("syllables join into words", () => {
	const ms = measuresOf(
		xml`${bar(1, sung(lyric("hap", "begin")), sung(lyric("py", "end")), sung(lyric("birth", "begin")), sung(lyric("day", "end")))}`,
	);
	expect(verseText(lyricLines(ms, 0))).toEqual(["happy birthday"]);
});

test("two verses get numbers", () => {
	const ms = measuresOf(
		xml`${bar(1, sung(lyric("happy", "single", 1) + lyric("merry", "single", 2)), sung(lyric("birthday", "single", 1) + lyric("christmas", "single", 2)))}`,
	);
	expect(verseText(lyricLines(ms, 0))).toEqual(["1. happy birthday", "2. merry christmas"]);
});

test("one verse has no number", () => {
	const ms = measuresOf(xml`${bar(1, sung(lyric("la", "single", 2)))}`);
	expect(verseText(lyricLines(ms, 0))).toEqual(["la"]);
});

test("an elision joins with a space", () => {
	const ms = measuresOf(
		xml`${bar(1, sung("<lyric><text>a</text><elision>_</elision><text>b</text></lyric>"))}`,
	);
	expect(verseText(lyricLines(ms, 0))).toEqual(["a b"]);
});

test("a word split across the system's end stays whole in the system where it starts", () => {
	const ms = measuresOf(
		xml`${bar(1, sung(lyric("one", "single")), sung(lyric("hap", "begin")))}${bar(2, sung(lyric("py", "end")), sung(lyric("day", "single")))}`,
	);
	const [first, second] = [ms[0], ms[1]];
	if (!first || !second) throw new Error("measures");
	expect(verseText(lyricLines([first], 0, [second]))).toEqual(["one happy"]);
	expect(verseText(lyricLines([second], 0))).toEqual(["day"]);
});

test("a word in the middle of three syllables runs across systems", () => {
	const ms = measuresOf(
		xml`${bar(1, sung(lyric("won", "begin")))}${bar(2, sung(lyric("der", "middle")))}${bar(3, sung(lyric("ful", "end")), sung(lyric("day", "single")))}`,
	);
	const [a, b, c] = ms;
	if (!a || !b || !c) throw new Error("measures");
	expect(verseText(lyricLines([a], 0, [b, c]))).toEqual(["wonderful"]);
	expect(verseText(lyricLines([b], 0, [c]))).toEqual([]);
	expect(verseText(lyricLines([c], 0))).toEqual(["day"]);
});

test("lyrics from the first part that has them; the others named once", () => {
	const quiet = partOf(xml`${bar(1, note("C", 4, 4))}`);
	const sop = { ...partOf(xml`${bar(1, sung(lyric("la")))}`), name: "Soprano" };
	const alto = { ...sop, name: "Alto" };
	const losses = new Losses();
	expect(importLyrics([quiet, sop, alto], losses)).toEqual({ part: 1, line: 0 });
	expect(losses.list().map((d) => [d.part, d.message])).toEqual([
		["Soprano", "lyrics written as text lines; their placement by beat isn't kept"],
		["Alto", "lyrics in Alto left out; only Soprano's are kept"],
	]);
});

test("the placement diagnostic is given once", () => {
	const part = partOf(xml`${bar(1, sung(lyric("la")))}${bar(2, sung(lyric("la")))}`);
	const losses = new Losses();
	importLyrics([part], losses);
	expect(losses.list()).toHaveLength(1);
	expect(losses.list()[0]?.message).toBe(
		"lyrics written as text lines; their placement by beat isn't kept",
	);
	const none = new Losses();
	expect(importLyrics([quietPart()], none)).toBeNull();
	expect(none.list()).toEqual([]);
});

const quietPart = () => partOf(xml`${bar(1, note("C", 4, 4))}`);
