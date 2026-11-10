/** The Verovio this package is pinned to (tests/download.test.ts holds these to the installed copy). */
export const VEROVIO_VERSION = "6.4.1";

/** `verovio/dist/verovio-module.mjs`'s size, decoded: what a compressed download is measured against. */
export const VEROVIO_MODULE_BYTES = 7_400_749;

/** The same module on jsDelivr (CORS `*`, immutable), for `verovio-url`. */
export const VEROVIO_CDN_URL = `https://cdn.jsdelivr.net/npm/verovio@${VEROVIO_VERSION}/dist/verovio-module.mjs`;

/** Its digest, for `verovio-integrity`. */
export const VEROVIO_CDN_INTEGRITY =
	"sha384-iGNyhtxpKLNw90cjbI9ES538TJtbNZjLxsFVUuI8PwE2TTNQ+i2j9CjQnRMhZXHk";
