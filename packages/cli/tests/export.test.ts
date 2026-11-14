import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { exportMidi } from "@barmark/midi";
import { exportMusicXml } from "@barmark/musicxml";
import { parseChart } from "barmark";
import { exportCommand, lossLine } from "../src/export.js";
import { COMMAND_HELP, HELP } from "../src/help.js";
import { main } from "../src/main.js";
import { textLine } from "../src/report.js";
import { folder, PROBLEMS } from "./charts.js";

const SONG =
	"# Song\npart: Gtr = Guitar\npart: Pno = Piano\n\n| D |\nGtr | G | C |\nPno | Em | C |\n";

const xml = (text: string, options = {}) => {
	const r = exportMusicXml(text, options);
	if (!r.ok) throw new Error("not ok");
	return r.xml;
};

describe("barmark export", () => {
	test("a problem prints its suggestion, as check does", async () => {
		const io = folder({ "s.chart.md": "| C(b2) |\n" });
		expect(await exportCommand(["--musicxml", "s.chart.md"], io)).toBe(1);
		expect(io.err()).toContain('"b2" is not a tone a parenthesis can add (write C(b9))\n');
	});
	test("--musicxml prints the score", async () => {
		const io = folder({ "s.chart.md": SONG });
		expect(await exportCommand(["--musicxml", "s.chart.md"], io)).toBe(0);
		expect(io.out()).toBe(xml(SONG));
	});
	test("a chart with no title is titled with its file name, less the extension", async () => {
		const io = folder({ "untitled.chart.md": "| G |\n" });
		expect(await exportCommand(["--musicxml", "untitled.chart.md"], io)).toBe(0);
		expect(io.out()).toContain("<work-title>untitled</work-title>");
	});
	test("--out writes the file", async () => {
		const io = folder({ "s.chart.md": SONG });
		expect(await exportCommand(["--musicxml", "s.chart.md", "--out", "s.musicxml"], io)).toBe(0);
		expect(io.out()).toBe("");
		expect(readFileSync(join(io.dir, "s.musicxml"), "utf8")).toBe(xml(SONG));
	});
	test("--part exports one part; an undeclared one exits 1", async () => {
		const io = folder({ "s.chart.md": SONG });
		expect(await exportCommand(["--musicxml", "s.chart.md", "--part", "Pno"], io)).toBe(0);
		expect(io.out()).toBe(xml(SONG, { part: "Pno" }));
		const bass = folder({ "s.chart.md": SONG });
		expect(await exportCommand(["--musicxml", "s.chart.md", "--part", "Bass"], bass)).toBe(1);
		expect(bass.err()).toContain("s.chart.md: no part labelled Bass");
	});
	test("an error goes to stderr and exits 1, and --out is not written", async () => {
		const io = folder({ "p.chart.md": PROBLEMS });
		expect(await exportCommand(["--musicxml", "p.chart.md", "--out", "p.musicxml"], io)).toBe(1);
		for (const d of parseChart(PROBLEMS).diagnostics)
			expect(io.err()).toContain(textLine("p.chart.md", d));
		expect(io.err()).toContain("p.musicxml not written: the chart has errors");
		expect(io.out()).toBe("");
	});
	test("export without --musicxml is a usage error", async () => {
		const io = folder({ "s.chart.md": SONG });
		expect(await main(["export", "s.chart.md"], io)).toBe(2);
		expect(io.err()).toBe("barmark: give a format: --musicxml or --midi\n");
	});
	test("help lists export", () => {
		expect(HELP).toContain("export <file>");
		expect(COMMAND_HELP.export).toContain("--musicxml");
		expect(COMMAND_HELP.export).toContain("--midi");
	});
});

const bytes = (text: string, options = {}) => {
	const r = exportMidi(text, options);
	if (!r.ok) throw new Error("not ok");
	return new Uint8Array(r.bytes);
};
const written = (io: { dir: string }, name: string) =>
	new Uint8Array(readFileSync(join(io.dir, name)));

