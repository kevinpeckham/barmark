# @barmark/listen

Find the bars in a recording and line a [barmark](https://barmark.dev)
chord chart up with them. It reads a recording's audio features, finds its bar grid
and where bar one is, builds a chart and its timing map from a chord
model's runs, and aligns an existing chart to the recording.

It is a port, not a rewrite: the recording-to-chart math of the Stem
Shovel app, with the app's arithmetic in the app's order and every
threshold an option, moved here so that the app, the benchmark that
tunes it, and public tools all run one copy. Where the package differs
from the app, the difference is listed in the CHANGELOG.

```sh
npm install @barmark/listen
```

It requires `barmark` 0.23.1 and `@barmark/sync` 0.4.1 or later, and
Node 20 or later (or any modern browser: the package uses only `Math`
and typed arrays, no DOM or Node API).

## The four calls

### Features

```ts
import { recordingFeatures } from "@barmark/listen/features";

// Mono PCM as a Float32Array and its sample rate (8,000 to 384,000 Hz).
const features = recordingFeatures(samples, 44100);
if (features.ok) cache.put(key, features.value);
```

The record (`Features`) holds the chromagram (12 values a frame), the
onset envelope, their rates, the recording's length and where its sound
starts and stops. It is plain data: it survives `structuredClone`,
`postMessage` and IndexedDB as it is. `@barmark/listen/features` imports
nothing from `barmark` or `@barmark/sync`, so a worker that only computes
features stays small. The root entry re-exports it.

### The grid

```ts
import { findGrid } from "@barmark/listen";

const grid = findGrid({
	features,
	chords: runs, // a chord model's runs (sync's ChordRuns), or null
	declared: { meter: "4/4", tempo: 120 },
});
if (grid.ok) grid.value.grid.bars; // bar one's start, every bar line, the end
else grid.reading; // the comb, the witnesses and the scores, when it got that far
```

The declared tempo is in grammar 2.1's beat (dotted quarters in 6/8). An
onset comb finds the bar period near the declared one, and three
witnesses (time zero, harmonic rhythm, section boundaries) vote on which
beat is the downbeat. `startAt` (the song's own start of bar one, set by
a person) skips the vote.

`declared` is required, and the package does not detect tempo or meter.
Detecting them is where this pipeline fails on real recordings: in Stem
Shovel's Study 34, every confidently wrong draft was wrong before the grid
ran (a blues at half tempo, a waltz read as 4/4), and the steps after it
wrote a faithful chart on the wrong bars. A host that detects what it
passes as `declared` should treat the result as unreviewed: hold it for a
person to check rather than save it as the song's chart.

`tempo-drift` warns how far the comb's settled bar is from the declared
one: `detail.ratio` is `period / declaredBar − 1`, signed (negative when
the recording runs faster), with `detail.period` and
`detail.declaredBar`. It is a warning with no threshold here; the host
chooses its own threshold. The comb
scans its period in steps of 0.02 %, so a recording at its declared
tempo usually shows a drift of about that size.

If the recording may not start on a bar line (a phone capture, a clip), pass `startsOnBarLine: false`.

### A chart and a recording

```ts
import { alignChart } from "@barmark/listen";

const aligned = alignChart({ chart: text, features });
if (aligned.ok) aligned.value.timing; // a barmark-timing map, checked against the text
else aligned.refusals; // why, every rule that failed, not the first only
```

The chart is rendered as pads at its own tempo, warped onto the
recording's chroma (DTW), and the bar lines re-phased with the onset
comb. The result carries the alignment, the fit (bar one, the median bar
against the declared one, the cost ratio) and where the chart's
sections, key changes and tempo changes fall (`placements`). A refusal
after the warping still carries the alignment and the placements.
`tempo` is the fallback for bars the chart gives no tempo, and
`declared` sets the bar the fit measures against (without it, the
chart's own median bar).

The map is clamped to the recording: its first start is never before 0
and its end never past `recording.duration`. The re-phased bar lines can
land a few milliseconds outside it (the app's maps keep that overshoot;
this package clamps it), and only the map is clamped: `alignment.barStarts`
and the placements keep the re-phased values. A bar lying wholly outside
the recording, which the clamp would leave no length (a recording cut a
bar or more short of the chart), is refused `map-invalid`, with
`detail.bar`, `detail.edge` (`start` or `end`) and the bar's own start
and end.

### A recording to a chart

```ts
import { chartFromRecording } from "@barmark/listen";

const built = chartFromRecording({
	samples,
	sampleRate: 44100, // or `features` from a cache, not both
	chords: runs,
	declared: { meter: "4/4", tempo: 120 },
	title: "Peaceful Dreams",
});
if (built.ok) {
	const { chart, timing, confidence, features } = built.value;
}
```

Features (unless given), then `findGrid`, then sync's
`chartFromDetections` on the grid. When the grid cannot be placed
(`no-period`, `downbeat-undecided`, `nothing-fits`) it refuses, unless
`onUnplaced: "declared"`: then it builds on the declared grid from
`startAt ?? 0` with a `bar-one-unplaced` warning, and `reading` still
carries the vote. Options for the builder go in `build`.

To carry the map over to a refined copy of the chart, use sync's
`rehashTiming`.

## Results and refusals

Every call returns one shape and never throws:

```ts
type Ok<T> = { ok: true; value: T; warnings: ListenWarning[] };
type Refused<E = {}> = { ok: false; refusals: Refusal[]; warnings: ListenWarning[] } & E;
type Refusal = { reason: RefusalReason; message: string; detail?: Record<string, number | string | boolean> };
```

`refusals` is never empty. `message` is one sentence in plain words, in
seconds and bar numbers; `detail` has the numbers behind it.

| Reason | Stage | When |
| --- | --- | --- |
| `invalid-input` | all | Samples empty or not finite; a sample rate outside 8,000 to 384,000; a meter `parseMeter` cannot read; a tempo not 1 to 999; `startAt` not a finite number ≥ 0; a chart not a string; `chords.frames` not a whole number ≥ 0; samples and features both given. `detail.field` names the field. |
| `invalid-option` | all | An option is unknown, not taken by that call, or out of its range. `detail.option` names it. |
| `features-invalid` | features | Not a features record, or one whose arrays, rates or values do not match what it says. |
| `features-version` | features | The record's `version` is not this package's `FEATURES_VERSION`. A cache treats it as a miss. |
| `no-period` | grid, align | The onset envelope is empty or all zero after detrending: no lattice to find. |
| `downbeat-undecided` | grid | The vote did not decide. The reading comes beside the refusal. |
| `nothing-fits` | grid | Bar one lands at or after the recording's end. |
| `no-bars` | align | The chart plays no bars. |
| `no-tempo` | align | A played bar has no tempo, and no `tempo` was given to fall back on. |
| `too-short` | align | The recording or the chart's render has no chroma frame. |
| `too-long` | align | The warping's step table, `(n + 1)(m + 1)` cells for `n` chart and `m` recording frames, exceeds `DTW_MAX_CELLS`. Checked before anything is rendered. |
| `chart-too-long` | align | The warping found no path: the chart runs more than twice as long as the recording. |
| `not-same-piece` | align | The tritone control's cost is under `ALIGNMENT_SAME_PIECE_RATIO` times the chart's, or the median local cost is over `ALIGNMENT_SAME_PIECE_LOCAL_COST`. |
| `bars-off-middle` | align | The re-phase's trusted span covers less than `REPAIR_MIN_TRUSTED_SHARE` of the bar starts. |
| `bar-one-far` | align | Bar one is more than one declared bar from where the music starts. |
| `bar-length-off` | align | The median aligned bar is more than `FIT_BAR_TOLERANCE` off the declared bar. |
| `weak-fit` | align | The control's cost is under `FIT_MIN_RATIO` times the chart's. |
| `map-invalid` | align | A bar lies wholly outside the recording, so the clamp to [0, duration] would leave it no length (`detail.bar`, `detail.edge`, `detail.start`, `detail.end`); or the aligned map fails `checkTimingMap` against the chart, which should be unreachable. |

| Warning | When |
| --- | --- |
| `pickup` | The grid reports a pickup (`detail.start`, `detail.beats`). |
| `bar-one-clamped` | Bar one fell before 0:00 and starts at 0:00; `detail.start` is where it fell, in seconds (negative). |
| `sound-before-start` | With `startAt`, sound begins a bar or more before it. Those bars are outside the grid. |
| `grid-truncated` | The grid reached `MAX_GRID_BARS` before the recording's end. |
| `bar-one-unplaced` | The pipeline built on the declared grid (`onUnplaced: "declared"`); `detail.reason` names the refusal it replaced. |
| `chart-diagnostics` | The aligned chart has parse warnings or errors (a `?` among them); the alignment still runs. |
| `tempo-drift` | grid and pipeline: the comb's bar differs from the declared one (`detail.ratio`, `period / declaredBar − 1`, signed; `detail.period`, `detail.declaredBar`). No threshold: the host decides. Not emitted when the ratio is zero within floating-point error. |

## Options

Each call takes an options object merged over `DEFAULTS` key by key. The
keys are the app's names, so a study, a sweep and the app's history name
them the same way. An unknown key, or a value out of its range, is
`invalid-option`: a misspelt sweep key never silently measures the
default. `resolveOptions(options, scope)` checks a set without running
anything.

**The sound options are feature options.** `ALIGNMENT_SOUND_FLOOR` and
`ALIGNMENT_SOUND_WINDOW_SEC` change where the sound starts and stops,
which belong to the features, so only the feature functions (and
`chartFromRecording`, which makes them) accept them; the record keeps
the values it used (`sound`). A sweep of them recomputes the features;
every other sweep reuses them.

| Option | Default | Range | Set by |
| --- | --- | --- | --- |
| `ALIGNMENT_SAME_PIECE_RATIO` | `1.6` | ≥ 1 | Study 14 |
| `ALIGNMENT_SAME_PIECE_LOCAL_COST` | `0.3` | (0, 1] | Studies 15 and 16 |
| `ALIGNMENT_SOUND_FLOOR` | `0.02` | (0, 1] | Study 14 (features only) |
| `ALIGNMENT_SOUND_WINDOW_SEC` | `0.05` | (0, 1] s | Study 14 (features only) |
| `REPAIR_TRUST_FRACTION` | `0.25` | (0, 1] | Study 26c |
| `REPAIR_SLIDE_FRACTION` | `0.25` | (0, 1] | Study 26c |
| `REPHASE_FENCE_BEATS` | `0.5` | > 0 beats | Study 27 |
| `ONSET_ENVELOPE_LEAD_SEC` | `0.07` | [0, 1] s | Measured on synthetic hits; Studies 27 and 31 |
| `REPAIR_SLIDE_STEP_SEC` | `0.01` | 0.0001 to 1 s | Study 26c; floor 0.1.1 |
| `REPAIR_MIN_TRUSTED_SHARE` | `0.5` | (0, 1] | Study 26c |
| `COMB_RANGE_FRACTION` | `0.1` | (0, 1) | Study 24 |
| `COMB_COARSE_STEP_FRACTION` | `0.002` | `COMB_RANGE_FRACTION / 5000` to `COMB_RANGE_FRACTION` | Study 24; floor 0.1.1 |
| `COMB_FINE_STEP_FRACTION` | `0.0002` | `COMB_COARSE_STEP_FRACTION / 1000` to `COMB_COARSE_STEP_FRACTION` | Study 24; floor 0.1.1 |
| `COMB_PHASE_STEP_SEC` | `0.01` | 0.0001 to 1 s | Study 24; floor 0.1.1 |
| `TIME_ZERO_SNAP_BEATS` | `0.25` | > 0 beats | Study 31 |
| `DOWNBEAT_WEIGHTS` | `{ timeZero: 2, harmonicRhythm: 2, sections: 1 }` | each ≥ 0 | Study 31 |
| `DOWNBEAT_MIN_SCORE` | `2` | ≥ 0 | Study 31 |
| `DOWNBEAT_OFF_COMB_MARGIN` | `2` | ≥ 0 | Study 31 |
| `HARMONIC_MIN_RATIO` | `1.2` | ≥ 1 | Studies 31 and 32 |
| `SECTION_NOVELTY_SPANS` | `[8, 16]` | non-empty, whole numbers ≥ 1 | Study 31 |
| `PLACEMENT_FIRST_SOUND_SLACK_BEATS` | `0.25` | [0, 1) beats | Study 31c |
| `FIT_BAR_TOLERANCE` | `0.15` | (0, 1] | set in the app, not by a study |
| `FIT_MIN_RATIO` | `1.5` | ≥ 1 | set in the app, not by a study |
| `SECTION_START_SNAP_SEC` | `0.25` | ≥ 0 s | set in the app, not by a study |
| `HEDGE_LOCAL_COST_FACTOR` | `2` | ≥ 1 | set in the app, not by a study |
| `DTW_MAX_CELLS` | `150_000_000` | whole number from 1 to 2^31 | set in the app, not by a study |
| `MAX_GRID_BARS` | `2000` | whole number ≥ 1 | set in the app, not by a study |
| `PICKUP_MAX_BAR_FRACTION` | `0.5` | (0, 1] | set in the design, not by a study |

**The step floors.** The four scan steps have floors (new in 0.1.1): a
step bounds no work by itself, and at 1e-12 the comb's phase scan ran
about 1e11 iterations. Each floor holds its scan to 100 times the
default's steps, far below any value a study has used. The phase scan and
the end slide take about `duration / step` and `2 × range / step` steps,
so their floor is 0.1 ms, a hundredth of 10 ms. The coarse ladder holds
`2 × range / coarse + 1` periods: at most 10,001 (the default's 101). The
fine ladder holds `2 × coarse / fine + 1`: at most 2,001 (the default's
21). The floors bound each scan on its own; several at their floors at
once multiply (the phase scan runs once per period of both ladders).

Each option's doc comment in `DEFAULTS` says what it does and where its
value comes from. A default changes only with a registered study, named
in the CHANGELOG.

## Caching features

A features record depends on the samples, the sample rate and the two
sound options (which it records). Key a cache on the audio and the rate,
and fold `FEATURES_VERSION` into the key (`af${FEATURES_VERSION}:…`): the
version is raised whenever the features would come out differently, so
an upgrade misses the cache instead of aligning on stale features. Read
a cached record back through `readFeatures`, which refuses another
version (`features-version`) or a record that does not hold together
(`features-invalid`), such as one at another rate or with plain arrays
after a JSON round trip. There is no JSON form: store structured clones,
or the two arrays as binary beside a JSON header.

## In a worker

Every call is synchronous and pure, and the package never creates a
worker. The two usual set-ups:

```ts
// One worker: the whole record.
import { recordingFeatures } from "@barmark/listen/features";
self.onmessage = ({ data }) => {
	const r = recordingFeatures(data.samples, data.sampleRate);
	if (r.ok) self.postMessage(r.value, [r.value.chroma.buffer, r.value.onset.buffer]);
	else self.postMessage(r);
};
```

```ts
// Two workers at once, the chroma in one and the onset envelope (the
// long pole) in the other, then joined where they meet.
import { chromaFeatures, joinFeatures, onsetFeatures } from "@barmark/listen/features";
const chroma = chromaFeatures(samples, rate); // worker A
const onset = onsetFeatures(samples, rate); // worker B
if (chroma.ok && onset.ok) {
	const features = joinFeatures(rate, samples.length / rate, chroma.value, onset.value);
}
```

## Size limits

| Stage | Time | Memory |
| --- | --- | --- |
| Features | O(N log W) in samples | a 4-minute song: about 127 KB of chroma and 83 KB of envelope |
| Comb and grid | linear in duration (about 3 M steps for 4 minutes) | the envelope |
| Chart render | chart seconds × rate × tones | one window: the render streams |
| Warping (DTW) | chart frames × recording frames, twice | one byte a cell of the step table, plus three rows |

The warping is quadratic, and `DTW_MAX_CELLS` (150 M cells, 150 MB of
step table) is its ceiling: about 19 minutes of chart against as long a
recording at 44.1 kHz, about 13 s in Node. The cell count is computed
from the chart's bar seconds and checked before anything is rendered or
allocated; `too-long` names the limit and the counts. A browser host should lower `DTW_MAX_CELLS` to about 40 M
(around 9 minutes). The grid has no quadratic stage; `MAX_GRID_BARS`
(2,000 bars) bounds it.

## Charts, pickups and groups

The chart is read by barmark. Each bar lasts its own meter's length in
the beat of the `time:` meter in force, at its `tempo:` (6/8 at
`tempo: 40` is 3.0 s a bar); `rit.` and `accel.` are read at the steady
tempo. A chart without `time:` is 4/4, as barmark reads it. A chord slot
sounds its pitches; `/`, `N.C.`, silence, `?`, a note set and an empty
bar hold or rest; **a group plays its first member**. Sections are the
chart's headings, then its rehearsal marks.

**Pickups.** When the first sound comes into the bar, at most
`PICKUP_MAX_BAR_FRACTION` of a bar before the next downbeat, the grid
reports a pickup and bar one is that downbeat. `chartFromRecording`
writes it as barmark's bar 0 with its own one-bar meter (`| [2/4] G | C
…`); in the timing map it is the entry with `index` 1, so the map's first
entry is `{ bar: 1, start: pickup.start }`. A longer lead-in is not a
pickup: bar one opens with its silence.

## Stages

`@barmark/listen/stages` exports each stage on its own (the comb, the
lattice, each witness, the vote, the render, the warping, the fit and the
rest), with `DEFAULTS`, `resolveOptions` and their types, for the
benchmark that measures them one at a time. The stages are the bench's
instruments and may change shape in a minor before 1.0; the four calls
are the stable surface.

## License

MIT
