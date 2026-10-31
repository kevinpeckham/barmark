import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const site = join(import.meta.dir, "..");
const out = join(site, ".vercel/output/static");

beforeAll(() => {
	const build = Bun.spawnSync(["bun", "run", "build"], {
		cwd: site,
		stdout: "pipe",
		stderr: "pipe",
	});
	if (build.exitCode !== 0) throw new Error(build.stderr.toString().slice(-2000));
}, 120_000);

describe("the site builds", () => {
	test("the home page is prerendered", () => {
		expect(readFileSync(join(out, "index.html"), "utf8")).toContain('<html lang="en"');
	});
	test("the packages come from npm at exact versions", () => {
		const pkg = JSON.parse(readFileSync(join(site, "package.json"), "utf8"));
		expect(pkg.dependencies).toEqual({ barmark: "0.2.0", "@barmark/render": "0.1.0" });
	});
	test("Edwin and its licence ship with the site", () => {
		expect(existsSync(join(out, "fonts/Edwin-Roman.otf"))).toBe(true);
		expect(existsSync(join(out, "fonts/OFL.txt"))).toBe(true);
	});
	test("UnoCSS registers Edwin through presetWebFonts", () => {
		const css = readdirSync(join(out, "_app/immutable/assets"))
			.filter((f) => f.endsWith(".css"))
			.map((f) => readFileSync(join(out, "_app/immutable/assets", f), "utf8"))
			.join("");
		expect(css).toMatch(/@font-face\{[^}]*font-family:"?barmark Edwin"?[;}]/);
	});
});
