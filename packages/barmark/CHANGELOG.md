# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
While the version is 0.x, a minor release may change the grammar or the API.
Releases follow the process in [RELEASING.md](RELEASING.md).

## [Unreleased]

Rehearsal marks and words on a bar, issue #70 (grammar 2.5 and 2.6);
omissions, voicings, accents, hits and push marks (grammar 2.7, 2.8, 3
and 4.2).

### Added

- **Rehearsal marks:** `@` and a label of letters and digits, alone in a
  cell (`| @B | D | A |`), marks the bar after it. A mark is not a bar
  and takes no time; a repeat or replay plays it with its bar. Cells
  gain `kind: "rehearsal"`, and played bars `rehearsal`, the label.
- **Words on a bar:** quoted words in a cell (`| "solo" D |`,
  `| D "rit." G |`) sit before the slot they precede, or at the bar's
  end after the last. Curly quotes are accepted. They carry no musical
  meaning. Cells and played bars gain `words` (`{ text, at }`), present
  only when written.
- **Omissions:** `no3` and `no5` in a chord's parentheses leave out its
  third or fifth (`C7(no3)`, `C7(b9,no5)`). `(omit3)` and `(omit 3)`
  are accepted and print as `(no3)`; `C(no3)` prints as `C5`. Harte
  labels mark them with `*` (`C:7(*3)`).
- **Voicings:** a chord name followed by a note set gives the chord and
  its exact notes (`Cmaj7{E3 G3 B3 C4}`). Every note must be in the
  chord. Chord slots gain `voicing`, and it transposes with the chord.
- **Accents and hits:** `>D` accents a chord or note set and `^D` makes
  it a hit, short and accented. Chord slots gain `articulation`
  (`"accent"` or `"hit"`).
- **Push marks:** `<D` arrives an eighth early and `<<D` a sixteenth,
  taking the time from the slot played just before it in play order,
  so a pushed downbeat works inside repeats, replays and jumps. Chord,
  `N.C.` and `--` slots gain `push` (`"eighth"` or `"sixteenth"`).
- **Errors with line numbers** for an omission the chord can't make, a
  voicing note not in its chord, an accent on anything but a chord or
  note set, a push with nothing before it or longer than the slot it
  borrows from, a push on `/`, `%`, `?` or inside a group, and `^<D`
  (with the fix `<^D`); and for a mark that shares its cell (with
  the fix), a bad label, a mark with no bar after it, two marks on one
  bar, an unclosed quote, empty quotes and words with no bar.

### Fixed

- **A bar line dropped for an error no longer counts its directions as
  bars** in the written numbers of the bars after it.

## [0.11.0] - 2026-11-03

Endings and directions, issue #70 (grammar 5.1 and 5.2).

### Added

- **First and second endings:** an ending is a bar line of its own,
  `|1 G | G7 :|` then `|2 G | C |`, also `|1-3` and `|1,3`. Endings
  follow a `|: … :|` repeat, and each pass plays its own ending. Bar
  lines carry `ending`, the passes it plays on.
- **Directions:** `Segno`, `Coda`, `To Coda`, `Fine`, and one jump per
  chart, `D.C.` or `D.S.`, alone or `al Fine` / `al Coda`. A direction
  is a cell of its own (`kind: "direction"`), a place between bars, not
  a bar. Play order follows the jump; after it, every repeat plays
  once and takes its last ending.
- **Errors with line numbers** for endings that don't add up (a pass with
  no ending or two, a last ending that goes back) and for directions
  the jump can't use (no Segno before `D.S.`, `al Coda` with no
  `To Coda`, a mark no jump uses, a second jump).
- **`printPasses` and `printDirection`**, the canonical spellings.

### Changed

- **`|1` was reserved and is now an ending;** a chart that wrote it had an
  error before, so no valid chart changes meaning.

## [0.10.0] - 2026-11-03

Written bar numbers on played bars, issue #70. No chart changes meaning.

### Added

