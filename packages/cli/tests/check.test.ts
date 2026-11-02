import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { type ChartDiagnostic, parseChart } from "barmark";
import { check } from "../src/check.js";
import { textLine } from "../src/report.js";
import { FIXTURES, folder, PEACEFUL_DREAMS, PROBLEMS, ROOT, WARNING } from "./charts.js";

const [warning, error] = parseChart(PROBLEMS).diagnostics as [ChartDiagnostic, ChartDiagnostic];

describe("barmark check", () => {
	test("a clean chart: a summary and exit 0", async () => {
		const io = folder({ "pd.chart.md": readFileSync(PEACEFUL_DREAMS, "utf8") });
		expect(await check(["pd.chart.md"], io)).toBe(0);
		expect(io.out()).toBe("1 file, 0 errors, 0 warnings\n");
	});
	test("each problem as path:line: severity: message, then the summary", async () => {
		const io = folder({ "bad.chart.md": PROBLEMS });
		expect(await check(["bad.chart.md"], io)).toBe(1);
		expect(io.out()).toBe(
			`${textLine("bad.chart.md", warning)}\n${textLine("bad.chart.md", error)}\n1 file, 1 error, 1 warning\n`,
		);
		expect(textLine("bad.chart.md", error)).toBe(
			"bad.chart.md:5: error: Q: a chord starts with a root A–G",
		);
	});
	test("warnings alone exit 0, or 1 with --strict", async () => {
		expect(await check(["w.chart.md"], folder({ "w.chart.md": WARNING }))).toBe(0);
		expect(await check(["--strict", "w.chart.md"], folder({ "w.chart.md": WARNING }))).toBe(1);
	});
	test("--format github prints workflow commands", async () => {
		const io = folder({ "bad.chart.md": PROBLEMS });
		expect(await check(["--format", "github", "bad.chart.md"], io)).toBe(1);
		expect(io.out()).toBe(
			`::warning file=bad.chart.md,line=3::${warning.message}\n::error file=bad.chart.md,line=5::${error.message}\n`,
		);
	});
	test("--format github escapes %, CR and LF in messages", async () => {
		const { githubLine } = await import("../src/report.js");
		expect(
			githubLine("a.chart.md", { line: 1, severity: "error", message: "50%\r\nx", token: "" }),
		).toBe("::error file=a.chart.md,line=1::50%25%0D%0Ax");
	});
	test("--format json prints one array", async () => {
		const io = folder({ "bad.chart.md": PROBLEMS, "ok.chart.md": "| D |\n" });
		expect(await check(["--format", "json", "."], io)).toBe(1);
		expect(JSON.parse(io.out())).toEqual([
			{
				file: "bad.chart.md",
				diagnostics: [
					{ line: 3, severity: "warning", message: warning.message },
					{ line: 5, severity: "error", message: error.message },
				],
			},
			{ file: "ok.chart.md", diagnostics: [] },
		]);
	});
	test("an unknown --format is a usage error", async () => {
		const io = folder({ "ok.chart.md": "| D |\n" });
		await expect(check(["--format", "xml", "ok.chart.md"], io)).rejects.toThrow(
			'--format must be text, github or json, not "xml"',
		);
	});
	test("an unknown flag is a usage error", async () => {
		const io = folder({ "ok.chart.md": "| D |\n" });
		await expect(check(["--strct", "ok.chart.md"], io)).rejects.toThrow("--strct");
	});
	test("the four Badverbs fixtures check clean", async () => {
		const io = folder({}, { cwd: ROOT });
		expect(await check([FIXTURES], io)).toBe(0);
		expect(io.out()).toBe("4 files, 0 errors, 0 warnings\n");
	});
	test("CRLF and a BOM report the same lines as LF", async () => {
		const lf = folder({ "bad.chart.md": PROBLEMS });
		const crlf = folder({ "bad.chart.md": `﻿${PROBLEMS.replace(/\n/g, "\r\n")}` });
		await check(["bad.chart.md"], lf);
		await check(["bad.chart.md"], crlf);
		expect(crlf.out()).toBe(lf.out());
	});
});
