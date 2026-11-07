# Changelog

All notable changes to `@barmark/render` are recorded here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
package uses [semantic versioning](https://semver.org/).

## [Unreleased]

## [0.15.0] - 2026-11-07

Needs `barmark` 0.17.0.

### Added

- **Voice lines and lyrics** (barmark's grammar 4.3, 7.7): the line a part
  sings words on draws its notes as pitch names, spaced by beat, with
  each verse's syllables under them: hyphens within a word, an extender
  for a held syllable (`:/`), verses numbered when there are several. A
  lyric row on no melody draws its words in the bars it covers, spaced
  by beat, so they wrap with their bars. A screen reader hears each bar's
  words after its notes. The model's rows gain `sings`, `verses` and
  `lyrics`; `--barmark-lyrics` colours the words, and `::part(lyrics)`
  styles each verse's line. A `lyrics:` line followed by a
  bar line, which drew as a line of text, now draws its words on the
  beats.

### Changed

- A `---` break draws nothing, and a text line written with a leading `\`
  shows without the backslash.
- A part's bare line with its named lines written after it (`Vox` over
  `Vox.Mel`, barmark's amended grammar 7.6) draws in the same system, as
  the part's first row.

## [0.14.0] - 2026-11-04

Needs `barmark` 0.16.0.

### Added

- **Part lines** (barmark's grammar 7.6): a system draws a row per line a
  part writes, labelled `Pno.RH`, `Pno.LH`, in score order; a part with no
  line there keeps its tacet row, and `part: "Pno"` draws both hands. The
  label column is as wide as the widest line label. A screen reader
  hears each row as its part and line: "Piano RH". `parts` in the model
  are barmark's `DeclaredPart`, with `lines`.
- **Pedal marks** (grammar 2.9): "Ped." under a press and "✱" under a
  release, the slot marked `data-pedal`; a bar with one makes room below.
  Spoken as "pedal G" and "pedal up C".
- **Dotted figures** (grammar 2.2): a dotted group draws no tuplet number
  and puts a dot after its dotted member (`data-dotted` on the group);
  spoken "C dotted, D".

## [0.13.0] - 2026-11-04

Needs `barmark` 0.15.0.

### Added

- **A chart's credits** (barmark's grammar 7.5), as a score sets them:
  "Words and music by …" when the same people wrote both, otherwise
  "Music by …" and "Words by …", then "Arranged by …", under the title
  (`part="credits"`); several names read "A, B and C". The copyright
  lines sit small at the chart's foot (`<footer part="copyright">`).
  `ChartModel.credits` carries them and `creditsText` is exported.

## [0.12.0] - 2026-11-03

Needs `barmark` 0.14.1.

### Changed

- **Breaking:** the element's one-part attribute is now `show-part`
  (property `showPart`), not `part`. HTML keeps `part` on every element
  for `::part()` styling, so a page styling `<barmark-chart part="…">`
  got a one-part view by accident, and `el.part` could not return the
  label. `renderChart`'s option stays `part`.

### Fixed

- A system shows and speaks what its rows share once, on its first drawn
  row: the bar number, "repeat start", the ending's number and ×N. Every
  row still draws its repeat bar lines. A system whose first part's line
  has an error numbers the next row.
- Tacet rows carry `bm-tacet` in a part's own view too, and a tacet bar
  cut in a `->` replay is marked and spoken as cut.
- The "no part labelled X" warning is about the whole chart: its line is
  0, and the diagnostics list shows it without a line number.

## [0.11.0] - 2026-11-03

Needs `barmark` 0.14.0.

### Added

- **Several parts** (barmark 0.14.0, grammar 7.4): a system draws as
  stacked rows, one per declared part in score order, sharing the
  section's columns, with the part's label in the gutter and one bar
  number. A part tacet there gets an empty row marked "tacet"; a tutti
  line stays one row. The header lists the parts. The model gains
  `parts`, a `system` item (its `rows`, each a row or an error) and
  `tacet` on a bar. A tutti bar the parts play differently (`%` or a
  leading `/` after a system) is drawn as written, `%` included, with
  `simile` on its cell, rather than as one part's chords.
- **One part's view**: the `part` option and attribute draw only the
  part with that label, as a single-part chart, with "tacet" where it
  rests. An undeclared label draws the whole chart with a warning.

## [0.10.0] - 2026-11-03

### Added

- **The part** a chart names (`part: Electric Guitar 1`) leads the
  header line: "Electric Guitar 1 · G major". The model gains `part`.

## [0.9.1] - 2026-11-03

### Fixed

- **Bar numbers count the bars as written** (issue #92), each once, as a
  band counts them and as `PlayedBar.written` gives them. Before, the
  margin counted played bars, so a second ending or anything after a
  repeat or a jump numbered past the printed score. A replayed section
  now shows the numbers it was written with; the coda after a
  `D.S. al Coda`, and bars after an open repeat, are numbered instead
  of left blank. Screen readers hear the same numbers.

## [0.9.0] - 2026-11-03

### Added

- **Rehearsal marks** draw as a boxed label at the start of their bar
  (`part="mark"`), spoken "rehearsal B". Bar numbers skip them.
- **Words on a bar** draw small, above the slot they precede, or at the
  bar's end (`part="words"`), and are spoken in place: "bar 1: “solo” D,
  A".
- **Accents and hits** draw `>` or `^` above the chord
  (`data-articulation`), spoken "accented D" and "D short hit".
- **Pushes** draw `‹` (an eighth) or `«` (a sixteenth) before the slot
  (`data-push`), spoken "D pushed" and "D pushed a sixteenth".
- **Omissions** are spoken "C seven no third".
- **Voicings** draw the chord's name; a screen reader hears the notes:
  "C major seven voiced E3 G3 B3 C4".

## [0.8.0] - 2026-11-03

Requires `barmark` 0.11.0.

### Changed

- **Depends on `barmark` `^0.11.0`** (was `^0.10.0`).

### Added

- **Endings:** an ending row has a bracket over its bars and a `1.`, `2.`
  or `1.–3.` label; screen readers hear "ending for pass 1".
- **Directions:** Segno and Coda as their signs, To Coda with the coda
  sign, Fine and the jumps as words. Each is spoken ("dal segno al
  coda"). Bar numbers skip them, since they are not bars.

## [0.7.3] - 2026-11-03

Requires `barmark` 0.10.0. No change to the renderer's code: a page that
installs `barmark` 0.10.0 alongside it gets one copy instead of two.

### Changed

- **Depends on `barmark` `^0.10.0`** (was `^0.9.0`, which in 0.x stops
  short of 0.10.0).

## [0.7.2] - 2026-11-02

Requires `barmark` 0.9.0, and shows its swing amount.

### Added

- **A swing amount shows with its feel** (barmark's `swingPercent`): the
  header reads "D major · swing 58%", and a mid-chart change "Feel shuffle
  58%". A later header `feel:` without an amount drops the earlier one.

## [0.7.1] - 2026-11-02

Requires `barmark` 0.8.0. No change to the renderer's code: it now reads
charts with `barmark` 0.8.0's rules (`(add9)` and friends inside
parentheses, the clearer empty-section message), so a page that installs
`barmark` 0.8.0 alongside it gets one copy instead of two.

### Changed

- **Depends on `barmark` `^0.8.0`** (was `^0.7.0`, which in 0.x stops
  short of 0.8.0 and made npm install a second, older copy for the
  renderer).

## [0.7.0] - 2026-11-02

Power chords in the numerals views. Requires `barmark` 0.7.0.

### Changed

- **A power chord's 5 is raised in the numerals views:** D5 in D shows as
  1⁵ (Nashville) and I⁵ (Roman), G5(7) as 4⁵⁽⁷⁾. On the baseline the
  Nashville 5 joined the number and read as 15. Chord names are
  unchanged (D5).

## [0.6.0] - 2026-11-02

Charts that scroll instead of wrapping. barmark.dev's home page uses it.

### Added

- **`wrap: false`** (attribute `wrap="off"`, property `wrap`): a section
  wider than the chart's box keeps its rows and columns rather than
  wrapping them, and the chart overflows for its page to scroll.

## [0.5.0] - 2026-11-02

The spoken name of a chord, for other tools. barmark.dev's /try page
uses it.

### Added

- **`speakChord(record, key?)`**: the spoken name the chart gives a chord
  ("C minor seven flat five"; with a key, its degree too), for screen
  readers and other tools.

## [0.4.0] - 2026-11-01

Chords as Nashville numbers or Roman numerals, and a little air between
rows. Depends on `barmark` ^0.6.0, for `degreeOf`.

### Added

- **A numerals view**: `numerals: "nashville" | "roman"` (the `numerals`
  attribute and property on `<barmark-chart>`). Each chord shows as its
  degree in its bar's key, counted from the tonic against the major
  scale (in A minor, C is ♭3). Nashville keeps the chord's quality and
  superscript (Bm7 in D is 6m⁷, D/F♯ is 1/3); Roman shows minor and
  diminished in lower case (vi⁷, vii°, ♭VII). Bars with no key, note
  sets, N.C., `?` and `--` are unchanged. Screen readers hear the
  numeral and the chord: "bar 5: five, A seven". Uses barmark 0.6.0's
  `degreeOf`; each bar in the model now carries its `key`.

### Changed

- **A small gap between rows** (0.35em), so the bar lines of one row no
  longer run into the next.

### Changed

- A little space (0.35 of the chord size) between consecutive bar rows,
  and between bars that wrap onto another line on a narrow screen, so
  one row's bar lines no longer run into the next row's.

## [0.3.0] - 2026-11-01

Draws gradual tempo changes. Depends on `barmark` ^0.5.0, which reads
them.

### Added

- Gradual tempo changes. A `tempo: rit. to 90` line reads
  "→ Tempo rit. to ♩ = 90" (`a tempo` reads as itself), and every bar
  played inside a rit. or accel. has a dashed line along its top, in
  the directive colour, with `data-tempo-change="rit"` or `"accel"`.
  Uses barmark 0.5.0's `tempoChange`.

## [0.2.1] - 2026-11-01

Two fixes found while moving barmark.dev to the element. Depends on
`barmark` ^0.3.0, which warns when a chart has no bar lines.

### Fixed

- **Triplet brackets work on any paper.** The bracket is drawn either
  side of its number, leaving a gap, instead of under it with the number
  painted over in the paper colour. A see-through `--barmark-paper` used
  to show the number in a box.
- **A chart from `renderChart` keeps its options when the element
  loads.** The `<barmark-chart>` it wraps the chart in now carries them as
  attributes (`theme`, `bar-numbers="off"`, `rehearsal-letters`). Before,
  a page that rendered a dark chart on the server and imported
  `@barmark/render/element` saw it switch to the system theme, and lose
  its rehearsal letters once given new `text`.

## [0.2.0] - 2026-11-01

Easier to read, and the bar numbers easier to scan. Every size below was
chosen on barmark.dev. The chart looks different, so check pages that
style it. Requires `barmark` 0.2.0 or later.

### Changed

- **Chords are 16px by default** (`--barmark-size` was `1.25rem`, now `1rem`),
  and no label is under 12px: the meta line, headings, bar numbers, lyrics,
  repeat counts, triplet marks and diagnostics are all larger in proportion.
- **Bar numbers sit flush left** in a fixed gutter, on their row's chord
  baseline. Section headings, lyrics, note lines and mid-chart changes
  start at the first bar line, so a `3/4` never sits among the numbers.
- **Chords start at the left** of their share of the bar instead of centred,
  and no bar is narrower than a bar holding D7sus4.
- **A change written mid-chart names itself** and marks where it takes
  effect: "→ Time 3/4 · Tempo ♩ = 120", with a rule, not a lone "3/4".
- **`###` note lines are italic** at weight 400 (Edwin has no bold, so 600 was
  faked), and lyrics and note lines use Georgia, which has a true italic.
- **A single ringed note** has room inside its ring and sits on the chord
  baseline (it was 1px low).

### Added

- **A `text` property on `<barmark-chart>`** for live editing: set it and the
  chart redraws, batched with attribute changes. While it is a string it
  wins over `src` (no fetch) and the script child; `null` returns to them.
  Text set before the element is defined is kept.
- **`--barmark-text-font` and `--barmark-label-font`**: the fonts for lyrics
  and note lines, and for the meta line, mid-chart changes, headings and
  diagnostics.
- **`--barmark-directive` and `--barmark-note`**: the colours of mid-chart
  changes and of note lines.

## [0.1.0] - 2026-10-31

The first release: barmark charts as an evenly spaced bar grid, as HTML
that needs no script or as the `<barmark-chart>` web component. Requires
`barmark` 0.2.0 or later.

### Added

- **`layoutChart(text)`**: the chart as data to draw. Bar lines become rows
  with their play-order bar numbers (numbering stops after an open repeat),
  `%` becomes the bar it copies, and text lines, directives and lines with
  errors keep their place.
- **Replays are drawn in full** with their own bar numbers. A replay's own
  text lines (verse 2's words) replace the written section's in order;
  `->` marks the bar the parser cut. Optional rehearsal letters (A, B, …,
  AA) mark each section occurrence in play order.
- **`renderChart(text, options)`** returns the chart as a `<barmark-chart>`
  element holding a declarative shadow root, and `renderChartUnwrapped`
  the bare markup (`bm-` classes) for pages that bring the stylesheet.
  Options: `theme`, `barNumbers`, `rehearsalLetters`, `diagnostics`. All
  chart text is escaped.
- **Chords in canonical form,** with ♯ and ♭ glyphs and the extension as a
  superscript; single notes ringed; note sets in braces with the root
  underlined; groups under a tuplet count; fermatas, one-bar meters, N.C.,
  silence and `?` each drawn distinctly.
- **Spoken names:** every bar reads to a screen reader as music ("bar 9: A
  seven sus four, hold"), with sections labelled by their headings and
  repeats spoken ("play 2 times").
- **Styles, light and dark.** The chart follows the system's colour scheme
  (`theme: "auto"`), or is forced `light` or `dark`; printing is always
  light, and Windows High Contrast keeps bar lines and marks visible. Both
  palettes meet WCAG AA contrast. Everything is sized in em from
  `--barmark-size`, and a section too wide for its container wraps its
  rows rather than scrolling sideways. Pages restyle the chart through
  `--barmark-font`, `--barmark-size`, `--barmark-ink`, `--barmark-paper`,
  `--barmark-muted`, `--barmark-rule` and `--barmark-accent`, or
  `::part()`.
- **Edwin ships with the package,** unmodified, with its OFL licence
  (`@barmark/render/fonts/Edwin-Roman.otf`). Pass `fontUrl` to emit its
  `@font-face` rule before the chart, or call `fontFaceCss(url)` once per
  page. The family is registered as "barmark Edwin"; without it the chart
  falls back to Georgia or another serif.
- **`<barmark-chart>`** (`import "@barmark/render/element"`): renders a
  chart from its `src` URL or a child `<script type="text/barmark">`, and
  again when either changes. Attributes (and matching properties):
  `theme`, `bar-numbers="off"`, `rehearsal-letters`. It registers the font
  itself, reuses a server-rendered shadow root (which still follows
  `theme` and `bar-numbers`), fetches a `src` once, renders once per batch
  of changes, and shows a failed load as an error inside the chart.

### Technical

- **Browser tests** (Playwright, Chromium) in CI: the chart looks pixel
  for pixel the same on a page with hostile CSS, themes follow the system
  and the page's custom properties, long rows wrap on a phone and at 400%
  zoom without sideways scrolling, the element renders and re-renders, and
  a screen reader hears "bar 9: D". Run them with `bun run test:browser`.

[Unreleased]: https://github.com/kevinpeckham/barmark/compare/render-v0.15.0...HEAD
[0.15.0]: https://github.com/kevinpeckham/barmark/compare/render-v0.14.0...render-v0.15.0
[0.14.0]: https://github.com/kevinpeckham/barmark/compare/render-v0.13.0...render-v0.14.0
[0.13.0]: https://github.com/kevinpeckham/barmark/compare/render-v0.12.0...render-v0.13.0
[0.12.0]: https://github.com/kevinpeckham/barmark/compare/render-v0.11.0...render-v0.12.0
[0.11.0]: https://github.com/kevinpeckham/barmark/compare/render-v0.10.0...render-v0.11.0
[0.10.0]: https://github.com/kevinpeckham/barmark/compare/render-v0.9.1...render-v0.10.0
[0.9.1]: https://github.com/kevinpeckham/barmark/compare/render-v0.9.0...render-v0.9.1
[0.9.0]: https://github.com/kevinpeckham/barmark/compare/render-v0.8.0...render-v0.9.0
[0.8.0]: https://github.com/kevinpeckham/barmark/compare/render-v0.7.3...render-v0.8.0
[0.7.3]: https://github.com/kevinpeckham/barmark/compare/render-v0.7.2...render-v0.7.3
[0.7.2]: https://github.com/kevinpeckham/barmark/compare/render-v0.7.1...render-v0.7.2
[0.7.1]: https://github.com/kevinpeckham/barmark/compare/render-v0.7.0...render-v0.7.1
[0.7.0]: https://github.com/kevinpeckham/barmark/compare/render-v0.6.0...render-v0.7.0
[0.6.0]: https://github.com/kevinpeckham/barmark/compare/render-v0.5.0...render-v0.6.0
[0.5.0]: https://github.com/kevinpeckham/barmark/compare/render-v0.4.0...render-v0.5.0
[0.4.0]: https://github.com/kevinpeckham/barmark/compare/render-v0.3.0...render-v0.4.0
[0.3.0]: https://github.com/kevinpeckham/barmark/compare/render-v0.2.1...render-v0.3.0
[0.2.1]: https://github.com/kevinpeckham/barmark/compare/render-v0.2.0...render-v0.2.1
[0.2.0]: https://github.com/kevinpeckham/barmark/compare/render-v0.1.0...render-v0.2.0
[0.1.0]: https://github.com/kevinpeckham/barmark/releases/tag/render-v0.1.0
