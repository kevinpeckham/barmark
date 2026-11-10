import { describe, expect, test } from "bun:test";
import { parseBarLine } from "../../src/chart/barLine.js";
import type { Cell, SimpleSlot, Slot } from "../../src/chart/types.js";
import { parseChord } from "../../src/chords/parse.js";
import { parseChart, printChart, printLine, printSlot, transposeChart } from "../../src/index.js";

// Kevin's decision (2026-11-10): an unreadable slot keeps its bar as unknown
// harmony with the author's text, and is still an error; only a bar line
// whose structure can't be read is excluded.

const read = (text: string) => parseBarLine(text, 3);
const errors = (text: string) => read(text).diagnostics.filter((d) => d.severity === "error");
const warnings = (text: string) => read(text).diagnostics.filter((d) => d.severity === "warning");
const slots = (cell: Cell | undefined): Slot[] => (cell?.kind === "slots" ? cell.slots : []);
const firstSlot = (text: string): Slot | undefined => slots(read(text).bars?.cells[0])[0];

describe("an unreadable chord symbol keeps its bar", () => {
	const spellings = ["CM7", "CSus4", "C69", "C−7", "C2", "d", "H7", "Cbb"];
	for (const symbol of spellings)
		test(`${symbol} is unknown harmony with its text, and the same error as before`, () => {
			const r = read(`| ${symbol} | G |`);
			expect(r.bars).not.toBeNull();
			expect(r.bars?.cells).toHaveLength(2);
			expect(slots(r.bars?.cells[0])).toEqual([{ kind: "unknown", text: symbol }]);
			const chord = parseChord(symbol);
			if (chord.ok) throw new Error(`${symbol} reads`);
			const e = errors(`| ${symbol} | G |`);
			expect(e).toEqual([
				{
					line: 3,
					severity: "error",
					message: chord.error.message,
					token: symbol,
					...(chord.error.suggestion ? { suggestion: chord.error.suggestion } : {}),
				},
			]);
			expect(warnings(`| ${symbol} | G |`)).toEqual([]);
		});

	test("CM7 still says to write maj", () => {
		expect(errors("| CM7 |")[0]).toMatchObject({
			message: 'CM7: "M" is one shifted letter from "m"; write maj',
			suggestion: "Cmaj7",
		});
	});
	test("the other slots of its bar are kept as read", () => {
		const s = slots(read("| G CM7 / D |").bars?.cells[0]);
		expect(s.map((x) => x.kind)).toEqual(["chord", "unknown", "hold", "chord"]);
	});
	test("a line of nothing but unreadable slots keeps its bars", () => {
		const r = read("| CM7 | H7 | CSus4 |");
		expect(r.bars?.cells).toHaveLength(3);
		expect(errors("| CM7 | H7 | CSus4 |")).toHaveLength(3);
	});
	test("a written ? has no text and still warns", () => {
		expect(firstSlot("| ? |")).toEqual({ kind: "unknown" });
		expect(warnings("| ? |").map((w) => w.message)).toEqual(["unknown harmony"]);
	});
});

describe("a bad note set, voicing or syllable keeps its bar", () => {
	for (const token of ["{H}", "{}", "{C3 E}", "{C! E!}", "C{F}", "Cmaj7{E3 Q}"])
		test(`${token}`, () => {
			expect(firstSlot(`| ${token} | G |`)).toEqual({ kind: "unknown", text: token });
			expect(errors(`| ${token} | G |`)).toHaveLength(1);
		});
	test("a syllable on a chord name is the whole token, unread", () => {
		expect(firstSlot("| C:la |")).toEqual({ kind: "unknown", text: "C:la" });
		expect(errors("| C:la |")).toHaveLength(1);
	});
	test("an empty syllable", () => {
		expect(firstSlot("| {G4}: |")).toEqual({ kind: "unknown", text: "{G4}:" });
	});
	test("a lone - is unread, and still suggests --", () => {
		const s = slots(read("| G - |").bars?.cells[0]);
		expect(s[1]).toEqual({ kind: "unknown", text: "-" });
		expect(errors("| G - |")[0]?.suggestion).toBe("--");
	});
});

describe("an unreadable mark keeps its bar, one error per slot", () => {
	for (const token of ["<<<C", "^<D", ">/", "+?", "<?", "+--", ">C:la"])
		test(`${token}`, () => {
			expect(firstSlot(`| ${token} | G |`)).toEqual({ kind: "unknown", text: token });
			expect(errors(`| ${token} | G |`)).toHaveLength(1);
			expect(warnings(`| ${token} | G |`)).toEqual([]);
		});
	test("good marks on an unreadable chord: the chord's error alone, the marks in the text", () => {
		expect(firstSlot("| +>CM7 |")).toEqual({ kind: "unknown", text: "+>CM7" });
		expect(errors("| +>CM7 |").map((e) => e.token)).toEqual(["CM7"]);
	});
});

describe("in a group, only the unreadable member is unknown", () => {
	test("C_CM7", () => {
		const g = firstSlot("| C_CM7 |");
		expect(g?.kind).toBe("group");
		if (g?.kind === "group")
			expect(g.members.map((m) => m.kind === "unknown" && m.text)).toEqual([false, "CM7"]);
	});
	test("a dotted member keeps its rhythm, not its dot", () => {
		const g = firstSlot("| CM7._D |");
		expect(g?.kind === "group" && g.members[0]).toEqual({
			kind: "unknown",
			text: "CM7",
			dotted: true,
		});
	});
});

