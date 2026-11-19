/**
 * What a reader does to a line before it reads it (ChordPro/Song.pm):
 * every line's `\uXXXX` and `\u{…}` escapes are unescaped first, a line
 * ends at CR as at LF, and `%{…}` is substituted in lyrics, grids and
 * directive values. No chart text may reach a reader as markup that way:
 * read with the tests' reader (which unescapes as the reference does), a
 * sheet holds no directive, chord or bar the chart did not play.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { exportLyricsheet, type LyricsheetOptions, type LyricsheetResult } from "../src/index.js";
import { FIXTURES } from "./fixtures.js";
import { type ChoLine, gridParts, readCho, unescaped } from "./read-cho.js";

const B = "\\";
const WJ = "\u2060";

/** The escape spellings the reference unescapes: `\u007b`, `\U007B`, `\u{7b}`, `\U{7B}`, and `\\u007b` (still unescaped). */
const SPELLINGS: [string, (code: string) => string][] = [
	["\\uXXXX", (h) => `${B}u${h.padStart(4, "0")}`],
	["\\UXXXX", (h) => `${B}U${h.padStart(4, "0").toUpperCase()}`],
	["\\u{…}", (h) => `${B}u{${h}}`],
	["\\U{…}", (h) => `${B}U{${h.toUpperCase()}}`],
	["\\\\uXXXX", (h) => `${B}${B}u${h.padStart(4, "0")}`],
];

