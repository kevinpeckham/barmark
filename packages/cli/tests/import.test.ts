import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { exportMusicXml, importMusicXml } from "@barmark/musicxml";
import { COMMAND_HELP, HELP } from "../src/help.js";
import { importCommand, importLine } from "../src/import.js";
import { main } from "../src/main.js";
import { folder } from "./charts.js";
import { mxl } from "./mxl.js";

const SONG = "# Song\n\n| D |\n| G | C |\n";

const score = (text: string) => {
	const r = exportMusicXml(text);
	if (!r.ok) throw new Error("not ok");
	return r.xml;
};
const XML = score(SONG);
const NOTHING = '<?xml version="1.0"?><score-partwise version="4.0"><part-list/></score-partwise>';

describe("barmark import", () => {
	test("a .musicxml file prints the chart", async () => {
		const io = folder({ "s.musicxml": XML });
		expect(await importCommand(["s.musicxml"], io)).toBe(0);
		expect(io.out()).toContain("| G | C |");
		expect(io.err()).toBe("");
	});
	test("--out writes the file", async () => {
		const io = folder({ "s.musicxml": XML });
		expect(await importCommand(["s.musicxml", "--out", "s.chart.md"], io)).toBe(0);
		expect(io.out()).toBe("");
		expect(readFileSync(join(io.dir, "s.chart.md"), "utf8")).toContain("| G | C |");
	});
	test("a .mxl is read as bytes and unpacked", async () => {
		const io = folder({});
		writeFileSync(join(io.dir, "s.mxl"), mxl("score.musicxml", XML));
		expect(await importCommand(["s.mxl"], io)).toBe(0);
		expect(io.out()).toContain("| G | C |");
	});
	test("--part names a part", async () => {
		const io = folder({ "s.musicxml": XML });
		expect(await importCommand(["s.musicxml", "--part", "Nope"], io)).toBe(1);
		expect(io.err()).toMatch(/^s\.musicxml: error: no part named Nope/);
		expect(io.out()).toBe("");
	});
	test("an import that gives nothing exits 1 and writes no --out file", async () => {
		const io = folder({ "n.musicxml": NOTHING });
		expect(await importCommand(["n.musicxml", "--out", "n.chart.md"], io)).toBe(1);
		expect(io.err()).toContain("n.musicxml: ");
		expect(existsSync(join(io.dir, "n.chart.md"))).toBe(false);
		expect(io.out()).toBe("");
	});
	test("a broken .mxl is one line on stderr and exit 1", async () => {
		const io = folder({ "b.mxl": "not a zip at all, but long enough to look" });
		expect(await importCommand(["b.mxl"], io)).toBe(1);
		expect(io.err()).toBe("b.mxl: not a .mxl file: no zip directory (the file may be truncated)\n");
	});
	test("a missing file or a folder is a usage error, as in the other commands", async () => {
		const io = folder({ "d/x.txt": "" });
		expect(await main(["import", "gone.musicxml"], io)).toBe(2);
		expect(io.err()).toBe("barmark: cannot read gone.musicxml\n");
		const dir = folder({ "d/x.txt": "" });
		expect(await main(["import", "d"], dir)).toBe(2);
		expect(dir.err()).toBe("barmark: d is a folder\n");
	});
	test("a UTF-16LE file with a byte-order mark imports", async () => {
		const io = folder({});
		const utf16 = new Uint8Array([0xff, 0xfe, ...Buffer.from(XML, "utf16le")]);
		writeFileSync(join(io.dir, "u.musicxml"), utf16);
		expect(await importCommand(["u.musicxml"], io)).toBe(0);
		expect(io.out()).toContain("| G | C |");
	});
	test("a diagnostic is a line: file: measure N (Part): severity: message, as check prints it", () => {
		const d = { severity: "warning" as const, message: "lost it" };
		expect(importLine("f.mxl", { ...d, measure: "4", part: "Piano" })).toBe(
			"f.mxl: measure 4 (Piano): warning: lost it",
		);
		expect(importLine("f.mxl", { ...d, measure: "4" })).toBe("f.mxl: measure 4: warning: lost it");
		expect(importLine("f.mxl", { ...d, part: "Piano" })).toBe("f.mxl: (Piano): warning: lost it");
		expect(importLine("f.mxl", d)).toBe("f.mxl: warning: lost it");
		expect(importLine("f.mxl", { severity: "error", message: "not a score" })).toBe(
			"f.mxl: error: not a score",
		);
	});
	test("a message that names its measures isn't prefixed with the first again", () => {
		const d = { severity: "warning" as const, measure: "3", part: "Gtr" };
		expect(importLine("f.mxl", { ...d, message: "notes left out in measure 3" })).toBe(
			"f.mxl: (Gtr): warning: notes left out in measure 3",
		);
		expect(importLine("f.mxl", { ...d, message: "notes left out in 4 measures: 3, 5, 7, 9" })).toBe(
			"f.mxl: (Gtr): warning: notes left out in 4 measures: 3, 5, 7, 9",
		);
		expect(importLine("f.mxl", { ...d, message: "notes left out in measure 30" })).toBe(
			"f.mxl: measure 3 (Gtr): warning: notes left out in measure 30",
		);
	});
	test("control characters never reach stderr raw", () => {
		const d = {
			severity: "warning" as const,
			message: "a\u001b[31mb",
			part: "P\u009bx",
			measure: "1",
		};
		expect(importLine("f\u001b.mxl", d)).toBe(
			"f\uFFFD.mxl: measure 1 (P\uFFFDx): warning: a\uFFFD[31mb",
		);
	});
	test("warnings go to stderr and still exit 0", async () => {
		const io = folder({ "s.musicxml": XML });
		const { diagnostics } = importMusicXml(XML);
		expect(await importCommand(["s.musicxml"], io)).toBe(0);
		expect(io.err()).toBe(diagnostics.map((d) => `${importLine("s.musicxml", d)}\n`).join(""));
	});
	test("no file is a usage error", async () => {
		const io = folder({});
		expect(await main(["import"], io)).toBe(2);
		expect(io.err()).toBe("barmark: no file given\n");
	});
	test("two files are a usage error", async () => {
		const io = folder({ "a.musicxml": XML, "b.musicxml": XML });
		expect(await main(["import", "a.musicxml", "b.musicxml"], io)).toBe(2);
		expect(io.err()).toBe("barmark: import takes one file\n");
	});
	test("help lists import", async () => {
		expect(HELP).toContain("import <file>");
		const io = folder({});
		expect(await main(["import", "--help"], io)).toBe(0);
		expect(io.out()).toBe(COMMAND_HELP.import ?? "");
		expect(COMMAND_HELP.import).toContain("--part");
	});
});
