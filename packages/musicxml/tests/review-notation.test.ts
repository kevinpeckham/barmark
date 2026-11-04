/** Findings of the notation branch's final review, each pinned. */
import { describe, expect, test } from "bun:test";
import { frac, meterValues } from "../src/rhythm.js";
import { measures, notes, xmlOf } from "./helpers.js";
import { sounding } from "./sounding.js";

const meter = (n: number, d: number) => ({ n, d });
const shown = (start: number, length: number, m: { n: number; d: number }) =>
	meterValues(frac(start * 2, 2), frac(length * 2, 2), m).map(
		(v) => `${v.type}${".".repeat(v.dots)}`,
	);
/** Each note's type (`.` per dot, `3` for a triplet) and its ties: `~` before for a stop, after for a start. */
const read = (m: string) =>
	notes(m)
		.filter((n) => !n.includes("<chord/>"))
		.map((n) => {
			const type = /<type>(\w+)<\/type>/.exec(n)?.[1] ?? "";
			const dots = ".".repeat((n.match(/<dot\/>/g) ?? []).length);
			const triplet = n.includes("<actual-notes>3</actual-notes>") ? "3" : "";
			const stop = n.includes('<tie type="stop"/>') ? "~" : "";
			const start = n.includes('<tie type="start"/>') ? "~" : "";
			return `${stop}${type}${dots}${triplet}${start}`;
		});

describe("compound meters show their beats (I2)", () => {
	test("6/8: a value from a beat that doesn't fill beats is cut after the whole ones", () => {
		expect(shown(0, 2, meter(6, 8))).toEqual(["quarter.", "eighth"]);
		expect(shown(0, 3, meter(6, 8))).toEqual(["half."]);
		expect(shown(0, 1, meter(6, 8))).toEqual(["quarter"]);
	});
	test("12/8: the middle of the bar shows, and the whole bar is one value", () => {
		expect(shown(0, 4.5, meter(12, 8))).toEqual(["half.", "quarter."]);
		expect(shown(0, 6, meter(12, 8))).toEqual(["whole."]);
		expect(shown(3, 2, meter(12, 8))).toEqual(["quarter.", "eighth"]);
	});
	test("3/4 keeps a dotted quarter on the beat", () => {
		expect(shown(0, 1.5, meter(3, 4))).toEqual(["quarter."]);
	});
	test("the export", () => {
		expect(read(measures(xmlOf("time: 6/8\n| {C4} / / / {D4} / |"))[0] ?? "")).toEqual([
			"quarter.~",
			"~eighth",
			"quarter",
		]);
		expect(read(measures(xmlOf("time: 12/8\n| C / / <G |"))[0] ?? "")).toEqual([
			"half.~",
			"~quarter",
			"eighth~",
			"~quarter.",
		]);
	});
});

describe("a tuplet stays within its beat (I1)", () => {
	test("a note set's hold after a triplet ties on, not into one long triplet value", () => {
		const [m = ""] = measures(xmlOf("| {C4} / {D4}_{E4}_{F4} / |"));
		expect(read(m)).toEqual(["half", "eighth3", "eighth3", "eighth3~", "~quarter"]);
	});
	test("so does a chord's, in a bar that shows its rhythm", () => {
		const [m = ""] = measures(xmlOf("| C / D_E_F / |"));
		expect(read(m)).toEqual(["half", "eighth3", "eighth3", "eighth3~", "~quarter"]);
	});
	test("a hold inside the triplet still joins it", () => {
		const [m = ""] = measures(xmlOf("| {C4} / {D4}_/_{F4} / |"));
		expect(read(m).slice(1, 3)).toEqual(["quarter3", "eighth3~"]);
	});
});

describe("a held chord ties into a bar that shows its rhythm (I3)", () => {
	test("across the bar line", () => {
		const [one = "", two = ""] = measures(xmlOf("time: 3/4\n| C / <G | / D_E_F / |"));
		expect(read(one).at(-1)).toEndWith("~");
		expect(read(two)[0]).toStartWith("~");
	});
	test("not into a bar of slash style", () => {
		const [one = "", two = ""] = measures(xmlOf("| C / / <G | / |"));
		expect(read(two)[0]).not.toStartWith("~");
		expect(read(one).at(-1)).not.toEndWith("~");
	});
});

describe("a bar of rests stays in the clef around it (M1)", () => {
	test("between two low bars", () => {
		const clefs = measures(xmlOf("| C | D | G | {D2} | -- | {D2} | C | D |")).map(
			(m) => /<clef><sign>([GF])<\/sign>/.exec(m)?.[1] ?? "",
		);
		expect(clefs).toEqual(["G", "", "", "F", "", "", "G", ""]);
	});
});

describe("the sounding reader (M3)", () => {
	test("a tie stop with no start is two notes", () => {
		const note = (tie: string) =>
			`<note><pitch><step>D</step><octave>2</octave></pitch><duration>4</duration>${tie}<voice>1</voice><type>whole</type></note>`;
		const xml = `<score-partwise version="4.0"><part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes>${note("")}</measure><measure number="2">${note('<tie type="stop"/>')}</measure></part></score-partwise>`;
		expect(sounding(xml).notes).toHaveLength(2);
	});
});
