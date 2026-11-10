import { expect, test } from "bun:test";
import * as info from "@barmark/engraver/info";
import {
	ENGRAVER_CDN_INTEGRITY,
	ENGRAVER_CDN_URL,
	ENGRAVER_LAGGING,
	ENGRAVER_MODULE_BYTES,
	ENGRAVER_VEROVIO_VERSION,
	ENGRAVER_WASM_BYTES,
	ENGRAVER_WASM_INTEGRITY,
	knownSize,
	VEROVIO_CDN_INTEGRITY,
	VEROVIO_MODULE_BYTES,
	VEROVIO_VERSION,
} from "../src/verovio.js";

test("the ENGRAVER_* literals are @barmark/engraver's info.ts", () => {
	expect(ENGRAVER_CDN_URL).toBe(info.CDN_URL);
	expect(ENGRAVER_CDN_INTEGRITY).toBe(info.MODULE_INTEGRITY);
	expect(ENGRAVER_WASM_INTEGRITY).toBe(info.WASM_INTEGRITY);
	expect(ENGRAVER_MODULE_BYTES).toBe(info.MODULE_BYTES);
	expect(ENGRAVER_WASM_BYTES).toBe(info.WASM_BYTES);
	expect(ENGRAVER_VEROVIO_VERSION).toBe(info.VEROVIO_VERSION);
});

test("the lite build's Verovio is the toolkit's, or marked as lagging", () => {
	expect(ENGRAVER_VEROVIO_VERSION === VEROVIO_VERSION || ENGRAVER_LAGGING).toBe(true);
});

test("known sizes are looked up by declared digest", () => {
	expect(knownSize(VEROVIO_CDN_INTEGRITY)).toBe(VEROVIO_MODULE_BYTES);
	expect(knownSize(` ${ENGRAVER_WASM_INTEGRITY} `)).toBe(ENGRAVER_WASM_BYTES);
	expect(knownSize("sha384-unknown")).toBeUndefined();
	expect(knownSize(undefined)).toBeUndefined();
});

test("the package exports the three public constants", async () => {
	const pkg = await import("../src/index.js");
	expect(
		Object.keys(pkg)
			.filter((k) => k.startsWith("ENGRAVER_"))
			.sort(),
	).toEqual(["ENGRAVER_CDN_INTEGRITY", "ENGRAVER_CDN_URL", "ENGRAVER_WASM_INTEGRITY"]);
});
