import { describe, expect, test } from "bun:test";
import { parseChart } from "barmark";
import { AT_A_GLANCE } from "../../barmark/tests/chart/fixtures.js";
import { corpus } from "../../musicxml/tests/charts.js";
import { perform, secondsAt } from "../src/perform/index.js";
import { add, q, toNumber, ZERO } from "../src/perform/quarters.js";
import { notesOf } from "./helpers/notes.js";

const notes = (text: string) => notesOf(perform(parseChart(text)));
const pitches = (text: string) => notes(text).map(([pitch]) => pitch);

describe("perform: slots, voicing and holds", () => {
	test("a chord is a bass under every chord tone from C4", () => {
		expect(notes("| C |")).toEqual([
			[48, 0, 4, 80],
			[60, 0, 4, 80],
			[64, 0, 4, 80],
			[67, 0, 4, 80],
		]);
		expect(pitches("| G7/B |")).toEqual([47, 62, 65, 67, 71]);
		expect(pitches("| F |")).toEqual([41, 60, 65, 69]);
		expect(pitches("| C/Bb |")).toEqual([46, 60, 64, 67, 70]);
	});

	test("a bass instrument plays the bass alone, E1 to D#2", () => {
		const text = "part: Bs = Bass, instrument: electric bass\n| C | G/B |";
		expect(notes(text).map((n) => n.slice(0, 3))).toEqual([
			[36, 0, 4],
			[35, 4, 4],
		]);
	});

	test("note sets and voicings are exact", () => {
		expect(pitches("| {C3 G3 E4} |")).toEqual([48, 55, 64]);
		expect(pitches("| Cmaj7{E3 G3 B3} |")).toEqual([52, 55, 59]);
	});

	test("note sets without octaves rise from octave 4", () => {
		expect(pitches("| {G E C} |")).toEqual([67, 76, 84]);
		expect(pitches("| {C E G} |")).toEqual([60, 64, 67]);
	});

	test("every named slot re-attacks; holds sustain across bars", () => {
		const g = notes("| G G |").filter(([pitch]) => pitch === 67);
		expect(g.map(([, at, length]) => [at, length])).toEqual([
			[0, 2],
			[2, 2],
		]);
		const held = notes("| G / | / G |").filter(([pitch]) => pitch === 67);
		expect(held.map(([, at, length]) => [at, length])).toEqual([
			[0, 6],
			[6, 2],
		]);
	});

	test("groups and dots", () => {
		const c = (text: string) => notes(text).find(([pitch]) => pitch === 60);
		const d = (text: string) => notes(text).find(([pitch]) => pitch === 62);
		expect(c("| C_D / / / |")?.slice(1, 3)).toEqual([0, 0.5]);
		expect(d("| C_D / / / |")?.slice(1, 3)).toEqual([0.5, 3.5]);
		expect(c("| C._D / / / |")?.slice(1, 3)).toEqual([0, 0.75]);
		expect(d("| C._D / / / |")?.slice(1, 2)).toEqual([0.75]);
	});

	test("N.C., silence, ? and tacet sound nothing", () => {
		expect(notes("| C N.C. | -- ? |")).toEqual([
			[48, 0, 2, 80],
			[60, 0, 2, 80],
			[64, 0, 2, 80],
			[67, 0, 2, 80],
		]);
		const tacet =
			"part: Gtr = Electric Guitar 1\npart: Pno = Piano\n\nGtr | C / |\nPno | F |\n---\nPno | / |\n";
		expect(notes(tacet).map(([, at, length]) => [at, length])).toEqual([
			[0, 4],
			[0, 4],
			[0, 4],
			[0, 4],
		]);
	});

	test("7alt sounds what it spells", () => {
		expect(pitches("| C7alt |")).toEqual([48, 60, 64, 70]);
	});

	test("bars follow parse.bars", () => {
		for (const [name, text] of [["at a glance", AT_A_GLANCE] as const, ...corpus()]) {
			const p = parseChart(text);
			const bars = perform(p).bars;
			expect({ name, bars: bars.map((b) => b.index) }).toEqual({
				name,
				bars: p.bars.map((b) => b.index),
			});
			let at = ZERO;
			bars.forEach((b, i) => {
				expect({ name, i, at: b.at }).toEqual({ name, i, at });
				at = add(at, q(4 * b.meter.n, b.meter.d));
			});
		}
	});
});

describe("perform: the performance", () => {
	test("one track named Chart, on piano", () => {
		const p = perform(parseChart("# Song\n| C |"));
		expect(p.title).toBe("Song");
		expect(p.tracks.map((t) => [t.name, t.part, t.line, t.role, t.program])).toEqual([
			["Chart", null, null, "line", 1],
		]);
		expect(p.end).toEqual(q(4));
	});

	test("secondsAt reads the tempo, in the meter's beat", () => {
		expect(secondsAt(perform(parseChart("| C | C |")), q(4))).toBe(2);
		expect(secondsAt(perform(parseChart("| C |"), { tempo: 60 }), q(3, 2))).toBe(1.5);
		const sixEight = perform(parseChart("time: 6/8\n| C |"), { tempo: 60 });
		expect(sixEight.tempos).toEqual([{ at: ZERO, qpm: 90 }]);
		expect(toNumber(q(3))).toBe(3);
		expect(secondsAt(sixEight, q(3))).toBe(2);
	});
});
