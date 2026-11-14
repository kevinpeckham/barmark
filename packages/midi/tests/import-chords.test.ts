/**
 * Import's chords, export and back (Task 12 fix round 2): the examples bar
 * for bar, and every input Task 12's re-review found coming back wrong.
 * Each expectation is what sounds: where the import's name differs from
 * the chart's, the comment says why the notes are the same.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { importMidi } from "../src/import/index.js";
import { exportMidi } from "../src/index.js";

/** The imported chart's bar lines, joined: what a musician reads. */
function bars(chart: string): string {
	const out = exportMidi(chart);
	if (!out.ok) throw new Error(out.diagnostics.map((d) => d.message).join("; "));
	return (
		importMidi(out.bytes)
			.text.split("\n")
			// A chart with lyric rows pads its bar lines to line up with them.
			.map((l) => l.trim().replace(/\s+/g, " "))
			.filter((l) => l.startsWith("|"))
			.join(" ")
			.replaceAll(" | |", " |")
	);
}

const example = (name: string) =>
	readFileSync(new URL(`../../../examples/${name}`, import.meta.url), "utf8");
const withBass = (body: string) =>
	`part: Pno = Piano\npart: Bs = Bass, instrument: electric bass\nkey: C\n${body}\n`;

describe("the examples, bar for bar", () => {
	test("Morning Song: the guitar and piano together (G with Em is Em7)", () => {
		expect(bars(example("morning-song.chart.md"))).toBe(
			"| G | C | G | D | G | C | Em7 | D | G | C | D | G | C | G | D | G | C | G | D | G |",
		);
	});

	test("Peaceful Dreams: every bar as written, % as /", () => {
		const verse =
			"| D5 | / | A5 | / | G5(7) | / | D5 | / | A5 | B5(7) | G5(7) | / | / | / | D5 | / | A5 | G5(7) | D5 | / |";
		const chorus = "| G5(7) | / | D5 | / | C5 | G5(7) | D7sus4 | / |";
		const eight = "| D7sus4 | / | / | / | / | / | / | / |";
		expect(bars(example("peaceful-dreams.chart.md"))).toBe(
			[
				eight,
				"| C5 | / | G5(7) | / |",
				eight,
				verse,
				chorus,
				verse,
				chorus,
				"| Bm7 | / | Em7 | / | G7 | / | A7sus4 | / |",
				"| D | / | A | / | G | / | D | / | A | Bm | G | / | / | / | D | / | A | Gm | D | / |",
				verse,
				eight,
				`| D5 |${" / |".repeat(20)}`,
			]
				.join(" ")
				.replaceAll(" | |", " |"),
		);
	});

	test("Shenandoah: the guitar's pickup chord too", () => {
		expect(bars(example("shenandoah.chart.md"))).toBe("| [1/4] C | C | / | F |");
	});
});

describe("the flat sixth: naming notes is unchanged", () => {
	// C E♭ G A♭ was named Abmaj7/C before (b6) was a spelling (run at a23242b), and still is:
	// naming goes by the notes, so a chart's Cm(b6) and Cm(b13) come back as the same name.
	test("C E♭ G A♭ is named Abmaj7/C, whether it was written as notes, (b6) or (b13)", () => {
		for (const body of ["{C4 Eb4 G4 Ab4}", "Cm(b6)", "Cm(b13)"])
			expect(bars(`key: C\n| ${body} |\n`)).toBe("| Abmaj7/C |");
	});
});

