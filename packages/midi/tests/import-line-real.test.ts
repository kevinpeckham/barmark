/** A played bass line (note-line design, sections 5 and 9): `interbellum-bass-09.mid` imports as the line it is, and is never published. */
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { parseChart, printChart } from "barmark";
import { attacksOf, lineOf } from "../src/import/attacks.js";
import { notesOf } from "../src/import/notes.js";
import { createReport } from "../src/import/report.js";
import { selectedNotes } from "../src/import/streams.js";
import { importMidi } from "../src/index.js";
import { perform } from "../src/perform/index.js";
import { readSmfInto } from "../src/smf/read.js";
import { fixtureBytes, fixtureChart } from "./helpers/fixtures.js";

const NAME = "interbellum-bass-09";

/** The file's pitched notes (outside channel 10), as the import pairs a line's: the notes, and the file's ppq. */
function lineRead() {
	const report = createReport();
	const { smf, names } = readSmfInto(fixtureBytes(NAME), report);
	if (smf === null) throw new Error("no file");
	const pitched = selectedNotes(
		notesOf(smf, report, { overlaps: "keep" }),
		names,
		{},
		report,
	).pitched;
	return { pitched, line: lineOf(pitched, smf.ppq) };
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

	test("its diagnostics: a line, 22 short notes, rounded bars, nine marks dropped", () => {
		expect(r.diagnostics.map((d) => [d.severity, d.code])).toEqual([
			["info", "notes-line"],
			["info", "notes-short"],
			["warning", "rhythm-rounded"],
			["info", "marker-dropped"],
		]);
		expect(r.diagnostics[1]?.message).toBe("22 notes shorter than a 64th note left out");
		expect(r.diagnostics[2]?.message).toContain("in bars 39, 62, 63 and 64");
		expect(r.diagnostics[3]?.message).toContain("9 times");
	});

	test("its attacks: 491 notes, 22 short, 465 attacks, none joined, every pitch kept in order", () => {
		const { pitched, line } = lineRead();
		expect(line).not.toBeNull();
		if (line === null) return;
		expect(pitched).toHaveLength(491);
		expect(line.short).toBe(22);
		// 491 notes less 22 short are 469 notes, and the 32nd window groups them in 465 attacks
		expect(line.notes).toHaveLength(491 - 22);
		expect(line.attacks).toHaveLength(465);
		expect(attacksOf(line.notes, 480)).toHaveLength(465);
		// rounding put no two attacks on one point, so the chart sounds as many attack times as the line has
		// attacks and as many notes as it has notes (the 4 more notes than attacks are double stops)
		const sounded = attackTimes(r.text);
		expect(sounded.notes).toBe(469);
		expect(sounded.attacks).toHaveLength(465);
		expect(sounded.attacks.map(([, p]) => [...p].sort((a, b) => a - b))).toEqual(
			line.attacks.map((a) => a.pitches),
		);
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
		const codes = chords.diagnostics.map((d) => d.code);
		expect(codes).not.toContain("notes-line");
		expect(codes).not.toContain("rhythm-rounded");
		expect(chords.text).not.toBe(r.text);
		expect(chords.text).not.toMatch(/\{[A-G][b#]?\d\}/);
	});
});

describe("the package's tarball", () => {
	test("npm pack lists nothing under tests/ and nothing of the real file", () => {
		const packed = spawnSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
			cwd: new URL("../", import.meta.url),
			encoding: "utf8",
		});
		expect(packed.status).toBe(0);
		const [info] = JSON.parse(packed.stdout) as { files: { path: string }[] }[];
		const paths = (info?.files ?? []).map((f) => f.path);
		expect(paths).toContain("package.json");
		expect(paths.filter((p) => p.includes("interbellum"))).toEqual([]);
		expect(paths.filter((p) => p.startsWith("tests/"))).toEqual([]);
	});
});
