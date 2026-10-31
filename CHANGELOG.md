# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
While the version is 0.x, a minor release may change the grammar or the API.
Releases follow the process in [RELEASING.md](RELEASING.md).

## [Unreleased]

## [0.1.0] - 2026-10-31

The first working release: the reference parser and printer for the
[grammar v0.1 draft](docs/grammar-v0.1-draft.md).

### Added

- **`parseChart(text)`** reads a whole `.chart.md` chart into the document as written (title, sections, directives, bar lines, text) and the bars in play order. Every bar carries its section, key, meter, tempo and feel. Section replays, `x N` and `|: :|` repeats, open repeats (`x ...`), `%` simile, `->` elision, fermatas (`...`) and one-bar meters (`[2/4]`) are all expanded. Problems come back as errors and warnings with line numbers, and the parser never throws.
- **`printChart(text)`** rewrites a chart in canonical form: standard spellings (`♯`→`#`, `X2`/`×2`→`x2`, `→`→`->`, `…`→`...`, `NC`→`N.C.`), the fewest slots per cell (`| G / D / |` → `| G D |`), and tidy directives and headings. Printing keeps the meaning (same bars, same errors) and is stable. Lines with errors, and lyrics, print exactly as written.
- **`parseChord(symbol)`** reads a chord symbol (Appendix A's vocabulary, with aliases such as `CM7`→`Cmaj7` rejected with a suggestion) into its root, intervals, spelled pitches, bass and canonical spelling.
- **`parseNoteSet("{D E! G}")`** reads a chord given by its notes, with optional octaves and a marked root.
- **Harte labels:** `toHarte` writes the Harte (2005) label for any chord or note set, and `harteToBarmark` converts a Harte label back. Every label in the McGill Billboard and Isophonics Beatles datasets converts with exactly the same notes.
- TypeScript declarations ship with the package.

### Changed

- The package is ESM only, with an `exports` map, and needs Node 20 or later. The 0.0.x placeholder's `VERSION` and throwing `parse()` are gone.

## [0.0.3] - 2026-10-31

### Changed

- **The README links the grammar v0.1 draft.**

## [0.0.2] - 2026-10-31

### Technical

- **First publish through npm trusted publishing** (OIDC, with provenance), from the GitHub release workflow.

## [0.0.1] - 2026-10-30

### Added

- **A placeholder package that holds the `barmark` name** while the spec and parser are written.

[Unreleased]: https://github.com/kevinpeckham/barmark/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/kevinpeckham/barmark/compare/v0.0.3...v0.1.0
[0.0.3]: https://github.com/kevinpeckham/barmark/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/kevinpeckham/barmark/releases/tag/v0.0.2
[0.0.1]: https://www.npmjs.com/package/barmark/v/0.0.1