describe("the re-review's inputs come back (Critical 1, Important 2-4)", () => {
	test("Critical 1: a re-strike dropping notes is a new chord", () => {
		expect(bars("key: C\n| Cmaj7 | C | G7 | G | C6 | C |\n")).toBe(
			"| Cmaj7 | C | G7 | G | C6 | C |",
		);
		expect(bars("key: Eb\n| Ebmaj7 | Eb |\n")).toBe("| Ebmaj7 | Eb |");
		expect(bars("key: C\n| C7 | C | C | C | C |\n")).toBe("| C7 | C | / | / | / |");
		// charts2 bar 13: Cmaj7 then C. Each chord comes back; groups are written one chord a
		// slot, and the G struck on the last eighth is written on the next downbeat (the writer's,
		// Task 13, as at HEAD before this round)
		expect(bars("key: C\n| Dm7_G7 Cmaj7_A7 | Dm7 G7_Db7 | Cmaj7 | % |\n| C / / /_G | / |\n")).toBe(
			"| Dm7 G7 Cmaj7 A7 | Dm7 / G7 Db7 | Cmaj7 | / | C | G |",
		);
		// Dm7 over an F2 bass track is D F A C over F: F6, the same notes
		expect(bars(withBass("Pno | Dm7 | F |\nBs  | {F2} | {F2} |"))).toBe("| F6 | F |");
	});

	test("Critical 1: a re-strike adding the top note is a new chord", () => {
		expect(bars("key: C\n| C | C7 | C | C7 |\n")).toBe("| C | C7 | C | C7 |");
		expect(bars("key: C\n| C | Cmaj7 | C7 | F |\n")).toBe("| C | Cmaj7 | C7 | F |");
		expect(bars("key: C\n| Cdim | Cdim7 | Cm | Cm7 | C | C6 |\n")).toBe(
			"| Cdim | Cdim7 | Cm | Cm7 | C | C6 |",
		);
		// C/B is C E G B (Cmaj7/B), C/A is A C E G (Am7): the same notes
		expect(bars("key: C\n| C | C/B | C/A | C/G | C | C/E | C/G |\n")).toBe(
			"| C | Cmaj7/B | Am7 | C/G | C | C/E | C/G |",
		);
	});

	test("Critical 1: Peaceful Dreams' D7sus4 then D5 (bars 125-154)", () => {
		expect(bars("key: D\n| D7sus4 | % | D5 | % | C5 | D5 |\n")).toBe(
			"| D7sus4 | / | D5 | / | C5 | D5 |",
		);
	});

	test("Important 2: a fill after a stab doesn't rename it", () => {
		const fill = "part: Pno = Piano\npart: Gtr = Electric Guitar\nkey: C\n";
		// the guitar's single line is a melody, left out of the harmony; the stab rings a quarter
		expect(bars(`${fill}Pno | C -- -- -- |\nGtr | {C5} {C5} {B4} {A4} |`)).toBe("| C N.C. / / |");
		expect(bars("key: C\n| C {C5} {B4} {A4} |\n")).toBe("| C |");
	});

	test("Important 3: the bass moving at a bar line under one voicing", () => {
		expect(bars("key: C\n| C/E | C/G |\n")).toBe("| C/E | C/G |");
		expect(bars("key: Eb\n| Fm11 | Bb9sus4 | Cdim7 | Ebdim7 | F#dim7 | Adim7 |\n")).toBe(
			"| Fm11 | Bb9sus4 | Cdim7 | Ebdim7 | F#dim7 | Adim7 |",
		);
		expect(bars(withBass("Pno | Dm7 | F |\nBs  | Dm7 | F |"))).toBe("| Dm7 | F |");
		// a held C pad over a bass C F G C: C E G over F is C(11)/F
		const pad = "| C | C(11)/F | C/G | C |";
		expect(
			bars(withBass("Pno | C / / / | / / / / | / / / / | / / / / |\nBs  | C | F | G | C |")),
		).toBe(pad);
		expect(bars(withBass("Pno | C | C | C | C |\nBs  | C | F | G | C |"))).toBe(pad);
	});

	test("Important 3: a walking bass inside a bar still moves no chord", () => {
		const walk =
			"Bs  | {D2} {A2} {G2} {D3} | {C2} {G2} {A2} {E3} | {D2} {F2} {G2} {B2} | {C2} {E2} {G2} {C3} |";
		expect(bars(withBass(`Pno | Dm7 G7 | Cmaj7 A7 | Dm7 G7 | C |\n${walk}`))).toBe(
			"| Dm7 G7 | Cmaj7 A7 | Dm7 G7 | C |",
		);
	});

	// Important 4 (a grace note in the bass line) is hand-built in import-segments.test.ts
	// and import-streams.test.ts: export writes no grace notes.

	test("a written sustain pedal still changes chord at each attack; the names are what it holds", () => {
		// under the pedal F sounds with C E G held: Fmaj9; G with all of them: Dm13/F
		expect(bars("key: C\n| +C | F | G | *C |\n")).toBe("| C | Fmaj9 | Dm13/F | C |");
	});
});