describe("a misplaced or bad dot is the slot's error (Kevin, 2026-11-10)", () => {
	for (const token of ["C.", "C._D._E", "C._D.", "{C4}.:la"])
		test(token, () => {
			const r = read(`| ${token} | G |`);
			expect(r.bars?.cells).toHaveLength(2);
			expect(firstSlot(`| ${token} | G |`)).toEqual({ kind: "unknown", text: token });
			const e = errors(`| ${token} | G |`);
			expect(e).toHaveLength(1);
			expect(e[0]?.message).toContain("a dot goes on one member of a two-member group");
		});
});

describe("broken bar structure still excludes the line", () => {
	const broken = [
		"| C :| D |",
		"| C | D |: E |",
		"| CM7 | D :| E |",
		"| C_ |",
		"|1x G | D :|",
		"| G | D | x1",
		"| @A G |",
		"| G x2 |",
		"| G % |",
		"| G ... |",
		"| [4/3] G |",
		'| "unclosed G |',
		"| | G |",
		"|",
		"| G D.C. |",
	];
	for (const line of broken)
		test(line, () => {
			expect(read(line).bars).toBeNull();
			expect(errors(line).length).toBeGreaterThan(0);
		});
});

describe("the printer keeps the author's text", () => {
	test("printSlot prints the text verbatim", () => {
		expect(printSlot({ kind: "unknown", text: "CM7" })).toBe("CM7");
		expect(printSlot({ kind: "unknown" })).toBe("?");
	});
	test("a dotted unreadable member prints its dot where it was written", () => {
		const unread: SimpleSlot = { kind: "unknown", text: "CM7", dotted: true };
		expect(printSlot({ kind: "group", members: [unread, { kind: "hold" }] })).toBe("CM7._/");
		const sung: SimpleSlot = { kind: "unknown", text: "{H}:la", dotted: true };
		expect(printSlot(sung)).toBe("{H}.:la");
	});
	test("printLine keeps CM7, never ?", () => {
		const bars = read("| C | CM7 G |").bars;
		if (!bars) throw new Error("dropped");
		expect(printLine(bars)).toBe("| C | CM7 G |");
	});
	test("format prints a line with an unreadable slot canonically, the text verbatim", () => {
		const chart = "time: 4/4\n|  C |   CM7  |\n|  G  / +>CSus4 / |\n";
		expect(printChart(chart)).toBe("time: 4/4\n| C | CM7 |\n| G +>CSus4 |\n");
	});
	test("a line excluded for its structure still prints as written", () => {
		const chart = "|  C :|   CM7  |\n|  G  |\n";
		expect(printChart(chart)).toBe("|  C :|   CM7  |\n| G |\n");
	});
	test("a line with another error beside its unreadable slot prints as written", () => {
		const chart = "| / CM7 |\n";
		expect(printChart(chart)).toBe(chart);
	});
});

describe("transpose moves the readable chords and leaves the text (Kevin, 2026-11-10)", () => {
	test("C to D: | D | CM7 | A |, with a warning on CM7", () => {
		const r = transposeChart("key: C\n| C | CM7 | G |\n", { to: "D" });
		expect(r.text).toBe("key: D\n| D | CM7 | A |\n");
		expect(r.diagnostics).toEqual([
			{
				line: 2,
				severity: "warning",
				message: "CM7 can't move: it can't be read, so it stays as written",
				token: "CM7",
			},
		]);
	});
	test("an unreadable group member and note set stay; their neighbours move", () => {
		const r = transposeChart("| C_CM7 {H} {E4} |\n", { semitones: 2 });
		expect(r.text).toBe("| D_CM7 {H} {F#4} |\n");
		expect(r.diagnostics.map((d) => d.token)).toEqual(["CM7", "{H}"]);
	});
	test("a line excluded for its structure stays as written", () => {
		const r = transposeChart("key: C\n| C :| CM7 |\n| G |\n", { semitones: 2 });
		expect(r.text).toBe("key: D\n| C :| CM7 |\n| A |\n");
		expect(r.diagnostics.map((d) => d.message)).toEqual(["not transposed: this line has an error"]);
	});
});

describe("a chart plays every bar it writes", () => {
	const unread = "time: 4/4\n| C | CM7 | G | D |\n| Em | H7 C | Am | G |\n";
	const gap = "time: 4/4\n| C | ? | G | D |\n| Em | ? C | Am | G |\n";
	test("the same bars, meters and slot counts as with ? written", () => {
		const a = parseChart(unread);
		const b = parseChart(gap);
		expect(a.bars).toHaveLength(8);
		const shape = (p: typeof a) => p.bars.map((x) => [x.written, x.meter, x.slots.length]);
		expect(shape(a)).toEqual(shape(b));
		expect(a.bars[1]?.slots).toEqual([{ kind: "unknown", text: "CM7" }]);
		expect(a.diagnostics.filter((d) => d.severity === "error").map((d) => d.line)).toEqual([2, 3]);
	});
	test("a part's notes line keeps a bad note set without a second error", () => {
		const chart = "part: P = Piano\nP.RH | {C4} | {C4} |\nP.LH | {C3} | {H3} |\n";
		const p = parseChart(chart);
		const errs = p.diagnostics.filter((d) => d.severity === "error");
		expect(errs).toHaveLength(1);
		expect(errs[0]?.token).toBe("{H3}");
		expect(p.bars).toHaveLength(2);
		expect(p.bars[1]?.lines?.[1]?.slots).toEqual([{ kind: "unknown", text: "{H3}" }]);
	});
});
