import { describe, expect, test } from "bun:test";
import { shapeFor } from "@barmark/fretboard";
import { parseChord } from "barmark";
import { defineLines } from "../src/export/defines.js";
import { Losses } from "../src/export/losses.js";
import { exportLyricsheet, type LyricsheetResult } from "../src/index.js";

const chordOf = (name: string) => {
	const c = parseChord(name);
	if (!c.ok) throw new Error(name);
	return c.value;
};

const sheet = (chart: string, diagrams = true) => {
	const r = exportLyricsheet(chart, diagrams ? { diagrams: "guitar" } : {});
	if (!r.ok) throw new Error(JSON.stringify(r.diagnostics));
	return r;
};
const defines = (r: Extract<LyricsheetResult, { ok: true }>) =>
	r.text.split("\n").filter((l) => l.startsWith("{define:"));
const codes = (r: Extract<LyricsheetResult, { ok: true }>) => r.losses.map((l) => l.code);

describe("a define for each chord the body writes", () => {
	test("an open shape is written with frets relative to base-fret", () => {
		expect(defines(sheet("# T\nkey: C\n\n| Am | C |")).slice(0, 1)).toEqual([
			"{define: Am base-fret 1 frets x 0 2 2 1 0}",
		]);
	});

	test("a shape up the neck moves base-fret and counts frets from it", () => {
		// Cm is x 3 5 5 4 3: a fifth fret does not fit a four-fret diagram from the first.
		expect(defines(sheet("# T\n| Cm |"))).toEqual(["{define: Cm base-fret 3 frets x 1 3 3 2 1}"]);
		expect(defines(sheet("# T\n| C#m |"))).toEqual(["{define: C#m base-fret 4 frets x 1 3 3 2 1}"]);
	});

	test("the name is the one the body writes", () => {
		const r = sheet("# T\n| Am7(b5) |\nlyrics: | la |");
		expect(r.text).toContain("[Am7b5]");
		expect(defines(r)).toEqual(["{define: Am7b5 base-fret 1 frets x 0 1 0 1 x}"]);
	});

	/** A define line read back: its base-fret and each string's fret as ChordPro counts it, and as the shape has it. */
	function readDefine(line: string | undefined, name: string): { base: number; drawn: string[] } {
		const m = /^\{define: \S+ base-fret (\d+) frets ([x\d ]+)\}$/.exec(line ?? "");
		if (!m) throw new Error(`${name}: ${line}`);
		return { base: Number(m[1]), drawn: (m[2] ?? "").split(" ") };
	}
	const absolute = ({ base, drawn }: { base: number; drawn: string[] }) =>
		drawn.map((f) => (f === "x" ? -1 : f === "0" ? 0 : Number(f) + base - 1));
	const tooHigh = (drawn: string[]) => drawn.filter((f) => f !== "x" && Number(f) > 4);

	test("every shape fits ChordPro's four-fret diagram, and says what fretboard says", () => {
		const roots = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
		const suffixes = ["", "m", "7", "m7", "maj7", "m7(b5)", "dim7", "9", "13", "sus4", "7(b9)"];
		let checked = 0;
		for (const name of roots.flatMap((r) => suffixes.map((s) => r + s))) {
			const shape = parseChord(name).ok ? shapeFor(chordOf(name)) : null;
			if (!shape?.ok) continue;
			const read = readDefine(defines(sheet(`# T\n| ${name} |`))[0], name);
			expect(read.drawn).toHaveLength(6);
			expect(absolute(read)).toEqual(shape.shape.frets);
			expect(tooHigh(read.drawn)).toEqual([]);
			checked++;
		}
		expect(checked).toBeGreaterThan(100);
	});

	test("one define for each distinct name, in the order the sheet first writes them, after the header and before the first section", () => {
		const r = sheet(
			"# T\nkey: C\n\n## Verse\n| G | C |\nlyrics: | la / | la / |\n\n## Out\n| C | Am | G |",
		);
		expect(defines(r).map((d) => d.split(" ")[1])).toEqual(["G", "C", "Am"]);
		const lines = r.text.split("\n");
		const first = lines.findIndex((l) => l.startsWith("{define:"));
		const section = lines.findIndex((l) => l.startsWith("{start_of_"));
		expect(lines.slice(0, first).at(-1)).toBe("");
		expect(lines[first - 2]?.startsWith("{")).toBe(true);
		expect(lines[section - 1]).toBe("");
		expect(lines[section - 2]).toBe(lines[first + 2]);
		expect(lines.slice(first, section - 1).every((l) => l.startsWith("{define:"))).toBe(true);
		expect(lines.indexOf("{key: C}")).toBeLessThan(first);
	});

	test("text lines before the first bar stay after the block, one blank line between", () => {
		const r = sheet("# T\n\nPlay softly.\n## A\n| C |\n");
		const lines = r.text.split("\n");
		const i = lines.findIndex((l) => l.startsWith("{define:"));
		expect(lines[i + 1]).toBe("");
		expect(lines[i + 2]).toBe("{comment: Play softly.}");
	});

	test("annotations, note sets and N.C. get no define", () => {
		const r = sheet("# T\n| N.C. {C E G} ? | -- {C4} C |");
		expect(defines(r)).toEqual(["{define: C base-fret 1 frets x 3 2 0 1 0}"]);
	});

	test("grid cells are defined too", () => {
		const r = sheet("# T\n## Intro\n| Am | Dm | E7 |");
		expect(defines(r).map((d) => d.split(" ")[1])).toEqual(["Am", "Dm", "E7"]);
	});

	test("without diagrams nothing is defined", () => {
		expect(sheet("# T\n| Am |", false).text).not.toContain("{define");
	});
});

