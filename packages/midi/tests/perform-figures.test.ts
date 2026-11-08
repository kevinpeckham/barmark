import { describe, expect, test } from "bun:test";
import { parseChart, pedalStates } from "barmark";
import { perform } from "../src/perform/index.js";
import { pedalEvents } from "../src/perform/pedal.js";
import { q, toNumber } from "../src/perform/quarters.js";
import { swingPoint } from "../src/perform/swing.js";
import { notesOf } from "./helpers/notes.js";

/** The bass notes (below C4) of the chart's track: one per attack, as `[pitch, at, length, velocity]`. */
const bass = (text: string) => notesOf(perform(parseChart(text))).filter(([pitch]) => pitch < 60);
/** `[at, length]` of each attack, from its bass note. */
const attacks = (text: string) => bass(text).map(([, at, length]) => [at, length]);
const pedal = (text: string, part: number | null = null) =>
	pedalEvents(parseChart(text), part).map((e) => [toNumber(e.at), e.down]);

describe("perform: accents, hits, pushes, pedal and swing", () => {
	test("accents and hits", () => {
		// Claude's ruling, 2026-11-08: a hit lasts its whole slot, and `/` holds it.
		expect(bass("| >C ^C / / |")).toEqual([
			[48, 0, 1, 100],
			[48, 1, 3, 112],
		]);
		expect(bass("| ^C ^C ^C ^C |")).toEqual([
			[48, 0, 1, 112],
			[48, 1, 1, 112],
			[48, 2, 1, 112],
			[48, 3, 1, 112],
		]);
		const velocities = new Set(notesOf(perform(parseChart("| >C |"))).map((n) => n[3]));
		expect([...velocities]).toEqual([100]);
		expect(bass("| C |")[0]?.[3]).toBe(80);
	});

	test("a push borrows from the slot before, across a bar line", () => {
		expect(attacks("| C | <G |")).toEqual([
			[0, 3.5],
			[3.5, 4.5],
		]);
		expect(attacks("| C | <<G |")).toEqual([
			[0, 3.75],
			[3.75, 4.25],
		]);
		expect(attacks("| C <G |")).toEqual([
			[0, 1.5],
			[1.5, 2.5],
		]);
	});

	test("a push borrows in play order", () => {
		// C G C G D: the second pass's G gives D its eighth (`:|` closes its bar line, so D starts the next).
		expect(attacks("|: C | G :|\n| <D |")).toEqual([
			[0, 4],
			[4, 4],
			[8, 4],
			[12, 3.5],
			[15.5, 4.5],
		]);
		// Grammar 2.8: the verse pushes from the intro, and replayed, from the chorus.
		const replay = "## Intro\n| C |\n## Verse\n| <D |\n## Chorus\n| A |\n## Verse\n";
		expect(attacks(replay)).toEqual([
			[0, 3.5],
			[3.5, 4.5],
			[8, 3.5],
			[11.5, 4.5],
		]);
	});

	test("a push as long as the slot before it stays on the beat", () => {
		// musicxml refuses this push too: taking all of G would lose a written chord.
		expect(attacks("| D / / /_G | <A |")).toEqual([
			[0, 3.5],
			[3.5, 0.5],
			[4, 4],
		]);
	});

	test("a push takes from a hold, shortening what it holds", () => {
		expect(attacks("| C / / / | <G |")).toEqual([
			[0, 3.5],
			[3.5, 4.5],
		]);
	});

	test("pedal", () => {
		expect(pedal("| +C / +F / | *G |")).toEqual([
			[0, true],
			[2, false],
			[2, true],
			[4, false],
		]);
		expect(pedal("| +C | -- |")).toEqual([
			[0, true],
			[4, false],
		]);
		expect(pedal("| +C |")).toEqual([
			[0, true],
			[4, false],
		]);
		expect(pedal("| +C_+D |")).toEqual([
			[0, true],
			[2, false],
			[2, true],
			[4, false],
		]);
		expect(pedal("| C |")).toEqual([]);
		expect(perform(parseChart("| +C / *F / |")).tracks[0]?.pedal.map((e) => e.down)).toEqual([
			true,
			false,
		]);
	});

	test("a pushed pedal mark moves with its slot", () => {
		expect(pedal("| C | +<G |")).toEqual([
			[3.5, true],
			[8, false],
		]);
		// A pushed first slot is a chart error; its note and its pedal stay on the beat.
		expect(pedal("| +<C |")).toEqual([
			[0, true],
			[4, false],
		]);
		expect(attacks("| +<C |")).toEqual([[0, 4]]);
		// A push as long as its giver doesn't take it; the press stays with its note.
		expect(pedal("| D / / /_G | +<A |")).toEqual([
			[4, true],
			[8, false],
		]);
	});

	test("pedal events agree with pedalStates at every slot's end", () => {
		const text = "| +C / +F / | *G | +C -- +D *E | +F |";
		const parse = parseChart(text);
		const events = pedalEvents(parse, null);
		const states = pedalStates(parse.bars);
		const downAt = (t: number) => events.filter((e) => toNumber(e.at) <= t).at(-1)?.down ?? false;
		const slotEnds = parse.bars.flatMap((bar, b) =>
			bar.slots.map((_, s) => 4 * b + ((s + 1) * 4) / bar.slots.length),
		);
		// Just before each slot's end, the pedal is as pedalStates reads it.
		expect(slotEnds.map((t) => downAt(t - 0.001))).toEqual(states.flat());
	});

	test("another part's pedal reads its own bars", () => {
		const text = [
			"part: Gtr = Electric Guitar 1",
			"part: Pno = Piano",
			"",
			"Gtr | C | C |",
			"Pno | +C | C |",
			"",
			"Gtr | C | C |",
		].join("\n");
		expect(pedal(text, 1)).toEqual([
			[0, true],
			[8, false],
		]);
		expect(pedal(text, 0)).toEqual([]);
		expect(pedal(text, null)).toEqual([]);
	});

	test("swing moves the second eighth", () => {
		expect(attacks("feel: swing\n| C_D E F G |").slice(0, 2)).toEqual([
			[0, 2 / 3],
			[2 / 3, 1 / 3],
		]);
		expect(attacks("feel: swing 58%\n| C_D E F G |").slice(0, 2)).toEqual([
			[0, 0.58],
			[0.58, 0.42],
		]);
		expect(attacks("feel: shuffle 62.5%\n| C_D E F G |")[1]?.[0]).toBe(0.625);
		expect(attacks("feel: swing 16\n| C_D_E_F / / / |")).toEqual([
			[0, 1 / 3],
			[1 / 3, 1 / 6],
			[0.5, 1 / 3],
			[5 / 6, 19 / 6],
		]);
		expect(attacks("feel: swing\n| C_D_E / / / |")).toEqual([
			[0, 1 / 3],
			[1 / 3, 1 / 3],
			[2 / 3, 10 / 3],
		]);
		expect(attacks("| C_D E F G |").slice(0, 2)).toEqual([
			[0, 0.5],
			[0.5, 0.5],
		]);
	});

	test("swingPoint moves only the second of a pair", () => {
		expect(swingPoint(q(5, 2), "swing", undefined)).toEqual(q(8, 3));
		expect(swingPoint(q(5, 2), "shuffle", 75)).toEqual(q(11, 4));
		expect(swingPoint(q(5, 2), "straight", undefined)).toEqual(q(5, 2));
		expect(swingPoint(q(3, 4), "swing 16", undefined)).toEqual(q(5, 6));
		expect(swingPoint(q(1, 2), "swing 16", undefined)).toEqual(q(1, 2));
		expect(swingPoint(q(1, 3), "swing", undefined)).toEqual(q(1, 3));
	});

	test("swing reads each bar's own feel", () => {
		// Swung, then straight again: only the first bar's off-beat moves.
		const back = "feel: swing\n| C_D E F G |\nfeel: straight\n| C_D E F G |";
		expect(attacks(back).map(([at]) => at)).toEqual([0, 2 / 3, 1, 2, 3, 4, 4.5, 5, 6, 7]);
		// Points at k + 1/2 within a whole-note bar's quarters, in the second bar only.
		expect(attacks("| C_D E F G |\nfeel: swing\n| C_D E F G |").map(([at]) => at)).toEqual([
			0,
			0.5,
			1,
			2,
			3,
			4,
			14 / 3,
			5,
			6,
			7,
		]);
	});

	test("a beat off the binary grid isn't swung", () => {
		// Controller's ruling: sextuplets keep all six notes, straight, under any swing.
		const sextuplets = "| C_D_E_F_G_A C C C |";
		const straight = [
			[0, 1 / 6],
			[1 / 6, 1 / 6],
			[1 / 3, 1 / 6],
			[1 / 2, 1 / 6],
			[2 / 3, 1 / 6],
			[5 / 6, 1 / 6],
		];
		for (const feel of ["swing", "swing 75%"])
			expect(attacks(`feel: ${feel}\n${sextuplets}`).slice(0, 6)).toEqual(straight);
		// The other beats still swing: a triplet beat beside swung eighths.
		expect(attacks("feel: swing\n| C_D_E C_D C C |").map(([at]) => at)).toEqual([
			0,
			1 / 3,
			2 / 3,
			1,
			5 / 3,
			2,
			3,
		]);
		// Pedal, words and lyrics follow the same map: a mark on the sextuplets' fourth stays put.
		const pedal = perform(parseChart("feel: swing\n| C_D_E_+F_G_A C C *C |")).tracks[0]?.pedal;
		expect(pedal?.map((e) => [toNumber(e.at), e.down])).toEqual([
			[0.5, true],
			[3, false],
		]);
	});

	test("a pushed and of 4 is swung", () => {
		expect(attacks("feel: swing\n| C / / <G |")).toEqual([
			[0, 8 / 3],
			[8 / 3, 4 / 3],
		]);
	});

	test("no swing in compound meters", () => {
		const p = perform(
			parseChart("time: 6/8, feel: swing, tempo: 80\n| C D E F G A | C D E F G A |"),
		);
		expect(
			notesOf(p)
				.filter(([pitch]) => pitch < 60)
				.map(([, at]) => at),
		).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5]);
		expect(p.losses.map((l) => [l.code, l.bar])).toEqual([["swing-compound", 1]]);
		expect(perform(parseChart("feel: swing, tempo: 120\n| C |")).losses).toEqual([]);
	});
});
