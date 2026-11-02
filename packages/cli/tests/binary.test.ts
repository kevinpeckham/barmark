import { beforeAll, describe, expect, test } from "bun:test";
import { copyFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PEACEFUL_DREAMS } from "./charts.js";

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
}, 60_000);

describe("the compiled binary, with no node_modules beside it", () => {
	test("--version names the workspace versions", async () => {
		const own = (await Bun.file(join(PACKAGE, "package.json")).json()) as { version: string };
		const lib = async (p: string) =>
			((await Bun.file(join(PACKAGE, "..", p, "package.json")).json()) as { version: string })
				.version;
		expect(barmark("--version").out).toBe(
			`@barmark/cli ${own.version} (barmark ${await lib("barmark")}, @barmark/render ${await lib("render")})\n`,
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
});
