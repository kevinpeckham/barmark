# @barmark/listen: a recording to a chart, and a chart to a recording: design

**Status:** the approach was approved by Kevin on 2026-11-09, in reply to Stem
Shovel's brief (`stem-shovel/docs/barmark-brief-chart-from-recording-2026-11-09.md`).
His decisions are posted on kevinpeckham/stem-shovel#17 and are marked
**Kevin's decision (2026-11-09)** below. My own choices are marked
**(design call)** so he can check them. The questions only he can answer
are collected in §14. No grammar change. Nothing here is code yet.
The build starts after barmark's current releases (§12).

## 1. Intent

Stem Shovel (SS) can draft a chord chart from a recording alone. It finds a
bar grid from the onsets, places bar one by a vote, takes the chords from a
chord model, builds the chart with `@barmark/sync`'s `chartFromDetections`
and keeps the timing map. It can also place an existing chart in a
recording by dynamic time warping (DTW) and keep the result as a timing
map. Half of that path is already in barmark: sync builds the chart and
the map from detections on a grid. The other half is about 1,200 lines of
pure TypeScript inside the app, and the bench (kevinpeckham/stem-bench)
keeps a second copy by hand (`src/study12/dtw.ts`, `src/study24/tempo.ts`,
`src/study26/recipe.ts`, `src/study27/rephase.ts`, and the vote in the
Study 31/32 scripts). That half makes the features, the comb, the
chartless grid, the chart alignment, the fit and the placements.

So the same math exists in three places: the app, the bench, and nowhere
in barmark. A study measures the bench's port, not the code the app runs,
and a public tool would need a fourth copy. `@barmark/listen` puts that
math in one package. The app, the bench and a future public tool import
it, and a study measures the code that ships.

### Goals

1. One call from mono PCM to **features** (chroma, onset envelope, first
   and last sound). The output can be cached and runs in a browser worker
   and in Node.
