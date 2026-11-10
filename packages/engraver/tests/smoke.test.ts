import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MODULE_BYTES, WASM_BYTES } from "../src/info.js";

// Needs a compiled dist/ (`bun run compile`, or CI's engraver-dist artifact): skipped without one.
const smoke = fileURLToPath(new URL("../../../scripts/smoke-engraver.mjs", import.meta.url));
const moduleFile = fileURLToPath(new URL("../dist/verovio-module.mjs", import.meta.url));
const built = existsSync(fileURLToPath(new URL("../dist/verovio-module.wasm", import.meta.url)));

test.skipIf(!built)("the built module instantiates in Node, matches info.js and engraves", () => {
	const r = JSON.parse(spawnSync("node", [smoke, moduleFile]).stdout.toString());
	expect(r).toMatchObject({
		version: expect.stringMatching(/^6\.4\.1(-|$)/),
		moduleBytes: MODULE_BYTES,
		wasmBytes: WASM_BYTES,
		digests: true,
		svg: true,
	});
});
