import { beforeAll, describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FIXTURES } from "./charts.js";

const PACKAGE = join(import.meta.dir, "..");
const BIN = join(PACKAGE, "dist/cli.js");
let dir = "";

/** Run the built bin with Node in the temp folder. */
function barmark(...args: string[]) {
	const run = Bun.spawnSync(["node", BIN, ...args], { cwd: dir });
	return { code: run.exitCode, out: run.stdout.toString(), err: run.stderr.toString() };
}

beforeAll(() => {
	// The workspace in dependency order: the bin imports the built libraries.
	const build = Bun.spawnSync(["bun", "run", "build"], { cwd: join(PACKAGE, "../..") });
	if (build.exitCode !== 0) throw new Error(build.stderr.toString());
	dir = mkdtempSync(join(tmpdir(), "barmark-node-"));
	for (const f of readdirSync(FIXTURES).filter((f) => f.endsWith(".chart.md")))
		cpSync(join(FIXTURES, f), join(dir, f));
}, 120_000);

describe("the built bin under Node", () => {
	test("check, format --write, format --check", () => {
		expect(barmark("check", ".").code).toBe(0);
		expect(barmark("format", "--check", ".").code).toBe(1);
		expect(barmark("format", "--write", ".").code).toBe(0);
		expect(barmark("format", "--check", ".")).toEqual({ code: 0, out: "", err: "" });
	});
	test("--version names the three packages", () => {
		expect(barmark("--version").out).toMatch(
			/^@barmark\/cli 0\.1\.0 \(barmark \d+\.\d+\.\d+, @barmark\/render \d+\.\d+\.\d+\)\n$/,
		);
	});
	test("render embeds Edwin", () => {
		const { code, out } = barmark("render", "peaceful-dreams.chart.md");
		expect(code).toBe(0);
		expect(out).toContain("data:font/otf;base64,");
	});
	test("a usage error is one line on stderr, exit 2", () => {
		expect(barmark("check", "nope.chart.md")).toEqual({
			code: 2,
			out: "",
			err: "barmark: cannot read nope.chart.md\n",
		});
	});
	test("stdin", () => {
		const run = Bun.spawnSync(["node", BIN, "format", "-"], {
			cwd: dir,
			stdin: Buffer.from("| D / A / |\n"),
		});
		expect(run.stdout.toString()).toBe("| D A |\n");
	});
	test("a reader that closes early ends it quietly, with no stack trace", () => {
		const run = Bun.spawnSync(
			[
				"sh",
				"-c",
				`node "${BIN}" render peaceful-dreams.chart.md 2>err.txt | head -c 10 >/dev/null; cat err.txt`,
			],
			{ cwd: dir },
		);
		expect(run.stdout.toString()).toBe("");
	});
});
