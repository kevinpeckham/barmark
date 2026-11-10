import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MODULE_BYTES, VEROVIO_VERSION, WASM_BYTES } from "../src/info.js";

// Needs a compiled dist/ (`bun run compile`, or CI's engraver-dist artifact): skipped without one.
const smoke = fileURLToPath(new URL("../../../scripts/smoke-engraver.mjs", import.meta.url));
const moduleFile = fileURLToPath(new URL("../dist/verovio-module.mjs", import.meta.url));
const built = existsSync(fileURLToPath(new URL("../dist/verovio-module.wasm", import.meta.url)));
const infoFile = fileURLToPath(new URL("../dist/info.js", import.meta.url));

test.skipIf(!built)("the built module instantiates in Node, matches info.js and engraves", () => {
	// The compiled files without the TS side: never a silent skip, which is how
	// a release ran bun test before bun run build (FINDINGS 2026-11-10).
	if (!existsSync(infoFile))
		throw new Error(
			"dist/verovio-module.wasm is here but dist/info.js is not: run `bun run build` before `bun test`",
		);
	const run = spawnSync("node", [smoke, moduleFile]);
	// The whole result on a failure, so its output says why.
	expect({
		status: run.status,
		stderr: run.stderr.toString(),
		stdout: run.stdout.toString(),
	}).toMatchObject({ status: 0 });
	const r = JSON.parse(run.stdout.toString());
	expect(r).toMatchObject({
		version: expect.stringMatching(new RegExp(`^${VEROVIO_VERSION.replaceAll(".", "\\.")}(-|$)`)),
		moduleBytes: MODULE_BYTES,
		wasmBytes: WASM_BYTES,
		digests: true,
		svg: true,
	});
});
