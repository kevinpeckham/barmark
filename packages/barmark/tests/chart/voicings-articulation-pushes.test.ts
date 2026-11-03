import { describe, expect, test } from "bun:test";
import { parseBarLine } from "../../src/chart/barLine.js";
import { parseChart } from "../../src/chart/parse.js";
import { printChart } from "../../src/chart/print.js";
import { transposeChart } from "../../src/chart/transpose.js";
import type { Slot } from "../../src/chart/types.js";
import { meaning, play } from "./fixtures.js";

const slotsOf = (text: string): Slot[] => {
	const cell = parseBarLine(text, 1).bars?.cells[0];
	return cell?.kind === "slots" ? cell.slots : [];
};
const lineError = (text: string) => parseBarLine(text, 1).diagnostics[0]?.message ?? null;
const errors = (text: string) =>
	play(text)
		.all.filter((d) => d.severity === "error")
		.map((d) => d.message);

describe("voicings", () => {
	test("a chord name then a note set: the name, and exactly these notes", () => {
		const s = slotsOf("| Cmaj7{E3 G3 B3 C4} |")[0];
		expect(s?.kind === "chord" && s.chord.canonical).toBe("Cmaj7");
		expect(s?.kind === "chord" && s.voicing?.pitches).toEqual(["E3", "G3", "B3", "C4"]);
	});
	test("a voicing may leave tones out, and octaves are optional", () => {
		const s = slotsOf("| C7{E Bb} |")[0];
		expect(s?.kind === "chord" && s.voicing?.pitches).toEqual(["E", "Bb"]);
	});
	test("a note that is not in the chord is an error", () => {
		expect(lineError("| Cmaj7{E3 Bb3} |")).toContain("Bb is not in Cmaj7");
	});
	test("the slash bass counts as in the chord", () => {
		expect(lineError("| C/Bb{Bb2 E3 G3} |")).toBeNull();
	});
	test("a voicing's own problems are reported", () => {
		expect(lineError("| Cmaj7{E3 G} |")).toContain("every note has an octave, or none does");
	});
	test("a voicing prints after its name and transposes with it", () => {
		expect(printChart("| Cmaj7{ E3  G3 B3 C4 } |")).toBe("| Cmaj7{E3 G3 B3 C4} |\n");
		expect(transposeChart("key: C\n| Cmaj7{E3 G3 B3 C4} |", { to: "D" }).text).toBe(
			"key: D\n| Dmaj7{F#3 A3 C#4 D4} |\n",
		);
	});
});

describe("articulation", () => {
	test("> accents a chord and ^ makes it a hit", () => {
		const [a, h] = slotsOf("| >D ^G |");
		expect(a?.kind === "chord" && a.articulation).toBe("accent");
		expect(h?.kind === "chord" && h.articulation).toBe("hit");
	});
	test("a note set and a group member take one too", () => {
		const [set, group] = slotsOf("| >{E G} ^D_E_F |");
		expect(set?.kind === "chord" && set.articulation).toBe("accent");
		expect(
			group?.kind === "group" &&
				group.members[0]?.kind === "chord" &&
				group.members[0].articulation,
		).toBe("hit");
	});
	test("only a chord or a note set takes one", () => {
		for (const t of ["| >N.C. |", "| ^-- |", "| C >/ |", "| >? |"])
			expect(lineError(t)).toContain("an accent or a hit goes on a chord or a note set");
	});
	test("articulation prints as written", () => {
		expect(printChart("| >D ^G |")).toBe("| >D ^G |\n");
	});
	test("an articulated slot is an attack: printing keeps it", () => {
		expect(printChart("| D / ^D / |")).toBe("| D ^D |\n");
	});
});