describe("barmark export --midi", () => {
	test("export --midi writes the file", async () => {
		const io = folder({ "s.chart.md": SONG });
		expect(await exportCommand(["--midi", "s.chart.md", "--out", "s.mid"], io)).toBe(0);
		expect(io.out()).toBe("");
		expect(written(io, "s.mid")).toEqual(bytes(SONG, { title: "s" }));
	});
	test("--part passes through", async () => {
		const io = folder({ "s.chart.md": SONG });
		expect(
			await exportCommand(["--midi", "s.chart.md", "--part", "Pno", "--out", "p.mid"], io),
		).toBe(0);
		expect(written(io, "p.mid")).toEqual(bytes(SONG, { part: "Pno", title: "s" }));
		expect(written(io, "p.mid")).not.toEqual(bytes(SONG, { title: "s" }));
	});
	test("a chart with no title is titled with its file name", async () => {
		const io = folder({ "untitled.chart.md": "tempo: 90\n| G |\n" });
		expect(await exportCommand(["--midi", "untitled.chart.md", "--out", "u.mid"], io)).toBe(0);
		expect(written(io, "u.mid")).toEqual(bytes("tempo: 90\n| G |\n", { title: "untitled" }));
		expect(Buffer.from(written(io, "u.mid")).includes("untitled")).toBe(true);
	});
	test("export --midi needs --out", async () => {
		const io = folder({ "s.chart.md": SONG });
		expect(await main(["export", "--midi", "s.chart.md"], io)).toBe(2);
		expect(io.err()).toBe("barmark: --midi writes a file: give --out <file.mid>\n");
		expect(io.out()).toBe("");
	});
	test("export --midi and --musicxml together", async () => {
		const io = folder({ "s.chart.md": SONG });
		expect(await main(["export", "--midi", "--musicxml", "s.chart.md", "--out", "s.mid"], io)).toBe(
			2,
		);
		expect(io.err()).toBe("barmark: give one format: --musicxml or --midi\n");
		expect(existsSync(join(io.dir, "s.mid"))).toBe(false);
	});
	test("a chart with errors writes nothing", async () => {
		const io = folder({ "p.chart.md": PROBLEMS });
		expect(await exportCommand(["--midi", "p.chart.md", "--out", "p.mid"], io)).toBe(1);
		for (const d of parseChart(PROBLEMS).diagnostics)
			expect(io.err()).toContain(textLine("p.chart.md", d));
		expect(io.err()).toContain("p.mid not written: the chart has errors");
		expect(existsSync(join(io.dir, "p.mid"))).toBe(false);
	});
	test("losses go to stderr", async () => {
		const chart = "tempo: 100\n| C |\n| G | x ...\n";
		const io = folder({ "o.chart.md": chart });
		expect(await exportCommand(["--midi", "o.chart.md", "--out", "o.mid"], io)).toBe(0);
		expect(io.err()).toBe(
			"o.chart.md: bar 2: warning: an open repeat (x ...) plays once: MIDI can't repeat as needed\n",
		);
		expect(written(io, "o.mid")).toEqual(bytes(chart, { title: "o" }));
	});
	test("a loss in the first full bar after a pickup is bar 1", async () => {
		const chart = "tempo: 100\n| [1/4] G |\n| C | x ...\n";
		const io = folder({ "o.chart.md": chart });
		expect(await exportCommand(["--midi", "o.chart.md", "--out", "o.mid"], io)).toBe(0);
		expect(io.err()).toBe(
			"o.chart.md: bar 1: warning: an open repeat (x ...) plays once: MIDI can't repeat as needed\n",
		);
	});
	test("a loss prints its written number, not its play position", () => {
		const loss = { code: "channels-shared" as const, message: "shared" };
		expect(lossLine("f.chart.md", { ...loss, bar: 3, written: 1 })).toBe(
			"f.chart.md: bar 1: warning: shared",
		);
	});
	test("a loss is a line: file: bar N: warning: message; with no bar, without one", () => {
		const loss = { code: "channels-shared" as const, message: "shared" };
		expect(lossLine("f.chart.md", { ...loss, bar: 3 })).toBe("f.chart.md: bar 3: warning: shared");
		expect(lossLine("f.chart.md", loss)).toBe("f.chart.md: warning: shared");
	});
});
