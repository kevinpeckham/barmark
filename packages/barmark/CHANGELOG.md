# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
While the version is 0.x, a minor release may change the grammar or the API.
Releases follow the process in [RELEASING.md](RELEASING.md).

## [Unreleased]

## [0.5.0] - 2026-11-01

Charts can say where the tempo slows down or speeds up. A grammar
decision (§7.2); no chart that read before changes meaning. Implements the
[grammar v0.1 draft](https://github.com/kevinpeckham/barmark/blob/main/docs/grammar-v0.1-draft.md).

### Added

- Gradual tempo changes (grammar §7.2). `tempo:` also takes `rit.`,
  `accel.`, either one `to` a tempo (`tempo: rit. to 90`), and
  `a tempo`; `rall.`, `ritardando`, `rallentando` and `accelerando`
  read too. A change runs from the next bar to the next `tempo:` or the
  end of the chart. Each played bar inside one has `tempoChange`
  (`{ kind, from, to }`), so a host knows the beat is not steady there;
  `tempo` stays the steady tempo. The printer writes `rit.`, `accel.`
  and `a tempo`.
- Two warnings: `a tempo` with no change in force, and `rit. to` a
  tempo that isn't slower (or `accel. to` one that isn't faster).

## [0.4.0] - 2026-11-01

Charts written in Logic Pro's chord spelling read as they are. A grammar
decision (two new aliases, §3 and Appendix A.5); no chart that read
before changes meaning. Implements the
[grammar v0.1 draft](https://github.com/kevinpeckham/barmark/blob/main/docs/grammar-v0.1-draft.md).

### Added

- **Logic Pro's parentheses are read.** Groups in a row are one list
  (`C7(b9)(#11)` is `C7(b9,#11)`), and `(5)` on a bare root is the power
  chord (`F#(5)(7)` is `F#5(7)`: F♯ C♯ E). Both print in the canonical
  form. Grammar §3, Appendix A.5 and the decisions log.

## [0.3.0] - 2026-11-01

A chart in another format no longer reads as an empty one. A grammar
decision (two new warnings, §9); no chart's meaning changes. Implements the
[grammar v0.1 draft](https://github.com/kevinpeckham/barmark/blob/main/docs/grammar-v0.1-draft.md).

### Added

- **A chart with no bar lines warns.** A chart with text but no bar line
  at all warns once, at its first text line, instead of looking like an
  empty file (issue #1). Grammar §9 and its decisions log.
- **Escaped pipes warn, with the fix.** A text line such as `D \| A \| G`,
  as some editors save a bar line, warns and suggests `| D | A | G |`.

## [0.2.0] - 2026-10-31

Machine output for renderers and hosts (`form`, `parts`), the first
grammar decision since 0.1.0 (directives under a replay heading), and the
move to a workspace beside `@barmark/render`. Implements the
[grammar v0.1 draft](https://github.com/kevinpeckham/barmark/blob/main/docs/grammar-v0.1-draft.md),
with Appendix A's provisional calls now approved (no behaviour change).

### Added

- **`form` on each section occurrence:** which distinct section it plays, numbered from 0 in order of first appearance. Every replay shares its written section's number, so a host can label the form (A B A B C) or mark repeated sections in a timeline.
- **`parts` on each chord record:** the canonical root, quality, extension, sus, tones and bass the canonical spelling is built from (`null` for a note set), so renderers can typeset and speak a chord without re-reading its text.

### Changed

- **A directive under a replay heading takes effect after the replay.** A chart with `## Chorus` (a replay) followed by `key: E` used to play that Chorus in E; now the change starts at the next section, as the grammar's "written order is play order" says. Write the directive before the heading to change the replay itself.
- **Peaceful Dreams uses plain section names** (`## Verse`, not `## II Verse`): headings are the author's text, and form now comes from `form`.

### Technical

- **`main` and release tags are protected, and publishing needs approval.** Changes reach `main` through pull requests that pass CI; `v*` tags cannot be moved or deleted; the npm publish job runs in an `npm` environment that waits for approval and that npm's trusted publisher requires. After publishing, the release workflow installs the new version from npm and reads a real chart with it (`scripts/smoke.mjs`, shared with `verify:package`).
- **Dependabot** proposes monthly, grouped updates for actions and dev dependencies, with a two-week cooldown. Jobs have time limits, superseded pull-request runs are cancelled, and releases never run concurrently. `actions/checkout` is now v7.0.1 and `actions/setup-node` v7.1.0, which ends the Node 20 deprecation warnings.
- **The repository is a Bun workspace.** The package lives in `packages/barmark/` (`package.json` names the directory), beside the coming `@barmark/render`; the verify scripts, CI's package check and the Swamp `release-check` take the package to check.
- **Releases are tagged per package:** `barmark-vX.Y.Z` (and `render-vX.Y.Z` for `@barmark/render`); the release workflow publishes the package its tag names, packed with `bun pm pack`.
- **Fallow guards the code's health.** `bun run fallow` fails on dead code, duplicated code, or complexity beyond `.fallow-health-baseline.json` (the 17 functions above threshold at 0.1.0). It runs in CI (findings annotate the pull request), in the release workflow, and in the Swamp `release-check` as a fourth assertion. Three internal-only exports lost `export`, and the verify scripts share `scripts/lib.ts`.

## [0.1.0] - 2026-10-31

The first working release: the reference parser and printer for the
[grammar v0.1 draft](https://github.com/kevinpeckham/barmark/blob/main/docs/grammar-v0.1-draft.md).

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

[Unreleased]: https://github.com/kevinpeckham/barmark/compare/barmark-v0.5.0...HEAD
[0.5.0]: https://github.com/kevinpeckham/barmark/compare/barmark-v0.4.0...barmark-v0.5.0
[0.4.0]: https://github.com/kevinpeckham/barmark/compare/barmark-v0.3.0...barmark-v0.4.0
[0.3.0]: https://github.com/kevinpeckham/barmark/compare/barmark-v0.2.0...barmark-v0.3.0
[0.2.0]: https://github.com/kevinpeckham/barmark/compare/v0.1.0...barmark-v0.2.0
[0.1.0]: https://github.com/kevinpeckham/barmark/compare/v0.0.3...v0.1.0
[0.0.3]: https://github.com/kevinpeckham/barmark/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/kevinpeckham/barmark/releases/tag/v0.0.2
[0.0.1]: https://www.npmjs.com/package/barmark/v/0.0.1
