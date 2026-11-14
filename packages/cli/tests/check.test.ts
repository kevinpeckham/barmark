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
			`::warning file=bad.chart.md,line=3::${warning.message} (write ${warning.suggestion})\n::error file=bad.chart.md,line=5::${error.message}\n`,
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
					{
						line: 3,
						severity: "warning",
						message: warning.message,
						suggestion: warning.suggestion,
					},
					{ line: 5, severity: "error", message: error.message },
				],
			},
			{ file: "ok.chart.md", diagnostics: [] },
		]);
	});
	describe("a problem's suggestion", () => {
		const SUGGESTING = "| C(b2) | Cadd9b13 |\n| D6(omit5add9) |\n";
		test("text: the line ends with (write <suggestion>), for errors and warnings", async () => {
			const io = folder({ "s.chart.md": SUGGESTING });
			expect(await check(["s.chart.md"], io)).toBe(1);
			expect(io.out()).toBe(
				[
					's.chart.md:1: error: C(b2): "b2" is not a tone a parenthesis can add (write C(b9))',
					's.chart.md:1: error: Cadd9b13: the "b" after add9 would join the root C; the items go in one parenthesis (write C(9,b13))',
					"s.chart.md:2: warning: D6(omit5add9): items in a parenthesis are separated by commas (write D6(omit5,add9))",
					"1 file, 2 errors, 1 warning",
					"",
				].join("\n"),
			);
		});
		test("github: the annotation's message carries the same sentence, escaped as data", async () => {
			const io = folder({ "s.chart.md": SUGGESTING });
			await check(["--format", "github", "s.chart.md"], io);
			expect(io.out().split("\n")[0]).toBe(
				'::error file=s.chart.md,line=1::C(b2): "b2" is not a tone a parenthesis can add (write C(b9))',
			);
			expect(io.out()).toContain("(write C(9,b13))\n::warning");
			const { githubLine } = await import("../src/report.js");
			expect(
				githubLine("a.chart.md", {
					line: 1,
					severity: "error",
					message: "50%",
					token: "",
					suggestion: "C(9%,b13)\n",
				}),
			).toBe("::error file=a.chart.md,line=1::50%25 (write C(9%25,b13)%0A)");
		});
		test("json: a suggestion field beside message, absent when there is none", async () => {
			const io = folder({ "s.chart.md": `${SUGGESTING}| Q |\n` });
			await check(["--format", "json", "s.chart.md"], io);
			const [file] = JSON.parse(io.out());
			expect(file.diagnostics[0]).toEqual({
				line: 1,
				severity: "error",
				message: 'C(b2): "b2" is not a tone a parenthesis can add',
				suggestion: "C(b9)",
			});
			expect(file.diagnostics[3]).toEqual({
				line: 3,
				severity: "error",
				message: "Q: a chord starts with a root A–G",
			});
			expect("suggestion" in file.diagnostics[3]).toBe(false);
		});
		test("a problem with no suggestion prints exactly what it printed before", async () => {
			const chart = "| Q |\n| C7(7) |\n";
			const io = folder({ "n.chart.md": chart });
			await check(["n.chart.md"], io);
			// byte for byte what the base printed for this chart
			expect(io.out()).toBe(
				"n.chart.md:1: error: Q: a chord starts with a root A–G\nn.chart.md:2: warning: C7(7) already contains 7\n1 file, 1 error, 1 warning\n",
			);
			const github = folder({ "n.chart.md": chart });
			await check(["--format", "github", "n.chart.md"], github);
			expect(github.out()).toBe(
				"::error file=n.chart.md,line=1::Q: a chord starts with a root A–G\n::warning file=n.chart.md,line=2::C7(7) already contains 7\n",
			);
		});
	});
	test("an unknown --format is a usage error", async () => {
		const io = folder({ "ok.chart.md": "| D |\n" });
		await expect(check(["--format", "xml", "ok.chart.md"], io)).rejects.toThrow(
			'--format must be text, github or json, not "xml"',
		);
	});
	test("an unknown flag is a usage error", async () => {
		const io = folder({ "ok.chart.md": "| D |\n" });
		await expect(check(["--strct", "ok.chart.md"], io)).rejects.toThrow(
			/^unknown flag "--strct"; a file name starting with - goes after --$/,
		);
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
