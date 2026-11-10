# @barmark/listen: a recording to a chart, and a chart to a recording: design

**Status:** approved by Kevin on 2026-11-09 (the approach, then this design's
five questions, §14). The approach was approved in reply to Stem
Shovel's brief (`stem-shovel/docs/barmark-brief-chart-from-recording-2026-11-09.md`).
His decisions are posted on kevinpeckham/stem-shovel#17 and are marked
**Kevin's decision (2026-11-09)** below. My own choices are marked
**(design call)** so he can check them. Revised after one review round
(2026-11-09). The questions only he can answer are collected in §14. No
grammar change. Nothing here is code yet. The build starts after
barmark's current releases (§12).

## 1. Intent

Half of Stem Shovel's (SS) recording-to-chart path is already in barmark:
`@barmark/sync` builds the chart and its timing map from detections on a
grid. The other half is about 1,200 lines of pure TypeScript inside the
app: the features, the onset comb, the chartless grid and its downbeat
vote, the chart alignment by dynamic time warping (DTW), the fit and the
placements. The bench (kevinpeckham/stem-bench) keeps a second copy by
hand (`src/study12/dtw.ts`, `src/study24/tempo.ts`, `src/study26/recipe.ts`,
`src/study27/rephase.ts`, and the vote in the Study 31/32 scripts).

So the same math exists in three places: the app, the bench, and nowhere
in barmark. A study measures the bench's port, not the code the app runs,
and a public tool would need a fourth copy. `@barmark/listen` puts that
math in one package. The app, the bench and a future public tool import
it, and a study measures the code that ships.

### Goals

1. The four calls of §6: PCM to **features** (cacheable; browser worker
   and Node), features and **chord runs** and a **declared meter and
   tempo** to a **grid**, an existing chart **aligned** to a recording, and
   the **whole pipeline** from PCM to chart, timing map and confidence.
2. **Refusals are values**: every stage returns a result or named
   reasons, and never throws.
3. Every bench-set threshold keeps its value and provenance, **exported and
   overridable** so the bench can sweep what the app keeps at default.
4. **`rehashTiming`** in `@barmark/sync`, so every caller carries a timing
   map across a refinement by one rule (§8).

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
  (§11.3). Improvements such as a banded DTW or a wider comb come later
  and need a study.
- **Workers, caches and storage.** The package exports pure functions.
  The host decides where they run and where features are kept (§9).
- **A CLI command** (§12).

### Anti-goals

These are things the design must never do:

- **Lose a threshold the bench set.** Every constant in the app's
  `constants/chartAlignment.ts` comes over with its value, its study and
  its doc comment. That includes `REPAIR_SLIDE_FRACTION`, which only the v3
  reference `repairEnds` reads (§11). A default changes only with a
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

Posted on stem-shovel#17:

1. **A new package**, `@barmark/listen`, depending on `@barmark/sync`.
2. **One detections shape:** sync's `ChordRuns`, read by both the
   harmonic witness and the builder.
3. **Meter and tempo** are declared by the caller in v1; the comb searches
   ±10 % (`COMB_RANGE_FRACTION`).
4. **Pickups:** the grid reports one when the first sound comes before bar
   one by less than a bar; the builder writes it as bar 0 (grammar 2.4),
   and `index` (so the timing map) still counts it as play position 1.
5. **Constants** exported with their defaults and studies, overridable
   through an options object.
