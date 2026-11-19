import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { VERSION } from "../src/index.js";

const pkg = JSON.parse(readFileSync(join(import.meta.dir, "../package.json"), "utf8"));

test("the package depends on barmark and @barmark/fretboard, with carets", () => {
	expect(pkg.name).toBe("@barmark/lyricsheet");
	expect(pkg.dependencies).toEqual({ "@barmark/fretboard": "workspace:^", barmark: "workspace:^" });
	expect(pkg.sideEffects).toBe(false);
	expect(pkg.license).toBe("MIT");
});

test("the version is the package's", () => {
	expect(VERSION).toBe(pkg.version);
});
