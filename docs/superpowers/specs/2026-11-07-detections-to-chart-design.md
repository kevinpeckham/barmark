# Detections to chart, and the timing map: design

Status: direction approved by Kevin (2026-11-07), who asked for it to be
built. Everything below that his direction did not settle is marked
**Claude's call**; the questions only he can answer are at the end, each
with a recommendation. No grammar change.

## Intent

Stem Shovel (SS) hears a recording and gets times: ChordMini chord runs
in frames, bar starts from chart alignment, a key such as "F♯ minor", a
meter, a tempo, section starts in seconds. Today it turns them into a
chart by voting one chord per bar, mapping labels through a lossy table
(`chart-symbols.json`: `min6` becomes `m`, `X` becomes `N.C.`), and
handing that to an LLM, whose draft is stored without being parsed or
printed. Mid-bar changes are lost, and every time is thrown away once the
chart exists.

This design gives barmark:

1. a **deterministic builder**, `chartFromDetections`, that turns timed
   detections into a canonical barmark chart: the starting chart an LLM
   may later refine, correct on its own;
2. a **timing map**, a separate record keying each played bar of a chart
   to seconds in one recording, with beats when known;
3. a **confidence record**, keyed by played bar and slot, so a host can
   show where the detector was unsure.

## Settled by Kevin's direction

- The chart text stays the stored, canonical form. Seconds and confidence
  never enter the grammar.
- A timing map is its own record: bar starts at minimum, beats and
  downbeats when known. One chart can have several, one per recording.
- Confidence is a side record keyed by played bar (and slot).
- The builder takes a bar or beat grid, chord runs with Harte labels in
  seconds or frames, key, meter, tempo and sections; it returns
  `printChart` output with no errors, plus the timing map and confidence
  record for the chart it wrote. Mid-bar changes become slots; labels go
  through `harteToBarmark` (`N` → `N.C.`, `X` → `?`); repeated bars may
  become `%`; sections become `## Name` headings; key and meter changes
  become directives; detected key spellings go through a small exported
  helper.

## Non-goals

- Hearing anything. The builder reads detections; it runs no model and
  does no alignment (SS's DTW stays in SS).
- Changing the grammar. The grammar's own generator rule (section 8,
  "Generators": one slot per beat, `/` for a held beat, a chord crossing
  a bar line continues as `/`, then `printChart`) is what the builder
  implements.

## 1. Where it lives

Options weighed:

| Option | For | Against |
|---|---|---|
| All in `barmark` | One install for SS; no new release line | `barmark` is the grammar and its parser; seconds, frames and a JSON format with its own version have nothing to do with the grammar and would ride its release cadence |
| One new package for the timing map, the confidence record and the builder | Mirrors `@barmark/musicxml` (one outside format, both directions, in its own package); one release line; depends only on `barmark` | The map's types come with the builder's code, which a pure map reader (a player, render later) doesn't need |
| Split: map types and helpers in one package, builder in another | Cleanest dependency for map-only readers | Two new packages, two release lines, each library release followed by a CLI release and a `songs` bump (RELEASING.md 13–14), for one consumer |

**Recommendation (Claude's call): one new workspace package,
`packages/sync/`, published as `@barmark/sync`** (name: open question 1),
holding the timing map, the confidence record and the builder, with
subpath exports so a map-only reader imports `@barmark/sync/timing` and
gets no builder code. Splitting later is cheap: the subpath is already
the seam.

`barmark` itself gains four small exports, because they are about the
grammar's own values and SS needs them without the builder (Claude's
call):

- `keyFromText(text: string): Key | null`: reads what `key:` reads, plus
  detector forms: `♯`/`♭`, `maj`/`min`, any case (`F♯ minor`,
  `D major`, `Bb Maj`, `E♭ min`, `C#m`). It is the existing private
  `parseKey` in `chart/directives.ts`, widened and exported; `key:`
  itself keeps its current rules.
