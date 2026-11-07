# Detections to chart, and the timing map: design

Status: direction approved by Kevin (2026-11-07), who asked for it to be
built. His three decisions are marked **Kevin's decision (2026-11-07)**;
other choices are marked **Claude's call**. A review's findings are
resolved; no open questions remain. No grammar change.

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
- The builder takes a grid, chord runs with Harte labels in seconds or
  frames, key, meter, tempo and sections; it returns `printChart` output
  with no errors, plus the timing map and confidence record for the chart
  it wrote. Mid-bar changes become slots; labels go through
  `harteToBarmark` (`N` → `N.C.`, `X` → `?`); repeated bars may become
  `%`; sections become `## Name` headings; key and meter changes become
  directives; detected key spellings go through a small exported helper.
  (v1 takes a bar grid only, 6.1.)

## Non-goals

- Hearing anything. The builder reads detections; it runs no model and
  does no alignment (SS's DTW stays in SS).
- Changing the grammar. The grammar's own generator rule (section 8,
  "Generators": one slot per beat, `/` for a held beat, a chord crossing
  a bar line continues as `/`, then `printChart`) is what the builder
  implements.
- **Re-colouring chords from notes** (power, sus, slash; Claude's
  call): the builder writes the detector's labels as converted. Study 20
  in stem-bench measured that recolouring on Kevin's recordings: 22/76
  strict on Letter Lands against a pass line of 46, roots falling.

## 1. Where it lives

Options weighed:

| Option | For | Against |
|---|---|---|
| All in `barmark` | One install for SS; no new release line | `barmark` is the grammar and its parser; seconds, frames and a JSON format with its own version have nothing to do with the grammar and would ride its release cadence |
| One new package for the timing map, the confidence record and the builder | Mirrors `@barmark/musicxml` (one outside format, both directions, in its own package); one release line; depends only on `barmark` | The map's types come with the builder's code, which a pure map reader (a player, render later) doesn't need |
| Split: map types and helpers in one package, builder in another | Cleanest dependency for map-only readers | Two new packages, two release lines, each library release followed by a CLI release and a `songs` bump (RELEASING.md 13–14), for one consumer |

