import { describe, expect, test } from "bun:test";
import { directive } from "../src/export/meta.js";
import { exportLyricsheet } from "../src/index.js";

const text = (chart: string, title?: string) => {
	const r = exportLyricsheet(chart, title === undefined ? {} : { title });
	if (!r.ok) throw new Error(JSON.stringify(r.diagnostics));
	return r;
};

describe("the header", () => {
	test("title, credits, key, time and tempo", () => {
		const r = text(
			"# Down by the River\ncomposer: A. Writer\nlyricist: B. Poet\narranger: C. Hand\ncopyright: 2026 Us\nkey: Bm, time: 6/8, tempo: 145\n\n| Bm | G |\n",
		);
		expect(r.text).toBe(
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

	test("no title: options.title, else none", () => {
		expect(text("| C |\n", "Mine").text).toStartWith("{title: Mine}\n");
		expect(text("| C |\n").text).not.toContain("{title");
		expect(text("# Own\n\n| C |\n", "Mine").text).toStartWith("{title: Own}\n");
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

	test("a title that cleans to nothing is no title", () => {
		expect(text("# {}\n\n| C |\n", "Mine").text).toStartWith("{title: Mine}\n");
		expect(text("# {}\n\n| C |\n").text).not.toContain("{title");
		expect(text("| C |\n", "{}").text).not.toContain("{title");
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
		expect(text("| C |\n").text).toBe("{time: 4/4}\n");
	});

	test("no key: no {key}", () => {
		expect(text("| C |\n").text).not.toContain("{key");
	});

	test("the opening tempo and time are the first bar's", () => {
		const r = text("time: 3/4, tempo: 90\n\n| C | G |\n");
		expect(r.text).toBe("{time: 3/4}\n{tempo: 90}\n");
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