describe("pushes: reading", () => {
	test("< arrives an eighth early, << a sixteenth", () => {
		const [e, s] = slotsOf("| <D <<G |");
		expect(e?.kind === "chord" && e.push).toBe("eighth");
		expect(s?.kind === "chord" && s.push).toBe("sixteenth");
	});
	test("N.C. and -- can be pushed", () => {
		const [nc, stop] = slotsOf("| <N.C. <-- |");
		expect(nc?.kind === "nc" && nc.push).toBe("eighth");
		expect(stop?.kind === "silence" && stop.push).toBe("eighth");
	});
	test("a push and an articulation: the push first", () => {
		const s = slotsOf("| <^D |")[0];
		expect(s?.kind === "chord" && [s.push, s.articulation]).toEqual(["eighth", "hit"]);
		expect(lineError("| ^<D |")).toContain("write the push first");
		expect(parseBarLine("| ^<D |", 1).diagnostics[0]?.suggestion).toBe("<^D");
	});
	test("/, ? and % can't be pushed", () => {
		for (const t of ["| C </ |", "| <? |", "| C | <% |"])
			expect(lineError(t)).toContain("a push goes on a chord, a note set, N.C. or --");
	});
	test("a push is not written inside a group", () => {
		expect(lineError("| C D_<E |")).toContain("a push goes on a whole slot, not inside a group");
	});
	test("three marks are no push", () => {
		expect(lineError("| N.C. | <<<D |")).toContain("a push is < (an eighth) or << (a sixteenth)");
	});
});

describe("pushes: playing", () => {
	test("a pushed bar plays its chord, marked pushed", () => {
		const bars = play("| N.C. |\n| <D | <G |").bars;
		expect(bars.map((b) => (b.slots[0]?.kind === "chord" ? b.slots[0].push : null))).toEqual([
			null,
			"eighth",
			"eighth",
		]);
	});
	test("a pushed repeat takes its time from whatever played before, each pass", () => {
		expect(errors("| N.C. |\n|: <D | <G | <A | <Bm :|\n| <E | A |")).toEqual([]);
	});
	test("a pushed replay takes its time from the section before it", () => {
		expect(
			errors("## Intro\n| N.C. |\n## Verse\n| <D | <G |\n## Chorus\n| <E | A |\n## Verse"),
		).toEqual([]);
	});
	test("a push with nothing played before it is an error", () => {
		expect(errors("| <D | G |")).toEqual([
			"a push takes its time from the slot before it, and nothing plays before this one; write a pickup bar",
		]);
	});
	test("after a fermata nothing measured plays before the push", () => {
		expect(errors("| C | ... | <D |")).toEqual([
			"a push takes its time from the slot before it, and nothing plays before this one; write a pickup bar",
		]);
	});
	test("a push longer than the slot before it is an error", () => {
		expect(errors("| C / / D_E_F_G |\n| <A |")).toEqual([
			"an eighth push is longer than the slot before it",
		]);
		expect(errors("| C / / D_E_F_G |\n| <<A |")).toEqual([]);
	});
	test("in compound meters a push is still an eighth", () => {
		expect(errors("time: 6/8\n| C / / D_E_F |\n| <G |")).toEqual([
			"an eighth push is longer than the slot before it",
		]);
		expect(errors("time: 6/8\n| C |\n| <G |")).toEqual([]);
	});
	test("a mid-bar push takes its time from the slot before it in the bar", () => {
		expect(errors("| C <G |")).toEqual([]);
	});
});

describe("pushes: printing", () => {
	test("pushes print as written and reduce like any attack", () => {
		expect(printChart("| N.C. |\n| <D / / / | <<G |")).toBe("| N.C. |\n| <D | <<G |\n");
	});
	test("printing keeps the meaning of marks, voicings and pushes", () => {
		const text = "| N.C. |\n|: <^D | >G{B2 D3 G3} | <A7(no3) | Bm :|\n";
		const once = printChart(text);
		expect(once).toBe(text);
		expect(meaning(parseChart(once))).toEqual(meaning(parseChart(text)));
	});
	test("transposing keeps marks and pushes", () => {
		expect(transposeChart("key: C\n| N.C. | <^C | >G |", { to: "D" }).text).toBe(
			"key: D\n| N.C. | <^D | >A |\n",
		);
	});
});
