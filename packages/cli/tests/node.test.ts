import { beforeAll, describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exportMidi } from "@barmark/midi";
import { FIXTURES, ROOT } from "./charts.js";

const MIDI = join(ROOT, "packages/midi/tests/fixtures");

const PACKAGE = join(import.meta.dir, "..");
const BIN = join(PACKAGE, "dist/cli.js");
let dir = "";

/** The Verovio the CLI pins exactly. */
const verovioVersion = () =>
	JSON.parse(readFileSync(join(PACKAGE, "package.json"), "utf8")).dependencies.verovio;

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
	cpSync(join(MIDI, "lead-sheet.mid"), join(dir, "lead-sheet.mid"));
}, 120_000);

describe("the built bin under Node", () => {
	test("check, format --write, format --check", () => {
		expect(barmark("check", ".").code).toBe(0);
		expect(barmark("format", "--check", ".").code).toBe(1);
		expect(barmark("format", "--write", ".").code).toBe(0);
		expect(barmark("format", "--check", ".")).toEqual({ code: 0, out: "", err: "" });
	});
	test("--version names the CLI and its libraries", () => {
		const version = (name: string) =>
			JSON.parse(readFileSync(join(PACKAGE, "..", name, "package.json"), "utf8")).version;
		expect(barmark("--version").out).toBe(
			`@barmark/cli ${version("cli")} (barmark ${version("barmark")}, @barmark/render ${version("render")}, @barmark/musicxml ${version("musicxml")}, @barmark/score ${version("score")}, @barmark/midi ${version("midi")}, verovio ${verovioVersion()})\n`,
		);
	});
	test("export --midi writes the file; import reads one", () => {
		const text = readFileSync(join(dir, "peaceful-dreams.chart.md"), "utf8");
		const want = exportMidi(text, { title: "peaceful-dreams" });
		if (!want.ok) throw new Error("export failed");
		const run = barmark("export", "--midi", "peaceful-dreams.chart.md", "--out", "pd.mid");
		expect(run.code).toBe(0);
		expect(new Uint8Array(readFileSync(join(dir, "pd.mid")))).toEqual(new Uint8Array(want.bytes));
		const read = barmark("import", "lead-sheet.mid");
		expect(read.code).toBe(0);
		expect(read.out).toBe(readFileSync(join(MIDI, "lead-sheet.chart.md"), "utf8"));
	});
	test("render embeds Edwin", () => {
		const { code, out } = barmark("render", "peaceful-dreams.chart.md");
		expect(code).toBe(0);
		expect(out).toContain("data:font/otf;base64,");
	});
	test("render --score engraves the score, and stdout is the page alone", () => {
		const { code, out, err } = barmark("render", "--score", "peaceful-dreams.chart.md");
		expect(err).toBe("");
		expect(code).toBe(0);
		expect(out.startsWith("<!doctype html>\n")).toBe(true);
		expect(out.endsWith("</html>\n")).toBe(true);
		expect(out).toContain('role="img"');
		expect(out).toContain("<svg");
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
