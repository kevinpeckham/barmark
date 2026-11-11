# Changelog

All notable changes to `@barmark/listen` are recorded here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
package uses [semantic versioning](https://semver.org/).

## [Unreleased]

### Added

- **The first release.** `@barmark/listen` is the one home of the Stem
  Shovel app's recording-to-chart math, ported (the app's arithmetic in
  the app's order, every threshold an option): a recording's features,
  the onset comb, the chartless grid and its downbeat vote, the
  alignment of a chart to a recording with its fit, placements and
  timing map, and the whole pipeline from a recording to a chart.
  - The calls: `recordingFeatures` (and `./features`), `findGrid`,
    `alignChart` and `chartFromRecording`. Each returns `Ok | Refused`
    and never throws; a refusal names its reason, says it in plain words
    and carries its numbers.
  - The options: the app's 28 constants under their own names, with the
    app's defaults (`DEFAULTS`, deep-frozen) and ranges; an unknown key
    or a value out of range is `invalid-option` (`resolveOptions`).
  - `@barmark/listen/stages`: each stage on its own, for the bench; the
    stages may change shape in a minor before 1.0.
  - Depends on `barmark` (^0.23.1) and `@barmark/sync` (^0.4.1, which
    writes `[k/8]` pickups and has `rehashTiming`), nothing else.
- **Where it differs from the app**, each asserted on its own:
  - A short pickup (`j ≥ 1`, at most `PICKUP_MAX_BAR_FRACTION` of a bar)
    becomes the pickup, starting at the first sound's beat, and the
    written bar 1 moves one bar later; a longer lead-in keeps the app's
    bar 1. Compound meters too: sync writes `[k/8]` pickups.
  - Compound-meter bar seconds follow barmark's tempo rule (6/8 at
    `tempo: 40` is 3.0 s a bar), as the app does since `1e120b2e`.
  - `startsOnBarLine: false` is new; the default is the app's.
  - `no-period` in the grid and the alignment, where the app voted on
    noise or called a silent envelope a wrong chart; `grid-truncated`
    warns where the app truncated silently.
  - `not-same-piece` refuses a new map; the app only hedged placements.
  - `alignChart` without `declared` measures the fit against the chart's
    median bar; the app passes `declared`.
  - Chord runs without `frames` count to the largest run end; the app
    passes the frame count.
  - The map's `recording.duration` is the recording's length, not the
    grid's end.
  - The pipeline refuses an unplaced grid by default; the app passes
    `onUnplaced: "declared"`, and `RecordingChart.reading` is new.
  - With `onUnplaced: "declared"`, the declared grid closes on a bar
    line exactly at the end and holds up to 2,000 bars, where the app's
    fallback keeps a zero-length bar there and caps at 1,999.
  - `Placements.tempoChanges[].bpm` is in grammar 2.1's beat, and a
    one-bar meter is not a tempo change.
  - A chart without `time:` is 4/4, as barmark reads it; the app
    substitutes the song's meter.
  - Sections are a chart's headings, then its rehearsal marks; the app's
    third source, words that name a section, stays in the app.
  - A bar line with an unreadable chord keeps its bars, the slot held as
    `?`; the app's adapter loses the line.
  - `too-long` counts the step table's `(n + 1)(m + 1)` cells, where the
    app counts `n × m`, and is checked before the render.
  - The chart's render streams in windows, bit for bit the same as a
    whole render, as the app renders.
  - `tempo-drift`: `findGrid` and `chartFromRecording` warn how far the
    comb's settled bar is from the declared one (`detail.ratio`,
    `period / declaredBar − 1`, signed, with `detail.period` and
    `detail.declaredBar`), on a placed grid and on an undecided or
    nothing-fits refusal alike. A warning with no threshold: the host
    chooses its own. The app computes the same ratio itself; no number
    changes.
- **The README says why `declared` is required**: detecting tempo and
  meter is where this pipeline fails on real recordings (Study 34), so a
  host that detects what it passes as `declared` should treat the result
  as unreviewed.
- `@barmark/listen/features`: `recordingFeatures`, `chromaFeatures`,
  `onsetFeatures` and `joinFeatures` make a recording's features record
  (`FEATURES_VERSION` 1), and `readFeatures` checks one read back from a
  cache, refusing another version (`features-version`) or a record whose
  hop or frame rate does not follow from its sample rate, whose arrays
  are not `Float32Array`s, whose arrays are not the length its duration
  gives at its rate, whose values are not finite, which lacks a key of
  its own, or which throws when read (`features-invalid`). The entry imports nothing from `barmark` or
  `@barmark/sync`.
