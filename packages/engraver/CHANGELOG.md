# Changelog

All notable changes to `@barmark/engraver` are recorded here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
package uses [semantic versioning](https://semver.org/).

## [Unreleased]

### Added

- **First release.** Verovio 6.4.1, built for what `@barmark/score` asks
  of it.
- **`@barmark/engraver/info`**: the build's facts as constants
  (`VEROVIO_VERSION`, `VEROVIO_COMMIT`, `MODULE_BYTES`, `WASM_BYTES`,
  `MODULE_INTEGRITY`, `WASM_INTEGRITY`, `WASM_FILE`, `CDN_URL`). Every
  build must match its sizes and sha384 digests byte for byte:
  `bun run build` and `prepack` refuse a `dist/` that does not.
- **Licence and notices.** `COPYING` and `COPYING.LESSER` (Verovio's
  texts), `NOTICE.md` (what this build changes from Verovio's npm build,
  dated), `OFL.txt` (Leipzig and Bravura) and `THIRD-PARTY.md`
  (Emscripten and the libraries Verovio vendors) are published with the
  package. The README states the build's limits: other fonts, footers,
  custom tunings and the importers left out.
