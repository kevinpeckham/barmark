import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { type Mode, parseChart } from "barmark";
// barmark's private signature count, which keyFifths must agree with (spec 3.7).
import { MODES, signature } from "../../barmark/src/chart/keys.js";
import { perform } from "../src/perform/index.js";
import { keyFifths } from "../src/perform/keys.js";
import { toNumber } from "../src/perform/quarters.js";
import type { Performance, Quarters } from "../src/perform/types.js";

const play = (text: string, options?: { tempo?: number }) => perform(parseChart(text), options);
const n = (at: Quarters) => toNumber(at);
const tempos = (p: Performance) => p.tempos.map((t) => [n(t.at), t.qpm]);
const lossCodes = (p: Performance) => p.losses.map((l) => l.code);
const markers = (text: string) => play(text).markers.map((m) => [m.text, n(m.at)]);

describe("perform: tempo, meters, keys, markers, words and lyrics", () => {
	test("tempo counts the beat", () => {
		expect(tempos(play("time: 6/8, tempo: 60\n| C |"))).toEqual([[0, 90]]);
		const change = "time: 4/4, tempo: 120\n| C | C |\ntime: 6/8\n| C | C |";
		expect(tempos(play(change))).toEqual([
			[0, 120],
			[8, 180],
		]);
	});

	test("no tempo", () => {
		const assumed = play("| C |");
		expect(tempos(assumed)).toEqual([[0, 120]]);
		expect(assumed.losses.filter((l) => l.code === "tempo-assumed")).toEqual([
			{ code: "tempo-assumed", message: expect.any(String), bar: 1 },
		]);
		expect(tempos(play("| C |", { tempo: 90 }))).toEqual([[0, 90]]);
		expect(lossCodes(play("tempo: 100\n| C |"))).toEqual([]);
	});

	test("rit. is a ramp a beat, reaching the target on the last bar's downbeat", () => {
		const rit = "tempo: 100\n| C |\ntempo: rit. to 80\n| C | C |";
		expect(tempos(play(rit))).toEqual([
			[0, 100],
			[4, 96],
			[5, 92],
			[6, 88],
			[7, 84],
			[8, 80],
		]);
		expect(play(rit).end).toEqual({ n: 12, d: 1 });
		const oneBar = "tempo: 100\n| C |\ntempo: rit. to 80\n| C |";
		expect(tempos(play(oneBar))).toEqual([
			[0, 100],
			[4, 80],
		]);
		expect(tempos(play("tempo: 100\n| C |\ntempo: rit.\n| C |"))).toEqual([
			[0, 100],
			[4, 80],
		]);
		expect(tempos(play("tempo: 100\n| C |\ntempo: accel.\n| C |"))).toEqual([
			[0, 100],
			[4, 120],
		]);
		const back = "tempo: 100\n| C |\ntempo: rit. to 80\n| C |\ntempo: a tempo\n| C |";
		expect(tempos(play(back))).toEqual([
			[0, 100],
			[4, 80],
			[8, 100],
		]);
		// Two runs back to back are two ramps, each from the steady tempo.
		const twice = "tempo: 100\n| C |\ntempo: rit. to 80\n| C |\ntempo: rit. to 60\n| C |";
		expect(tempos(play(twice))).toEqual([
			[0, 100],
			[4, 80],
			[8, 60],
		]);
	});

	test("a fermata triples the last beat", () => {
		const p = play("tempo: 120\n| C | ... | G |");
		expect(tempos(p)).toEqual([
			[0, 120],
			[3, 40],
			[4, 120],
		]);
		expect(p.bars.map((b) => n(b.at))).toEqual([0, 4]);
		// In 6/8 the last beat is a dotted quarter.
		expect(tempos(play("time: 6/8, tempo: 60\n| C | ... | G |"))).toEqual([
			[0, 90],
			[1.5, 30],
			[3, 90],
		]);
	});

	test("meters and keys", () => {
		const p = play("| [2/4] C | D |");
		expect(p.bars.map((b) => [n(b.at), `${b.meter.n}/${b.meter.d}`])).toEqual([
			[0, "2/4"],
			[2, "4/4"],
		]);
		expect(keyFifths({ tonic: "Bb", mode: "major" })).toEqual({
			fifths: -2,
			minor: false,
			modeLost: false,
		});
		expect(keyFifths({ tonic: "F#", mode: "minor" })).toEqual({
			fifths: 3,
			minor: true,
			modeLost: false,
		});
		expect(keyFifths({ tonic: "A", mode: "mixolydian" })).toEqual({
			fifths: 2,
			minor: false,
			modeLost: true,
		});
		expect(keyFifths({ tonic: "D", mode: "aeolian" }).minor).toBe(true);
		const keys = play("key: Bb\n| C |\nkey: F#m\n| C | C |\nkey: A mixolydian\n| C |");
		expect(keys.keys.map((k) => [n(k.at), k.key.tonic, k.key.mode])).toEqual([
			[0, "Bb", "major"],
			[4, "F#", "minor"],
			[12, "A", "mixolydian"],
		]);
		expect(keys.losses.filter((l) => l.code === "mode")).toEqual([
			{ code: "mode", message: expect.any(String), bar: 4 },
		]);
		expect(play("| C |").keys).toEqual([]);
	});

	test("keyFifths agrees with barmark", () => {
		const flats = ["Cb", "Db", "Eb", "Fb", "Gb", "Ab", "Bb"];
		const sharps = ["C#", "D#", "E#", "F#", "G#", "A#", "B#"];
		const tonics = [...flats, "C", "D", "E", "F", "G", "A", "B", ...sharps];
		expect(tonics).toHaveLength(21);
		for (const tonic of tonics)
			for (const mode of MODES as Mode[])
				expect({ tonic, mode, fifths: keyFifths({ tonic, mode }).fifths }).toEqual({
					tonic,
					mode,
					fifths: signature(tonic, mode),
				});
	});

	test("markers in play order", () => {
		expect(markers("## Verse\n| C |\n## Chorus\n| F |\n## Verse\n")).toEqual([
			["Verse", 0],
			["Chorus", 4],
			["Verse", 8],
		]);
		expect(markers("| C | @B | C |")).toEqual([["B", 4]]);
		expect(markers("## Verse\n| @A | C |")).toEqual([
			["Verse", 0],
			["A", 0],
		]);
	});

	test("words", () => {
		const p = play('| "solo" C G "fill" |');
		expect(p.tracks[0]?.words.map((w) => [w.text, n(w.at)])).toEqual([
			["solo", 0],
			["fill", 4],
		]);
		// Words count the bar's slots, a `_` group as one: "x" is before E, on beat 2.
		const grouped = play('| C_D "x" E F G |');
		expect(grouped.tracks[0]?.words.map((w) => [w.text, n(w.at)])).toEqual([["x", 1]]);
		// Words before the second eighth swing with it.
		const swung = play('feel: swing\n| C "x" C C C C C C C |');
		expect(swung.tracks[0]?.words.map((w) => [w.text, n(w.at)])).toEqual([["x", 2 / 3]]);
	});

	test("lyrics", () => {
		const leadSheet = readFileSync(
			new URL("../../musicxml/tests/fixtures/import/lead-sheet.chart.md", import.meta.url),
			"utf8",
		);
		const sung = play(leadSheet).tracks.filter((t) => t.lyrics.length > 0);
		expect(sung).toHaveLength(1);
		expect(sung[0]?.lyrics.slice(0, 4).map((l) => [l.text, l.verse, n(l.at)])).toEqual([
			["Hap", 1, 8],
			["Whis", 2, 8],
			["py ", 1, 10],
			["per ", 2, 10],
		]);
		const elided = play("| {C4}:the~end {D4}:/ |").tracks[0]?.lyrics;
		expect(elided?.map((l) => [l.text, n(l.at)])).toEqual([["the‿end ", 0]]);
		// Thirds stay exact.
		const thirds = play("| {C4}:a {D4}:b {E4}:c |").tracks[0]?.lyrics;
		expect(thirds?.map((l) => l.at)).toEqual([
			{ n: 0, d: 1 },
			{ n: 4, d: 3 },
			{ n: 8, d: 3 },
		]);
	});

	test("open repeat", () => {
		const p = play("tempo: 100\n| C |\n| G | x ...");
		expect(p.bars.map((b) => b.index)).toEqual([1, 2]);
		expect(p.losses).toEqual([{ code: "open-repeat", message: expect.any(String), bar: 2 }]);
	});

	test("credits and title", () => {
		const p = play("# Title\ncomposer: A\ncopyright: B\n| C |");
		expect(p.title).toBe("Title");
		expect(p.credits).toEqual({ composer: ["A"], lyricist: [], arranger: [], copyright: ["B"] });
	});
});
