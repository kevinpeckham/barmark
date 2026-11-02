import { describe, expect, test } from "bun:test";
import { readCharts } from "../src/inputs.js";
import { UsageError } from "../src/io.js";
import { folder as at } from "./charts.js";

const folder = (files: Record<string, string>, stdin?: string) =>
	at(files, stdin === undefined ? {} : { stdin });

describe("readCharts", () => {
	test("a folder means every .chart.md under it, sorted", async () => {
		const io = folder({
			"b.chart.md": "| B |",
			"a.chart.md": "| A |",
			"sub/c.chart.md": "| C |",
			"notes.md": "notes",
			"node_modules/x.chart.md": "| X |",
			".git/y.chart.md": "| Y |",
		});
		const charts = await readCharts(["."], io, { folders: true });
		expect(charts.map((c) => c.path)).toEqual(["a.chart.md", "b.chart.md", "sub/c.chart.md"]);
		expect(charts[0]?.text).toBe("| A |");
	});
	test("a file named twice, or inside a named folder, is read once", async () => {
		const io = folder({ "a.chart.md": "| A |" });
		const charts = await readCharts(["a.chart.md", ".", "a.chart.md"], io, { folders: true });
		expect(charts.map((c) => c.path)).toEqual(["a.chart.md"]);
	});
	test("- reads stdin", async () => {
		const io = folder({}, "| D |");
		expect(await readCharts(["-"], io, { folders: false })).toEqual([
			{ path: "<stdin>", text: "| D |" },
		]);
	});
	test("no paths is a usage error", async () => {
		await expect(readCharts([], folder({}), { folders: true })).rejects.toThrow(
			new UsageError("no chart given"),
		);
	});
	test("a missing path is a usage error", async () => {
		await expect(readCharts(["nope.chart.md"], folder({}), { folders: true })).rejects.toThrow(
			new UsageError("cannot read nope.chart.md"),
		);
	});
	test("a folder with no charts is a usage error", async () => {
		const io = folder({ "docs/notes.md": "notes" });
		await expect(readCharts(["docs"], io, { folders: true })).rejects.toThrow(
			new UsageError("no charts found in docs"),
		);
	});
	test("a folder is a usage error when folders are not allowed", async () => {
		const io = folder({ "songs/a.chart.md": "| A |" });
		await expect(readCharts(["songs"], io, { folders: false })).rejects.toThrow(
			new UsageError("songs is a folder"),
		);
	});
	test("- twice is a usage error", async () => {
		await expect(readCharts(["-", "-"], folder({}), { folders: true })).rejects.toThrow(
			new UsageError("- (stdin) given twice"),
		);
	});
});
