import { describe, expect, test } from "bun:test";
import type { Syllable } from "barmark";
import { lyricLine, type Piece } from "../src/export/merge.js";

/** A chord attacking at `at` whole notes from the line's start. */
const ch = (at: number, chord: string): Piece => ({ at, chord });
/** A sung syllable; a trailing `-` continues the word, `~` joins elided syllables. */
function sy(at: number, text: string): Piece {
	const continues = text.endsWith("-");
	const parts = (continues ? text.slice(0, -1) : text).split("~");
	const syllable: Syllable = { kind: "sung", parts, continues };
	return { at, syllable };
}
const held = (at: number): Piece => ({ at, syllable: { kind: "held" } });

/** The moved chords' indexes, with the line. */
function moved(pieces: Piece[]): [string, number[]] {
	const seen: number[] = [];
	return [lyricLine(pieces, (i) => seen.push(i)), seen];
}

describe("lyricLine (spec 4.2)", () => {
	test("the spec's example", () => {
		// | G | C | G | D |  over  | Down / by the | riv- er | wait- ing | / |
		const line = lyricLine([
			ch(0, "G"),
			sy(0, "Down"),
			sy(0.5, "by"),
			sy(0.75, "the"),
			ch(1, "C"),
			sy(1, "riv-"),
			sy(1.5, "er"),
			ch(2, "G"),
			sy(2, "wait-"),
			sy(2.5, "ing"),
			ch(3, "D"),
		]);
		expect(line).toBe("[G]Down by the [C]river [G]waiting [D]");
	});

	test("a chord that attacks with a word's later syllable goes inside the word", () => {
		expect(lyricLine([ch(0, "G"), sy(0, "wait-"), ch(0.5, "D"), sy(0.5, "ing")])).toBe(
			"[G]wait[D]ing",
		);
	});

	test("a chord where no syllable starts stands alone between words, a space each side", () => {
		const line = lyricLine([sy(0, "waiting"), ch(0.5, "D"), sy(0.75, "for")]);
		expect(line).toBe("waiting [D] for");
	});

	test("a chord before the line's first word stands alone, a space after it", () => {
		expect(lyricLine([ch(0, "D"), sy(0.5, "Down")])).toBe("[D] Down");
	});

	test("a chord after the line's last word stands alone, with no trailing space", () => {
		expect(lyricLine([ch(0, "G"), sy(0, "home"), ch(0.5, "C")])).toBe("[G]home [C]");
	});

	test("a bar with no words between sung bars: single spaces", () => {
		const line = lyricLine([
			ch(0, "G"),
			sy(0, "go"),
			ch(1, "G"),
			ch(1.5, "C"),
			ch(2, "D"),
			sy(2, "now"),
		]);
		expect(line).toBe("[G]go [G] [C] [D]now");
	});

	test("a line of chords only", () => {
		expect(lyricLine([ch(0, "G"), ch(1, "C"), ch(2, "D")])).toBe("[G] [C] [D]");
	});

	test("on a tie the chord comes first, whatever the order given", () => {
		expect(lyricLine([sy(0, "Down"), ch(0, "G")])).toBe("[G]Down");
	});

	test("chords at one syllable all go before it, in the order given", () => {
		expect(lyricLine([ch(0, "*@B"), ch(0, "G"), sy(0, "Down")])).toBe("[*@B][G]Down");
	});

	test("a syllable that starts between two chords stays between them", () => {
		expect(lyricLine([ch(0, "G"), sy(0.25, "oh"), ch(0.5, "C")])).toBe("[G] oh [C]");
	});

	test("an elision is a space", () => {
		expect(lyricLine([ch(0, "G"), sy(0, "the~end")])).toBe("[G]the end");
	});

	test("a held syllable writes nothing", () => {
		expect(lyricLine([ch(0, "G"), sy(0, "oh"), held(0.5), sy(0.75, "my")])).toBe("[G]oh my");
	});

	test("a chord over a held syllable between words stands alone", () => {
		expect(lyricLine([sy(0, "oh"), held(0.5), ch(0.5, "C"), sy(0.75, "my")])).toBe("oh [C] my");
	});

	/**
	 * A design call the spec leaves open: a chord that attacks between two
	 * syllables of one word (over a held syllable, or a hold in the row)
	 * cannot stand alone without splitting the word, so it is written
	 * before the word's next syllable, and the caller is told (one
	 * `chord-moved` loss).
	 */
	test("a chord between two syllables of one word moves to the word's next syllable", () => {
		const pieces = [ch(0, "G"), sy(0, "wait-"), held(0.5), ch(0.5, "D"), sy(0.75, "ing")];
		expect(moved(pieces)).toEqual(["[G]wait[D]ing", [3]]);
	});

	test("a word that runs on past the line's end keeps its hyphen", () => {
		expect(lyricLine([ch(0, "G"), sy(0, "wait-")])).toBe("[G]wait-");
	});

	test("a chord after a word that runs on past the line stands alone and is not moved", () => {
		expect(moved([sy(0, "wait-"), ch(0.5, "D")])).toEqual(["wait- [D]", []]);
	});

	test("times equal within 1e-9 are a tie", () => {
		expect(lyricLine([ch(0, "G"), sy(1 / 3, "a"), ch(1 / 6 + 1 / 6, "C"), sy(2 / 3, "b")])).toBe(
			"[G] [C]a b",
		);
	});

	test("a piece marked alone (a fermata after its bar) never claims the syllable at its time", () => {
		const fermata: Piece = { at: 1, chord: "*…", alone: true };
		expect(lyricLine([ch(0, "G"), sy(0, "go"), fermata, ch(1, "C"), sy(1, "now")])).toBe(
			"[G]go [*…] [C]now",
		);
	});

	test("an empty line is empty", () => {
		expect(lyricLine([])).toBe("");
	});
});