- **Written bar numbers** (issue #70): every played bar has `written`, its
  number as written, counting each written bar once in written order (`%`
  included, `...` not). A repeat or replay plays its bars under the numbers
  they were written with, so a host can speak a printed score's measure
  numbers. A bar line dropped for an error has `written` too, the bars its
  pipes write, so the numbers after it hold (grammar A.7).

## [0.9.0] - 2026-11-02

An optional swing amount for `feel:` (`swing 58%`), issue #66. Charts
that read before read and print the same. Implements the
[grammar v0.1 draft](https://github.com/kevinpeckham/barmark/blob/main/docs/grammar-v0.1-draft.md).

### Added

- **A swing amount** (grammar 7.1, issue #66): `feel: swing 58%`,
  `feel: shuffle 62.5%`, `feel: swing 16 55%`. The amount is where the
  swung note lands, as a percentage of its pair, from 50% to 75%
  inclusive, with the `%` required. It reaches `Directives.swingPercent`
  and each played bar's `swingPercent`; both are absent for the bare word,
  which stays the triplet feel (66.7%). `swing 66.7%` reads and prints as
  `swing`, so every chart that read before reads and prints the same.
- Errors, each on its line: an amount outside 50% to 75%, more than one
  decimal place, a missing `%` (`swing 58` suggests `swing 58%`), an amount
  on `straight` (suggests `swing` with it), and an amount with no kind.

## [0.8.0] - 2026-11-02

`(add9)` and friends inside parentheses, clearer messages for an empty
section and a rejected tone, and grammar notes from Stem Shovel's issues.
Charts that read before read the same. Implements the
[grammar v0.1 draft](https://github.com/kevinpeckham/barmark/blob/main/docs/grammar-v0.1-draft.md).

### Added

- **`(addN)` reads inside parentheses** (issue #62). `Am(add9)`,
  `C(add2)`, `C(add4)` and `C(add11)` are aliases of `Am(9)`, `C(2)`,
  `C(4)` and `C(11)`, alone or in a list (`C(b9,add11)` is `C(b9,11)`),
  and print in the canonical form. `add13` and `add#11` stay errors.
  Grammar Appendix A.5 and the decisions log.

### Changed

- **An empty section that matches nothing says how to fix it** (issue
  #63). `## Progression` with no bars and no earlier section of that name
  reported `no earlier section named "Progression" to replay`; it now
  reports `"Progression" has no bars and no earlier section has that
  name; write its bars under it, or remove the heading`. When the name is
  written out later in the chart, the message says replays use only
  earlier sections and gives that line. It is still an error: a section
  with no bars replays (grammar §6), and there is no intentionally empty
  section.
- **Grammar notes; no chart changes meaning.** §8 gains a note for
  generators: write one slot per beat (the 2.1 beat, so 6/8 has two),
  then canonicalize; a length that is not a whole number of beats needs
  an eighth-note grid or a `_` group; leave out a section with no bars
  (issue #64). §2.3: a tool that knows only the chord part writes `N.C.`
  for its rests, not `--` (issue #65). §7.1: `feel:` names a kind of
  groove, not an amount, so `swing 60%` stays an error, and the "custom
  swing ratios" open question is closed (issue #66).

### Fixed

- **A rejected tone in parentheses is named as written.** `C(add9x)`
  reported `"x" is not a tone a parenthesis can add`, and `Am(add9)`
  reported `""`, because a bare `add9` was looked for inside the group
  too; the message now quotes the tone as written (`"add9x"`).

## [0.7.0] - 2026-11-02

Print a chart you have already parsed, and conformance fixtures from real
charts. No grammar change: every chart reads as before. Implements the
[grammar v0.1 draft](https://github.com/kevinpeckham/barmark/blob/main/docs/grammar-v0.1-draft.md).

### Added

- **`printParsed(text, parsed)`**: the canonical text from a `parseChart`
  result you already have, so a caller that needs both the parse and the
  printed chart reads the text once.
- The stem-bench conformance fixtures (`tests/conformance/`): the four
  public Badverbs charts exactly as stored in Stem Shovel, with expected
  readings derived from the band's declared section starts and
  stem-bench's independently-built verified bar lists (Study 16), plus
  the grammar's trap rules as tests. A parser change that alters what a
  real chart means now fails CI before it ships.

## [0.6.0] - 2026-11-01

Transposition, and scale degrees for numeral views. No grammar change:
every chart reads as before. Implements the
[grammar v0.1 draft](https://github.com/kevinpeckham/barmark/blob/main/docs/grammar-v0.1-draft.md).

### Added

- **`transposeChart(text, { to } | { semitones })`** returns the chart in
  another key as canonical text, with diagnostics. Chord roots, slash
  basses, note sets (octaves included) and every `key:` line move, so a
  modulation moves too; text lines never change. Chords are spelled by
  their interval from the first key, so each keeps its place in the key,
  and double sharps and flats are written as the plain note. Given
  semitones, the new key takes the signature with fewer accidentals (F#
  over Gb on a tie; minor keys and modes by their own signatures); a chart
  with no `key:` spells roots from one table. Lines with errors stay as
  written, with a warning, as does a note pushed outside octaves 0–8. A
  target key for a chart with no `key:`, or a target that isn't a key, is
  an error and returns the text unchanged.
- **`degreeOf(root, key)`**: a root's scale degree above the key's tonic,
  measured against the major scale for every mode (in A minor, C is b3),
  for numeral views such as `@barmark/render`'s.

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

[Unreleased]: https://github.com/kevinpeckham/barmark/compare/barmark-v0.11.0...HEAD
[0.11.0]: https://github.com/kevinpeckham/barmark/compare/barmark-v0.10.0...barmark-v0.11.0
[0.10.0]: https://github.com/kevinpeckham/barmark/compare/barmark-v0.9.0...barmark-v0.10.0
[0.9.0]: https://github.com/kevinpeckham/barmark/compare/barmark-v0.8.0...barmark-v0.9.0
[0.8.0]: https://github.com/kevinpeckham/barmark/compare/barmark-v0.7.0...barmark-v0.8.0
[0.7.0]: https://github.com/kevinpeckham/barmark/compare/barmark-v0.6.0...barmark-v0.7.0
[0.6.0]: https://github.com/kevinpeckham/barmark/compare/barmark-v0.5.0...barmark-v0.6.0
[0.5.0]: https://github.com/kevinpeckham/barmark/compare/barmark-v0.4.0...barmark-v0.5.0
[0.4.0]: https://github.com/kevinpeckham/barmark/compare/barmark-v0.3.0...barmark-v0.4.0
[0.3.0]: https://github.com/kevinpeckham/barmark/compare/barmark-v0.2.0...barmark-v0.3.0
[0.2.0]: https://github.com/kevinpeckham/barmark/compare/v0.1.0...barmark-v0.2.0
[0.1.0]: https://github.com/kevinpeckham/barmark/compare/v0.0.3...v0.1.0
[0.0.3]: https://github.com/kevinpeckham/barmark/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/kevinpeckham/barmark/releases/tag/v0.0.2
[0.0.1]: https://www.npmjs.com/package/barmark/v/0.0.1
