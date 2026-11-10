import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readVersions, renderInfo } from "../build/facts.js";
import pkg from "../package.json";
import {
	CDN_URL,
	MODULE_BYTES,
	MODULE_INTEGRITY,
	VEROVIO_COMMIT,
	VEROVIO_VERSION,
	WASM_BYTES,
	WASM_FILE,
	WASM_INTEGRITY,
} from "../src/info.js";

// Committed state only: no build needed.
const versions = readVersions(
	readFileSync(new URL("../build/versions.env", import.meta.url), "utf8"),
);
const infoPath = fileURLToPath(new URL("../src/info.ts", import.meta.url));

test("info.ts and versions.env agree", () => {
	expect(VEROVIO_VERSION).toBe(versions.VEROVIO_TAG.replace(/^version-/, ""));
	expect(VEROVIO_COMMIT).toBe(versions.VEROVIO_COMMIT);
	expect(WASM_FILE).toBe("verovio-module.wasm");
});

test("CDN_URL names this package's version on jsDelivr", () => {
	expect(CDN_URL).toBe(
		`https://cdn.jsdelivr.net/npm/@barmark/engraver@${pkg.version}/dist/verovio-module.mjs`,
	);
});

test("info.ts is exactly what renderInfo writes for its own facts", () => {
	expect(readFileSync(infoPath, "utf8")).toBe(
		renderInfo(
			{
				moduleBytes: MODULE_BYTES,
				wasmBytes: WASM_BYTES,
				moduleIntegrity: MODULE_INTEGRITY,
				wasmIntegrity: WASM_INTEGRITY,
			},
			versions,
			pkg.version,
		),
	);
});
