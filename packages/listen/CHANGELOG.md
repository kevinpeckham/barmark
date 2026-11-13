# Changelog

All notable changes to `@barmark/listen` are recorded here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
package uses [semantic versioning](https://semver.org/).

## [Unreleased]

### Added

- **`gridFromBeats` and `chartFromBeats`**: a beat tracker's beats and
  downbeats (seconds) read as a bar grid, a meter and a tempo, and then,
  with the chord runs, as a chart, its timing map and its confidence
  record, with no audio and no features. Each downbeat is snapped to its
  nearest beat; the meter is labelled from the modal count of beats in a
  bar and the tempo from the median beat interval, a third of that tempo
  in 6/8 (stem-bench Study 41); adjacent half bars are joined (Study 44);
  an unsteady reading is turned away. Beats before bar one are a pickup
  when they measure 1 beat to half a bar by the builder's own measure and
  bar one is a usual bar; otherwise they are left off with a warning.
  `declared` is optional and compared, never obeyed. A refused reading is
  a refusal with its numbers, never a silent fallback: a host calls
  `chartFromRecording` itself. `./stages` adds `snapDownbeats`,
  `beatsLabel`, `joinHalfBars` and `steadyShare`. The design is
  `docs/superpowers/specs/2026-11-12-listen-beats-design.md`.
- **Where this path differs from the app** (design §9):
  - the app returns null for no grid; listen refuses (`too-few-bars` or
    `bars-unsteady`) with the reading;
  - a pickup is written when the beats before the first downbeat measure 1
    beat to half a bar before a usual bar one; the app drops them;
  - the map's `recording.duration` is the recording's length, where the
    app passes the grid's end;
  - the grid stops at `MAX_GRID_BARS` with `grid-truncated`; the app has no
    cap;
  - input the app never sees (unsorted, non-finite, past the end, over
    200,000 beats) is `invalid-input`, not repaired;
  - downbeats are snapped on every call, where the app snaps once before
    it stores them;
  - `changes` reach the builder as given;
  - the warnings `tempo-drift` (with `fold`), `meter-differs`,
    `bars-joined` and `beats-before-bar-one` are new.
- **Three options**: `TRACKER_MIN_BARS` (4), `TRACKER_MIN_STEADY_SHARE`
  (0.4, Study 44) and `TRACKER_MIN_CLOSING_SHARE` (0.5).
- **Two refusal reasons**, `too-few-bars` and `bars-unsteady`, and
  **three warning codes**, `meter-differs`, `beats-before-bar-one` and
  `bars-joined`.
- **`tempo-drift` carries `fold` and `foldRatio` on this path**: the
  nearest of ½, 1 and 2 to the bar over the declared bar, and the drift
  left after it (Study 41: a fold is not a wrong draft). `ratio` is as in
  0.1.

### Fixed

- **A call no longer throws on options that cannot be read** (an options
  object with a getter that throws, or a Proxy that does): `resolveOptions`
  refuses as `invalid-option`, so every call that takes options refuses too.

## [0.1.1] - 2026-11-11

### Fixed

- **`alignChart`'s timing map is clamped to the recording** (Kevin's
  decision, design §6.3 and §11.3). Its first start is never before 0
  and its end never past `recording.duration`; 0.1.0 kept the re-phased
  bar lines' overshoot, as the app does (in the 0.1.0 review, 3 of 30
  self-renders started down to −2.3 ms and 21 ended 1 to 6 ms past the
  duration). Only the map is clamped: `alignment.barStarts` and the
  placements keep the re-phased values. A bar lying wholly outside the
  recording, which the clamp would leave no length (a recording cut a
  bar or more short of the chart), is dropped: the map stops short of
  the chart where the recording does, and a new warning, `bars-cut`,
  names the bars (`detail.bars`) and the edge (`detail.edge`). 0.1.0
  kept such a bar past the recording's end. `ListenWarning.detail`
  values may now be a list of numbers (`bars-cut` only). The pipeline's
  maps were already inside the recording and are unchanged.
- **Floors on the four scan steps**, refused as `invalid-option`: a step
  bounded no work by itself, and 1e-12 ran about 1e11 iterations. Each
  floor holds its scan to 100 times the default's steps:
  `COMB_PHASE_STEP_SEC` and `REPAIR_SLIDE_STEP_SEC` at least 0.0001 s;
  `COMB_COARSE_STEP_FRACTION` at least `COMB_RANGE_FRACTION / 5000`
  (10,001 coarse periods at most); `COMB_FINE_STEP_FRACTION` at least
  `COMB_COARSE_STEP_FRACTION / 1000` (2,001 fine periods at most). No
  default changes.
- **A ceiling on `REPHASE_FENCE_BEATS`**: at most 16 beats, refused as
  `invalid-option`. It had none: 2,000,000 beats took 21.6 s and 1e9
  was accepted, and a fence wider than a bar is meaningless.

## [0.1.0] - 2026-11-11

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

[Unreleased]: https://github.com/kevinpeckham/barmark/compare/listen-v0.1.1...HEAD
[0.1.1]: https://github.com/kevinpeckham/barmark/compare/listen-v0.1.0...listen-v0.1.1
[0.1.0]: https://github.com/kevinpeckham/barmark/releases/tag/listen-v0.1.0