- `conventionalKey(key: Key): Key`: the enharmonic key with the fewest
  accidentals in its signature; a tie keeps the spelling given. SS names
  keys by pitch class (`A♭ minor`, 7 flats, becomes `G#m`, 5 sharps;
  `C♯ major` becomes `Db`; `E♭ minor` stays). Modes count their parent
  major's signature.
- `printKey(key: Key): string`: the canonical `key:` value (`F#m`,
  `A mixolydian`), today private in `print.ts`.
- `spellPitch(pitchClass: number, key: Key | null): string`: how a key
  spells a black-key pitch class: sharps in sharp keys, flats in flat
  keys, and with no key or none in its signature the table
  `transposeChart` already uses (C#, Eb, F#, Ab, Bb). `transpose.ts`
  moves onto it, so the two never disagree.

### Should the timing map be a public, standardised format?

Kevin asked. **Recommendation: yes, the timing map; not yet the
confidence record.** Reasons:

- **It will be stored.** SS will write it to a database and read it back
  across app releases; a stored JSON shape needs a version and a written
  meaning, or it drifts the way the SS chart draft did.
- **It has a second consumer in sight.** A playback cursor in
  `@barmark/render` (highlight the bar sounding now), a practice loop,
  the CLI, a DAW export: all read "which bar is at 1:32?". None needs the
  builder.
- **It is small and stable.** Bar starts and optional beats, keyed by
  `PlayedBar.index`, which the parser already defines exactly.
- **The confidence record is not.** Its numbers mean whatever one
  detector means by confidence; with one detector behind it, a standard
  would freeze a guess. It ships as a typed, versioned JSON shape marked
  experimental in the README, and is standardised when a second detector
  feeds it.

What "standardised" means here (Claude's call, scope for open question 2):

1. **A spec document**, `docs/timing-map-v1.md`, short, in the grammar's
   style: fields, meaning, validity rules, versioning.
2. **A JSON Schema** (draft 2020-12), shipped in the package as
   `@barmark/sync/timing-map-1.schema.json` and served by barmark.dev at
   `https://barmark.dev/schema/timing-map-1.json`, its `$id`.
3. **TypeScript types and a validator**, `checkTimingMap`, hand-written
   (no runtime dependency) and tested to agree with the schema.
4. **Helpers**: `barAt`, `secondsAtBar`, `beatAt`, `secondsAtBeat`
   (section 4).
5. **Versioning**: `format: "barmark-timing"`, `version: 1`. Adding an
   optional field keeps the version; anything a v1 reader would misread
   bumps it. Readers reject a version they don't know, with a diagnostic.

## 2. Input

All times are seconds from the start of the recording file, except chord
runs given in frames.

```ts
type Seconds = number;
/** A value from a detector, bare or with its confidence (0..1). */
type Detected<T> = T | { value: T; confidence?: number };

/** Bar starts; one more entry than bars, the last is where the last bar ends. */
type BarGrid = { bars: Seconds[] };
/** Every beat, the downbeats among them, and where the last bar ends. */
type BeatGrid = { beats: Seconds[]; downbeats: Seconds[]; end: Seconds };

type ChordRun = {
  /** In seconds, or in frames when the runs give `frameSec`; `end` is exclusive. */
  start: number;
  end: number;
  /** A Harte label ("A:min7", "N", "X"). */
  label?: string;
  /** Or a barmark slot symbol ("Am7", "N.C.", "{C E G}"), when the source has no Harte. */
  symbol?: string;
  confidence?: number;
};
/** SS's `ChordminiRuns` fits as is: extra fields are ignored. */
type ChordRuns = { runs: ChordRun[]; frameSec?: number };

/** SS's `SongChange` fits as is. */
type Change = {
  kind: "key" | "meter" | "tempo";
  start: Seconds;
  value: string | number;
  confidence?: number;
};

type Detections = {
  title?: string;
  grid: BarGrid | BeatGrid;
  chords: ChordRuns;
  key?: Detected<string> | null;   // "F♯ minor", "D major", "Bm"
  meter?: Detected<string>;        // "4/4", "6/8"
  /** bpm in the meter's beat; omitted: derived from the grid; null: no tempo line. */
  tempo?: Detected<number> | null;
  changes?: Change[];
  sections?: { name: string; start: Seconds; confidence?: number }[];
  /** Where a pickup before bar 1 begins, when the host knows there is one. */
  pickup?: { start: Seconds };
  recording?: { id?: string; duration?: Seconds };
};

type BuildOptions = {
  /** "beat" (default): one slot per beat; "subdivision": per eighth (simple) or per third of a beat (compound). */
  resolution?: "beat" | "subdivision";
  /** Write a repeated bar as `%` (default true). */
  simile?: boolean;
  /** Bars per line (default 4). */
  barsPerLine?: number;
};
```

`label` or `symbol`, not both; `symbol` is read with the chart parser and
taken as spelled (Claude's call: it lets SS's notes matcher, whose names
are near-barmark, use the builder too).

## 3. Output

```ts
type BuildCode =
  | "grid-unusable" | "grid-unsorted" | "downbeat-off-beat"
  | "meter-unreadable" | "meter-grid-disagree"
  | "key-unreadable" | "key-respelled" | "tempo-unreadable"
  | "run-invalid" | "run-overlap" | "label-unknown" | "no-chord-detected"
  | "outside-bars" | "pickup-ignored"
  | "section-unnamed" | "section-marks-stripped" | "section-collision"
  | "change-collision" | "change-unreadable";

type BuildDiagnostic = {
  severity: "error" | "warning" | "info";
  code: BuildCode;
  message: string;
  /** Where in the input: "chords.runs[12]", "changes[3]", "grid.bars". */
  path?: string;
  at?: Seconds;
  /** The played bar it concerns, in the chart written. */
  bar?: number;
};

type BuildResult = {
  /** `printChart` output; "" when the grid is unusable. */
  chart: string;
  /** Null exactly when `chart` is "". */
  timing: TimingMap | null;
  confidence: ConfidenceRecord | null;
  diagnostics: BuildDiagnostic[];
};

function chartFromDetections(d: Detections, o?: BuildOptions): BuildResult;
```

The builder never throws (Claude's call: the parsers' rule, applied to
JSON input). It writes chart text, prints it with `printChart`, parses
the result once, and derives the timing map and confidence record from
that parse, so both are keyed to the bars and slots a reader of the
stored chart sees.

## 4. The timing map

```ts
type TimingMap = {
  format: "barmark-timing";
  version: 1;
  /** The chart it was made for: its played-bar count, and an opaque hash the host may set. */
  chart: { bars: number; hash?: string };
  recording?: { id?: string; duration?: Seconds };
  /** How it was made: "detected", "aligned", "tapped", "tempo", or the host's word. */
  source?: string;
  /** In recording order. */
  bars: TimedBar[];
  /** Where the last entry ends. */
  end: Seconds;
};
type TimedBar = {
  /** `PlayedBar.index` of the chart. */
  bar: number;
  start: Seconds;
  /** The bar's beat onsets, when known: beats[0] === start, one per beat of the bar's meter. */
  beats?: Seconds[];
};
```

Rules (the spec document states them; `checkTimingMap` enforces them):

- Starts strictly increase; `end` is after the last start. An entry runs
  from its start to the next entry's start (or `end`).
- `bar` is 1 to `chart.bars`. Entries need not run 1, 2, 3: a bar may
  recur (an open repeat, `x ...`, plays once in `ChartParse.bars` but
  many times in a recording, so its passes map back to the same
  indices), and bars may be missing (a recording that cuts a section).
  The builder's own maps always run 1 to N. (Claude's call: the map
  describes a recording, which needn't play the chart as written.)
- `beats`, when present, increase, start at `start`, end before the next
  entry, and, checked against a chart, number `beatsOf` the bar's meter.
- Unknown fields are kept and ignored by v1 readers.

API in `@barmark/sync/timing`:

```ts
type TimingDiagnostic = { severity: "error" | "warning"; message: string; path: string };
/** Shape and rules; with a chart also bar range, beat counts and coverage ("covers bars 1–40 of 48"). */
function checkTimingMap(value: unknown, chart?: ChartParse):
  { map: TimingMap | null; diagnostics: TimingDiagnostic[] };
/** The entry sounding at `t`: its played bar and how far through it (0..1); null outside. */
function barAt(map: TimingMap, t: Seconds): { entry: number; bar: number; fraction: number } | null;
/** Where the `pass`th playing (from 1) of a played bar starts. */
function secondsAtBar(map: TimingMap, bar: number, pass?: number): Seconds | null;
/** Beat position at `t` (0-based, fractional), from `beats`, else even division by the chart's meter. */
function beatAt(map: TimingMap, t: Seconds, chart?: ChartParse): { bar: number; beat: number } | null;
function secondsAtBeat(map: TimingMap, bar: number, beat: number, chart?: ChartParse, pass?: number): Seconds | null;
```

Without `beats` and without a chart, the beat helpers return null rather
than guess a meter. A chart edit that changes the played-bar count makes
`checkTimingMap(map, parse)` report the mismatch; the host then re-aligns
or drops the map. Making a map from a chart's declared tempo
(`timingFromChart`) is a natural next helper, but not this sprint.

## 5. The confidence record

```ts
type ConfidenceRecord = {
  format: "barmark-confidence";
  version: 1;
  /** One per played bar, in order; `slots` lines up with that bar's `PlayedBar.slots`. */
  bars: { bar: number; confidence: number; slots: number[] }[];
  key?: number; meter?: number; tempo?: number;
  sections?: { bar: number; confidence: number }[];
};
```

A slot's confidence (Claude's call) is **agreement × detector
confidence**: the share of the slot's time covered by runs whose symbol
is the one written (a hold counts as the chord it holds), times the
duration-weighted mean of those runs' `confidence` where given (1 where
not). An uncovered `?` slot is 0. A bar's confidence is the time-weighted
mean of its slots. Because it is computed on the printed chart, a slot
the printer merged (`C / G /` → `C G`) gets the confidence of the span it
covers, and a `%` bar has its own values. `key`, `meter`, `tempo` and
section confidences are passed through from the input.