/** `text` with every markup character written as an escape. */
const escaped = (text: string, spell: (code: string) => string) =>
	text.replace(/[{}[\]|#%]/g, (c) => spell(c.charCodeAt(0).toString(16)));

/** What an injection tries to write: a directive, a chord over a word, and a grid bar. */
const PAYLOADS = ["{title:Yours}", "la[F#]la", "| D . . . |"];

/** Each place chart text reaches the sheet, as a chart (and options) holding `p`. */
const PLACES: [string, (p: string) => [string, LyricsheetOptions?]][] = [
	[
		"a lyric syllable",
		(p) => [`# Mine\n| C | G |\nlyrics: | a | b |\n| / | / |\nlyrics: | ${p} | / |\n`],
	],
	["the title", (p) => [`# ${p}\n| C |\n`]],
	["the composer", (p) => [`# Mine\ncomposer: ${p}\n| C |\n`]],
	["the lyricist", (p) => [`# Mine\nlyricist: ${p}\n| C |\n`]],
	["the arranger", (p) => [`# Mine\narranger: ${p}\n| C |\n`]],
	["the copyright", (p) => [`# Mine\ncopyright: ${p}\n| C |\n`]],
	["a sung section's heading", (p) => [`# Mine\n## ${p}\n| C |\nlyrics: | la |\n`]],
	["a grid's heading", (p) => [`# Mine\n## ${p}\n| C |\n`]],
	["a rehearsal mark", (p) => [`# Mine\n| @${p} C | G |\n`]],
	["a margin word in a grid", (p) => [`# Mine\n| "${p}" C | G |\n`]],
	["a bar's words on a lyric line", (p) => [`# Mine\n| "${p}" C | G |\nlyrics: | la | la |\n`]],
	[
		"a text line in a sung section",
		(p) => [`# Mine\n| C |\nlyrics: | la |\n${p}\n| G |\nlyrics: | la |\n`],
	],
	["a text line in a grid", (p) => [`# Mine\n| C |\n${p}\n| G |\n`]],
	["a ### note", (p) => [`# Mine\n### ${p}\n| C |\n`]],
	["the title option", (p) => ["| C |\n", { title: p }]],
	["a part's label", (p) => [`# Mine\npart: ${p} = Guitar\n${p} | C |\n`]],
	["a part's name", (p) => [`# Mine\npart: Gtr = ${p}\nGtr | C |\n`]],
	["the part asked for", (p) => [`# Mine\npart: Gtr = Guitar\nGtr | C |\n`, { part: p }]],
];

/** The directives this package writes. */
const DIRECTIVES = new Set([
	...["title", "composer", "lyricist", "copyright", "meta", "key", "time", "tempo", "comment"],
	...["start_of_verse", "end_of_verse", "start_of_chorus", "end_of_chorus", "chorus"],
	...["start_of_bridge", "end_of_bridge", "start_of_grid", "end_of_grid", "define"],
]);

/** The directives a sheet holds that this package never writes, and its titles but one that is not `title`. */
function directiveProblems(lines: ChoLine[], title: string): string[] {
	const named = lines.flatMap((l) => (l.kind === "directive" ? [l] : []));
	const titles = named.filter((d) => d.name === "title").map((d) => d.value.replaceAll(WJ, ""));
	const wrong =
		titles.length === 1 && titles[0] === title ? [] : [`titles ${JSON.stringify(titles)}`];
	return [
		...wrong,
		...named.filter((d) => !DIRECTIVES.has(d.name)).map((d) => `the directive ${d.name}`),
	];
}

/** A chord the charts never play (only C and G), in a lyric line or a grid's measure. */
function strayChords(line: ChoLine): string[] {
	if (line.kind === "lyrics")
		return line.tokens.flatMap((t) =>
			"chord" in t && !t.chord.startsWith("*") && !["C", "G"].includes(t.chord)
				? [`the chord ${t.chord}`]
				: [],
		);
	if (line.kind !== "grid") return [];
	const bars = gridParts(line.cells).measures;
	return bars.some((m) => m.cells.includes("D")) ? [`the grid line ${line.cells.join(" ")}`] : [];
}

/** What is wrong with a sheet as a reader reads it: an injected directive, chord or bar, or an escape left in it. */
function injected(r: LyricsheetResult & { ok: true }, title: string): string[] {
	const lines = readCho(r.text);
	return [
		...(/\\u/i.test(r.text) ? ["an escape a reader unescapes"] : []),
		...(unescaped(r.text).includes("%{") ? ["a %{ a reader substitutes"] : []),
		...directiveProblems(lines, title),
		...lines.flatMap(strayChords),
	];
}

/** The title the sheet should have: the chart's, else the option's, as written in the chart (escapes and all). */
const titleOf = (place: string, p: string) =>
	place === "the title" || place === "the title option"
		? p.replace(/[{}]/g, " ").replace(/ {2,}/g, " ").trim()
		: "Mine";

describe("escapes a reader unescapes never reach it as markup", () => {
	for (const [place, make] of PLACES)
		for (const [spelling, spell] of SPELLINGS)
			test(`${place}, spelled ${spelling}`, () => {
				for (const payload of PAYLOADS) {
					const p = escaped(payload, spell);
					const [chart, options] = make(p);
					const r = exportLyricsheet(chart, options);
					if (!r.ok) continue; // refused: nothing is written
					expect([payload, injected(r, titleOf(place, p))]).toEqual([payload, []]);
				}
			});

	test("each line with an escape changed is a text-changed loss", () => {
		const r = exportLyricsheet(`# Mine\n| C |\nlyrics: | ${B}u007bla${B}u007d |\n`);
		expect(r.ok && r.losses.map((l) => l.code)).toContain("text-changed");
		expect(r.ok && r.text).toContain(`[C]${B}${WJ}u007bla${B}${WJ}u007d`);
	});

	test("a backslash before a u that is not an escape is changed too, and a lone backslash is not", () => {
		const r = exportLyricsheet(`# Mine\n| C |\nlyrics: | a${B}up b${B}x |\n`);
		expect(r.ok && r.text).toContain(`[C]a${B}${WJ}up b${B}x`);
	});

	test("a line ending in a backslash after the escape is still not joined", () => {
		const r = exportLyricsheet(`# Mine\n| C |\nlyrics: | ${B}u007b${B} |\n`);
		expect(r.ok && readCho(r.text).length).toBeGreaterThan(0);
		expect(r.ok && r.text).toContain(`[C]${B}${WJ}u007b/`);
	});

	test("the injection golden reads back with no directive, chord or bar it did not play", () => {
		const cho = readFileSync(join(FIXTURES, "injection.cho"), "utf8");
		const chart = readFileSync(join(FIXTURES, "injection.chart.md"), "utf8");
		const r = exportLyricsheet(chart);
		expect(r.ok && r.text).toBe(cho);
		if (r.ok) expect(injected(r, "Mine")).toEqual([]);
	});
});

describe("%{…} cannot reach a reader: no line but a directive's end holds a }", () => {
	for (const [place, make] of PLACES)
		test(place, () => {
			for (const p of ["%{title}", "%{title|x}", "%{}", "50%{x}y"]) {
				const [chart, options] = make(p);
				const r = exportLyricsheet(chart, options);
				if (!r.ok) continue;
				for (const line of r.text.slice(0, -1).split("\n")) {
					const body = line.startsWith("{") ? line.slice(1, -1) : line;
					expect([line, body.includes("}") || body.includes("{")]).toEqual([line, false]);
				}
			}
		});
});

/** Every control character but LF, and the characters some readers end a line at. */
const CONTROLS = [..."\0\x01\x07\b\v\f\r\x1b\x7f\x80\x85\x9f", "\u2028", "\u2029"];
const LINE_BREAKING = /[^\P{Cc}\n]|[\u2028\u2029]/u;

describe("control characters never reach a sheet", () => {
	const places: [string, (c: string) => string][] = [
		[
			"a bar's words on a lyric line",
			(c) => `# Mine\n| "a${c}#b" C | G |\nlyrics: | these words | vanish |\n`,
		],
		["a margin word in a grid", (c) => `# Mine\n| "a${c}#b" C | G |\n`],
		["a lyric syllable", (c) => `# Mine\n| C |\nlyrics: | a${c}b |\n`],
		["a text line", (c) => `# Mine\n| C |\nlyrics: | la |\nsay${c}#it\n`],
		["a heading", (c) => `# Mine\n## V${c}x\n| C |\nlyrics: | la |\n`],
		["the title", (c) => `# M${c}ine\n| C |\n`],
	];
	for (const [place, make] of places)
		test(place, () => {
			for (const c of CONTROLS) {
				const r = exportLyricsheet(make(c));
				if (!r.ok) continue;
				expect([JSON.stringify(c), LINE_BREAKING.test(r.text)]).toEqual([JSON.stringify(c), false]);
				expect(() => readCho(r.text)).not.toThrow();
			}
		});

	test("a carriage return in a bar's words is a space, the line's chords and words kept", () => {
		const r = exportLyricsheet(`# Mine\n| "a\r#b" C | G |\nlyrics: | these words | vanish |\n`);
		expect(r.ok && r.text).toContain("[*a #b][C]these words [G]vanish");
		expect(r.ok && r.losses.map((l) => l.code)).toContain("text-changed");
	});
});

/**
 * A noncharacter (U+FDD0, U+FFFE, U+FFFF and their kin) makes ChordPro's
 * strict UTF-8 decode fail, and it then reads the WHOLE sheet as Latin-1
 * (measured 2026-11-19: `Café` printed as `CafÃ©`).
 */
describe("noncharacters never reach a sheet", () => {
	const NONCHARACTERS = ["\ufdd0", "\ufdef", "\ufffe", "\uffff", "\u{1fffe}", "\u{10ffff}"];
	const places: [string, (c: string) => string][] = [
		["the title", (c) => `# Caf\u00e9${c}\n| C |\n`],
		["a lyric syllable", (c) => `# Mine\n| C |\nlyrics: | a${c}b |\n`],
		["a margin word in a grid", (c) => `# Mine\n| "a${c}b" C | G |\n`],
		["a text line", (c) => `# Mine\n| C |\nlyrics: | la |\nsay${c}it\n`],
	];
	for (const [place, make] of places)
		test(place, () => {
			for (const c of NONCHARACTERS) {
				const r = exportLyricsheet(make(c));
				if (!r.ok) throw new Error(`refused: U+${c.codePointAt(0)?.toString(16)}`);
				expect(r.text).not.toMatch(/\p{Noncharacter_Code_Point}/u);
				expect(r.losses.map((l) => l.code)).toContain("text-changed");
			}
		});
});

/** A seeded mutation of the fixture charts with hostile text: no sheet holds a control character, an escape or `%{`. */
describe("a fuzz of hostile text", () => {
	const seeds = readdirSync(FIXTURES)
		.filter((f) => f.endsWith(".chart.md"))
		.map((f) => readFileSync(join(FIXTURES, f), "utf8"));
	const bits = [
		...["\r", "\v", "\f", "\0", "\x85", "\u2028", "\u2029", "\t", B, `${B}u007b`, `${B}U007D`],
		...[`${B}u{5b}`, `${B}${B}u005d`, `${B}u007c`, "%{title}", "#", "{", "}", "[", "]", "|", '"w"'],
		...["lyrics: | la |", "## Chorus", "\n", " "],
	];
	test("1,500 charts, plain, with diagrams and with a part", () => {
		let seed = 20261119;
		const rnd = () => {
			seed = (seed * 1103515245 + 12345) & 0x7fffffff;
			return seed / 0x7fffffff;
		};
		const pick = <T>(a: T[]): T => a[Math.floor(rnd() * a.length)] as T;
		let written = 0;
		for (let i = 0; i < 500; i++) {
			let chart = pick(seeds);
			for (let e = 0; e < 1 + Math.floor(rnd() * 4); e++) {
				const at = Math.floor(rnd() * chart.length);
				chart = chart.slice(0, at) + pick(bits) + chart.slice(at);
			}
			for (const options of [{}, { diagrams: "guitar" }, { part: "Gtr" }] as LyricsheetOptions[]) {
				const r = exportLyricsheet(chart, options);
				if (!r.ok) continue;
				written++;
				const bad = [
					LINE_BREAKING.test(r.text),
					/\\u/i.test(r.text),
					unescaped(r.text).includes("%{"),
				];
				expect([JSON.stringify(chart), bad]).toEqual([
					JSON.stringify(chart),
					[false, false, false],
				]);
			}
		}
		expect(written).toBeGreaterThan(300);
	}, 60_000);
});
