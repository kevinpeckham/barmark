/** The Verovio this package is pinned to (tests/download.test.ts holds these to the installed copy). */
export const VEROVIO_VERSION = "6.4.1";

/** `verovio/dist/verovio-module.mjs`'s size, decoded: what a compressed download is measured against. */
export const VEROVIO_MODULE_BYTES = 7_400_749;

/** The same module on jsDelivr (CORS `*`, immutable), for `verovio-url`. */
export const VEROVIO_CDN_URL = `https://cdn.jsdelivr.net/npm/verovio@${VEROVIO_VERSION}/dist/verovio-module.mjs`;

/** Its digest, for `verovio-integrity`. */
export const VEROVIO_CDN_INTEGRITY =
	"sha384-iGNyhtxpKLNw90cjbI9ES538TJtbNZjLxsFVUuI8PwE2TTNQ+i2j9CjQnRMhZXHk";

/**
 * `@barmark/engraver`, the smaller Verovio build, on jsDelivr: for `verovio-url`.
 * These are literals, so a site that doesn't opt in never installs the build;
 * tests/engraver.test.ts holds them to `packages/engraver/src/info.ts`.
 */
export const ENGRAVER_CDN_URL =
	"https://cdn.jsdelivr.net/npm/@barmark/engraver@0.1.1/dist/verovio-module.mjs";

/** The build's module digest, for `verovio-integrity`. */
export const ENGRAVER_CDN_INTEGRITY =
	"sha384-klTppHZB0IPzdIOfSXNr8CbdhJU+1yp5eltjmgp8W3E8uhht5dlRy1mwrBSnmKJO";

/** Its `.wasm`'s digest, for `verovio-wasm-integrity`. */
export const ENGRAVER_WASM_INTEGRITY =
	"sha384-cBBw1xx6xHEb/I7QDrSFDgImfzzvZVvwru055NG6QbY1zHI/FFLQHjlKdtH7pr5i";

/** The Verovio the build is made from. */
export const ENGRAVER_VEROVIO_VERSION = "6.4.1";

/**
 * True only while the build trails a newer stock `VEROVIO_VERSION`: score's
 * decision at a stock upgrade, so it lives here, not in the engraver's API.
 */
export const ENGRAVER_LAGGING = false;

/** The build's module and `.wasm` sizes, decoded. */
export const ENGRAVER_MODULE_BYTES = 29_534;
export const ENGRAVER_WASM_BYTES = 2_956_941;

const KNOWN_SIZES: ReadonlyMap<string, number> = new Map([
	[VEROVIO_CDN_INTEGRITY, VEROVIO_MODULE_BYTES],
	[ENGRAVER_CDN_INTEGRITY, ENGRAVER_MODULE_BYTES],
	[ENGRAVER_WASM_INTEGRITY, ENGRAVER_WASM_BYTES],
]);

/** The decoded size of a known build's file, looked up by its declared digest. */
export function knownSize(integrity: string | undefined): number | undefined {
	return integrity === undefined ? undefined : KNOWN_SIZES.get(integrity.trim());
}
