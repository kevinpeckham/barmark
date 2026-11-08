import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { importMidi } from "@barmark/midi";
import { COMMAND_HELP } from "../src/help.js";
import { importCommand, midiLine, tracksOf } from "../src/import.js";
import { main } from "../src/main.js";
import { folder, ROOT } from "./charts.js";

const MIDI = join(ROOT, "packages/midi/tests/fixtures");
const LEAD_SHEET = new Uint8Array(readFileSync(join(MIDI, "lead-sheet.mid")));
const LEAD_CHART = readFileSync(join(MIDI, "lead-sheet.chart.md"), "utf8");

/** A temp folder holding these files as bytes. */
function withFiles(files: Record<string, Uint8Array | string>) {
	const io = folder({});
	for (const [name, data] of Object.entries(files)) writeFileSync(join(io.dir, name), data);
	return io;
}

describe("barmark import of a MIDI file", () => {
	test("import reads .mid: the chart on stdout, diagnostics on stderr", async () => {
		const io = withFiles({ "lead.mid": LEAD_SHEET });
		expect(await importCommand(["lead.mid"], io)).toBe(0);
		expect(io.out()).toBe(LEAD_CHART);
		expect(io.err()).toBe(
			importMidi(LEAD_SHEET)
				.diagnostics.map((d) => `${midiLine("lead.mid", d)}\n`)
				.join(""),
		);
		expect(io.err()).toBe(
			'lead.mid: (track 1): info: single-note lines left out of the harmony: track 1 ("Voice"), channel 1\n',
		);
	});
	test("a .midi file, in any case, is read as MIDI", async () => {
		const io = withFiles({ "lead.MIDI": LEAD_SHEET });
		expect(await importCommand(["lead.MIDI"], io)).toBe(0);
		expect(io.out()).toBe(LEAD_CHART);
	});
	test("--out writes the chart", async () => {
		const io = withFiles({ "lead.mid": LEAD_SHEET });
		expect(await importCommand(["lead.mid", "--out", "lead.chart.md"], io)).toBe(0);
		expect(io.out()).toBe("");
		expect(readFileSync(join(io.dir, "lead.chart.md"), "utf8")).toBe(LEAD_CHART);
	});
	test("an error exits 1 and writes no --out file", async () => {
		const io = withFiles({ "bad.mid": "not a MIDI file at all" });
		expect(await importCommand(["bad.mid", "--out", "bad.chart.md"], io)).toBe(1);
		expect(io.err()).toMatch(/^bad\.mid: error: /);
		expect(existsSync(join(io.dir, "bad.chart.md"))).toBe(false);
		expect(io.out()).toBe("");
	});
	test("a diagnostic is a line: file: bar N (track T): severity: message", () => {
		const d = { severity: "warning" as const, code: "chord-unnamed" as const, message: "lost it" };
		expect(midiLine("f.mid", { ...d, bar: 4, track: 2 })).toBe(
			"f.mid: bar 4 (track 2): warning: lost it",
		);
		expect(midiLine("f.mid", { ...d, bar: 4 })).toBe("f.mid: bar 4: warning: lost it");
		expect(midiLine("f.mid", { ...d, track: 2 })).toBe("f.mid: (track 2): warning: lost it");
		expect(midiLine("f.mid", d)).toBe("f.mid: warning: lost it");
	});
	test("control characters never reach stderr raw", async () => {
		expect(
			midiLine("f\u001b.mid", {
				severity: "warning",
				code: "track-unknown",
				message: "a\u001b[31mb\u009b",
			}),
		).toBe("f�.mid: warning: a�[31mb�");
		const io = withFiles({ "lead.mid": LEAD_SHEET });
		expect(await importCommand(["lead.mid", "--tracks", "x\u001by"], io)).toBe(0);
		expect(io.err()).toContain('no track is "x�y"');
		expect(io.err()).not.toContain("\u001b");
	});
	test("--tracks: numbers and names, comma-separated", async () => {
		expect(tracksOf("2,piano")).toEqual([2, "piano"]);
		expect(tracksOf(" 1 , Lead Vox ")).toEqual([1, "Lead Vox"]);
		expect(tracksOf("02")).toEqual([2]);
		const io = withFiles({ "lead.mid": LEAD_SHEET });
		expect(await importCommand(["lead.mid", "--tracks", "2,piano"], io)).toBe(0);
		expect(io.err()).toContain('no track is 2 and "piano"');
		expect(io.out()).toBe(importMidi(LEAD_SHEET, { tracks: [2, "piano"] }).text);
	});
	test("--tracks with an empty entry is a usage error", async () => {
		for (const list of ["", "1,,2", "1,"]) {
			const io = withFiles({ "lead.mid": LEAD_SHEET });
			expect(await main(["import", "lead.mid", "--tracks", list], io)).toBe(2);
			expect(io.err()).toBe(
				"barmark: --tracks takes track numbers or names, separated by commas\n",
			);
		}
	});
	test("--tracks numbers start at 1", async () => {
		for (const list of ["0", "-1", "2,-1", "99999999999999999999"]) {
			const io = withFiles({ "lead.mid": LEAD_SHEET });
			expect(await main(["import", "lead.mid", "--tracks", list], io)).toBe(2);
			const bad = list.split(",").at(-1);
			expect(io.err()).toBe(
				`barmark: --tracks: "${bad}" is not a track number (they start at 1)\n`,
			);
		}
		const io = withFiles({ "lead.mid": LEAD_SHEET });
		expect(await main(["import", "lead.mid", "--tracks=-1"], io)).toBe(2);
		expect(io.err()).toBe('barmark: --tracks: "-1" is not a track number (they start at 1)\n');
	});
	test("--tracks is for MIDI and --part for MusicXML", async () => {
		const midi = withFiles({ "lead.mid": LEAD_SHEET });
		expect(await main(["import", "lead.mid", "--part", "Piano"], midi)).toBe(2);
		expect(midi.err()).toBe("barmark: --part is for MusicXML; a MIDI file takes --tracks\n");
		const xml = withFiles({ "s.musicxml": "<score-partwise/>" });
		expect(await main(["import", "s.musicxml", "--tracks", "1"], xml)).toBe(2);
		expect(xml.err()).toBe("barmark: --tracks is for MIDI; a MusicXML score takes --part\n");
	});
	test("help lists MIDI import", () => {
		expect(COMMAND_HELP.import).toContain(".mid");
		expect(COMMAND_HELP.import).toContain("--tracks");
	});
});