describe("a chord ChordPro's parser rejects", () => {
	const chart = "# T\n| C(6) |";
	test("with diagrams it is defined, and is no longer a chord-names loss", () => {
		const r = sheet(chart);
		expect(defines(r)).toHaveLength(1);
		expect(codes(r)).not.toContain("chord-names");
	});
	test("without diagrams the loss stays", () => {
		expect(codes(sheet(chart, false))).toContain("chord-names");
	});
	test("with diagrams but no shape, it stays a loss, and is a no-shape one too", () => {
		const r = sheet("# T\n| C7(b9,#9,#11,b13) |");
		expect(shapeFor(chordOf("C7(b9,#9,#11,b13)")).ok).toBe(false);
		expect(defines(r)).toEqual([]);
		expect(codes(r)).toContain("chord-names");
		expect(codes(r)).toContain("no-shape");
	});
});

describe("a written voicing", () => {
	test("when every use writes the same voicing and it fits, its shape is the name's", () => {
		const r = sheet("# T\n| Cmaj7{E3 G3 B3} | Cmaj7{E3 G3 B3} |");
		expect(defines(r)).toEqual(["{define: Cmaj7 base-fret 1 frets x x 2 0 0 x}"]);
		expect(codes(r)).not.toContain("voicing");
	});
	test("two voicings, or one used and one not, give the name's own shape and one voicing loss", () => {
		for (const chart of [
			"# T\n| Cmaj7{E3 G3 B3} | Cmaj7{G3 B3 E4} |",
			"# T\n| Cmaj7{E3 G3 B3} | Cmaj7 |",
		]) {
			const r = sheet(chart);
			const own = shapeFor(chordOf("Cmaj7"));
			if (!own.ok) throw new Error("Cmaj7 has a shape");
			expect(defines(r)).toHaveLength(1);
			expect(defines(r)[0]).toBe(
				`{define: Cmaj7 base-fret 1 frets ${own.shape.frets.map((f) => (f < 0 ? "x" : f)).join(" ")}}`,
			);
			expect(r.losses.filter((l) => l.code === "voicing")).toHaveLength(1);
		}
	});
	test("without diagrams the voicing loss is as before", () => {
		expect(codes(sheet("# T\n| Cmaj7{E3 G3 B3} |", false))).toContain("voicing");
	});
});

describe("shapes that do not stand for the chord", () => {
	test("an altered chord is defined as its shell, with one shell-shape loss", () => {
		const r = sheet("# T\n| C7alt | G7alt |");
		expect(defines(r)).toHaveLength(2);
		const loss = r.losses.filter((l) => l.code === "shell-shape");
		expect(loss).toHaveLength(1);
		expect(loss[0]?.message).toContain("C7alt");
		expect(loss[0]?.message).toContain("G7alt");
	});
	test("a chord with no playable shape gets no define and one no-shape loss", () => {
		expect(shapeFor(chordOf("C13(b9)/Eb")).ok).toBe(false);
		const r = sheet("# T\n| C13(b9)/Eb | Am | C13(b9)/Eb |");
		const none = r.losses.filter((l) => l.code === "no-shape");
		expect(none).toHaveLength(1);
		expect(none[0]?.message.startsWith("no guitar shape: C13b9/Eb, so ")).toBe(true);
		expect(defines(r).map((d) => d.split(" ")[1])).toEqual(["Am"]);
	});
});

describe("defineLines", () => {
	test("is given the chords as used, and writes each name once", () => {
		const out = { lines: [], losses: new Losses() };
		const use = { chord: chordOf("Am"), voicing: null };
		expect(defineLines([use, use, use], out)).toEqual([
			"{define: Am base-fret 1 frets x 0 2 2 1 0}",
		]);
		expect(out.losses.list()).toEqual([]);
	});
});
