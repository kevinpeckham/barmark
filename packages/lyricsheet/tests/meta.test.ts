import { describe, expect, test } from "bun:test";
import { directive } from "../src/export/meta.js";
import { exportLyricsheet } from "../src/index.js";

const text = (chart: string, title?: string) => {
	const r = exportLyricsheet(chart, title === undefined ? {} : { title });
	if (!r.ok) throw new Error(JSON.stringify(r.diagnostics));
	return r;
};
/** The header: the sheet up to the blank line before its first section. */
const header = (r: { text: string }) => r.text.slice(0, r.text.indexOf("\n\n") + 1);

describe("the header", () => {
	test("title, credits, key, time and tempo", () => {
		const r = text(
			"# Down by the River\ncomposer: A. Writer\nlyricist: B. Poet\narranger: C. Hand\ncopyright: 2026 Us\nkey: Bm, time: 6/8, tempo: 145\n\n| Bm | G |\n",
		);
		expect(header(r)).toBe(
			[
				"{title: Down by the River}",
				"{composer: A. Writer}",
				"{lyricist: B. Poet}",
				"{meta: arranger C. Hand}",
				"{copyright: 2026 Us}",
				"{key: Bm}",
				"{time: 6/8}",
				"{tempo: 145}",
				"",
			].join("\n"),
		);
		expect(r.losses).toEqual([]);
	});

	test("D major is {key: D}", () => {
		expect(text("key: D\n\n| D |\n").text).toContain("{key: D}\n");
	});

	test("no title: options.title, else an empty title", () => {
		expect(text("| C |\n", "Mine").text).toStartWith("{title: Mine}\n");
		expect(text("| C |\n").text).toStartWith("{title: }\n");
		expect(text("# Own\n\n| C |\n", "Mine").text).toStartWith("{title: Own}\n");
	});

	test("tag-like markup in a title or credit is written with parentheses, as one loss", () => {
		const r = text("# T <b>x</b>\ncomposer: A <i>B</i>\n\n| C |\n");
		expect(r.text).toStartWith("{title: T (b)x(/b)}\n{composer: A (i)B(/i)}\n");
		expect(r.losses.map((l) => l.code)).toEqual(["text-changed"]);
		expect(text("# a < b -> c\n\n| C |\n").text).toStartWith("{title: a ( b -) c}\n");
		for (const title of ["a < b", "<3", "->", "x>y", "&amp;"]) {
			const r = text(`# ${title}\n\n| C |\n`);
			expect(r.text).toStartWith(`{title: ${title}}\n`);
			expect(r.losses).toEqual([]);
		}
	});

	test("braces in a title, a credit or the title option are spaces, as one loss", () => {
		for (const [chart, title] of [
			["# My {Song}\n\n| C |\n", undefined],
			["# T\ncomposer: A {B}\n\n| C |\n", undefined],
			["| C |\n", "My {Song}"],
		] as [string, string | undefined][]) {
			const r = text(chart, title);
			expect(r.text).not.toMatch(/^\{\w+: [^\n]*[{}][^\n]*\}$/m);
			expect([chart, r.losses.map((l) => l.code)]).toEqual([chart, ["text-changed"]]);
		}
	});

	test("two composers are two lines", () => {
		const r = text("# T\ncomposer: A\ncomposer: B\n\n| C |\n");
		expect(r.text).toContain("{composer: A}\n{composer: B}\n");
	});

	test("a church mode leaves {key} out, as one loss", () => {
		const r = text("key: D dorian\n\n| D | G |\n");
		expect(r.text).not.toContain("{key");
		expect(r.losses.length).toBe(1);
		expect(r.losses[0]?.code).toBe("key-mode");
		expect(r.losses[0]?.bar).toBe(1);
	});

	// A sheet always has a title line: the reference takes the first line as the title when none is given.
	test("a title that cleans to nothing gives way to options.title, else an empty title", () => {
		expect(text("# {}\n\n| C |\n", "Mine").text).toStartWith("{title: Mine}\n");
		expect(text("# {}\n\n| C |\n").text).toStartWith("{title: }\n");
		expect(text("| C |\n", "{}").text).toStartWith("{title: }\n");
	});

	test("ionian is major and aeolian is minor, with no loss", () => {
		const a = text("key: C ionian\n\n| C |\n");
		expect(a.text).toContain("{key: C}\n");
		expect(a.losses).toEqual([]);
		const b = text("key: A aeolian\n\n| Am |\n");
		expect(b.text).toContain("{key: Am}\n");
		expect(b.losses).toEqual([]);
		expect(text("key: F# ionian\n\n| F# |\n").text).toContain("{key: F#}\n");
	});

	test("the loss names the mode of the bar it is reported for", () => {
		const r = text("key: D dorian\n\n| D |\n");
		expect(r.losses[0]?.message).toContain("dorian");
	});

	test("no time: writes the grammar's default, 4/4", () => {
		expect(header(text("| C |\n"))).toBe("{title: }\n{time: 4/4}\n");
	});

	test("no key: no {key}", () => {
		expect(text("| C |\n").text).not.toContain("{key");
	});

	test("the opening tempo and time are the first bar's", () => {
		const r = text("time: 3/4, tempo: 90\n\n| C | G |\n");
		expect(header(r)).toBe("{title: }\n{time: 3/4}\n{tempo: 90}\n");
	});
});

describe("directive", () => {
	test("a value cannot end or start a directive", () => {
		expect(directive("title", "a{b}c\nd\r\ne  f")).toBe("{title: a b c d e f}");
		expect(directive("title", "}{")).toBe("{title: }");
	});
	test("no tab or control character survives; a non-breaking space stays", () => {
		expect(directive("title", "a\tb\vc\0d\u0085e\u2028f\u2029g\u001fh")).toBe(
			"{title: a b c d e f g h}",
		);
		expect(directive("title", "a\u00a0b")).toBe("{title: a\u00a0b}");
		expect(directive("title", "\t x \t")).toBe("{title: x}");
	});
	test("no value", () => {
		expect(directive("end_of_verse")).toBe("{end_of_verse}");
	});
});
