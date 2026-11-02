import { describe, expect, test } from "bun:test";
import { cpSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { printChart } from "barmark";
import { format } from "../src/format.js";
import { FIXTURES, folder, PROBLEMS } from "./charts.js";

/** Written loosely: printChart changes it. */
const LOOSE = "key: D\n\n## Verse\n| D / A / |\n";
const CANONICAL = printChart(LOOSE);

describe("barmark format", () => {
	test("the loose chart is not already canonical", () => {
		expect(CANONICAL).not.toBe(LOOSE);
	});
	test("one chart prints its canonical form", async () => {
		const io = folder({ "a.chart.md": LOOSE });
		expect(await format(["a.chart.md"], io)).toBe(0);
		expect(io.out()).toBe(CANONICAL);
		expect(readFileSync(join(io.dir, "a.chart.md"), "utf8")).toBe(LOOSE);
	});
	test("several charts without --write or --check is a usage error", async () => {
		const io = folder({ "a.chart.md": LOOSE, "b.chart.md": LOOSE });
		await expect(format(["a.chart.md", "b.chart.md"], io)).rejects.toThrow(
			"several charts need --write or --check",
		);
	});
	test("a folder without --write or --check is a usage error", async () => {
		const io = folder({ "songs/a.chart.md": LOOSE });
		await expect(format(["songs"], io)).rejects.toThrow("songs is a folder");
	});
	test("--write rewrites changed files and lists them", async () => {
		const io = folder({ "a.chart.md": LOOSE, "b.chart.md": CANONICAL });
		expect(await format(["--write", "."], io)).toBe(0);
		expect(io.out()).toBe("formatted a.chart.md\n");
		expect(readFileSync(join(io.dir, "a.chart.md"), "utf8")).toBe(CANONICAL);
		expect(readFileSync(join(io.dir, "b.chart.md"), "utf8")).toBe(CANONICAL);
	});
	test("--check lists files that would change and exits 1", async () => {
		const io = folder({ "a.chart.md": LOOSE, "b.chart.md": CANONICAL });
		expect(await format(["--check", "."], io)).toBe(1);
		expect(io.out()).toBe("would format a.chart.md\n");
		expect(readFileSync(join(io.dir, "a.chart.md"), "utf8")).toBe(LOOSE);
	});
	test("--check on canonical charts prints nothing and exits 0", async () => {
		const io = folder({ "b.chart.md": CANONICAL });
		expect(await format(["--check", "."], io)).toBe(0);
		expect(io.out()).toBe("");
	});
	test("--write and --check together is a usage error", async () => {
		const io = folder({ "a.chart.md": LOOSE });
		await expect(format(["--write", "--check", "a.chart.md"], io)).rejects.toThrow(
			"--write and --check can't be used together",
		);
	});
	test("stdin: - prints the canonical form", async () => {
		const io = folder({}, { stdin: LOOSE });
		expect(await format(["-"], io)).toBe(0);
		expect(io.out()).toBe(CANONICAL);
	});
	test("--write with - is a usage error", async () => {
		const io = folder({}, { stdin: LOOSE });
		await expect(format(["--write", "-"], io)).rejects.toThrow("--write can't rewrite stdin");
	});
	test("CRLF and a BOM: --write leaves printChart's output, LF and no BOM", async () => {
		const io = folder({ "a.chart.md": `﻿${LOOSE.replace(/\n/g, "\r\n")}` });
		await format(["--write", "a.chart.md"], io);
		const written = readFileSync(join(io.dir, "a.chart.md"), "utf8");
		expect(written).toBe(CANONICAL);
		expect(written).not.toContain("\r");
		expect(written.startsWith("﻿")).toBe(false);
	});
	test("a line with an error is kept and format still exits 0", async () => {
		const io = folder({ "bad.chart.md": PROBLEMS });
		expect(await format(["--write", "bad.chart.md"], io)).toBe(0);
		expect(readFileSync(join(io.dir, "bad.chart.md"), "utf8")).toContain("| Q |");
	});
	test("the Badverbs fixtures: --check names all four", async () => {
		const io = folder({});
		for (const f of readdirSync(FIXTURES).filter((f) => f.endsWith(".chart.md")))
			cpSync(join(FIXTURES, f), join(io.dir, f));
		expect(await format(["--check", "."], io)).toBe(1);
		expect(io.out().trim().split("\n")).toHaveLength(4);
	});
});
