import { beforeAll, describe, expect, test } from "bun:test";
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exportMidi } from "@barmark/midi";
import { exportMusicXml } from "@barmark/musicxml";
import { PEACEFUL_DREAMS, ROOT } from "./charts.js";

const MIDI = join(ROOT, "packages/midi/tests/fixtures");

import { mxl } from "./mxl.js";

const PACKAGE = join(import.meta.dir, "..");
let dir = "";
let bin = "";

/** Run the compiled binary in a folder with nothing else in it. */
function barmark(...args: string[]) {
	const run = Bun.spawnSync([bin, ...args], { cwd: dir, env: { PATH: "/usr/bin:/bin" } });
	return { code: run.exitCode, out: run.stdout.toString(), err: run.stderr.toString() };
}

beforeAll(() => {
	dir = mkdtempSync(join(tmpdir(), "barmark-binary-"));
	bin = join(dir, "barmark");
	const target = `${process.platform}-${process.arch}`;
	const compile = Bun.spawnSync(["bun", "scripts/compile.ts", target, bin], { cwd: PACKAGE });
	if (compile.exitCode !== 0)
		throw new Error(compile.stderr.toString() || compile.stdout.toString());
	copyFileSync(PEACEFUL_DREAMS, join(dir, "peaceful-dreams.chart.md"));
	const exported = exportMusicXml("# Song\n\n| D |\n| G | C |\n");
	if (!exported.ok) throw new Error("export failed");
	writeFileSync(join(dir, "song.mxl"), mxl("score.musicxml", exported.xml));
	copyFileSync(join(MIDI, "lead-sheet.mid"), join(dir, "lead-sheet.mid"));
}, 60_000);

describe("the compiled binary, with no node_modules beside it", () => {
	test("--version names the workspace versions", async () => {
		const own = (await Bun.file(join(PACKAGE, "package.json")).json()) as { version: string };
		const lib = async (p: string) =>
			((await Bun.file(join(PACKAGE, "..", p, "package.json")).json()) as { version: string })
				.version;
		expect(barmark("--version").out).toBe(
			`@barmark/cli ${own.version} (barmark ${await lib("barmark")}, @barmark/render ${await lib("render")}, @barmark/musicxml ${await lib("musicxml")}, @barmark/score ${await lib("score")}, @barmark/midi ${await lib("midi")})\n`,
		);
	});
	test("check reads a chart", () => {
		expect(barmark("check", "peaceful-dreams.chart.md")).toEqual({
			code: 0,
			out: "1 file, 0 errors, 0 warnings\n",
			err: "",
		});
	});
	test("render embeds the font", () => {
		expect(barmark("render", "peaceful-dreams.chart.md").out).toContain("data:font/otf;base64,");
	});
	test("render --score engraves the score with the Verovio inside it", () => {
		const { code, out, err } = barmark(
			"render",
			"--score",
			"peaceful-dreams.chart.md",
			"--out",
			"pd.html",
		);
		expect({ code, out, err }).toEqual({ code: 0, out: "", err: "" });
		const page = readFileSync(join(dir, "pd.html"), "utf8");
		expect(page).toContain('role="img"');
		expect(page).toContain("<svg");
	});
	test("import unpacks a .mxl (deflate-raw)", () => {
		const run = barmark("import", "song.mxl");
		expect(run.code).toBe(0);
		expect(run.out).toContain("| G | C |");
	});
	test("export --midi writes the file; import reads one", () => {
		const want = exportMidi(readFileSync(PEACEFUL_DREAMS, "utf8"), { title: "peaceful-dreams" });
		if (!want.ok) throw new Error("export failed");
		const run = barmark("export", "--midi", "peaceful-dreams.chart.md", "--out", "pd.mid");
		expect(run.code).toBe(0);
		expect(new Uint8Array(readFileSync(join(dir, "pd.mid")))).toEqual(new Uint8Array(want.bytes));
		const read = barmark("import", "lead-sheet.mid");
		expect(read.code).toBe(0);
		expect(read.out).toBe(readFileSync(join(MIDI, "lead-sheet.chart.md"), "utf8"));
	});
});