6. **The refinement contract** in `@barmark/sync`: the re-hashed map, or
   why it was dropped (doesn't parse; plays different bars).
7. **Kept as written:** refusals never throw; ESM only, no DOM, no new
   runtime dependencies; cacheable features in a worker and in Node; the
   65 Hz sine-kick fixture.

## 3. The package

- `packages/listen/`, published as `@barmark/listen`, ESM only, `"type":
  "module"`, `sideEffects: false`, Node ≥ 20, MIT, version 0.1.0.
- **Runtime dependencies:** `barmark` (`parseChart`, `beatsOf`,
  `parseMeter`, `harteToBarmark`, `parseChord`) and `@barmark/sync`
  (`ChordRuns`, `Grid`, `TimingMap`, `chartFromDetections`, `chartHash`,
  `checkTimingMap`), both `workspace:^`, so they publish as carets on the
  versions current at release. There is nothing else, and no
  devDependency is needed beyond what the workspace has.
- **Build:** `tsconfig.build.json` with `"lib": ["ESNext"]` and `"types":
  []`, as in sync. That makes a DOM or Node global a compile error, which
  enforces "no DOM" by the compiler and not by review. No `TextEncoder`,
  no `performance`, no `Worker`, no `Buffer`.
- **Entry points (design call):**
  - `@barmark/listen`: the four calls, the options and the types. It also
    re-exports the features API (everything in `./features`), so a host
    that already imports the root needs no second import. The refinement
    helper is sync's (§8) and is imported from sync, not re-exported.
  - `@barmark/listen/features`: `recordingFeatures`, `chromaFeatures`,
    `onsetFeatures`, `joinFeatures`, `readFeatures` and the `Features`
    type. **It imports nothing from `barmark` or `@barmark/sync`**, so a
    worker that only computes features bundles a few hundred lines. This
    follows `@barmark/sync/timing` and `@barmark/midi/perform`.
  - `@barmark/listen/stages`: each stage's function (the layout in §11
    lists them) for the bench, which measures stages one at a time. It
    follows semver like the rest, but its README says the stages are the
    bench's instruments and may change shape in a minor before 1.0. The
    four calls are the stable surface.

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
| `invalid-input` | all | Samples empty or containing a non-finite value; sample rate not a finite number from 8,000 to 384,000; declared meter unreadable by `parseMeter`; declared tempo not 1 to 999; `startAt` not a finite number ≥ 0; chart not a string; `chords.frames` not a whole number ≥ 0. `detail.field` names the field. |
| `invalid-option` | all | An option is unknown or out of its range (§5.3). `detail.option` names it. |
| `features-invalid` | features | `readFeatures` was given something that is not a features record, or whose arrays do not match its counts. |
| `features-version` | features | The record's `version` is not this package's `FEATURES_VERSION`. A cache treats this as a miss. |
| `no-period` | grid, align | The onset envelope is empty or entirely zero after detrending, so the comb has no lattice to find. This is new (design call). In the grid, the app runs the comb on silence and lets the vote decide on noise. In the alignment, the app's re-phase silently returns `repair: null`, which its fit then reports as "the chart's bars do not line up through the middle", a wrong-chart message for a silent envelope. Here it is its own reason. It does not fire on any audible recording, so it moves no bench number. |
| `downbeat-undecided` | grid | The vote did not decide (§6.2). `detail` has the scores. The reading comes beside the refusal. |
| `nothing-fits` | grid | Bar one lands at or after the recording's end. |
| `no-bars` | align | The chart plays no bars. |
| `no-tempo` | align | A played bar has no tempo, and the caller gave no `tempo` to fall back on. |
| `too-short` | align | The recording or the chart's render has no chroma frame. |
| `too-long` | align | The DTW's cell count, chart frames × recording frames, exceeds `DTW_MAX_CELLS` (§10). It is computed from the bar seconds and checked before the chart is rendered or anything is allocated. |
| `chart-too-long` | align | The warping found no path: the chart runs more than twice as long as the recording at its declared tempo. |
| `not-same-piece` | align | `controlCost / cost < ALIGNMENT_SAME_PIECE_RATIO` or the median local cost `> ALIGNMENT_SAME_PIECE_LOCAL_COST` (Studies 14, 16). See §14 Q1: this makes a map refusal out of a gate the app today uses only to hedge placements. |
| `bars-off-middle` | align | The grid re-phase refused: the trusted span covers less than `REPAIR_MIN_TRUSTED_SHARE` of the bar starts (Study 26c's wrong-chart detector, kept by Study 27). |
| `bar-one-far` | align | Bar one is more than one declared bar (§6.3) from where the music starts (`max(startAt, firstSound)`). |
| `bar-length-off` | align | The median aligned bar is more than `FIT_BAR_TOLERANCE` off the declared bar (§6.3). |
| `weak-fit` | align | `controlCost / cost < FIT_MIN_RATIO`. |
| `map-invalid` | align | The aligned map fails `checkTimingMap` against the chart (the bar count or the hash). This should be unreachable, and its test proves that. |

### 4.2 Warning codes

| Code | When |
| --- | --- |
| `pickup` | The grid reports a pickup. `detail.start` and `detail.beats` are included. |
| `pickup-dropped` | A compound-meter pickup that sync would write at the wrong length (§7). The grid keeps the first bar as the app places it. |
| `bar-one-clamped` | Bar one fell before 0:00 (by less than 0.75 beat, §7) and starts at 0:00. |
| `sound-before-start` | With `startAt` set, sound begins a bar or more before it. Those bars are outside the grid and their chords are dropped (sync's `outside-bars`). |
| `grid-truncated` | The grid reached `MAX_GRID_BARS` before the recording's end. The app truncated silently. Here it warns (design call). |
| `bar-one-unplaced` | The pipeline built on the declared grid because the grid could not be placed and the caller asked for that (§6.4). `detail.reason` names the refusal it replaced. |
| `chart-diagnostics` | The aligned chart has parse warnings or errors. The alignment still runs, as the app's adapter does. `detail.count` is included. |

## 5. Options: the constants

### 5.1 The bench's 21, copied exactly from the app's constants file

Each is exported under its app name with its app value, and its doc
comment is carried over verbatim from `src/lib/constants/chartAlignment.ts`.
The option keys keep the app's SCREAMING_CASE names (design call): a study,
a sweep and the app's history all name them that way, and a grep for the
name finds the study. The range is what validation accepts (§5.3).

| Constant | Default | Range | Set by | Read by |
| --- | --- | --- | --- | --- |
| `ALIGNMENT_SAME_PIECE_RATIO` | `1.6` | ≥ 1 | Study 14 (real recordings: right charts 2.04, 2.53; a wrong one 1.17, 1.24; the midpoint) | align: same-piece gate |
| `ALIGNMENT_SAME_PIECE_LOCAL_COST` | `0.3` | (0, 1] | Study 15 proposed, Study 16 made necessary (a wrong pairing at ratio 1.74, local cost 0.323) | align: same-piece gate |
| `ALIGNMENT_SOUND_FLOOR` | `0.02` | (0, 1] | Study 14 (FIRST-ONSET and LAST-SOUND rules; 34 dB under the peak) | features: first and last sound |
| `ALIGNMENT_SOUND_WINDOW_SEC` | `0.05` | (0, 1] s | Study 14's RMS window for the floor | features: first and last sound |
| `REPAIR_TRUST_FRACTION` | `0.25` | (0, 1] | Study 26c | comb: trusted span; re-phase confidence |
| `REPAIR_SLIDE_FRACTION` | `0.25` | (0, 1] | Study 26c (the v3 fence; ±0.5 broke Peaceful Dreams' intro by 0.60 s) | comb: `repairEnds` (v3 reference only) |
| `REPHASE_FENCE_BEATS` | `0.5` | > 0 beats | Study 27, recipe v5 (Mop Heart, 224 bpm in 3/4) | comb: `rephaseGrid` |
| `ONSET_ENVELOPE_LEAD_SEC` | `0.07` | [0, 1] s | Measured 2026-11-08 on synthetic hits (75, 68, 60, 54 ms early); Study 31's 0.058 to 0.079 s and Study 27's residuals are this lead | grid: lattice anchor; align: re-phased starts |
| `REPAIR_SLIDE_STEP_SEC` | `0.01` | (0, 1] s | Study 26c | comb: `combSlide` |
| `REPAIR_MIN_TRUSTED_SHARE` | `0.5` | (0, 1] | Study 26c (the one wrong pairing on the bench, no right one) | comb: phase line refusal |
| `COMB_RANGE_FRACTION` | `0.1` | (0, 1) | Study 24, as Study 26c uses it | comb: period search |
| `COMB_COARSE_STEP_FRACTION` | `0.002` | (0, range] | Study 24 | comb: coarse ladder |
| `COMB_FINE_STEP_FRACTION` | `0.0002` | (0, coarse] | Study 24 | comb: fine ladder |
| `COMB_PHASE_STEP_SEC` | `0.01` | (0, 1] s | Study 24 | comb: phase scan |
| `TIME_ZERO_SNAP_BEATS` | `0.25` | > 0 beats | Study 31 | grid: time-zero witness |
| `DOWNBEAT_WEIGHTS` | `{ timeZero: 2, harmonicRhythm: 2, sections: 1 }` | each ≥ 0 | Study 31, registered before it ran | grid: vote |
| `DOWNBEAT_MIN_SCORE` | `2` | ≥ 0 | Study 31 | grid: vote |
| `DOWNBEAT_OFF_COMB_MARGIN` | `2` | ≥ 0 | Study 31 | grid: vote |
| `HARMONIC_MIN_RATIO` | `1.2` | ≥ 1 | Studies 31 (thinnest right margin 1.27) and 32 (the validated run applied it to the witness) | grid: harmonic witness |
| `SECTION_NOVELTY_SPANS` | `[8, 16]` | non-empty, whole numbers ≥ 1 | Study 31 | grid: section witness |
| `PLACEMENT_FIRST_SOUND_SLACK_BEATS` | `0.25` | [0, 1) beats | Study 31c | grid: placement and pickup |

### 5.2 Seven set by the app or the design, not by a study

Six are hard-coded in the app's modules, outside the constants file. They
come over as options too, so that no number is hidden. Their doc comments
say "set in the app, not by a study" (design call). The seventh,
`PICKUP_MAX_BAR_FRACTION`, is new with the pickup (§7). Its doc comment
says "set in the design, not by a study", and Study 34's pickup slot is to
confirm or move it:

| Constant | Default | Range | From | Read by |
| --- | --- | --- | --- | --- |
| `FIT_BAR_TOLERANCE` | `0.15` | (0, 1] | `utils/alignmentFit.ts` `BAR_TOLERANCE` | align: `bar-length-off` |
| `FIT_MIN_RATIO` | `1.5` | ≥ 1 | `utils/alignmentFit.ts` `MIN_RATIO` | align: `weak-fit` |
| `SECTION_START_SNAP_SEC` | `0.25` | ≥ 0 s | `utils/alignedPlacements.ts` `START_SNAP` | align: placements |
| `HEDGE_LOCAL_COST_FACTOR` | `2` | ≥ 1 | `utils/alignedPlacements.ts` (`2 * localMedian`) | align: placements |
| `DTW_MAX_CELLS` | `150_000_000` | whole number ≥ 1 | `audio/chartAlignment.ts` `MAX_CELLS` | align: `too-long` |
| `MAX_GRID_BARS` | `2000` | whole number ≥ 1 | `audio/chartlessGrid.ts` `MAX_BARS` (the app's `ChartDraftSchema` limit) | grid: `grid-truncated` |
| `PICKUP_MAX_BAR_FRACTION` | `0.5` | (0, 1] | this design, after the app's review (2026-11-09) | grid: the longest pickup reported, as a share of the bar (§7) |

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

- Options are merged over `DEFAULTS` key by key.
- **An unknown key is `invalid-option`** (design call). A misspelt sweep key
  must not silently measure the default. The pipeline's `build` key is the
  one non-constant key it accepts.
- Validation never throws. A value outside the range in §5.1 or §5.2
  gives `invalid-option` naming the key. Ranges that depend on each other
  are checked together (the fine step ≤ the coarse step ≤ the range).
- **The two sound options are feature options.** They change
  `firstSound` and `lastSound`, which belong to the features, so only the
  feature functions accept them. Passing them to `findGrid` or
  `alignChart` is `invalid-option`. The features record the values they
  used (`Features.sound`). A sweep of the sound floor recomputes features.
  Other sweeps reuse them (design call: this keeps a cached record
  truthful about what it holds).
- **Fixed, not options:** what defines a stage and no study tuned on its
  own: the chroma and onset windows and hops, the 55 to 2,200 Hz band, the
  half-second detrend, the pad synthesis, the trusted run of four, the
  phase line's middle 60 %, the novelty peak rule and the witnesses'
  abstention counts. Each doc comment names its origin. Changing one is a
  new feature or stage version, not a sweep.

## 6. The public API

Types from sync are used as they are: `ChordRuns`, `BarGrid` (`{ bars:
Seconds[] }`), `TimingMap`, `ConfidenceRecord`, `BuildDiagnostic`,
`BuildOptions`, `Change`, `Detected`. Chord runs may also carry the
model's total frame count (§11.1):

```ts
/** sync's ChordRuns, plus ChordMini's frame count: frames past the last run up to it vote N.C. */
type ListenChordRuns = ChordRuns & { frames?: number };
```

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

### 6.2 The grid

```ts
/** What the caller declares: tempo in grammar 2.1's beat, as sync's `Detections.tempo`. */
type Declared = { meter: string; tempo: number };

type GridInput = {
	features: Features;
	chords: ListenChordRuns | null;      // null: the harmonic witness abstains
	declared: Declared;
	/** The song's own start of bar one, when a person set it: the vote is skipped. */
	startAt?: number | null;
	/**
	 * Whether the recording starts on a bar line (a DAW export). Default true, the app's behavior.
	 * False sets the time-zero witness's weight to 0: a phone capture or a cut does not.
	 */
	startsOnBarLine?: boolean;
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
	/** `beats` is nominal, for display: the builder re-derives the pickup's length from `start`. */
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
  numerator beats (design call, to keep the bench's numbers; §13 says
  what Study 34 could change).
- **The order is the app's `chartlessGrid`.** The comb near the declared
  bar comes first, with its phase moved by `ONSET_ENVELOPE_LEAD_SEC`. A
  flat envelope is `no-period`. Then, if `startAt` is given, bar one goes at
  the lattice beat nearest it (`byStart`, no vote). Otherwise the three
  witnesses vote, and a decided vote places bar one (§7).
- **The vote rule (Study 31), in one sentence:** each witness adds its
  weight to the class it votes, and the vote is decided when the top class
  scores at least `DOWNBEAT_MIN_SCORE`, leads the runner-up by at least 1,
  and is class 0 (the comb's own phase) or beats class 0 by at least
  `DOWNBEAT_OFF_COMB_MARGIN`. An undecided vote is a `downbeat-undecided`
  refusal carrying the full reading, so a page can say why bar one was not
  placed.
- **`startsOnBarLine: false`** (design call, after the app's review) is the
  remedy for a recording that is not a DAW export, with no new math. On
  such a recording time zero snaps to some lattice beat about half the
  time, and that beat is the downbeat one time in `beatsPerBar`. When the
  other two witnesses abstain, time zero alone decides: its weight 2 meets
  `DOWNBEAT_MIN_SCORE` and the off-comb margin. It is the main way a public
  tool would save a wrong chart. `false` is the same as
  `DOWNBEAT_WEIGHTS.timeZero: 0`, without the host knowing the weight. The
  default and every bench number are unchanged. The README says so in
  one line: "If the recording may not start on a bar line (a phone
  capture, a clip), pass `startsOnBarLine: false`." The pipeline passes
  it through.
- `features.duration` is the recording's length, and `features.firstSound`
  is the first sound.

### 6.3 Aligning a chart

```ts
type AlignInput = {
	chart: string;                         // barmark text
	features: Features;
	/** Grammar 2.1 bpm for bars the chart gives no tempo; the app passes the song's. */
	tempo?: number;
	/**
	 * The song's declared meter and tempo at `startAt`: the fit's declared bar.
	 * Omitted: the chart's own median bar.
	 */
	declared?: Declared;
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
	chartBar: number;                      // the median of the chart's bar seconds: the comb's centre
	beatsPerBar: number;                   // the most common numerator among played bars
	hopSec: number;
	firstSound: number;
	lastSound: number;
};

/**
 * `declaredBar` is `declared`'s bar when given, else `Alignment.chartBar`.
 * `ratio` is the app's fit ratio, controlCost / cost (Infinity at cost 0);
 * `Alignment.ratio` is the placements' (cost floored at 1e-6). Both are kept as the app has them.
 */
type Fit = { bar1: number; medianBar: number; declaredBar: number; ratio: number };

type Placements = {                       // the app's AlignedPlacements, but tempo in barmark's beat
	sections: { name: string; start: number; hedged: boolean }[];
	keyChanges: { at: number; key: string; hedged: boolean }[];
	/** `bpm` in grammar 2.1's beat, like `Declared.tempo`; the app converts to its bottom-note unit. */
	tempoChanges: { at: number; bpm: number; hedged: boolean }[];
};

type AlignedChart = { timing: TimingMap; alignment: Alignment; fit: Fit; placements: Placements };

alignChart(input: AlignInput, options?: ListenOptions):
	Ok<AlignedChart> | Refused<{ alignment: Alignment | null; placements: Placements | null }>;
```

- **The fit's declared bar.** The app measures `bar-one-far` and
  `bar-length-off` against the song's declared bar
  (`alignmentFit(alignment, { startAt, barSeconds: barSecondsAt(grid,
  startAt) })`, `state/songCheck.svelte.ts`), not the chart's. So
  `declared`, when given, sets the fit's declared bar. That is the app's
  behavior, and the app passes it. Without it the fit uses the chart's
  median bar (design call: a public tool has only the chart). This default
  is a listed difference (§11.3). The comb that re-phases the bars always
  centres on the chart's median bar (`chartBar`), as the app's
  `repairAlignment` does.
- **The chart is barmark text, read by barmark (design call).** The app
  converts it with `barmarkChartBars` to its `ChartBar` first. The package
  reads `parseChart(chart).bars` directly (`chartPadBars`), with the app
  adapter's rules for slots: a chord slot sounds its `ChordRecord` (root and
  pitches as pitch classes, the slash bass among them, no repeats); `/`
  holds; `N.C.` and silence are silent; `?` holds, with a warning; a group
  plays its first member; a note set (a rootless record) holds, as the
  app's `chordPitchClasses` returned null for it; an empty bar holds.
  The app's `SPELLINGS` table, which rewrote older charts' spellings before
  `parseChord`, is dropped: barmark text is already barmark. barmark 0.21
  does not read seven of the forms it rewrote: `CM7`, `CSus4`, `CmMaj7`,
  `CmM7`, `C69`, `C(7)sus4`, and a Unicode minus. A stored chart that still
  carries one gets a `?` slot that holds, with a warning. The app runs
  `db:chart-check` on every stage before adoption and fixes what it lists.
  Whether barmark should read any of them is a grammar question (§13).
- **Bar seconds** follow barmark's own tempo rule: `tempo:` counts the beat
  of the `time:` meter in force (`bar.time ?? bar.meter`), and a bar lasts
  its own meter's length in that beat. This is the rule `@barmark/midi`'s
  `perform` uses (`quarters.ts`). It differs from the app before
  `1e120b2e`: there the adapter handed a chart's own `tempo:` (grammar
  2.1's beat) to a rule that counts the numerator. That gave 9.0 s for a
  6/8 bar at `tempo: 40`, where barmark's rule gives 3.0 s. The app fixed
  its adapter at `1e120b2e`, and the package's values are the asserted
  ones (§11.3): 6/8 at `tempo: 40` is 3.0 s a bar, 12/8 at `tempo: 60` is
  4.0 s, and a `[6/8]` bar in 4/4 at `tempo: 120` is 1.5 s. rit. and
  accel. are read at the steady tempo, as the app's adapter reads them.
- **A tempo change** is placed where a played bar's `tempo` (grammar 2.1's
  beat) differs from the bar before. A one-bar meter of another bottom
  note (a `[6/8]` bar in 4/4) changes the bottom-note bpm without changing
  the tempo, so it is not reported as a tempo change. The app met this
  trap.
- **The order:** read the chart's bars, then compute the render's frame
  count from the bar seconds and check `DTW_MAX_CELLS` (§10). Only then
  render and warp. Re-phase with the comb: a flat envelope is `no-period`.
  Then run the fit and the same-piece gate, and build and check the map.
- The map covers every played bar: `bar: index`, a pickup at index 1, the
  `end` included, `source: "aligned"`, `recording.duration` set to
  `features.duration`. It is checked by `checkTimingMap` against the text.
- **A refusal still carries the alignment and the placements** whenever the
  warping ran, because the app places a chart's sections (hedged) even
  when the map is not kept. The refusals after the warping are
  `no-period`, the fit's rules and the same-piece gate (§14 Q1), all of
  them listed, not the first only.

### 6.4 The whole pipeline

```ts
type Unplaced = "no-period" | "downbeat-undecided" | "nothing-fits";

type RecordingInput = {
	/** Mono PCM and its rate, or features computed earlier (for instance from a cache). */
	samples?: Float32Array;
	sampleRate?: number;
	features?: Features;
	chords: ListenChordRuns;
	declared: Declared;
	startAt?: number | null;
	/** Passed to chartFromDetections as given. */
	title?: string;
	key?: Detected<string> | null;
	sections?: { name: string; start: number; confidence?: number }[];
	changes?: Change[];
	recording?: { id?: string };
	/** When the grid cannot be placed (an `Unplaced` refusal): refuse (default), or build on the declared grid with a warning. */
	onUnplaced?: "refuse" | "declared";
};

type RecordingChart = {
	chart: string;
	timing: TimingMap;
	confidence: ConfidenceRecord;
	/** The builder's own diagnostics, unchanged. */
	diagnostics: BuildDiagnostic[];
	grid: PlacedGrid | null;               // null when built on the declared grid
	/** The comb, the witnesses and the scores, whether or not the grid was placed (null only for no-period). */
	reading: GridReading | null;
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
- **When the grid cannot be placed, the pipeline refuses by default
  (design call; §14 Q2).** This covers `no-period`, `downbeat-undecided`
  and `nothing-fits`, the grid refusals the app answers today by keeping
  the declared grid (`chartlessGridInBrowser` resolves null on any
  placement failure). With `onUnplaced: "declared"` the pipeline builds on
  the declared grid instead: bar one at `startAt ?? 0`, the declared bar,
  to the recording's end. It adds `bar-one-unplaced` naming the refusal it
  replaced, and `reading` still carries the witnesses and the scores: the
  app shows them, and the bench uses the vote margin as its confidence
  proxy. Input and option refusals are never replaced. The app and the
  bench do this today, and Study 34 counts it as "the pipeline's own
  choice".
- One call is all a public tool or the bench needs. The app can keep
  calling the stages it already calls in its own order (§12).

## 7. Pickups end to end (grammar 2.4)

**What the grid does.** Study 31c's placement is unchanged. Take the
voted class's latest lattice point `a` at or before `firstSound +
PLACEMENT_FIRST_SOUND_SLACK_BEATS × beat`. The bar from `a` holds the first
sound. Then count how many lattice beats into that bar the first sound
comes:

```
j = floor((firstSound − a) / beat + PLACEMENT_FIRST_SOUND_SLACK_BEATS)   // 0 ≤ j < beatsPerBar by construction
```

- `j = 0`: no pickup. Bar one is `a`. The first sound is less than
  `1 − slack` (0.75) beat past `a`, so `a` can be up to 0.75 beat before
  0:00. Then it is clamped to 0, with `bar-one-clamped`, as the app clamps
  it today.
- `j ≥ 1` and `beatsPerBar − j ≤ PICKUP_MAX_BAR_FRACTION × beatsPerBar`
  (at most half a bar by default): the first sound comes `beatsPerBar − j`
  beats before the next downbeat. That is **a pickup** (**Kevin's decision
  (2026-11-09)**, bounded after the app's review, §14 Q3). Bar one is
  `a + period`, and `grid.bars` starts there. `pickup = { start:
  max(0, a + j × beat), beats: beatsPerBar − j }`, with a `pickup` warning.
- `j ≥ 1` with a longer lead-in, such as an entrance on beat 2 of a 4/4
  bar: no pickup. Bar one is `a` with its opening silence, as the app
  places it and as a band writes it (a first bar with a rest). The bench's
  bar-one truths in Studies 31c to 32b were scored this way.
- With `startAt` (byStart) the **unbounded** rule applies around the bar
  one the start gives. A person has said where bar one is, so any sound
  more than the slack and less than a bar before it is a pickup, found the
  same way. A bar or more before it gives `sound-before-start` and no
  pickup (design call: a person's start of bar one wins, and the intro is
  theirs to chart).

**What moves.** The bar lines stay where the app puts them, but **bar one
does not**. For every decided grid whose first sound comes 0.75 beat or
more into the placed bar (`j ≥ 1`) and leaves at most half a bar before
the next downbeat, the app's bar 1 (the bar from `a`,
clamped at 0:00 or opening in silence) becomes the pickup, starting at the
first sound's beat. The written bar 1 is then the next bar, one bar later
than the app's. The silent beats before the pickup leave the grid. This
is Kevin's decision as bounded after the app's review (§14 Q3), and it is
a listed difference (§11.3). On the app's four dev songs with stems the
first sound falls in the first half beat (`j = 0`), so it moves nothing
there.

**What the builder writes.** The pipeline passes `pickup: { start }` to
`chartFromDetections`. sync's `readPickup` re-derives the length from
`start` (rounding the gap to whole barmark beats) and writes the first bar
with its own one-bar meter (`| [2/4] G | C …`). So `pickup.beats` is
nominal: it is for display, not what the builder reads. Under grammar 2.4
barmark numbers that bar 0 (`written`). Its `index` is 1, so the timing
map's first entry is `{ bar: 1, start: pickup.start }`. The confidence
record and `chartHash` are unchanged by the numbering.

**Compound meters: a guard until sync writes eighths.** The lattice counts
numerator beats (eighths in 6/8). `readPickup` builds the pickup in barmark
beats (dotted quarters) and rounds to whole ones. So a 1-eighth pickup
rounds to nothing, and a 2- or 4-eighth one is written at the wrong length
(3 or 6 eighths). Until sync writes `[k/8]` pickups (§14 Q4), listen
reports a compound-meter pickup only when `beatsPerBar − j` is a multiple
of the meter's grouping (3). Otherwise it adds `pickup-dropped` and places
bar one at `a`, clamped as the app does (design call). Once sync writes
`[k/8]`, a listen patch lifts the guard.

## 8. The refinement contract in `@barmark/sync`

```ts
type RehashReason = "no-timing" | "unparsed" | "bars-differ" | "meters-differ";

rehashTiming(
	/** `BuildResult` fits as is: `chart` is the built text. */
	built: { chart: string; timing: TimingMap | null; confidence?: ConfidenceRecord | null },
	refined: string,
	options?: { parse?: ChartParse },
):
	| { ok: true; timing: TimingMap; confidence: ConfidenceRecord | null; confidenceDropped: boolean }
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
   longer mean what they say. `built.chart` is required for this rule,
   and both `BuildResult` and the pipeline's result carry it.
5. Otherwise the result is the same map with `chart.hash` set to
   `chartHash(refined, parse)`. It is checked by `checkTimingMap(map, {
   text: refined })` before it is returned.

**The confidence record** keys played bars and slots. It is kept when
every played bar has the same slot count. The count is taken on the
played slots barmark resolves (`PlayedBar.slots` after `parseChart`), not
on the text, so `%`, a hold written out or a repeat sign written instead
of its bars count the same as the bars they play. Otherwise it is dropped
(`confidenceDropped: true`) and the map is still kept: a spelling fix or
a change of shorthand keeps the slots, and a regrouped bar does not. The
app's refinement rewrites in the account's own style and changes
shorthand often.

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
- **JSON:** none in v1 (design call): the app stores structured clones,
  and the bench can write the two arrays as binary beside a JSON header.
- **Determinism:** bit-identical within one engine. Across engines
  (V8, JavaScriptCore) `Math.cos`, `log1p` and `exp` may differ in the
  last place, so tests compare features within 1e-6 relative and discrete
  results (classes, refusals, bar counts) exactly.
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
| Chart render (`renderChartPads`) | chart seconds × rate × tones | **the app: one `Float32Array` of the chart's whole length at `features.sampleRate`**, 4 bytes a sample: ≈ 200 MB for 19 minutes at 44.1 kHz. **Here: O(window)**, see below |
| DTW | **chart frames × recording frames**, twice (the tritone control) | **one byte a cell** (the step table) + three rows |

**The DTW is quadratic, and its ceiling is `DTW_MAX_CELLS` (150 M).** The
chroma hop is about 0.093 s at 22,050 and 44,100 Hz (10.8 frames a second)
and 0.085 s at 48,000 Hz (11.7). With a chart as long as its recording,
the ceiling is about 19 minutes at 44.1 kHz and 17.4 minutes at 48 kHz. At
the ceiling the step table is 150 MB. The control warping reuses that
table instead of allocating a second one (design call: same numbers, half
the peak). The app measured both warpings of a 140 s song at 0.19 s
together, about 42 ns a cell, so the ceiling costs about 13 s in Node.

**The check comes before the render.** The chart's frame count is
arithmetic: with `L = ceil(Σ bar seconds × rate)` samples and the chroma
window `win` and hop `hop` at that rate, it is `L < win ? 0 : floor((L −
win) / hop) + 1`, exactly what `chromagram` will produce. `alignChart`
computes it from the bar seconds, multiplies by `features.frames`, and
refuses `too-long` (`detail: { cells, limit, chartFrames, recordingFrames
}`) before it renders or allocates anything. The app checks only after it
has rendered.

**The render streams (design call).** Each sample belongs to exactly one
pad, so its value is the same sum of tones in the same order whether the
render is whole or windowed. That holds when each tone's phasor recursion
runs from the pad's start as it does now. The one global step is the peak
normalization. So the render runs twice in windows: one pass finds the
peak, and the second scales each window and feeds it to the chromagram as
it goes. Memory is one window, and time is twice the render (about 0.4 s
more on a 140 s chart). This should be bit-identical to the app.
**Equivalence comes first:** the goldens (§11.2) decide it. If any frame
differs, v1 renders whole as the app does, behind the same arithmetic
check. Rendering straight to chroma frames analytically (each pad's
spectrum through the Hann window) would be cheaper still, but it is not
bit-identical, so it is out of v1.

**A browser host should lower `DTW_MAX_CELLS`.** 150 MB of step table is
heavy for a tab on a phone. The README recommends about 40 M (around 9
minutes) for browser hosts and says the refusal names the limit. The
default stays the app's.

The grid has no quadratic stage. A recording's length bounds it only
through `MAX_GRID_BARS` (2,000 bars, over half an hour at any tempo). A
banded DTW (Sakoe–Chiba) would make the alignment linear, but it changes
the path. It is out of v1 and would need a study.

## 11. Module layout and the port

One stage per module, as in sync's `build/` and musicxml's `import/`. The
`./stages` entry exports the functions named here. Each renamed function's
doc comment keeps its app name ("the app's `chartlessLattice`") so a grep
from either side finds the other.

```
packages/listen/
  src/
    index.ts            the four calls, the options, the types; re-exports ./features
    options.ts          DEFAULTS (5.1 and 5.2 with their doc comments), resolve and validate
    result.ts           Ok, Refused, Refusal, ListenWarning, the reason and code unions
    features/           ← audio/analysis.ts (≈ 110 of its 689 lines), audio/chartAlignment.ts (≈ 120)
      index.ts          the ./features entry: no barmark or sync import
      fft.ts            fft
      onset.ts          onsetRate (decimation), onsetEnvelope (paired FFT), detrend
      chroma.ts         chromagram, its window per rate
      sound.ts          audibleSpan
      features.ts       recordingFeatures, chromaFeatures, onsetFeatures, joinFeatures, readFeatures
    comb/               ← audio/alignmentRepair.ts (300, all of it)
      comb.ts           jointOnsetComb → CombFit (phase score, period ladders)
      span.ts           trustedSpan, phaseLine
      slide.ts          combSlide
      rephase.ts        rephaseGrid → GridRephase
      ends.ts           repairEnds → EndRepair: Study 26c's v3 reference, unused by the pipeline,
                        kept so REPAIR_SLIDE_FRACTION and the bench's v3 comparisons live here (design call)
    grid/               ← audio/chartlessGrid.ts (369, all of it), utils/chordminiBarChords.ts (62)
      lattice.ts        gridLattice (app: chartlessLattice), the lattice's beats
      beats.ts          beatChords (app: chordminiBarChords) on ListenChordRuns
      witnesses.ts      timeZeroWitness, harmonicRhythmWitness, histogramVote
      sections.ts       beat chroma, checkerboardNovelty, novelty peaks, sectionWitness
      vote.ts           downbeatVote
      place.ts          placeBarOne (app: placeChartlessGrid) with the pickup (§7), bar one at a start
      grid.ts           findGrid (app: chartlessGrid)
    align/              ← audio/chartAlignment.ts (the rest, ≈ 380), utils/alignmentFit.ts (73),
                          utils/alignedPlacements.ts (101), utils/alignedTimingMap.ts (27)
      bars.ts           chartPadBars ← the slot rules of utils/barmarkChartBars.ts,
                        utils/chordPitchClasses.ts less SPELLINGS, chartBarSeconds, meterBeats, median
      render.ts         renderChartPads (windowed, §10)
      dtw.ts            dtwAlign (rows, steps, backtrack, frame costs; mapSeconds stays stage-only)
      path.ts           alignPath (app: alignChartPath): frame count check, render, chroma, both warpings
      rephase.ts        rephaseAlignment (app: repairAlignment): comb + rephaseGrid + the lead
      fit.ts            alignmentFit → refusal reasons
      placements.ts     samePiece, alignedPlacements
      timing.ts         alignedTimingMap
      align.ts          alignChart (app: alignChart)
    pipeline.ts         chartFromRecording
    stages.ts           the ./stages entry
  tests/                (§11.2)
  README.md, CHANGELOG.md, LICENSE, package.json, tsconfig.build.json
```

`options.ts` ports `constants/chartAlignment.ts` (166 lines, all 21
constants, comments verbatim). **Not ported** from `analysis.ts`:
`extractFeatures`, and the tempo, meter and key detectors (about 570
lines). Study 34 decides whether tempo and meter detection come over. Key
detection is not the pipeline's.

### 11.1 What changes in the port

- **`ChordminiRuns` → `ChordRuns`** (**Kevin's decision**). `beatChords`
  reads frames when `frameSec` is given, and the app's ChordMini runs fit
  as they are (sync ignores `version`, `frames` and `chord`; listen reads
  `frames`). Details (design calls):
  - **`frames`**, ChordMini's total frame count, is accepted as an optional
    field (`ListenChordRuns`). The app votes "N.C." for frames past the
    last run up to `frames`, and a beat that straddles the last run's end
    counts those frames in its majority. So the app passes it, and the
    vote is the app's. Without it the frame count is the largest run
    `end`, which can change the vote on that one straddling beat. That
    default is a listed difference (§11.3).
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
- **The chart comes in as text** and goes through `parseChart` (§6.3). The
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

### 11.2 Testing

The working agreement applies: write a failing test first, keep Fallow
clean, use `bun test`.

1. **The app's suites as the starting suite:** `chartlessGrid.test.ts`,
   `chartAlignment.test.ts`, `alignmentRepair.test.ts`, the relevant
   cases of `server/chartBuild.test.ts`, and the util tests for the fit,
   placements, aligned map and `chordminiBarChords`. That is about 1,070
   lines, all synthetic, no audio. Their helpers move to `tests/helpers/`,
   and chart-shaped inputs are rewritten as barmark text. `chartBuild`'s
   tempo conversion and key re-spelling stay in the app.
2. **The 65 Hz sine kick** (**Kevin's decision**; Study 32's first run
   failed on it). The fixture is 22,050 Hz PCM at 120 bpm in 4/4: a 65 Hz
   sine kick (5 ms attack, 60 ms decay) on beats 1 and 3, with pads. Three
   tests: (a) the envelope does not see it, which documents the weakness;
   (b) with a broadband hit added on beats 2 and 4, bar one lands within
   0.03 s; (c) kick and pads alone are recorded exactly, as a refusal or a
   grid, and must not be a decided grid off the truth. If the port finds
   one, that is a FINDINGS.md entry and a question for Kevin. Its fix (a
   comb-contrast refusal) needs a threshold from Study 34 and is not
   invented in the build.
3. **Property, never-throws and scale tests**, seeded, where the numeric
   code warrants them. Properties: `fft` against a naive DFT; the paired-FFT
   envelope against one frame per FFT within 4e-6 (the app's own measure);
   a sine's chroma peaking at its pitch class at 16 to 48 kHz; the DTW
   path's monotonicity, end points and step set; the comb finding random
   lattices within 0.05 %; the vote's invariance under witness order; for
   random first sounds, bar one holding the first sound or a valid pickup;
   grids strictly increasing and uniform. The arithmetic frame count (§10)
   equals `chromagram`'s on random bar lists and rates, and the windowed
   render equals the whole one bit for bit. Every entry point given `NaN`,
   `Infinity`, empty or mismatched arrays, bad rates, unknown or
   out-of-range options or a junk features record returns a refusal and
   never throws. Scale, relative times as in `@barmark/midi`'s
   `export-scale.test.ts`: DTW time grows with cells and no faster;
   `too-long` returns at once for a 20-minute chart and recording, with
   nothing rendered or allocated; the comb and the grid are linear in
   duration. The plan spells out each case.
4. **Equivalence with the app.** `scripts/listen-equivalence.ts` runs on
   the VM only, never in CI, like `musescore-fixtures.ts` and
   `detection-fixtures.ts`. It runs against a `git worktree` of
   stem-shovel at the commit it records, never the live checkout, which
   changes under it, and it never writes there. It imports the app's pure
   modules read-only from that worktree's `src/lib/` (Bun resolves the
   app's `#lib/*` from its `package.json` `imports`). The commit must be
   at or after `1e120b2e`, where the app's compound-meter tempo was
   fixed. It runs them and the package on
   every app fixture plus a seeded set of synthetic songs (4/4, 3/4, 6/8,
   tempos 60 to 224, pickups, mid-bar starts, flat harmony). It writes the
   app's outputs, numbers and labels only, to
   `packages/listen/tests/fixtures/equivalence/*.json`, and records the
   app's commit it ran against. `tests/equivalence.test.ts` checks the
   package against those goldens in CI. The package is called with what
   the app passes (`declared` for the fit, `chords.frames`,
   `onUnplaced: "declared"`), and values must match exactly, since this is
   the same engine and the same arithmetic order, apart from §11.3.

### 11.3 Where the equivalence may differ, and why

Each difference is asserted as its own expected value. Anything else that
differs is a porting bug, and the goldens make it a failing test.

| Difference | Why |
| --- | --- |
| Pickups (§7): with `j ≥ 1`, the app's bar 1 becomes the pickup, starting at the first sound's beat; the written bar 1 moves one bar later | Kevin's pickup decision |
| Pickups longer than `PICKUP_MAX_BAR_FRACTION` of a bar keep the app's bar 1 (no difference); only shorter ones move | §7's bound |
| `pickup-dropped` in compound meters, where the grid stays as the app's | sync writes whole dotted-quarter pickups only |
| Compound-meter bar seconds from a chart's own `tempo:` (6/8 at 40 = 3.0 s, 12/8 at 60 = 4.0 s, `[6/8]` in 4/4 at 120 = 1.5 s), asserted on the package's values | The app was wrong before `1e120b2e`; goldens come from that commit or later, so they agree, and the cases are also asserted on their own |
| `startsOnBarLine: false` | New input; the app's default (true) is unchanged |
| `RecordingChart.reading` with `onUnplaced: "declared"` | New field |
| `Placements.tempoChanges[].bpm` in grammar 2.1's beat; one-bar meters are not tempo changes | The app used its bottom-note unit; it converts at adoption |
| `no-period` in the grid and the alignment | The app voted on noise, or reported a silent envelope as a wrong chart |
| `grid-truncated` warning | The app truncated silently |
| `not-same-piece` refuses new maps | §14 Q1 |
| `alignChart` without `declared`: the fit uses the chart's median bar | A public tool has no song; the app passes `declared` |
| `chords` without `frames`: the frame count is the largest run end | `ChordRuns` has no total; the app passes it |
| The map's `recording.duration` is the recording's length | The app passes the grid's end |
| The pipeline refuses an unplaced grid by default | §14 Q2; the app passes `onUnplaced: "declared"` |
| The chart render streams | Bit-identical by construction; the goldens confirm it, or v1 renders whole (§10) |
| A bar line with an unreadable chord (`CM7`, `C(7)sus4`, `riff` …) keeps its bars here, the slot held as `?` (§6.3); the app's adapter loses the whole line, so its chart plays shorter | barmark keeps an unreadable slot as unknown harmony `{ kind: "unknown", text }` since PR #250 (grammar principle 4); the app parses with barmark 0.22, which drops the line. Task 16 names these charts; the seeded generators write no unreadable chord |
| `too-long` counts the step table's cells, `(n + 1)(m + 1)`, where the app counts `n × m`: a case within `n + m + 1` cells of `DTW_MAX_CELLS` is refused here and warped by the app (added in Task 12, after a security review) | It is what `dtwTable` allocates. The other new check, `chart-too-long` before the render when the chart's seconds exceed twice the recording's, changes no outcome: it implies more than `2m` chart frames, which no warping fits (the app's own `chart-too-long`, checked on 1,677 seeded warpings) |

## 12. Adoption and release

**The app** adopts the package the way it adopted sync in v0.244.0:

1. Pin `@barmark/listen` exactly (and sync, for `rehashTiming`).
2. Replace `chartlessGrid.ts`, `alignmentRepair.ts`, `chartAlignment.ts`,
   the fit, placements and aligned-map utils, `chordminiBarChords.ts`'s use
   in the grid, and the constants file with imports. Each module goes
   behind its existing tests first. Those tests stay until the module is
   gone.
3. **Tempo units.** The app's songs store bpm in the meter's bottom note
   (`chartlessGridInBrowser.ts` computes `declaredBarSeconds` from it),
   and `Declared.tempo` is grammar 2.1's beat. The app converts once with
   its existing rule (`value × beatsOf(meter) / meter.n`, as `chartBuild.ts`
   converts tempo changes), for `findGrid`, the pipeline, and the fit's
   `declared` in `alignChart`.
4. The workers call `chromaFeatures` and `onsetFeatures` (or
   `recordingFeatures`) and `alignChart`. The cache key folds in
   `FEATURES_VERSION` (§9). The app passes `chords.frames` and the fit's
   `declared`.
5. Either pass `onUnplaced: "declared"`, or keep the app's own declared
   grid (several tempo segments from the song's changes) and call
   `findGrid`, falling back to that grid on any `Unplaced` refusal, as
   `chartlessGridInBrowser` does today.
6. Replace the inline re-hash in `remote/songs.remote.ts` with
   `rehashTiming`, and show its message on the card.
7. Run `bun run db:chart-check` on every stage, then ship. It also lists
   stored charts with the seven spellings barmark 0.21 does not read
   (§6.3), to fix before adoption. The stricter map gate applies to new
   alignments only. Saved maps stay as they are, and no count is a
   precondition, because a saved map stores no ratio or local cost
   (§14 Q1).
8. **Reason names.** The app's names map onto the package's: `no-input` →
   `invalid-input`, `undecided` → `downbeat-undecided`, `no-fit` →
   `nothing-fits`. `no-period` is new. `unavailable` stays the app's own,
   for its workers.
9. Convert `Placements.tempoChanges[].bpm` from grammar 2.1's beat to the
   song's unit, and pass `startsOnBarLine` where a recording is not a DAW
   export.

`analysis.ts` keeps its detectors and its key detection's `fft`.

**The bench** re-pins its pipeline against the package in place of its
port, as its Study 34 answer already registers. A sweep passes options. A
study that uses the package records its exact version beside its results.

**Release.** The order is the one Kevin set in #17: barmark's current
releases first (the pickup-bar-0 train, the `@barmark/score` patch,
barmark.dev). Then sync 0.4.0 (`rehashTiming`, a minor) with its
CLAUDE.md follow-ups (the midi patch, the CLI, the `songs` bump). Then
`@barmark/listen` 0.1.0. It is a new package, so RELEASING.md's "A new
package's first release" applies: Kevin's placeholder 0.0.0 from his Mac,
the trusted publisher, the `listen-v*` tag rules and the `package (N,
listen)` required checks. Alongside the package come the repo's own
wiring: the CI matrix, `verify-package` and `verify-release`, the Swamp
input, the `/release` skill, and the CLAUDE.md layout.

**CLI: out of v1** (design call). The chartless path needs chord runs from
a model the CLI does not have. `barmark align chart.md take.wav` needs no
model, but it needs a WAV reader and puts listen into the binary. It is
the first candidate after v1. Until then a listen release needs no CLI
release.

## 13. Open for Study 34

- **Meter and tempo detection:** a `detectMeterTempo(features)` (a port of
  `analysis.ts`'s ladder, or a comb over candidate bars) would make
  `declared` optional, additively.
- **Extreme tempos:** octave errors would call for comb candidates at ½×,
  2× and 3⁄2×, with a threshold the study registers.
- **3/4 and 6/8:** if 6/8 songs fail the vote, the witnesses may need the
  compound beat (2 classes). That changes `beatsPerBar`, the fence and the
  pickup's beat (with §14 Q4).
- **Phone captures (S34-G3):** the time-zero witness assumes a DAW export.
  Possible outcomes are a `source: "capture"` input, a capture-specific
  sound floor, or a warning.
- **Confidently wrong (S34-G1):** each failure shape gets a new refusal
  reason with a registered threshold (a comb-contrast floor for the 65 Hz
  kick case, a vote-margin floor, a tighter same-piece gate).
- **The same-piece gate's breadth:** 1.6 and 0.3 come from two songs of
  one band. A new default is a minor that names the study.
- **Extended harmony:** if extensions thin the harmonic histogram,
  `beatChords` could compare roots and qualities only.
- **The pickup bound:** `PICKUP_MAX_BAR_FRACTION` 0.5 is the design's (confirmed by Kevin), and
  the study's pickup song confirms or moves it.
- **A grammar question, Kevin's, not the study's:** should barmark read
  `CM7`, `CSus4`, `CmMaj7`, `CmM7`, `C69`, `C(7)sus4` and a Unicode minus?
  **Decided by Kevin (2026-11-09): none.** Spellings stay unambiguous;
  the app's `db:chart-check` moves stored charts once before adoption.

## 14. Kevin's answers

**Decided by Kevin (2026-11-09): yes to all five recommendations below.**
Where the text says "Recommendation", read "Decided"; the design calls
they touch (`not-same-piece` refusing maps, `onUnplaced` refusing by
default, the §7 pickup reading, the sync `[k/8]` patch before compound-meter
pickups, `rehashTiming`'s meter check) are now decisions.

**Amended after the app's review (2026-11-09, stem-shovel#17), Kevin to
confirm the third:**

- Q1: the gate applies to new alignments. Saved maps stay as they are, and
  no count is a precondition: a saved map stores no ratio or local cost, so
  counting would mean re-aligning every song from its audio. If Kevin
  wants the number, an optional script after the package ships can do it
  (decode each mix, run `alignChart`, count `not-same-piece`).
- Q2: unchanged. `RecordingChart.reading` now survives
  `onUnplaced: "declared"`.
- **Q3: yes, bounded at half a bar** (amended after the app's review;
  confirmed by Kevin 2026-11-09). A pickup is reported only when it is at most
  `PICKUP_MAX_BAR_FRACTION` (0.5) of a bar. A longer lead-in keeps the
  app's bar 1 with its opening silence. With `startAt` set by a person,
  the unbounded rule stands.
- Q5: unchanged, with the slot count taken on barmark's played slots
  (§8).

1. **Should "not the same piece" refuse a timing map?** Today the app keeps
   an aligned map when the fit passes (the ratio ≥ 1.5 among its rules).
   The same-piece gate (ratio ≥ 1.6 and median local cost ≤ 0.3) only
   hedges placements. Study 16's wrong pairing scored 1.74, so it passes
   the fit's ratio. *Recommendation: yes.* The map is refused with
   `not-same-piece` as well as the fit's reasons. It is stricter than the
   app by exactly the Study 16 case, which is S34-G1's concern. It applies
   to new alignments; saved maps stay (amended above). `weak-fit` (1.5) then never fires alone, and I'd keep it only as a
   reason name for the bench.
2. **What should the pipeline do when the grid cannot be placed?** That is
   an undecided vote, a flat envelope or bar one past the end.
   *Recommendation: refuse by default.* A public tool shows the reason,
   and the app and the bench pass `onUnplaced: "declared"` to keep today's
   behavior, which Study 34 records as the pipeline's choice.
3. **Is §7 the right reading of your pickup decision?** Bar one becomes the
   first downbeat after the first sound. Whenever the first sound comes
   0.75 beat or more into the placed bar, the app's bar 1 becomes the
   pickup and the written bar 1 moves one bar later. The silent beats
   before the pickup leave the grid, and the other bar lines stay put.
   *Recommendation: yes.* **Decided: yes, bounded at half a bar (amended
   after the app's review; confirmed by Kevin 2026-11-09).**
4. **Should sync write eighth-note pickups in compound meters?** Today
   `readPickup` builds whole dotted quarters, so a 1-eighth pickup in 6/8
   is ignored and a 2- or 4-eighth one comes out the wrong length. Grammar
   2.4 already allows `[1/8]` before 6/8. *Recommendation:* a sync patch
   that writes `[k/8]` for any whole number of eighths. It lands before
   listen reports compound-meter pickups. Until then the §7 guard stands,
   and listen drops those pickups with `pickup-dropped`.
5. **How strict should `rehashTiming` be?** It refuses when a played bar's
   meter changes, not only the count. *Recommendation: yes.* The map's
   starts mean nothing on a bar of another length, and a refinement that
   only names and spells never trips it.
