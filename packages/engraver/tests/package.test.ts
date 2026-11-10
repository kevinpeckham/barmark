import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import pkg from "../package.json";

// versions.env, read as build.sh sources it: KEY=value, one per line.
const versions: Record<string, string> = Object.fromEntries(
	readFileSync(new URL("../build/versions.env", import.meta.url), "utf8")
		.split("\n")
		.filter((line) => line.includes("="))
		.map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
);
const tag = versions.VEROVIO_TAG ?? "";

test("ESM exports: the module, its wasm, the info constants and package.json", () => {
	expect(pkg.exports).toEqual({
		".": {
			types: "./dist/index.d.mts",
			import: "./dist/verovio-module.mjs",
			default: "./dist/verovio-module.mjs",
		},
		"./verovio-module.wasm": "./dist/verovio-module.wasm",
		"./info": { types: "./dist/info.d.ts", import: "./dist/info.js" },
		"./package.json": "./package.json",
	});
});
test("LGPL-3.0-only, and the description says what it is", () => {
	expect(pkg.license).toBe("LGPL-3.0-only");
	expect(pkg.description.startsWith("A modified, smaller build of Verovio for barmark")).toBe(true);
	expect(pkg.description.endsWith(`(Verovio ${tag.replace("version-", "")})`)).toBe(true);
});
test("the build never compiles: compile is separate", () => {
	expect(pkg.scripts).toEqual({
		build: "bun build/dist.ts",
		compile: "bun build/compile.ts",
		prepack: "bun build/dist.ts --require-module",
	});
});