**Kevin's decision (2026-11-07): one new workspace package,
`packages/sync/`, published as `@barmark/sync` 0.1.0 when it's built**,
so SS installs it from npm like the other packages. It holds the timing
map, the confidence record and the builder, with a subpath export so a
map-only reader imports `@barmark/sync/timing` and gets no builder code
(Claude's call). Splitting later is cheap: the subpath is already the
seam.

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
  spells a pitch class. A note in the key's scale takes its signature's
  spelling; any other is spelled by scale degree (`degreeOf`) as b2, b3,
  #4, b6 or b7, so bIII, bVI and bVII take flats even in sharp keys
  (`Bb` in D major); a spelling with a double accidental falls back to
  its enharmonic. With no key, the table `transposeChart` uses for a
  keyless chart (C#, Eb, F#, Ab, Bb); `transpose.ts` takes that table
  from here, so the two never disagree.

### The timing map: versioned now, a standard later

**Kevin's decision (2026-11-07): version it now, make it a standard
later.** v1 ships the `format: "barmark-timing"` and `version: 1`
fields, `checkTimingMap` (hand-written, no runtime dependency) and the
rules written in the package README. Adding an optional field keeps the
version; anything a v1 reader would misread bumps it; readers reject a
version they don't know. No reviewed spec page, JSON Schema at
barmark.dev or schema agreement tests in v1: the map is promoted to a
spec plus schema once a second reader, render's playback cursor, uses
it. The confidence record stays experimental: its numbers mean whatever
one detector means by confidence.

## 2. Input

All times are seconds from the start of the recording file, except chord
runs given in frames. Every tempo, given or derived, counts grammar 2.1's
beat: the bottom number in simple meters, the dotted quarter in compound
ones (6/8 has 2 beats a bar).

```ts
type Seconds = number;
/** A value from a detector, bare or with its confidence (0..1). */
type Detected<T> = T | { value: T; confidence?: number };

/** Bar starts; one more entry than bars, the last is where the last bar ends. */
type BarGrid = { bars: Seconds[] };
/** The seam: `BeatGrid` joins this union when SS ships a beat grid. */
type Grid = BarGrid;

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

/** SS's `SongChange` fits as is. A tempo value counts grammar 2.1's beat. */
type Change = {
  kind: "key" | "meter" | "tempo";
  start: Seconds;
  value: string | number;
  confidence?: number;
};

type Detections = {
  title?: string;
  grid: Grid;
  chords: ChordRuns;
  key?: Detected<string> | null;   // "F♯ minor", "D major", "Bm"
  meter?: Detected<string>;        // "4/4", "6/8"
  /** bpm in grammar 2.1's beat; omitted: derived from the grid; null: no tempo line. */
  tempo?: Detected<number> | null;
  changes?: Change[];
  sections?: { name: string; start: Seconds; confidence?: number }[];
  /** Where a pickup before bar 1 begins, when the host knows there is one. */
  pickup?: { start: Seconds };
  recording?: { id?: string; duration?: Seconds };
};

type BuildOptions = {
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
  | "grid-unusable" | "grid-unsorted"
  | "meter-unreadable" | "meter-assumed"
  | "key-unreadable" | "key-respelled"
  | "tempo-unreadable" | "tempo-grid-disagree"
  | "run-invalid" | "run-overlap" | "label-unknown" | "no-chord-detected"
  | "outside-bars" | "pickup-ignored"
  | "section-unnamed" | "section-marks-stripped" | "section-collision"
  | "after-last-bar" | "change-collision" | "change-unreadable";

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
  /** The chart it was made for: its played-bar count, its hash, and a reference the host may set. */
  chart: { bars: number; hash: string; ref?: string };
  recording?: { id?: string; duration?: Seconds };
  /** How it was made: "detected", "aligned", "tapped", "tempo", or the host's word. */
  source?: string;
  /** In recording order; never empty (Kevin's decision, 2026-11-07). */
  bars: TimedBar[];
  /** Where the last entry ends. */
  end: Seconds;
};
type TimedBar = {
  /** `PlayedBar.index` of the chart. */
  bar: number;
  start: Seconds;
  /** Where the bar stops sounding, when a pause or fermata follows it. */
  end?: Seconds;
  /** Onsets of the bar's grammar 2.1 beats after `start`, when known. */
  beats?: Seconds[];
};
```

`chart.hash` is FNV-1a 64 over the UTF-8 bytes of the chart's
`printChart` output, as 16 lowercase hex digits (Claude's call: bytes
and digits). The builder always sets it. `chart.ref` is opaque to
barmark, a host's revision id (Claude's call: a hash can't be looked up).

Rules (the README states them; `checkTimingMap` enforces them):

- Starts strictly increase; `end` is after the last start. An entry runs
  from its start to its own `end` when given, else to the next entry's
  start (or the map's `end`). An entry's `end` is after its start and no
  later than the next start; the gap between is a pause, and no bar
  sounds in it.
- `bar` is 1 to `chart.bars`. Entries need not run 1, 2, 3: a bar may
  recur (an open repeat, `x ...`, plays once in `ChartParse.bars` but
  many times in a recording, so its passes map back to the same
  indices), and bars may be missing (a recording that cuts a section).
  The builder's own maps always run 1 to N. (Claude's call: the map
  describes a recording, which needn't play the chart as written.)
- With a pickup, the pickup is played bar 1, so grid bar k is map bar
  k+1.
- `beats`, when present, are the onsets after `start`: they increase,
  are after `start` and before the entry ends, and, checked against a
  chart, number `beatsOf` the bar's meter minus one. No float equality is
  needed anywhere.
- Unknown fields are kept and ignored by v1 readers.

API in `@barmark/sync/timing`:

```ts
type TimingDiagnostic = { severity: "error" | "warning"; code?: "chart-hash-mismatch"; message: string; path: string };
/** Shape and rules; with the chart, also its hash, bar range, beat counts and coverage. */
function checkTimingMap(value: unknown, chart?: { text: string; parse?: ChartParse }):
  { map: TimingMap | null; diagnostics: TimingDiagnostic[] };
function chartHash(text: string, parse?: ChartParse): string;
/** The entry sounding at `t`: its played bar and how far through it (0..1); null outside. */
function barAt(map: TimingMap, t: Seconds):
  { entry: number; bar: number; fraction: number; paused?: true } | null;
/** Where the `pass`th playing (from 1) of a played bar starts. */
function secondsAtBar(map: TimingMap, bar: number, pass?: number): Seconds | null;
```

With the chart given, `checkTimingMap` hashes `printParsed(text, parse)`
and reports a `chart-hash-mismatch` error when it differs from
`chart.hash` (Claude's call: it takes the text, not just the parse,
because `printParsed` needs it). The host then re-aligns or drops the
map. Inside a pause, `barAt` returns the entry before it with fraction 1
and `paused: true`: a cursor stays on the held bar (Claude's call).

`beatAt`, `secondsAtBeat` and `timingFromChart` are deferred (Claude's
call: without `beats` they need the chart's meters, so they are not
free); a beat helper will hold the bar's last beat through a pause.

## 5. The confidence record

Experimental, by Kevin's decision 2 (section 1).

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
not). A `?` slot is 0. A bar's confidence is the time-weighted mean of
its slots. Because it is computed on the printed chart, a slot the
printer merged (`C / G /` → `C G`) gets the confidence of the span it
covers, and a `%` bar has its own values. `key`, `meter` and `tempo`
come from their `Detected<T>` wrappers, sections from theirs. SS stores
no confidences today, so for SS the record is agreement only.

## 6. Building: the rules

### 6.1 The grid

- **Bar grid only in v1.** Bar k spans `bars[k]` to `bars[k+1]`, its
  beats evenly divided by `beatsOf(meter)`. `BeatGrid`, with its
  downbeat snapping, meter inference and one-bar overrides, waits until
  SS ships a beat grid; without overrides the review's S2 (`[33/8]` is
  no time signature) is moot.
- **Meter per bar.** The input meter, then each `meter` change. With no
  meter, 4/4, with `meter-assumed` (info). Unreadable: 4/4,
  `meter-unreadable`.
- **Slots.** One per grammar 2.1 beat (6/8 has two): boundaries jitter
  by tens of milliseconds, and the refiner adds pushes.
- **Unusable grid** (fewer than two finite bar starts): error
  `grid-unusable`, chart "". Non-finite starts are dropped; unsorted or
  duplicate starts are sorted and deduplicated (within 1 ms), with one
  `grid-unsorted` warning (Claude's call).

### 6.2 Runs to symbols

- Frames convert by `frameSec`. A run with non-finite times, `end <=
  start`, or neither or both of `label` and `symbol` is dropped,
  warning `run-invalid` (one per run, capped at ten, then a count).
- Labels go through `harteToBarmark` after the root is respelled with
  `spellPitch` for the key in force at the run's start (`D#:min` in B♭
  is `Ebm`; `A#:maj` in D is `Bb`, the bVI). The Harte intervals then
  spell the bass and any note set; a result with `##` or `bb`
  (`D#:maj/3` as is gives `{F## D#! A#}`) retries the enharmonic root
  (`Eb/G`). An unreadable label, or a symbol with an error,
  becomes `?` with one `label-unknown` warning per distinct label
  (Claude's calls).
- **Overlaps**: runs sort by start (stable); the later-starting run wins
  from its start, equal starts keep the longer; one `run-overlap` warning
  with a count (Claude's call: an overlap is a seam error, and the newer
  onset is the likelier truth).

### 6.3 Quantising to slots

1. **Vote.** A slot takes the plurality of its covered time: the symbol
   covering more of it than any other. Gaps cast no vote.
2. **Ties** go to the symbol sounding at the slot's start, then to the
   earlier-starting run (Claude's call: deterministic, and it favours
   the chord already ringing).
3. **Under half covered** gives `?` (honest: too little was detected
   there, which is not `N.C.`), warning `no-chord-detected` per stretch
   of slots.
4. **Minimum duration** is relative to competitors: a change wins a slot
   only by out-covering every other symbol in it, so a short chord
   between two long ones is outvoted, and the grid sets the scale. No
   further smoothing; ChordMini already smooths (Claude's call: one rule,
   explainable from the chart's own grid).
5. **Holds.** A slot whose symbol equals the slot before (across bar
   lines too) is `/`, per the grammar's generator rule: a detector can't
   tell a re-attack from a sustain. The same holds `N.C.` and `?` (one
   warning per unknown stretch, not per beat). Two exceptions: the
   chart's first slot is always written by name, and the first bar of a
   section restates a held chord by name, as charts do (Claude's call).
6. **Simile.** With `simile` on, a bar whose slots equal the previous
   bar's, slot for slot, and whose first slot is an attack, is `%`. Not
   on a section's first bar, and not across a meter change, the pickup
   included (Claude's calls: `%` is only ever shorthand inside a
   passage). With the hold rule, `%` appears exactly for repeated
   multi-chord bars (`| C G | % |`); a bar holding one chord stays `/`. A bar with a `?` slot is always written
   out, never `%` (Kevin's decision, 2026-11-07).
7. `printChart` then reduces each cell to the fewest even slots
   (`| C / G / |` → `| C G |`).

### 6.4 Before bar 1 and after the last bar

- **Pickup.** Only when the input gives `pickup.start` (Claude's call:
  a detector's first sound is often a count-in or noise, and inventing
  bars would shift the host's numbering). Its length in beats, k, is
  rounded at bar 1's beat length; for 1 ≤ k < the bar's beats it is a
  bar with a one-bar meter of k beats (`[1/4]` in 4/4, `[3/8]` in 6/8)
  on the first line, played bar 1, as the MusicXML import writes a
  pickup. Otherwise `pickup-ignored` (info).
- **Runs outside the bars** are cut at bar 1's start (or the pickup's)
  and at the grid's end. When chords other than `N` and `?` lose a beat or more,
  one `outside-bars` warning each side, with the seconds lost; unknown
  time (Kevin's decision, 2026-11-07) is not counted.

### 6.5 Title, sections and directives

- **Title.** Whitespace runs, newlines included, collapse to one space
  and the ends are trimmed; an empty title is left out (Claude's call: a
  newline in a title would end the title line).
- **Sections.** Each start snaps to the nearest bar start (a tie goes to
  the later bar; before bar 1 means bar 1). Names are trimmed and
  whitespace collapsed; an empty name is dropped (`section-unnamed`). A
  trailing repeat or elision mark would be read as one, so it is
  stripped with `section-marks-stripped`: `x2`, `x 2`, `X 2` (any case,
  any spacing), `x ...` and `->`. Two sections on one bar: the later
  wins, `section-collision`. A section or change whose nearest bar start
  is the grid's end is dropped, `after-last-bar` (an empty heading is an
  error, or a replay of an earlier same-name section). Bars before the
  first section form the grammar's unnamed section.
- **No same-name replays.** **Kevin's decision (2026-11-07): every
  section is written out in full**, even one with the same name and
  slots as an earlier one; a name may recur.
- **Key.** `keyFromText`, then `conventionalKey` (info `key-respelled`
  when it changed). Unreadable: no `key:` line, `key-unreadable`. With no
  key given, none is written; the grammar says a converter that doesn't
  know leaves it out.
- **Tempo**, in grammar 2.1's beat. A given tempo is written as given,
  decimals included (`tempo: 87.5`). Omitted, it is 60 ÷ the grid's
  folded median beat length, rounded to a whole bpm: a bar under 0.6× the
  plain median counts as half a bar, one over 1.6× as two, before the median
  is taken (real grids carry many half-length bars). A given tempo more than
  15% from the grid's (over the bars where it is in force) is still
  written, warning `tempo-grid-disagree`: it is usually in the wrong unit
  (section 9, step 6). Outside 1–999: dropped, `tempo-unreadable`.
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
`info` is a value the builder chose or respelled.

## 8. What it deliberately does not do

- **Repeats** (`|: :|`, `x2`, endings, `D.S.`, replay headings). A
  detected repeat is a claim that two passes are the same music; a
  detector's two choruses differ by noise, and folding them would hide
  that. The played-bar index stays the recording's bar order, so the
  timing map stays trivial. `%` is the one shorthand, because it is exact
  and local. Same-name replays are out too, by Kevin's decision (6.5).
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

1. **Bump** barmark 0.17.0 → 0.17.1 and @barmark/render 0.15.0 → 0.16.0
   (chord typesetting exports, #151, about to be released); keep
   @barmark/musicxml at 0.6.0; run SS's tests.
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
   starting chart to refine, in place of the per-bar votes. **Tempo
   units:** SS's stored tempo (`src/lib/audio/measures.ts`, a meter with
   no `beatUnit`) counts the meter's bottom-number unit, so a 6/8 song
   stored at "120" is 120 eighths a minute, a barmark tempo of 40. SS
   passes `value × beatsOf(meter) / meter.n` for the tempo and each tempo
   change, or passes no tempo and lets the builder take the grid's. The
   refiner is told to keep the bar count; SS checks the map against the
   refined chart and re-aligns or drops it on a mismatch.
7. **Store the timing map** (and the confidence record) beside the chart,
   one map per recording; replace the in-memory `BarGrid`'s
   `secondsAtBar`/`barAt` with the package's; save alignment's
   `barStarts` as a map with `source: "aligned"`, hashed with
   `chartHash`.

## 10. Testing and acceptance

Test first, per rule, in `packages/sync/tests/`.

- **Rules**: one test per rule of section 6 (vote, each tie-break, holds
  and their exceptions, `%` and where it is refused, pickup, outside-bar
  cuts, section snapping and stripping, each change kind, tempo
  disagreement, respelling: bVI in a sharp key, the double-accidental
  retry, a run across a key change) and per diagnostic code.
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
- **Real data**, generated by a VM-only script,
  `bun scripts/detection-fixtures.ts`, that writes JSON (numbers and
  labels, no audio) to `packages/sync/tests/fixtures/`, as the MuseScore
  fixtures script does; CI only reads them. The expected charts are
  reviewed by hand once, then snapshotted.
  - **Primary: frame-level ChordMini runs.** The script runs SS's
    ChordMini TypeScript port (imported as stem-bench's
    `scripts/run-study19.ts` does; it matched the Python reference on
    every frame) on stem-bench's `corpus-mmkk/{letter-lands,
    eat-all-the-clocks}/mix.mp3`, with `results/study19.json`'s aligned
    `barStarts` as the grid.
  - **Secondary:** `results/study19.json` gives chart symbols, one per
    bar (`appPerBar`), so it feeds the `symbol` path, one run per bar.
- **Fuzz** (seeded generator in the test, no new dependency; 2,000
  cases): random grids (unsorted, duplicate, NaN), runs (overlapping,
  gapped, empty, frame-based, garbage labels), sections (including at the
  grid's end and colliding), changes, pickups. Each case: no throw; the
  chart parses with no errors; printing it again changes nothing; the
  first slot is not `/`; every heading has at least one bar;
  `checkTimingMap(timing, {text: chart})` reports nothing; map and
  confidence bars number `parse.bars.length`, and each confidence
  `slots` matches its bar's slot count.
- **Package mechanics** (plan items): a `sync` entry in
  `scripts/lib.ts` `PACKAGES` (tag `sync-v`) with `scripts/smoke-sync.mjs`;
  the `./timing` subpath export, whose Node import check is new ground
  (render exports `./element`, but no smoke script imports a subpath);
  CI, Swamp's release-check input, Fallow, `verify-release`; a README
  holding the map's rules, a CHANGELOG, and a `barmark` CHANGELOG entry
  for its exports. Released as `sync-v0.1.0`, after the barmark minor.