2. One call from features, **chord runs** (sync's `ChordRuns`) and a
   **declared meter and tempo** to a **grid** in the shape
   `chartFromDetections` takes. The result includes the vote's verdict, each
   witness's reading, and a pickup when there is one.
3. One call that **aligns an existing chart** to a recording's features and
   returns a timing map with its fit, or the reasons it was refused.
4. One **whole-pipeline** call, from PCM (or features), chord runs and a
   declared meter and tempo to the chart text, the timing map, the
   confidence record, and the refusals or warnings.
5. **Refusals are values.** Every stage returns a result or named reasons,
   and never throws.
6. Every threshold the bench set keeps its value and its provenance. The
   thresholds are **exported and overridable** through an options object,
   so the bench can sweep them while the app keeps the defaults.
7. A small addition to `@barmark/sync`, **`rehashTiming`**, so every caller
   carries a timing map across a refinement by the same rule (§8).

### Non-goals

- **Models.** ChordMini, Basic Pitch and any other model stay with the
  caller. The package takes their output as data (`ChordRuns`) and never
  imports a model runtime.
- **Decoding and the downmix.** The caller passes mono `Float32Array` PCM
  and its sample rate. Study 33 settled that the input is mono: no
  channel splitting, no mid/side, no harmonic-percussive separation.
- **The section-naming and spelling model** (`server/aiDetect.ts`). The
  prompt stays in the app. Only the rule that keeps a timing map valid
  across the refinement belongs to barmark (§8).
- **Detecting meter and tempo in v1.** The caller declares both
  (**Kevin's decision (2026-11-09)**). The comb searches ±10 % around the
  declared bar, as it does today. Detection waits for Study 34 (§13).
- **Changing the math.** v1 is a port. The arithmetic, its order and
  every threshold stay as they are, so the app's outputs are reproduced
  (§11.4). Improvements such as a banded DTW or a wider comb come later
  and need a study.
- **Workers, caches and storage.** The package exports pure functions.
  The host decides where they run and where features are kept (§9).
- **A CLI command** (§12.3).

### Anti-goals

These are things the design must never do:

- **Lose a threshold the bench set.** Every constant in the app's
  `constants/chartAlignment.ts` comes over with its value, its study and
  its doc comment. That includes `REPAIR_SLIDE_FRACTION`, which only the v3
  reference `repairEnds` reads (§6.2). A default changes only with a
  registered study, and the CHANGELOG names the study.
- **Turn a refusal into a throw, or a throw into a silent result.** The
  app's `alignChartPath` throws "The chart has no bars to place". The port
  returns `no-bars`. Bad input, bad options and a cache record that does
  not parse are all refusals. No path returns a chart or a map while it
  drops the reason it should have refused.
- **Save a wrong chart without a warning.** This is Study 34's first gate
  (S34-G1). Any check that can tell a wrong chart (the vote, the
  same-piece gate, the trusted-span refusal, the fit) gets a named refusal
  reason. None of them is folded into a number the caller has to
  interpret.

## 2. Kevin's decisions (2026-11-09), binding

1. **Where it lives:** a new package, `@barmark/listen`, that depends on
   `@barmark/sync`. The features and the DTW are numeric code of a
   different weight from sync's data-in, chart-out builder.
2. **One detections shape:** sync's `ChordRuns`. The app converts
   ChordMini's output once (what `utils/chordminiBarChords.ts` does today),
   and the grid's harmonic witness and the builder read the same data.
3. **Meter and tempo:** the caller declares them in v1. The comb searches
   ±10 % (`COMB_RANGE_FRACTION`).
4. **Pickups:** the grid reports a pickup when the first sound comes
   before bar one by less than a bar. The builder already takes one
   (`readPickup`), and under grammar 2.4 it is written as bar 0. `index`,
   and so the timing map, still count it as play position 1.
5. **Constants:** exported with their defaults, each documented with the
   study that set it, and overridable through an options object.
6. **The refinement contract:** a small function in `@barmark/sync` takes
   the built result and a refined text. It returns the re-hashed map, or
   the reason the map was dropped (the text doesn't parse, or it plays
   different bars).
7. **Requirements kept as written:** refusals are values and never throws;
   ESM only, no DOM, no new runtime dependencies; the features can be
   cached and run in a browser worker and in Node; the 65 Hz sine-kick
   fixture.

## 3. The package

- `packages/listen/`, published as `@barmark/listen`, ESM only, `"type":
  "module"`, `sideEffects: false`, Node ≥ 20, MIT, version 0.1.0.
- **Runtime dependencies:** `barmark` (`parseChart`, `beatsOf`,
  `harteToBarmark`, `parseChord`) and `@barmark/sync` (`ChordRuns`, `Grid`,
  `TimingMap`, `chartFromDetections`, `chartHash`, `checkTimingMap`), both
  `workspace:^`, so they publish as carets on the versions current at
  release. There is nothing else, and no devDependency is needed beyond
  what the workspace has.
- **Build:** `tsconfig.build.json` with `"lib": ["ESNext"]` and `"types":
  []`, as in sync. That makes a DOM or Node global a compile error, which
  enforces "no DOM" by the compiler and not by review. No `TextEncoder`,
  no `performance`, no `Worker`, no `Buffer`.
- **Entry points (design call):**
  - `@barmark/listen`: the four calls, the options and the types. The
    refinement helper is sync's (§8) and is imported from sync, not
    re-exported.
  - `@barmark/listen/features`: `recordingFeatures`, `chromaFeatures`,
    `onsetFeatures`, `joinFeatures`, `readFeatures` and the `Features`
    type. **It imports nothing from `barmark` or `@barmark/sync`**, so a
    worker that only computes features bundles a few hundred lines. This
    follows `@barmark/sync/timing` and `@barmark/midi/perform`.
  - `@barmark/listen/stages`: each stage's function (§6) for the bench,
    which measures stages one at a time. It follows semver like the rest,
    but its README says the stages are the bench's instruments and may
    change shape in a minor before 1.0. The four calls are the stable
    surface.

## 4. Results, refusals and warnings

Every call returns this one shape (design call: one union everywhere, so a
caller handles all stages the same way):

```ts
type Ok<T> = { ok: true; value: T; warnings: ListenWarning[] };
type Refused<E = {}> = { ok: false; refusals: Refusal[]; warnings: ListenWarning[] } & E;

type Refusal = {
	reason: RefusalReason;
	/** One sentence in plain words, fit to show a person as it is. */
	message: string;
	/** The numbers behind it, for a page that explains or a study that scores. */
	detail?: Record<string, number | string | boolean>;
};

type ListenWarning = {
	code: WarningCode;
	message: string;
	detail?: Record<string, number | string | boolean>;
};
```

`refusals` is never empty. The fit can fail on several rules at once, so
it is a list. Messages use seconds and bar numbers, not the app's
`formatTime`. The app maps each reason to its own sentence when it wants
to (it does that today in `utils/alignmentReason.ts`).

### 4.1 Refusal reasons

| Reason | Stage | When |
| --- | --- | --- |
| `invalid-input` | all | Samples empty or containing a non-finite value; sample rate not a finite number from 8,000 to 384,000; declared meter unreadable by `parseMeter`; declared tempo not 1 to 999; `startAt` not a finite number ≥ 0; chart not a string. `detail.field` names the field. |
| `invalid-option` | all | An option is out of its range (§5.3). `detail.option` names it. |
| `features-invalid` | features | `readFeatures` was given something that is not a features record, or whose arrays do not match its counts. |
| `features-version` | features | The record's `version` is not this package's `FEATURES_VERSION`. A cache treats this as a miss. |
| `no-period` | grid | The onset envelope is empty or entirely zero after detrending, so the comb has no lattice to find. This is new. The app runs the comb on silence and lets the vote decide on noise (design call). It does not fire on any audible recording, so it moves no bench number. |
| `downbeat-undecided` | grid | The vote did not decide (Study 31's rule). `detail` has the scores. The reading comes beside the refusal (§6.3). |
| `nothing-fits` | grid | Bar one lands at or after the recording's end. |
| `no-bars` | align | The chart plays no bars. |
| `no-tempo` | align | A played bar has no tempo, and the caller gave no `tempo` to fall back on. |
| `too-short` | align | The recording or the chart's render has no chroma frame. |
| `too-long` | align | The DTW's cell count, chart frames × recording frames, exceeds `DTW_MAX_CELLS` (§10). It is checked before anything is allocated. |
| `chart-too-long` | align | The warping found no path: the chart runs more than twice as long as the recording at its declared tempo. |
| `not-same-piece` | align | `controlCost / cost < ALIGNMENT_SAME_PIECE_RATIO` or the median local cost `> ALIGNMENT_SAME_PIECE_LOCAL_COST` (Studies 14, 16). See §14 Q1: this makes a map refusal out of a gate the app today uses only to hedge placements. |
| `bars-off-middle` | align | The grid re-phase refused: the trusted span covers less than `REPAIR_MIN_TRUSTED_SHARE` of the bar starts (Study 26c's wrong-chart detector, kept by Study 27). |
| `bar-one-far` | align | Bar one is more than one declared bar from where the music starts (`max(startAt, firstSound)`). |
| `bar-length-off` | align | The median aligned bar is more than `FIT_BAR_TOLERANCE` off the chart's declared bar. |
| `weak-fit` | align | `controlCost / cost < FIT_MIN_RATIO`. |
| `map-invalid` | align | The aligned map fails `checkTimingMap` against the chart (the bar count or the hash). This should be unreachable, and its test proves that. |

### 4.2 Warning codes

| Code | When |
| --- | --- |
| `pickup` | The grid reports a pickup. `detail.start` and `detail.beats` are included. |
| `bar-one-clamped` | Bar one fell less than a beat before 0:00 and starts at 0:00. |
| `sound-before-start` | With `startAt` set, sound begins a bar or more before it. Those bars are outside the grid and their chords are dropped (sync's `outside-bars`). |
| `grid-truncated` | The grid reached `MAX_GRID_BARS` before the recording's end. The app truncated silently. Here it warns (design call). |
| `bar-one-unplaced` | The pipeline built on the declared grid because the vote was undecided and the caller asked for that (§6.5). |
| `chart-diagnostics` | The aligned chart has parse warnings or errors. The alignment still runs, as the app's adapter does. `detail.count` is included. |

## 5. Options: the constants

### 5.1 The bench's 21, copied exactly from the app's constants file

Each is exported under its app name with its app value, and its doc
comment is carried over verbatim from `src/lib/constants/chartAlignment.ts`.
The option keys keep the app's SCREAMING_CASE names (design call): a study,
a sweep and the app's history all name them that way, and a grep for the
name finds the study.

| Constant | Default | Set by | Read by |
| --- | --- | --- | --- |
| `ALIGNMENT_SAME_PIECE_RATIO` | `1.6` | Study 14 (real recordings: right charts 2.04, 2.53; a wrong one 1.17, 1.24; the midpoint) | align: same-piece gate |
| `ALIGNMENT_SAME_PIECE_LOCAL_COST` | `0.3` | Study 15 proposed, Study 16 made necessary (a wrong pairing at ratio 1.74, local cost 0.323) | align: same-piece gate |
| `ALIGNMENT_SOUND_FLOOR` | `0.02` | Study 14 (FIRST-ONSET and LAST-SOUND rules; 34 dB under the peak) | features: first and last sound |
| `ALIGNMENT_SOUND_WINDOW_SEC` | `0.05` | Study 14's RMS window for the floor | features: first and last sound |
| `REPAIR_TRUST_FRACTION` | `0.25` | Study 26c | comb: trusted span; re-phase confidence |
| `REPAIR_SLIDE_FRACTION` | `0.25` | Study 26c (the v3 fence; ±0.5 broke Peaceful Dreams' intro by 0.60 s) | comb: `repairEnds` (v3 reference only) |
| `REPHASE_FENCE_BEATS` | `0.5` | Study 27, recipe v5 (Mop Heart, 224 bpm in 3/4) | comb: `rephaseGrid` |
| `ONSET_ENVELOPE_LEAD_SEC` | `0.07` | Measured 2026-11-08 on synthetic hits (75, 68, 60, 54 ms early); Study 31's 0.058 to 0.079 s and Study 27's residuals are this lead | grid: lattice anchor; align: re-phased starts |
| `REPAIR_SLIDE_STEP_SEC` | `0.01` | Study 26c | comb: `combSlide` |
| `REPAIR_MIN_TRUSTED_SHARE` | `0.5` | Study 26c (the one wrong pairing on the bench, no right one) | comb: phase line refusal |
| `COMB_RANGE_FRACTION` | `0.1` | Study 24, as Study 26c uses it | comb: period search |
| `COMB_COARSE_STEP_FRACTION` | `0.002` | Study 24 | comb: coarse ladder |
| `COMB_FINE_STEP_FRACTION` | `0.0002` | Study 24 | comb: fine ladder |
| `COMB_PHASE_STEP_SEC` | `0.01` | Study 24 | comb: phase scan |
| `TIME_ZERO_SNAP_BEATS` | `0.25` | Study 31 | grid: time-zero witness |
| `DOWNBEAT_WEIGHTS` | `{ timeZero: 2, harmonicRhythm: 2, sections: 1 }` | Study 31, registered before it ran | grid: vote |
| `DOWNBEAT_MIN_SCORE` | `2` | Study 31 | grid: vote |
| `DOWNBEAT_OFF_COMB_MARGIN` | `2` | Study 31 | grid: vote |
| `HARMONIC_MIN_RATIO` | `1.2` | Studies 31 (thinnest right margin 1.27) and 32 (the validated run applied it to the witness) | grid: harmonic witness |
| `SECTION_NOVELTY_SPANS` | `[8, 16]` | Study 31 | grid: section witness |
| `PLACEMENT_FIRST_SOUND_SLACK_BEATS` | `0.25` | Study 31c | grid: placement and pickup |

### 5.2 Six set by the app, not by a study

These are hard-coded in the app's modules, outside the constants file. They
come over as options too, so that no number is hidden. Their doc comments
say "set in the app, not by a study" (design call):

| Constant | Default | From | Read by |
| --- | --- | --- | --- |
| `FIT_BAR_TOLERANCE` | `0.15` | `utils/alignmentFit.ts` `BAR_TOLERANCE` | align: `bar-length-off` |
| `FIT_MIN_RATIO` | `1.5` | `utils/alignmentFit.ts` `MIN_RATIO` | align: `weak-fit` |
| `SECTION_START_SNAP_SEC` | `0.25` | `utils/alignedPlacements.ts` `START_SNAP` | align: placements |
| `HEDGE_LOCAL_COST_FACTOR` | `2` | `utils/alignedPlacements.ts` (`2 * localMedian`) | align: placements |
| `DTW_MAX_CELLS` | `150_000_000` | `audio/chartAlignment.ts` `MAX_CELLS` | align: `too-long` |
| `MAX_GRID_BARS` | `2000` | `audio/chartlessGrid.ts` `MAX_BARS` (the app's `ChartDraftSchema` limit) | grid: `grid-truncated` |

### 5.3 How options work

```ts
type ListenOptions = Partial<{
	ALIGNMENT_SAME_PIECE_RATIO: number;
	/* … every constant in 5.1 and 5.2 except the two sound options … */
	DOWNBEAT_WEIGHTS: { timeZero: number; harmonicRhythm: number; sections: number };
	SECTION_NOVELTY_SPANS: readonly number[];
}>;
type FeatureOptions = Partial<{ ALIGNMENT_SOUND_FLOOR: number; ALIGNMENT_SOUND_WINDOW_SEC: number }>;

const DEFAULTS: Readonly<Required<ListenOptions> & Required<FeatureOptions>>; // deep-frozen
```

- Options are merged over `DEFAULTS` key by key. An unknown key is
  ignored, and the caller can check `Object.keys(DEFAULTS)` (design call: a
  sweep script may pass extra bookkeeping).
- Validation never throws. A non-finite value, a fraction outside
  `(0, 1]`, a step of 0 or less, a negative weight, or a span that is not
  a positive integer gives `invalid-option` naming the key.
- **The two sound options are feature options.** They change
  `firstSound` and `lastSound`, which belong to the features, so only the
  feature functions accept them. The features record the values they used
  (`Features.sound`). A sweep of the sound floor recomputes features.
  Other sweeps reuse them (design call: this keeps a cached record
  truthful about what it holds).
- **Fixed, not options:** the parts of each stage that define it and that
  no study tuned separately stay fixed. Each one's doc comment names its
  origin. The chroma window (4,096 samples at 22,050 Hz in seconds, as a
  power of two, hop half), the 55 to 2,200 Hz band, the onset window
  (2,048, hop 256 at about 22,050 Hz), the half-second detrend, the pad
  synthesis, the trusted run of four, the phase line's middle 60 %, the
  novelty peaks' mean plus one SD and their L/2 spacing, and the
  witnesses' own abstention counts. Changing any of these is a new
  feature or stage version, not a sweep.

## 6. The public API

Types from sync are used as they are: `ChordRuns`, `BarGrid` (`{ bars:
Seconds[] }`), `TimingMap`, `ConfidenceRecord`, `BuildDiagnostic`,
`BuildOptions`, `Change`, `Detected`.

### 6.1 Features

```ts
const FEATURES_VERSION = 1;

type Features = {
	format: "barmark-listen-features";
	version: typeof FEATURES_VERSION;
	sampleRate: number;        // the PCM's rate; the chart's render uses it too
	duration: number;          // samples.length / sampleRate
	chroma: Float32Array;      // frames × 12, each frame L2-normalized (a silent one zero)
	frames: number;
	hopSec: number;
	onset: Float32Array;       // spectral flux at ≈ 22,050 Hz, window 2,048, hop 256
	fps: number;
	firstSound: number;        // first audible window's start; 0 when nothing is audible
	lastSound: number;         // last audible window's end; the duration when nothing is
	sound: { floor: number; windowSec: number };
};

type ChromaPart = Pick<Features, "chroma" | "frames" | "hopSec" | "firstSound" | "lastSound" | "sound">;
type OnsetPart = Pick<Features, "onset" | "fps">;

recordingFeatures(samples: Float32Array, sampleRate: number, options?: FeatureOptions): Ok<Features> | Refused;
chromaFeatures(samples: Float32Array, sampleRate: number, options?: FeatureOptions): Ok<ChromaPart> | Refused;
onsetFeatures(samples: Float32Array, sampleRate: number): Ok<OnsetPart> | Refused;
joinFeatures(sampleRate: number, duration: number, chroma: ChromaPart, onset: OnsetPart): Ok<Features> | Refused;
readFeatures(value: unknown): Ok<Features> | Refused;
```

- `chromaFeatures` is the app's `chromagram` (flattened) plus
  `audibleSpan`. `onsetFeatures` is the app's `alignmentEnvelope`: an
  integer decimation to about 22,050 Hz (`onsetRate`), then
  `onsetEnvelope` with two real frames per FFT. They are split because the
  app runs them in two workers at once. The envelope is the long pole, at
  1.55 s of a 140 s song, against 0.48 s for the chroma.
  `recordingFeatures` runs both.
- The samples are read and never written or kept. Transferring their
  buffer is the host's business.
- `readFeatures` checks a value from a cache: the format, the version, the
  typed array types, `chroma.length === frames × 12`, and that every
  number is finite. §9 has the cache contract.

### 6.2 Stages (the `./stages` entry, for the bench)

These are the app's functions, renamed only where a name was the app's
(design call), each taking a resolved options object:

- Features: `fft`, `onsetEnvelope`, `detrend`, `chromagram`, `audibleSpan`.
- Comb: `jointOnsetComb` → `CombFit { period, phase, score }`,
  `trustedSpan`, `combSlide`, `rephaseGrid` → `GridRephase`, and
  `repairEnds` → `EndRepair`. `repairEnds` is Study 26c's v3 reference.
  Nothing in the pipeline calls it. It is kept so that
  `REPAIR_SLIDE_FRACTION` and the bench's v3 comparisons live with the
  rest (design call).
- Grid: `gridLattice` (the app's `chartlessLattice`),
  `timeZeroWitness`, `harmonicRhythmWitness`, `sectionWitness`,
  `checkerboardNovelty`, `downbeatVote`, `placeBarOne` (the app's
  `placeChartlessGrid`, now with the pickup, §7), `beatChords` (the app's
  `chordminiBarChords` on `ChordRuns`).
- Align: `chartPadBars` (chart → pad bars, §6.4), `renderChartPads`,
  `dtwAlign` (its result's `mapSeconds` is a closure, so it is for stages
  only and never part of a public result), `alignPath`, `rephaseAlignment`
  (the app's `repairAlignment`), `alignmentFit`, `alignedPlacements`,
  `alignedTimingMap`.

### 6.3 The grid

```ts
/** What the caller declares: tempo in grammar 2.1's beat, as sync's `Detections.tempo`. */
type Declared = { meter: string; tempo: number };

type GridInput = {
	features: Features;
	chords: ChordRuns | null;            // null: the harmonic witness abstains
	declared: Declared;
	/** The song's own start of bar one, when a person set it: the vote is skipped. */
	startAt?: number | null;
};

type Witness = {
	name: "timeZero" | "harmonicRhythm" | "sections";
	cls: number | null;                  // null: abstains
	weight: number;
	detail: { distanceBeats?: number; histogram?: number[]; margin?: number; ratio?: number; peaks?: number };
};

type GridReading = {
	comb: { period: number; phase: number; score: number };
	lattice: { anchor: number; beat: number; period: number; beatsPerBar: number };
	witnesses: Witness[];                // [] when byStart
	scores: number[];                    // per beat class; [] when byStart
	cls: number;
	decided: boolean;
	byStart: boolean;
};

type PlacedGrid = {
	grid: BarGrid;                        // bar one's start … the end; never includes the pickup
	pickup: { start: number; beats: number } | null;
	reading: GridReading;
};

findGrid(input: GridInput, options?: ListenOptions):
	Ok<PlacedGrid> | Refused<{ reading: GridReading | null }>;
```

- **Declared to lattice terms.** The declared bar in seconds is
  `beatsOf(meter) × 60 / tempo`. That is grammar 2.1's beat, the same
  seconds as the app's `chartBarSeconds(meter, bpm)` with its bottom-note
  bpm. **`beatsPerBar` is the meter's numerator** (6 in 6/8), as the app
  passes it (`meterBeats`) and as the bench measured: the lattice, the
  witnesses' classes, the time-zero snap and the placement slack all count
  numerator beats (design call, to keep the bench's numbers; §13 Q2 says
  what Study 34 could change).
- **The order is the app's `chartlessGrid`.** The comb near the declared
  bar comes first, with its phase moved by `ONSET_ENVELOPE_LEAD_SEC`. Then,
  if `startAt` is given, bar one goes at the lattice beat nearest it
  (`byStart`, no vote). Otherwise the three witnesses vote. An undecided
  vote is a `downbeat-undecided` refusal carrying the full reading, so a
  page can say why bar one was not placed. A decided vote places bar one
  (§7).
- `features.duration` is the recording's length, and `features.firstSound`
  is the first sound.

### 6.4 Aligning a chart

```ts
type AlignInput = {
	chart: string;                         // barmark text
	features: Features;
	/** Grammar 2.1 bpm for bars the chart gives no tempo; the app passes the song's. */
	tempo?: number;
	/** The song's start of bar one; the fit measures bar one from max(startAt, firstSound). Default 0. */
	startAt?: number;
	recording?: { id?: string };           // copied into the map
};

type Alignment = {
	barStarts: number[];                   // played bars + 1; the re-phased starts, else the path's
	rawBarStarts: number[];                // the warping path's own
	repair: { period: number; confidence: ("aligned" | "re-phased")[]; delta: number; rephased: number } | null;
	cost: number;                          // mean step cost, cosine distance 0..1
	controlCost: number;                   // the same, every chord a tritone away
	ratio: number;                         // controlCost / max(cost, 1e-6)
	localCost: number[];                   // per played bar
	localMedian: number;
	samePiece: boolean;
	declaredBar: number;                   // the median of the chart's bar seconds
	beatsPerBar: number;                   // the most common numerator among played bars
	hopSec: number;
	firstSound: number;
	lastSound: number;
};

/** `ratio` here is the app's fit ratio, controlCost / cost (Infinity at cost 0); `Alignment.ratio` is the placements' (cost floored at 1e-6). Both are kept as the app has them. */
type Fit = { bar1: number; medianBar: number; declaredBar: number; ratio: number };

type Placements = {                       // the app's AlignedPlacements, unchanged
	sections: { name: string; start: number; hedged: boolean }[];
	keyChanges: { at: number; key: string; hedged: boolean }[];
	tempoChanges: { at: number; bpm: number; hedged: boolean }[];
};

type AlignedChart = { timing: TimingMap; alignment: Alignment; fit: Fit; placements: Placements };

alignChart(input: AlignInput, options?: ListenOptions):
	Ok<AlignedChart> | Refused<{ alignment: Alignment | null; placements: Placements | null }>;
```

- **The chart is barmark text, read by barmark (design call).** The app
  converts it with `barmarkChartBars` to its `ChartBar` first. The package
  reads `parseChart(chart).bars` directly (`chartPadBars`), with the app
  adapter's rules for slots: a chord slot sounds its `ChordRecord` (root and
  pitches as pitch classes, the slash bass among them, no repeats); `/`
  holds; `N.C.` and silence are silent; `?` holds, with a warning; a group
  plays its first member; a note set (a rootless record) holds, as the
  app's `chordPitchClasses` returned null for it; an empty bar holds.
  The app's `SPELLINGS` table, which rewrote older charts' spellings before
  `parseChord`, is dropped: barmark text is already barmark.
- **Bar seconds** follow barmark's own tempo rule: `tempo:` counts the beat
  of the `time:` meter in force (`bar.time ?? bar.meter`), and a bar lasts
  its own meter's length in that beat. This is the rule `@barmark/midi`'s
  `perform` uses (`quarters.ts`), and it gives the app's seconds for every
  chart the app keeps (6/8 at `tempo: 40` is 3 s, as the app's 6/8 at 120
  eighths). rit. and accel. are read at the steady tempo, as the app's
  adapter reads them.
- The map covers every played bar: `bar: index`, a pickup at index 1, the
  `end` included, `source: "aligned"`, `recording.duration` set to
  `features.duration`. It is checked by `checkTimingMap` against the text.
- **A refusal still carries the alignment and the placements** whenever the
  warping ran, because the app places a chart's sections (hedged) even
  when the map is not kept. The refusals after the warping are the fit's
  rules and the same-piece gate (§14 Q1), all of them listed, not the
  first only.

### 6.5 The whole pipeline

```ts
type RecordingInput = {
	/** Mono PCM and its rate, or features computed earlier (for instance from a cache). */
	samples?: Float32Array;
	sampleRate?: number;
	features?: Features;
	chords: ChordRuns;
	declared: Declared;
	startAt?: number | null;
	/** Passed to chartFromDetections as given. */
	title?: string;
	key?: Detected<string> | null;
	sections?: { name: string; start: number; confidence?: number }[];
	changes?: Change[];
	recording?: { id?: string };
	/** What an undecided vote does: refuse (default), or build on the declared grid with a warning. */
	onUndecided?: "refuse" | "declared";
};

type RecordingChart = {
	chart: string;
	timing: TimingMap;
	confidence: ConfidenceRecord;
	/** The builder's own diagnostics, unchanged. */
	diagnostics: BuildDiagnostic[];
	grid: PlacedGrid | null;               // null when built on the declared grid
	/** The features used, so a caller can cache them. */
	features: Features;
};

chartFromRecording(input: RecordingInput, options?: ListenOptions & FeatureOptions & { build?: BuildOptions }):
	Ok<RecordingChart> | Refused<{ reading: GridReading | null; features: Features | null }>;
```

- The steps are features (unless given), then `findGrid`, then
  `chartFromDetections({ grid, pickup, chords, meter: declared.meter,
  title, key, sections, changes, recording: { id, duration } })`. No
  tempo is passed: the builder derives it from the grid, which is the
  comb's exact period. That is what the app does.
- `recording.duration` is the recording's length (`features.duration`).
  The app passes the grid's end (design call: the map should say how long
  the recording is).
- A builder `error` (only `grid-unusable`) cannot follow a placed grid.
  If it happens anyway it is `invalid-input` with the builder's message,
  never an empty chart returned as success.
- **An undecided vote refuses by default (design call; §14 Q2).** With
  `onUndecided: "declared"` the pipeline builds on the declared grid
  instead: bar one at `startAt ?? 0`, the declared bar, to the recording's
  end. It adds `bar-one-unplaced`. The app and the bench do this today,
  and Study 34 counts it as "the pipeline's own choice".
- One call is all a public tool or the bench needs. The app can keep
  calling the stages it already calls in its own order (§11.1).

## 7. Pickups end to end (grammar 2.4)

**What the grid does.** Study 31c's placement is unchanged. Take the
voted class's latest lattice point `a` at or before `firstSound +
PLACEMENT_FIRST_SOUND_SLACK_BEATS × beat`. The bar from `a` holds the first
sound. Then count how many lattice beats into that bar the first sound
comes:

```
j = floor((firstSound − a) / beat + PLACEMENT_FIRST_SOUND_SLACK_BEATS)   // 0 ≤ j < beatsPerBar by construction
```

- `j = 0`: no pickup. Bar one is `a`. If `a` is before 0:00 (by less than
  the slack, a quarter beat) it is clamped to 0, with `bar-one-clamped`,
  as the app clamps it today.
- `j ≥ 1`: the first sound comes `beatsPerBar − j` beats before the next
  downbeat. That is **a pickup** (**Kevin's decision (2026-11-09)**: "when
  the first sound comes before bar one by less than a bar"). Bar one is
  `a + period`, and `grid.bars` starts there. `pickup = { start:
  max(0, a + j × beat), beats: beatsPerBar − j }`, with a `pickup` warning.
- With `startAt` (byStart) the same reading applies around the bar one the
  start gives. If the first sound is more than the slack and less than a
  bar before it, that is a pickup, found the same way. A bar or more
  before it gives `sound-before-start` and no pickup (design call: a
  person's start of bar one wins, and the intro is theirs to chart).

**The times do not move.** Every bar line is where the app puts it today.
In the case the app clamps (`a < 0`, a short first bar numbered 1) and the
case it gives a bar opening in silence (`a ≥ 0`, `j ≥ 1`), the first grid
bar becomes a pickup that starts at the first sound's beat. This is my
reading of Kevin's decision (design call, §14 Q3). It drops the silent
beats before a pickup from the grid. In the clamped case that changes
nothing but the label.

**What the builder writes.** The pipeline passes `pickup: { start }` to
`chartFromDetections`. sync's `readPickup` rounds the gap to whole beats
and writes the first bar with its own one-bar meter (`| [2/4] G | C …`).
Under grammar 2.4 barmark numbers that bar 0 (`written`). Its `index` is
1, so the timing map's first entry is `{ bar: 1, start: pickup.start }`,
exactly as before 2.4. The confidence record and `chartHash` are
unchanged by the numbering.

**Compound meters.** The lattice counts numerator beats (eighths in 6/8),
but `readPickup` builds the pickup from barmark beats (dotted quarters) and
rounds to whole ones. So an eighth-note pickup in 6/8, a common one, rounds
to 0 and is ignored (`pickup-ignored`, info), and the first bar's chords
fall outside the grid. v1 leaves that as it is and says so. The fix belongs
to sync (§14 Q4).

## 8. The refinement contract in `@barmark/sync`

```ts
type RehashReason = "no-timing" | "unparsed" | "bars-differ" | "meters-differ";

rehashTiming(
	/** `BuildResult` fits as is; `chart` is the built text, for rule 4. */
	built: { timing: TimingMap | null; confidence?: ConfidenceRecord | null; chart?: string },
	refined: string,
	options?: { parse?: ChartParse },
):
	| {
			ok: true;
			timing: TimingMap;
			confidence: ConfidenceRecord | null;
			confidenceDropped: boolean;
			meters: "checked" | "unchecked";
	  }
	| { ok: false; reason: RehashReason; message: string };
```

The name follows the brief. It says what happens to the map, and the
reasons say why it might not.

**Rules, in order:**

1. `built.timing` is null, so there is nothing to carry: `no-timing`.
2. `refined` parses with an `error` diagnostic: `unparsed` ("The refined
   chart has errors (line N: …); the timing map was dropped.").
3. Its played-bar count differs from `timing.chart.bars`: `bars-differ`
   ("The refined chart plays 76 bars where the map has 78; …"). The
   app's check today is this rule alone.
4. A played bar's meter (`n/d`, compared by value) differs from the
   built chart's at the same `index`: `meters-differ`. This is stricter
   than the app (design call, §14 Q5). A refinement names sections and
   corrects spellings. One that turns a 4/4 bar into two 2/4 bars, or
   moves a repeat so that a 3/4 bar lands where a 4/4 one was, plays
   different bars even when the count holds, and the map's starts no
   longer mean what they say. The rule needs the built chart's meters, so
   `built` carries the built `chart` text: `BuildResult` and the
   pipeline's result both have it. Without it, rule 4 is skipped and the
   result says so (`meters: "unchecked"`).
5. Otherwise the result is the same map with `chart.hash` set to
   `chartHash(refined, parse)`. It is checked by `checkTimingMap(map, {
   text: refined })` before it is returned.

**The confidence record** keys played bars and slots. It is kept when
every played bar has the same slot count. Otherwise it is dropped
(`confidenceDropped: true`) and the map is still kept: a spelling fix keeps
slots, and a regrouped bar does not.

**Where:** `packages/sync/src/timing/rehash.ts`, exported from both
`@barmark/sync` and `@barmark/sync/timing`. It needs only `parseChart` and
the timing code, so the timing subpath stays free of builder code (the
`ConfidenceRecord` import is type-only). The release is sync 0.4.0, a
minor (§12).

## 9. Features: the cache contract

- **Shape:** `Features` (§6.1) is plain data: numbers, strings, two
  `Float32Array`s. There are no class instances, functions or shared
  buffers, so it survives `structuredClone`, `postMessage` (with the two
  buffers transferable) and IndexedDB as it is. That is how the app keeps
  it today (`audio/alignmentFeaturesCache.ts`).
- **Version:** `FEATURES_VERSION` (an integer, starting at 1) is bumped
  whenever `chromagram`, `audibleSpan`, the onset decimation,
  `onsetEnvelope` or `detrend` change what they compute, including any
  fixed parameter of §5.3. `readFeatures` refuses another version
  (`features-version`), and the CHANGELOG entry names the bump. The app
  folds it into its key (today's `af1:<rate>:<renditions>` becomes, say,
  `af<FEATURES_VERSION>-lf1:…`), so an upgrade invalidates the cache
  without the app tracking the package's internals.
- **What it depends on:** the samples, the sample rate, and the two sound
  options (recorded in `sound`). A cache keys on the audio and the rate,
  as the app's does. A record at another rate is a miss: the chart's render
  has to share the chroma's hop.
- **JSON:** typed arrays don't survive `JSON.stringify`. v1 has no JSON
  codec (design call). The app stores structured clones, and the bench
  can write the two arrays as binary beside a JSON header. A codec is
  additive if a host needs one.
- **Determinism:** in one engine the same input gives the same bits. Across
  engines, `Math.cos`, `Math.log1p` and `Math.exp` may differ in the last
  place (V8 and JavaScriptCore), so a record made in a browser and read in
  Bun can differ from a fresh one by rounding. No decision in the pipeline
  is sensitive at that scale on any fixture. The tests compare features
  within 1e-6 relative and discrete results (classes, refusals, bar
  counts) exactly.
- **Browser worker and Node:** every function is synchronous, pure and
  allocation-bounded (§10). It has no globals beyond `Math` and typed
  arrays. The package never creates a worker. The README shows the two
  usual set-ups: one worker running `recordingFeatures`, or two running
  `chromaFeatures` and `onsetFeatures`, joined by `joinFeatures`.

## 10. Size limits: time and memory

| Stage | Time | Memory |
| --- | --- | --- |
| Features | O(N log W) in samples N | the two outputs: 4-min song ≈ 127 KB chroma + 83 KB envelope |
| Comb | about 122 periods × (bar ÷ 10 ms) phases × (duration ÷ bar) points, ≈ 3 M steps for 4 minutes; linear in duration | the detrended envelope |
| Section witness | beats × Σ(2L)² = beats × 1,280 for spans 8 and 16; linear | beats × 12 |
| Harmonic witness | linear in beats + frames | frames |
| DTW | **chart frames × recording frames**, twice (the tritone control) | **one byte a cell** (the step table) + three rows |

**The DTW is quadratic, and its ceiling is `DTW_MAX_CELLS` (150 M).** The
chroma hop is about 0.093 s at 22,050 and 44,100 Hz (10.8 frames a second)
and 0.085 s at 48,000 Hz (11.7). With a chart as long as its recording,
the ceiling is about 19 minutes at 44.1 kHz and 17.4 minutes at 48 kHz.
Past it, `alignChart` refuses with `too-long`, with `detail: { cells,
limit, chartFrames, recordingFrames }`, before it allocates. At the
ceiling the step table is 150 MB. The control warping reuses that table
instead of allocating a second one (design call: same numbers, half the
peak). The app measured both warpings of a 140 s song at 0.19 s together,
about 42 ns a cell, so the ceiling costs about 13 s in Node. The grid has
no quadratic stage. A recording's length bounds it only through
`MAX_GRID_BARS` (2,000 bars, over half an hour at any tempo).

A banded DTW (Sakoe–Chiba) would make the alignment linear, but it changes
the path. It is out of v1 and would need a study.

## 11. Module layout and the port

One stage per module, as in sync's `build/` and musicxml's `import/`:

```
packages/listen/
  src/
    index.ts            the four calls, the options, the types
    options.ts          DEFAULTS (5.1 and 5.2 with their doc comments), resolve and validate
    result.ts           Ok, Refused, Refusal, ListenWarning, the reason and code unions
    features/
      index.ts          the ./features entry: no barmark or sync import
      fft.ts            fft
      onset.ts          decimation to ≈ 22,050 Hz, onsetEnvelope (paired FFT), detrend
      chroma.ts         chromagram, its window per rate
      sound.ts          audibleSpan
      features.ts       recordingFeatures, chromaFeatures, onsetFeatures, joinFeatures, readFeatures
    comb/
      comb.ts           jointOnsetComb (phase score, period ladders)
      span.ts           trustedSpan, phaseLine
      slide.ts          combSlide
      rephase.ts        rephaseGrid
      ends.ts           repairEnds (v3 reference)
    grid/
      lattice.ts        gridLattice, the lattice's beats
      beats.ts          beatChords: ChordRuns voted per beat
      witnesses.ts      timeZeroWitness, harmonicRhythmWitness, histogramVote
      sections.ts       beat chroma, checkerboardNovelty, novelty peaks, sectionWitness
      vote.ts           downbeatVote
      place.ts          placeBarOne, bar one at a start, the pickup (§7), bar starts
      grid.ts           findGrid
    align/
      bars.ts           chartPadBars: parse → pad bars, bar seconds, pitch classes
      render.ts         renderChartPads
      dtw.ts            dtwAlign (rows, steps, backtrack, frame costs)
      path.ts           alignPath: render, chroma, both warpings, local costs
      rephase.ts        rephaseAlignment (comb + rephaseGrid + the lead)
      fit.ts            alignmentFit → refusal reasons
      placements.ts     samePiece, alignedPlacements
      timing.ts         alignedTimingMap
      align.ts          alignChart
    pipeline.ts         chartFromRecording
    stages.ts           the ./stages entry
  tests/                (§11.3)
  README.md, CHANGELOG.md, LICENSE, package.json, tsconfig.build.json
```

### 11.1 What comes from where

| Package module | App source (read-only, `stem-shovel/src/lib/`) | Lines in app |
| --- | --- | --- |
| `features/fft.ts`, `features/onset.ts` | `audio/analysis.ts`: `fft`, `splitMagnitudes`, `fluxOver`, `onsetEnvelope`, `detrend` only; `audio/chartAlignment.ts`: `onsetRate`, `alignmentEnvelope` | ≈ 110 of analysis.ts's 689, + 30 |
| `features/chroma.ts`, `sound.ts`, `features.ts` | `audio/chartAlignment.ts`: `chromaWindow`, `chromagram`, `audibleSpan`, `recordingFeatures` | ≈ 90 |
| `comb/*` | `audio/alignmentRepair.ts`, all of it | 300 |
| `grid/*` | `audio/chartlessGrid.ts`, all of it; `utils/chordminiBarChords.ts` | 369 + 62 |
| `align/bars.ts` | the slot rules of `utils/barmarkChartBars.ts`; `utils/chordPitchClasses.ts` less `SPELLINGS`; `utils/chartBarSeconds.ts`, `utils/meterBeats.ts`, `utils/median.ts` | ≈ 80 |
| `align/render.ts`, `dtw.ts`, `path.ts`, `rephase.ts` | `audio/chartAlignment.ts`: the rest | ≈ 380 |
| `align/fit.ts`, `placements.ts`, `timing.ts` | `utils/alignmentFit.ts`, `utils/alignedPlacements.ts`, `utils/alignedTimingMap.ts` | 73 + 101 + 27 |
| `options.ts` | `constants/chartAlignment.ts`, all 21, comments verbatim | 166 |

**Not ported** from `analysis.ts`: `extractFeatures`, the tempo, meter
and key detectors (`detectTempo`, `findPulse`, `subdivisionOf`,
`tempoAlternates`, `detectMeter`, `detectKey`, `detectKeys`, the key
segments). They are about 570 lines. Study 34 decides whether tempo and
meter detection come over (§13 Q1). Key detection is not the pipeline's.

### 11.2 What changes in the port

- **`ChordminiRuns` → `ChordRuns`** (**Kevin's decision**). `beatChords`
  reads frames when `frameSec` is given, and the app's ChordMini runs fit
  sync's type as they are (sync ignores `version`, `frames` and `chord`).
  Three details (design calls):
  - `frames` (ChordMini's total) is not in `ChordRuns`, so the frame
    count is the largest run `end`. That gives the same answer: a beat
    past every run votes "N.C." either way.
  - A run's chord is `harteToBarmark(label) ?? "?"`, as the app re-spells
    on read. A `symbol` run reads as barmark's canonical spelling when
    `parseChord` reads it, else as written, so `A-` and `Am` count as one
    chord and not as a change.
  - Runs in seconds (no `frameSec`) vote each beat by covered time, which
    the app never needed. Overlaps resolve as sync's do (the later onset
    wins), which matches the app's later-run-overwrites for frame runs.
- **Throws become refusals.** These are `alignChartPath`'s five throws,
  `scanPeriods`' "empty period scan" (now unreachable: options validation
  guarantees a non-empty ladder) and every `null` return that meant "no".
- **Constants come from the options**, threaded through as one resolved
  object. There are no module-level imports of thresholds.
- **The chart comes in as text** and goes through `parseChart` (§6.4). The
  app's `ChartBar`, `bpm` in the bottom-note unit and `SPELLINGS` stay in
  the app.
- **The rendering rate is `features.sampleRate`**, so the app's "features
  at another rate" throw cannot happen. A mismatched record is caught by
  `readFeatures`.
- **App-only pieces stay in the app:** the workers
  (`alignChart.worker.ts`, `alignmentEnvelope.worker.ts`,
  `recordingFeatures.worker.ts`), the IndexedDB cache, the Effect
  plumbing, `alignmentFeaturesKey`, `formatTime` sentences, `barGrid` and
  the song's changes, `ChartDraftSchema`.
- **New behavior, each listed in §11.4 as an expected difference:** the
  pickup (§7), `no-period`, `grid-truncated`, `not-same-piece` as a map
  refusal (§14 Q1), the map's `recording.duration`, and the pipeline's
  default refusal on an undecided vote.

### 11.3 Testing

The working agreement applies: write a failing test first, keep Fallow
clean, use `bun test`.

1. **The app's suites as the starting suite.** These are
   `chartlessGrid.test.ts` (282 lines), `chartAlignment.test.ts` (177),
   `alignmentRepair.test.ts` (157), and the relevant cases of
   `server/chartBuild.test.ts` (110: the model's frame runs used as they
   are, and an unusable grid giving no chart). The util tests come too:
   `alignmentFit.test.ts` (82), `alignedPlacements.test.ts` (163),
   `alignedTimingMap.test.ts` (29), `chordminiBarChords.test.ts` (68).
   That is about 1,070 lines, all synthetic, no audio. Their helpers
   (seeded draws, 100 fps envelopes with smeared hits, chord runs on
   downbeats, sectioned chroma, pad renders) move to `tests/helpers/`. The
   chart-shaped inputs (`{ chords, bpm, meter }`) are rewritten as barmark
   text. `chartBuild`'s 6/8 tempo conversion and key re-spelling are the
   app's adapter, and they stay in the app.
2. **The 65 Hz sine kick** (**Kevin's decision**). Study 32's first run
   failed on the bench's own fixture because a 65 Hz sine kick is
   invisible to the spectral flux. The fixture is 22,050 Hz PCM at 120
   bpm in 4/4: a kick that is a 65 Hz sine with a 5 ms attack and a 60 ms
   decay on beats 1 and 3, and pads carrying the chords. The tests:
   - (a) The envelope does not see it: the detrended flux at the kick
     frames is within a small factor of the median frame. This test
     *documents* the weakness.
   - (b) With a broadband hit (a 30 ms noise burst) added on beats 2 and 4,
     the grid is right: bar one within 0.03 s, period within 0.05 %.
   - (c) Kick and pads alone: the result is recorded exactly, as a
     refusal or a grid. The test asserts that it is not a decided grid
     whose bar one is off the truth. If the port finds one, that is a
     confidently wrong case: a FINDINGS.md entry and a question for
     Kevin. The fix it calls for (a comb-contrast refusal) needs a
     threshold Study 34 should set (§13 Q4). It is not invented in the
     build.
3. **Property tests** (seeded; the numeric code warrants them):
   - `fft` equals a naive DFT within 1e-4 on random lengths 2 to 4,096.
   - The paired-FFT envelope equals one frame per FFT within 4e-6. That is
     the app's own measure when it changed this.
   - `chromagram` of a sine peaks at its pitch class for all twelve, at
     16, 22.05, 44.1 and 48 kHz.
   - `dtwAlign`'s path is monotone, starts at reference frame 0, ends at
     the last, and has a step set of (1,1), (1,2) and (2,1). A sequence
     against itself costs 0. A chart at more than twice the recording
     finds no path.
   - The comb finds random lattices (period 1.2 to 3 s, any phase, noise,
     declared within ±8 %) within 0.05 %.
   - `downbeatVote` is invariant under the witnesses' order, and an
     abstaining witness changes nothing.
   - For random `firstSound`, bar one holds the first sound, or a pickup
     is reported with `pickup.start ≤ firstSound + slack` and
     `1 ≤ beats < beatsPerBar`.
   - A grid is strictly increasing and uniform at the comb period except
     a clamped first bar, and ends at or before the duration.
4. **Never throws:** each entry point with `NaN`, `Infinity`, empty and
   mismatched arrays, negative rates, wrong-typed options and a junk
   features record returns a refusal. It never throws, and never succeeds
   on garbage.
5. **Scale:**
   - DTW time grows with cells, not faster: 1 M against 4 M cells within
     a factor of 6. The test times relative, not absolute.
   - `too-long` returns at once for 12,300 × 12,300 frames. The input is
     views of one shared zero frame, so it is cheap, and nothing is
     allocated.
   - The comb and the grid are linear in duration: 1 against 8 minutes
     within a factor of 12.
   This follows `@barmark/midi`'s `export-scale.test.ts`.
6. **Equivalence with the app.** `scripts/listen-equivalence.ts` runs on
   the VM only, never in CI, like `musescore-fixtures.ts` and
   `detection-fixtures.ts`. It imports the app's pure modules read-only
   from `~/projects/stem-shovel/src/lib/` (Bun resolves the app's `#lib/*`
   from its `package.json` `imports`). It runs them and the package on
   every app fixture plus a seeded set of synthetic songs (4/4, 3/4, 6/8,
   tempos 60 to 224, pickups, mid-bar starts, flat harmony). It writes the
   app's outputs, numbers and labels only, to
   `packages/listen/tests/fixtures/equivalence/*.json`.
   `tests/equivalence.test.ts` checks the package against those goldens
   in CI. Values must match exactly, since this is the same engine and the
   same arithmetic order, apart from the listed differences (§11.2), each
   asserted as its own expected value: the clamped and silent-headed first
   bars become pickups with the same bar times, and so on. The script
   records the app's commit it ran against.

### 11.4 Where the equivalence may differ, and why

The differences are exactly the new behaviors in §11.2. Anything else that
differs is a porting bug. The goldens make that a failing test, not a
review finding.

## 12. Adoption and release

### 12.1 The app

It adopts the package the way it adopted sync in v0.244.0:

1. Pin `@barmark/listen` exactly (and sync, for `rehashTiming`).
2. Replace `chartlessGrid.ts`, `alignmentRepair.ts`, `chartAlignment.ts`,
   the fit, placements and aligned-map utils, `chordminiBarChords.ts`'s use
   in the grid, and the constants file with imports. Each module goes
   behind its existing tests first. Those tests stay until the module is
   gone.
3. The workers call `chromaFeatures` and `onsetFeatures` (or
   `recordingFeatures`) and `alignChart`. The cache key folds in
   `FEATURES_VERSION` (§9).
4. Pass `onUndecided: "declared"` if the app keeps today's fallback, or
   keep its own declared grid and call `findGrid`.
5. Replace the inline re-hash in `remote/songs.remote.ts` with
   `rehashTiming`, and show its message on the card.
6. Run `bun run db:chart-check` on every stage, then ship.

`analysis.ts` keeps its detectors. Only `fft`, `onsetEnvelope` and
`detrend` lose their pipeline callers, and the app's key detection still
uses `fft`.

### 12.2 The bench

The bench re-pins its pipeline against the package in place of its port,
as its Study 34 answer already registers ("when the app extracts the
pipeline as a package, the bench re-pins against it"). A sweep passes
options. A study that uses the package records its exact version beside its
results.

### 12.3 Release

- **Order** (as Kevin set it in #17): first barmark's current releases
  (the pickup-bar-0 train: barmark 0.22.0, render, musicxml, sync 0.3.0,
  midi; an `@barmark/score` patch; then barmark.dev). Then **sync 0.4.0**
  (`rehashTiming`, a minor), followed by the `@barmark/midi` patch
  ("Requires `@barmark/sync` 0.4.0"), the CLI and the `kevinpeckham/songs`
  bump, as CLAUDE.md asks after a sync minor. Then **`@barmark/listen`
  0.1.0**.
- **A new package's first release** (RELEASING.md, "A new package's first
  release"). Kevin publishes a placeholder 0.0.0 under `@barmark/listen`
  from his Mac (`npm whoami` first; logged out, npm answers with a
  misleading 404). He then sets the trusted publisher (GitHub Actions,
  `kevinpeckham/barmark`, `release.yml`, environment `npm`), adds the
  `listen-v*` tag rule to the "release tags" ruleset and to the `npm`
  environment, and adds `package (20|22|24, listen)` to the required
  checks. None of this can be done from the VM: its npm token is invalid.
- **In the repo, with the package:** CI's package matrix gains `listen`.
  `scripts/verify-package.ts` and `verify-release.ts` accept `listen`. The
  Swamp `release-check` input and the `/release` skill list it, the
  CLAUDE.md layout gains `packages/listen/`, the RELEASING tag list gains
  `listen-vX.Y.Z`, and the README and CHANGELOG are written.
- **CLI: out of v1** (design call). The chartless path needs chord runs
  from a model the CLI does not have. The one command that would make
  sense is `barmark align chart.md take.wav`, which needs no model. It
  still needs a WAV reader, puts listen into the binary, and raises the
  question of which audio formats to accept. That is not trivial, so it is
  the first candidate after v1. `@barmark/listen` releases therefore need
  no CLI release until the CLI uses it.

## 13. Open questions for Study 34, and what each would change

1. **Meter and tempo detection.** A public upload has no declared tempo.
   - If Study 34 shows the app's detector, or a wider comb, finds tempo
     and meter reliably, the package gains `detectMeterTempo(features)`:
     a port of `analysis.ts`'s tempo ladder and meter test, or a comb
     searched over candidate bars. `declared` then becomes optional
     (additive, a minor).
   - If octave errors show up at extreme tempos (under 70 or over 180),
     the comb's ±10 % may need candidate bars at ½×, 2× and 3⁄2×, with the
     vote or a fit choosing between them. That changes the comb stage and
     needs its own registered threshold.
2. **3/4 and 6/8.** v1's lattice counts numerator beats (6 classes in 6/8)
   because that is what was measured, on four 4/4 and 3/4 songs. If 6/8
   songs fail the vote, the lattice may need the compound beat (2 classes)
   for the witnesses while the comb keeps the bar. That changes
   `beatsPerBar`'s meaning, the fence (`REPHASE_FENCE_BEATS` counts these
   beats) and the pickup's beat. It goes with §14 Q4.
3. **Phone recordings (S34-G3).** The time-zero witness assumes a DAW
   export starting on a bar line. A phone capture does not, so the witness
   will mostly abstain. The vote then rests on the chord changes alone,
   which can still reach `DOWNBEAT_MIN_SCORE` 2. The open part is the off-comb
   margin, which needs 2 over class 0. Room noise also lifts the
   `ALIGNMENT_SOUND_FLOOR`'s reference, which moves `firstSound` and so
   the placement. Possible outcomes are a `source: "capture"` input that
   drops the time-zero witness, a different floor for captures, or a
   warning on phone input. Each is a new option or an input field
   (additive).
4. **The confidently wrong class (S34-G1).** If a corpus song gets a
   decided, wrong grid, or a fit that passes on a wrong chart, the remedy
   is a new refusal reason, such as a comb-contrast floor (the 65 Hz kick
   case), a vote-margin floor or a tighter same-piece gate. Its threshold
   is registered by the study. The union grows, which is additive for
   callers that switch on known reasons with a default.
5. **The same-piece gate's breadth.** 1.6 and 0.3 come from two songs of
   one band (the constants say so). Study 34 may move them. They are
   options already, and a new default is a minor with the study named.
6. **Modulation and extended harmony.** The harmonic witness counts
   changes between chords, so a key change does not matter to it.
   Extensions may split a run into more changes (Cmaj7 → C6 inside a bar)
   and thin the histogram. If so, `beatChords` could compare roots and
   qualities only, a rule the study would set.

## 14. Questions only Kevin can answer (with my recommendation)

1. **Should "not the same piece" refuse a timing map?** Today the app keeps
   an aligned map when the fit passes (the ratio ≥ 1.5 among its rules).
   The same-piece gate (ratio ≥ 1.6 and median local cost ≤ 0.3) only
   hedges placements. Study 16's wrong pairing scored 1.74, so it passes
   the fit's ratio. *Recommendation: yes.* The map is refused with
   `not-same-piece` as well as the fit's reasons. It is stricter than the
   app by exactly the Study 16 case, which is S34-G1's concern. `weak-fit`
   (1.5) then never fires alone, and I'd keep it only as a reason name for
   the bench.
2. **What should the pipeline do on an undecided vote by default?**
   *Recommendation: refuse.* A public tool shows the reason, and the app
   and the bench pass `onUndecided: "declared"` to keep today's behavior,
   which Study 34 records as the pipeline's choice.
3. **Is §7 the right reading of your pickup decision?** Bar one becomes the
   first downbeat after the first sound, and silent beats before a pickup
   leave the grid. That covers the clamp case and a bar that opens in
   silence. *Recommendation: yes.* Bar times don't move, only the label
   and the first bar's start.
4. **Should eighth-note pickups in compound meters be allowed?** sync's
   `readPickup` builds them in whole dotted-quarter beats, so a
   one-eighth pickup in 6/8 is ignored. Grammar 2.4 already allows `[1/8]`
   before 6/8. *Recommendation:* a sync patch that writes `[k/8]` for any
   whole number of eighths in a compound meter. It is separate from
   listen v1, and before Study 34's 6/8 song if possible.
5. **How strict should `rehashTiming` be?** It refuses when a played bar's
   meter changes, not only the count. *Recommendation: yes.* The map's
   starts mean nothing on a bar of another length, and a refinement that
   only names and spells never trips it.