## 6. Building: the rules

### 6.1 The grid

- **Bar grid.** Bar k spans `bars[k]` to `bars[k+1]`, its beats evenly
  divided by `beatsOf(meter)`.
- **Beat grid.** Each downbeat starts a bar, up to `end`; a bar's beats
  are the grid's beats inside it. A downbeat not on a beat (beyond 10% of
  the median beat) snaps to the nearest beat, warning
  `downbeat-off-beat`. Beats before the first downbeat feed the pickup
  rule (6.4) only.
- **Meter per bar.** The input meter, then each `meter` change. With a
  beat grid and no meter, the commonest beats per bar gives `n/4`. A bar
  whose beat count differs from its meter's gets a one-bar `[n/d]`
  override (n = beats × `meter.n / beatsOf(meter)`); when most bars
  disagree, one `meter-grid-disagree` warning (Claude's calls).
- **Slots.** `resolution: "beat"` gives one slot per beat (grammar 2.1's
  beat, so 6/8 has two). `"subdivision"` splits each beat evenly into 2
  (simple) or 3 (compound). Default `"beat"` (Claude's call: detection
  boundaries jitter by tens of milliseconds, and a beat grid keeps the
  draft readable; the LLM or a person adds pushes).
- **Unusable grid** (fewer than two finite bar starts, or no downbeat
  before `end`): error `grid-unusable`, chart "". Non-finite starts are
  dropped; unsorted or duplicate starts are sorted and deduplicated
  (within 1 ms) with one `grid-unsorted` warning (Claude's call: a
  sorted grid is almost always what was meant, and the warning says it
  happened).

### 6.2 Runs to symbols

- Frames convert by `frameSec`. A run with non-finite times, `end <=
  start`, or neither or both of `label` and `symbol` is dropped,
  warning `run-invalid` (one per run, capped at ten, then a count).
- Labels go through `harteToBarmark` after the root is respelled for the
  key in force with `spellPitch` (ChordMini says `D#:min`; in B♭ that is
  `Ebm`, with no key `Ebm` too). The Harte intervals then spell the
  bass and any note set consistently (`D#:maj/3` in E♭ → `Eb/G`). An
  unreadable label, or a symbol with an error, becomes `?` with one
  `label-unknown` warning per distinct label (Claude's calls).
- **Overlaps**: runs are sorted by start (stable); where two overlap, the
  later-starting run wins from its start and the earlier is cut there;
  equal starts keep the longer. One `run-overlap` warning with a count
  (Claude's call: detectors emit sequences, so an overlap is a seam
  error, and the newer onset is the likelier truth).

### 6.3 Quantising to slots

1. **Vote.** Each slot takes the symbol covering most of its time. Time
   no run covers casts no vote.
2. **Ties** go to the symbol sounding at the slot's start, then to the
   earlier-starting run (Claude's call: deterministic, and it favours
   the chord already ringing).
3. **No coverage** at all gives `?` (honest: nothing was detected there,
   which is not `N.C.`), warning `no-chord-detected` per stretch of
   slots.
4. **Minimum duration** is implicit: a change shorter than half a slot
   can never win one, so the grid sets the floor (half a beat by
   default). No further smoothing; ChordMini already smooths (Claude's
   call: one rule, explainable from the chart's own grid).
5. **Holds.** A slot whose symbol equals the slot before (across bar
   lines too) is `/`, per the grammar's generator rule: a detector can't
   tell a re-attack from a sustain. The same holds `N.C.` and `?` (one
   warning per unknown stretch, not per beat). One exception (Claude's
   call): the first bar of a section restates a held chord by name, as
   charts do.
6. **Simile.** With `simile` on, a bar whose slots equal the previous
   bar's, slot for slot, and whose first slot is an attack, is `%`. Not
   on a section's first bar, not next to a one-bar `[n/d]` or across a
   `time:` change (Claude's calls: `%` is only ever shorthand inside a
   passage). With the hold rule, `%` appears exactly for repeated
   multi-chord bars (`| C G | % |`); a bar holding one chord stays `/`.
7. `printChart` then reduces each cell to the fewest even slots
   (`| C / G / |` → `| C G |`).

### 6.4 Before bar 1 and after the last bar

- **Pickup.** Only when the input gives `pickup.start` (Claude's call:
  a detector's first sound is often a count-in or noise, and inventing
  bars would shift the host's numbering). Its length in beats, k, is
  rounded at bar 1's beat length; for 1 ≤ k < the bar's beats it is a
  bar with a one-bar meter of k beats (`[1/4]` in 4/4, `[3/8]` in 6/8)
  on the first line, played bar 1, as the MusicXML import writes a
  pickup.
  Otherwise `pickup-ignored` (info).
- **Runs outside the bars** are cut at bar 1's start (or the pickup's)
  and at the grid's end. When chords other than `N` lose a beat or more,
  one `outside-bars` warning each side, with the seconds lost.

### 6.5 Sections and directives

- **Sections.** Each start snaps to the nearest bar start (a tie goes to
  the later bar; before bar 1 means bar 1). Names are trimmed and
  whitespace collapsed; an empty name is dropped (`section-unnamed`). A
  trailing `x N`, `x ...` or `->` would be read as a repeat or elision,
  so it is stripped with `section-marks-stripped` (the builder writes
  every bar out). Two sections on one bar: the later wins,
  `section-collision`. Bars before the first section form the grammar's
  unnamed section. Every section is written out in full; a name may
  recur.
- **Key.** `keyFromText`, then `conventionalKey` (info `key-respelled`
  when it changed). Unreadable: no `key:` line, `key-unreadable`. With no
  key given, none is written; the grammar says a converter that doesn't
  know leaves it out.
- **Tempo.** A given tempo rounds to a whole bpm (Claude's call: charts
  show whole numbers; the map holds the real timing). Omitted, it is
  60 ÷ the grid's median beat length, rounded. Outside 1–999 it is
  dropped with `tempo-unreadable`.
- **Changes** snap to the nearest bar start like sections. One whose
  value is already in force is dropped silently; two of a kind on one bar
  keep the later (`change-collision`); a change at bar 1 replaces the
  starting value. Each becomes a `key:`, `time:` or `tempo:` line before
  its bar, sharing one line when several land together.
- **Layout.** Title, then the starting directives on one line, then the
  bars, `barsPerLine` to a line. A section heading or a directive starts
  a new line; a pickup is an extra bar on the first line.

## 7. Errors and diagnostics

`chart` always parses with **no errors** (an acceptance test). It has
warnings only where the grammar requires them of what the input said:
`?` for `X`, an unknown label or an undetected stretch. Build diagnostics
are separate from chart diagnostics: they point into the input (`path`,
`at`) and the chart (`bar`), never at a line, because the host never sees
the intermediate text. `error` means a whole input was unusable (the
grid); everything else that is skipped or repaired is a `warning`, and
`info` is a spelling the builder changed.

## 8. What it deliberately does not do

- **Repeats** (`|: :|`, `x2`, endings, `D.S.`, replay headings). A
  detected repeat is a claim that two passes are the same music; a
  detector's two choruses differ by noise, and folding them would hide
  that. The played-bar index stays the recording's bar order, so the
  timing map stays trivial. `%` is the one shorthand, because it is exact
  and local. Exact same-name replays: open question 3.
- **Lyrics.** SS has no speech recognition and no syllable timing; a
  lyric row needs both.
- **Melody and note sets from notes.** Basic Pitch notes are the notes
  matcher's input, and a voice part needs rhythm the chord runs don't
  carry. A `symbol` input can still be a note set.
- **Pushes, groups, triplets, dotted rhythms.** At beat resolution a
  change just before a beat lands on it; pushes are the refiner's job.
- **Feel, swing, rit. and accel.** A tempo curve lives in the map; the
  chart says only the tempo lines the input gives.
- **Silence (`--`).** A chord detector knows only the harmony, so `N`
  is `N.C.` (grammar 2.3).
- **Several parts, chord-name choice beyond `harteToBarmark`, and
  alignment** of an existing chart to audio.

## 9. How SS adopts it

Separate work, in the SS repo, in this order; each step stands alone.

1. **Bump** barmark 0.16.0 → 0.17.0, @barmark/render 0.14.0 → 0.15.1
   (released from `fix/render-singer-scan` first) and @barmark/musicxml
   0.4.0 → 0.6.0; run SS's tests.
2. **Use `harteToBarmark`** for ChordMini labels instead of
   `chart-symbols.json` (the stored `label` makes this a re-spelling on
   read; `min6`, `hdim7`, `minmaj7` and `X` stop collapsing). Delete the
   table.
3. **Spell detected keys the barmark way**:
   `printKey(conventionalKey(keyFromText(v)))` wherever detector keys
   reach a chart or the UI, replacing hand key maps.
4. **Canonicalise the AI draft**: in `saveChartDraft`, `parseChart`, and
   store `printChart` output; a draft with errors is stored as written
   and its diagnostics shown, as the editor does today.
5. **Use render's `typesetChord`** (#151) and delete SS's
   `typesetChord.ts` and `accidentalGlyphs.ts`.
6. **Feed the builder**: `draftChart` calls `chartFromDetections` with
   `song.chordsJson`, the `Detection`, `song.changes`, `song.sections`
   and a grid (alignment bar starts when present, else the declared
   tempo's bar starts), and gives its chart to `draftChartWithAi` as the
   starting chart to refine, in place of the per-bar votes. The refiner
   is told to keep the bar count; SS checks the map against the refined
   parse and re-aligns or drops it on a mismatch.
7. **Store the timing map** (and the confidence record) beside the chart,
   one map per recording, with `chart.hash` set to the stored chart's
   hash; replace the in-memory `BarGrid`'s `secondsAtBar`/`barAt` with
   the package's; save alignment's `barStarts` as a map with
   `source: "aligned"`.

## 10. Testing and acceptance

Test first, per rule, in `packages/sync/tests/`.

- **Rules**: one test per rule of section 6 (vote, each tie-break, holds
  and their exceptions, `%` and where it is refused, pickup, outside-bar
  cuts, section snapping and stripping, each change kind, respelling)
  and per diagnostic code.
- **Round trip** (the yardstick): a test helper `runsFromChart(parse,
  {startAt, tempo})` renders a chart's played bars to Harte runs
  (`toHarte` of each slot's chord; holds extend a run) and bar starts at
  the tempo. For **generator-form** charts (written out, chords on beats,
  `/` across bar lines, ChordMini-vocabulary chords spelled for the key),
  building gives back `printChart` of the original exactly. For every
  chart in `examples/` and the grammar's own example (via `expand`), the
  built chart sounds the same pitch classes on every beat.
- **Robustness of the round trip**: run boundaries jittered by up to 20%
  of a beat, and bar lengths drifting ±3% bar to bar, give the same chart.
- **Real data**: Letter Lands and Eat All the Clocks (Kevin's songs),
  from stem-bench's `results/study19.json` (read-only): real aligned bar
  starts with per-bar ChordMini chords, made into runs. A VM-only script,
  `bun scripts/detection-fixtures.ts`, writes them as JSON (numbers and
  labels, no audio) to `packages/sync/tests/fixtures/`, as the MuseScore
  fixtures script does; CI only reads them. The expected charts are
  reviewed by hand once, then snapshotted. If the SS ChordMini port runs
  on the VM against stem-bench's `corpus-mmkk/*/mix.mp3`, its frame-level
  runs are added the same way.
- **Fuzz** (seeded generator in the test, no new dependency; 2,000
  cases): random grids (unsorted, duplicate, NaN), runs (overlapping,
  gapped, empty, frame-based, garbage labels), sections, changes,
  pickups. Each case: no throw; the chart parses with no errors; printing
  it again changes nothing; `checkTimingMap(timing, parse)` reports
  nothing; map and confidence bars number `parse.bars.length`, and each
  confidence `slots` matches its bar's slot count.
- **Schema agreement**: the JSON Schema and `checkTimingMap` accept and
  reject the same fixtures (ajv as a dev dependency of that test only).
- **Package**: added to `verify-package`/`verify-release`, CI, Swamp's
  release-check input and Fallow; its own README and CHANGELOG; the
  barmark exports get a `barmark` CHANGELOG entry. Released as
  `sync-v0.1.0`, with the barmark minor release before it.

## Open questions for Kevin

1. **The package name, and publishing now.** `@barmark/sync` says what
   the map is for (keeping a chart in sync with a recording);
   alternatives are `@barmark/timing` (the format only) and
   `@barmark/detect` (the builder only). **Recommendation:**
   `@barmark/sync`, published as 0.1.0 when built, so SS installs it
   from npm like the other packages.
2. **The timing map as a barmark standard.** Publishing it as spec v1
   with a JSON Schema at barmark.dev (section 1) makes it part of
   barmark's public promise, reviewed like the grammar. **Recommendation:**
   yes, the timing map now; the confidence record experimental until a
   second detector feeds it.
3. **Exact same-name replays.** When a detected section has the same
   name and exactly the same slots as an earlier one, the builder could
   write an empty `## Chorus` that replays it: lossless, conventional,
   and it doesn't change the played bars, so the map is unaffected.
   But editing the first chorus then edits both, which a detected draft
   may not deserve. **Recommendation:** not in v1; add it later as an
   option, off by default, once SS's refined drafts show how often
   detected sections repeat exactly.
