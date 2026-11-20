/** A played bass line (note-line design, sections 5 and 9): `interbellum-bass-09.mid` imports as the line it is, and is never published. */
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { parseChart, printChart } from "barmark";
import { attacksOf, lineFrom, lineOf } from "../src/import/attacks.js";
import { notesOf } from "../src/import/notes.js";
import { createReport } from "../src/import/report.js";
import { selectedNotes } from "../src/import/streams.js";
import { importMidi } from "../src/index.js";
import { perform } from "../src/perform/index.js";
import { readSmfInto } from "../src/smf/read.js";
import { fixtureBytes, fixtureChart } from "./helpers/fixtures.js";

const NAME = "interbellum-bass-09";

/**
 * The file's pitched notes (outside channel 10), as the import reads a
 * line's: paired first in, first out and tested with the pedal read, then
 * paired again by their keys, the pedal unread. `pedalled` is the test's
 * line, `line` the one written.
 */
function lineRead() {
	const report = createReport();
	const { smf, names } = readSmfInto(fixtureBytes(NAME), report);
	if (smf === null) throw new Error("no file");
	const paired = (pedal: boolean) =>
		selectedNotes(notesOf(smf, report, { overlaps: "keep", pedal }), names, {}, report).pitched;
	const pitched = paired(false);
	return {
		pitched,
		pedalled: lineOf(paired(true), smf.ppq),
		line: lineFrom(pitched, smf.ppq),
	};
}

const attackTimes = (text: string) => {
	const notes = perform(parseChart(text)).tracks.flatMap((t) => t.notes);
	const by = new Map<number, number[]>();
	for (const n of notes) {
		const at = n.at.n / n.at.d;
		by.set(at, [...(by.get(at) ?? []), n.pitch]);
	}
	return { notes: notes.length, attacks: [...by.entries()].sort((a, b) => a[0] - b[0]) };
};

describe("interbellum-bass-09.mid", () => {
	const r = importMidi(fixtureBytes(NAME));

	test("imports to its checked-in chart, which parses and prints unchanged", () => {
		expect(r.text).toBe(fixtureChart(NAME));
		expect(parseChart(r.text).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
		expect(printChart(r.text)).toBe(r.text);
	});

	test("its diagnostics: a line, 23 short notes, rounded bars, nine marks dropped", () => {
		expect(r.diagnostics.map((d) => [d.severity, d.code])).toEqual([
			["info", "notes-line"],
			["info", "notes-short"],
			["warning", "rhythm-rounded"],
			["info", "marker-dropped"],
		]);
		expect(r.diagnostics[1]?.message).toBe("23 notes shorter than a 64th note left out");
		expect(r.diagnostics[2]?.message).toContain("in bars 39, 62, 63 and 64");
		expect(r.diagnostics[3]?.message).toContain("9 times");
	});

	test("its attacks: 491 notes, 23 short, 464 attacks, none joined, every pitch kept in order", () => {
		const { pitched, pedalled, line } = lineRead();
		// the test reads the pedal: 22 short notes and 465 attacks, one of them a 15-tick C4 (track 9,
		// tick 119545) the sustain pedal holds for 735 ticks
		expect([pedalled?.short, pedalled?.attacks.length]).toEqual([22, 465]);
		// the line is read by its keys (Kevin, 2026-11-20): that C4 is a short note too
		expect(pitched).toHaveLength(491);
		expect(line.short).toBe(23);
		// 491 notes less 23 short are 468 notes, and the 32nd window groups them in 464 attacks
		expect(line.notes).toHaveLength(491 - 23);
		expect(line.attacks).toHaveLength(464);
		expect(attacksOf(line.notes, 480)).toHaveLength(464);
		// rounding put no two attacks on one point, so the chart sounds as many attack times as the line has
		// attacks and as many notes as it has notes. The 4 more notes than attacks are three closing chords,
		// one of three pitches and two of two.
		const sounded = attackTimes(r.text);
		expect(sounded.notes).toBe(468);
		expect(sounded.attacks).toHaveLength(464);
		expect(sounded.attacks.map(([, p]) => [...p].sort((a, b) => a - b))).toEqual(
			line.attacks.map((a) => a.pitches),
		);
	});

	test("the Outro: the first closing chord ends where its keys did, and no pedal-held C4 is written", () => {
		expect(r.text).toContain("| / -- --_{G4 A4} / | / -- -- {E4 G4} | / / / -- |");
		expect(r.text).not.toContain("| / {C4} /_{G4 A4} / |");
	});

	test("every region is there and nothing sounds as N.C.", () => {
		const headings = r.text.split("\n").filter((l) => l.startsWith("## "));
		expect(headings).toEqual([
			"## Marker ##",
			"## Verse I",
			"## Chorus",
			"## Verse",
			"## Chorus",
			"## Chorus",
			"## Bridge",
			"## Int",
			"## Verse II",
			"## Outro",
		]);
		expect(r.text).not.toContain("N.C.");
	});

	test("reading A: the first two bars of Verse I hold each note to the next attack", () => {
		expect(r.text).toContain(
			"| {C3} {C3}_{C3} /_{C3} {C3}_{C3} | {G2}_{G2} {C3}_{C3} /_{C3} {C3}_/_{E3}_{D3} |",
		);
	});

	test("notes: false reads only what main reads: chords, no notes-line", () => {
		const chords = importMidi(fixtureBytes(NAME), { notes: false });
		// The digest is `main`'s output for this file (606 characters), taken from a checkout of main before the line reading.
		expect(chords.text).toHaveLength(606);
		expect(createHash("sha256").update(chords.text).digest("hex")).toBe(
			"02d4d21b277201a8263acc32912ccd9c0301d5d23305aa13da435f231bfc10ab",
		);
		const codes = chords.diagnostics.map((d) => d.code);
		expect(codes).not.toContain("notes-line");
		expect(codes).not.toContain("rhythm-rounded");
		expect(chords.text).not.toBe(r.text);
		expect(chords.text).not.toMatch(/\{[A-G][b#]?\d\}/);
	});
});

describe("the package's tarball", () => {
	const cwd = new URL("../", import.meta.url);
	const check = (paths: string[]) => {
		expect(paths).toContain("package.json");
		expect(paths.filter((p) => p.includes("interbellum"))).toEqual([]);
		expect(paths.filter((p) => p.startsWith("tests/"))).toEqual([]);
	};

	test("npm pack lists nothing under tests/ and nothing of the real file", () => {
		const packed = spawnSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
			cwd,
			encoding: "utf8",
		});
		expect(packed.status).toBe(0);
		const [info] = JSON.parse(packed.stdout) as { files: { path: string }[] }[];
		check((info?.files ?? []).map((f) => f.path));
	});

	// the release packs with `bun pm pack` (release.yml, scripts/verify-package.ts)
	test("bun pm pack lists nothing under tests/ and nothing of the real file", () => {
		const packed = spawnSync("bun", ["pm", "pack", "--dry-run", "--ignore-scripts"], {
			cwd,
			encoding: "utf8",
		});
		expect(packed.status).toBe(0);
		check([...packed.stdout.matchAll(/^packed \S+ (.+)$/gm)].map((m) => m[1] as string));
	});

	test("the file, its chart and its notice sit side by side", () => {
		for (const ext of [".mid", ".chart.md", ".NOTICE.md"])
			expect(existsSync(new URL(`fixtures/${NAME}${ext}`, import.meta.url))).toBe(true);
	});
});
