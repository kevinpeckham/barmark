# @barmark/listen 0.2: the grid from a tracker's beats: design

**Status:** approved by Kevin on 2026-11-13, with both of §13's
recommendations. The direction is Kevin's (2026-11-11, "Both": a tracker's
beats as input first, a model-free path later, §2). My own choices are
marked **(design call)**; he approved the design with them in it. No
grammar change. Nothing here is code yet.

It extends `2026-11-09-listen-design.md` (the 0.1 design, "the 0.1 design"
below). Section numbers with "0.1" in front point there.

## 1. Intent

Listen 0.1 finds a recording's bars with an onset comb near a declared
tempo. Stem Shovel's automatic draft no longer does: since app v0.261.0
its bars are a beat tracker's (Beat This small0, stem-bench Studies 41
and 44). The arithmetic that turns the tracker's beats and downbeats into
a bar grid, a meter and a tempo is about 190 lines of pure TypeScript in
the app:

- `src/lib/utils/beatThisDownbeats.ts`: each downbeat moved to its
  nearest beat;
- `src/lib/utils/beatThisGrid.ts`: the tempo from the median beat
  interval, the meter from the modal count of beats in a bar (Study 41);
- `src/lib/utils/trackerBarGrid.ts`: the bar grid, with adjacent half
  bars joined and an unsteady reading turned away (Study 44).

The bench ported those files by hand for Study 44. So the math is again
in two places and in neither of barmark's packages, which is what listen
exists to prevent. The 0.2 note of 2026-11-11 named this as the risk; it
has happened.

**0.2 ports that arithmetic into listen**, as 0.1 ported the comb: the
app's arithmetic in the app's order, each threshold an option, every
difference from the app a listed row (§9). The app, the bench and a public
tool then read a tracker's beats by one rule.

### Goals

1. **`gridFromBeats`** (§4): a tracker's beats and downbeats, as data, to
   a bar grid, a meter and a tempo. It needs no audio and no features.
2. **`chartFromBeats`** (§6): the beats and the chord runs to a chart, a
   timing map and a confidence record, in one call.
3. **`declared` becomes optional** on this path. When it is given it is
   compared and reported (§5), never obeyed.
4. **Refusals stay values.** A reading with too few bars or no settled
   bar is refused by name, with the numbers beside it.
5. The thresholds keep their values and studies, **exported and
   overridable** (§7).

### Non-goals

- **A model.** Listen runs no tracker and imports no model runtime (the
  0.1 design's non-goal, unchanged). Beat This's front end, windows and
  peak-picking (`beatThisLogMel`, `beatThisChunks`, `beatThisStitch`,
  `beatThisPeaks`) stay in the app: they belong to one model's recipe.
- **A model-free tempo-following grid.** Kevin chose it as the second
  step. It waits for a registered full-corpus study of the bench's "arm
  D" tracker; Study 35's evidence is one recording (§11).
- **Changing `findGrid`, `alignChart` or `chartFromRecording`.** The comb
  path stays as it is, bit for bit. Using beats in the alignment is later
  work (§11).
- **The app's sentence and hold.** `trackerGridNote.ts` words a notice and
  holds a draft when the bar is more than 4 % off the declared one. Listen
  reports the numbers (§5); the sentence and the threshold are the host's,
  as with `tempo-drift` in 0.1.
- **Where bar one is saved.** The app stores a draft's first downbeat as
  the song's start. That is the app's data.
- **A CLI command.** The CLI does not bundle listen.

### Anti-goals

- **Infer what the studies ruled out.** No 6/8 call from a sub-beat test,
  no ×2 "finer bar" rule (Study 40), no confidence gate on a tempo (Studies
  35, 36b), no hold on the drift from a declared tempo (Study 41).
- **Move a bar line the app would not.** `grid.bars` is the app's grid on
  every input the app accepts. The one addition, the pickup, sits before
  bar one and moves nothing (§4.4).
- **Turn the app's `null` into a silent fallback.** Where the app returns
  no grid, listen refuses with a reason. It does not quietly build on
  another grid.

## 2. Kevin's decisions, binding

From 2026-11-11, posted on kevinpeckham/stem-shovel#17:

1. Listen takes a tracker's **beats and downbeats as data**, the way sync
   takes chord detections. It runs no model.
2. **Listen owns the arithmetic** the bench measured: tempo = 60 over the
   median beat interval; the meter from the modal count of beats in a bar;
   a count of 6 is 6/8 at a third of the beat tempo.
3. **`declared` becomes optional**, and a metrical fold against it is
   reported, not held.
4. **Later, a model-free path**, only after a registered full-corpus
   study.
5. **Kept out:** the confidence gate, the sub-beat 6/8 call, the ×2 rule.

## 3. What is ported, and from where

The source is stem-shovel `dev` at `8714cf36` (the three files last
changed in `011cee44`, v0.261.0). Read only; nothing is written there.

| App | Listen |
| --- | --- |
| `beatThisDownbeats` | `src/beats/snap.ts`, run on every input (§4.2) |
| `beatThisGrid` (tempo, counts, modal count, meter) | `src/beats/label.ts` |
| `trackerBarGrid` (`joinHalfBars`, `steadyShare`, the closing bar) | `src/beats/bars.ts` |
| the constants `MIN_BARS`, `MIN_STEADY_SHARE`, `MIN_CLOSING_SHARE` | options (§7) |
| `buildChartFromDetections`' tracker branch | `chartFromBeats` (§6) |

New files: `src/beats/input.ts` (the input, checked), `src/beats/grid.ts`
(`gridFromBeats`), `src/beats/declared.ts` (§5), `src/beats/pipeline.ts`
(`chartFromBeats`). The root exports the two calls and their types;
`./stages` adds `snapDownbeats`, `beatsLabel`, `joinHalfBars`,
`steadyShare` for the bench.

## 4. `gridFromBeats`

```ts
/** A tracker's reading, in seconds from the recording's start. */
type BeatsInput = {
	beats: number[];
	/** The first beat of each bar. */
	downbeats: number[];
	/** The recording's length: the closing bar ends here. */
	duration: number;
	/** What the song is set to, if anything: compared (§5), never obeyed. Either part may be missing. */
	declared?: { meter?: string; tempo?: number } | null;
};

type BeatsReading = {
	/** 60 / the median beat interval, a whole bpm: the tracker's beat. */
	beatTempo: number;
	/** The tempo in grammar 2.1's beat: `beatTempo`, or a third of it in 6/8. */
	tempo: number;
	/** The modal count of beats in a bar, the smallest on a tie. */
	beatsPerBar: number;
	/** How many bars, as read, held each count. */
	counts: Record<number, number>;
	/** Bar lines removed by joining half bars. */
	joined: number;
	/** The share of the joined bars that hold `beatsPerBar` beats. */
	steadyShare: number;
	/** The median bar of the joined grid, in seconds. */
	barSeconds: number;
};

type TrackedGrid = {
	/** Bar one's start … the end; never includes the pickup. */
	grid: BarGrid;
	pickup: { start: number; beats: number } | null;
	meter: "4/4" | "3/4" | "6/8";
	reading: BeatsReading;
};

gridFromBeats(input: BeatsInput, options?: ListenOptions):
	Ok<TrackedGrid> | Refused<{ reading: Partial<BeatsReading> | null }>;
```

### 4.1 The input

Checked in this order; the first problem is an `invalid-input` refusal
whose `detail.field` names the field (and `detail.index` the element):

- the input is an object;
- `duration` is a finite number above 0;
- `beats` and `downbeats` are arrays of at most 200,000 numbers **(design
  call: a fixed cap, about 18 hours at 180 bpm, so no input makes the
  package allocate without bound)**;
- every element is finite, at least 0, at most `duration`, and greater
  than the one before it (strictly ascending);
- `declared`, when given and not null, is an object; its `meter`, when
  given, is one `parseMeter` reads, and its `tempo`, when given, is a
  number from 1 to 999 (0.1's two rules, each applied on its own). 0.1's
  `readDeclared` needs both parts, so this path has its own reader
  **(design call: the app's notice handles a song with a meter and no
  tempo, so listen must too)**.

Each array is read once into a copy, and a read that throws is
`invalid-input`, as 0.1 reads chord runs.

**Design call: strict, not repaired.** An unsorted or duplicated list is
refused, not sorted. Every tracker we know writes ascending times, the
app's stored beats are ascending, and a list out of order more likely
means the wrong field was passed than a tracker worth repairing.

### 4.2 The reading, in the app's order

1. **Snap** (`beatThisDownbeats`): each downbeat moves to its nearest
   beat, the earlier one on a tie; duplicates go. So every downbeat is a
   beat. The app does this when it stores a reading; listen does it on
   every input, so another tracker's output is safe. On the app's stored
   beats it changes nothing.
2. Fewer than 2 beats, or fewer than `TRACKER_MIN_BARS + 1` downbeats:
   **`too-few-bars`**.
3. **The label** (`beatThisGrid`). `beatTempo` is `round(60 / median beat
   interval)`. Each bar as read is counted downbeat to downbeat; the modal
   count is `beatsPerBar`. The meter is Study 41's rule as the app has it:
   6 is `6/8`, 3 is `3/4`, any other count is `4/4`. `tempo` is
   `round(beatTempo / 3)` in 6/8 and `beatTempo` otherwise.
4. **Join half bars** (`joinHalfBars`, Study 44). When `beatsPerBar` is
   even, two bars in a row that each hold half of it lose the line between
   them. A half bar with no partner stays as read. Pairs only: three in a
   row leave the third.
5. Fewer than `TRACKER_MIN_BARS + 1` bar lines after joining:
   **`too-few-bars`**.
6. **The steady share** (`steadyShare`): the share of the joined bars that
   hold exactly `beatsPerBar` beats. Under `TRACKER_MIN_STEADY_SHARE`:
   **`bars-unsteady`**. Study 44 says what this is for: it keeps a reading
   with no bar at all off the chart; it does not predict a wrong bar.
7. `barSeconds` is the median joined bar.
8. **The closing bar.** If the time from the last bar line to `duration`
   is at least `TRACKER_MIN_CLOSING_SHARE × barSeconds`, the grid ends at
   `duration`. Otherwise it ends at the last bar line, and what follows is
   left off.
9. More than `MAX_GRID_BARS` bars: the grid keeps the first
   `MAX_GRID_BARS` and warns `grid-truncated` (0.1's option and warning;
   the app has no cap) **(design call)**.

A refusal after step 3 carries the reading so far (`counts`,
`beatsPerBar`, `beatTempo`, and `steadyShare` when it was reached), so a
page or a study can say why.

**The counts are taken in one pass.** The app counts a bar's beats with a
filter over every beat, which is quadratic in a long recording. Listen
walks both lists once. The numbers are the same; the scale test times it
relatively, as the package's others do.

### 4.3 What the meter and tempo mean

- The tracker gives **one meter for the piece**. A count of 5 or 7 reads
  as `4/4`, and a count of 2 as `4/4` with two-beat bars. That is the
  app's rule and Study 41's ("else 4/4"; 2 "unmeasured"). It is wrong for
  a song in 5/4. It is listed as open (§11), not changed here: a new label
  needs a study.
- **Two tempos, and which to show (design call).** `reading.beatTempo`
  and `reading.tempo` are Study 41's label, from the median beat. The
  chart's `tempo:` is another number: `chartFromBeats` passes the builder
  no tempo, so sync derives it from the bars (`gridTempo`: the median bar,
  with half and double bars folded first), as the app's build does. They
  differ by a few bpm on real readings, because a tracker's times sit on
  20 ms frames and the two medians round apart: Peaceful Dreams reads 143
  from its beats and 145 from its bars (declared 145), Letter Lands 130
  and 132 (declared 132). They differ more where the label and the count
  do (a count of 2 or 5 labelled 4/4). **A host shows and stores the
  chart's tempo**, which is the one the timing map agrees with; the
  reading's is for the bench and for the label's own record. The README
  says so.

### 4.4 The pickup (design call; §13 Q1)

The app's grid starts at the first downbeat. Beats before it are outside
the grid, and their chords are dropped (sync's `outside-bars`).

Listen reports them as a pickup when there are few enough, by 0.1's bound
(0.1 §7, Kevin's decision of 2026-11-09):

- `p` = the number of beats before the first bar line.
- `1 ≤ p ≤ PICKUP_MAX_BAR_FRACTION × beatsPerBar` (at most half a bar by
  default) **and bar one holds `beatsPerBar` beats**: `pickup = { start:
  the first beat, beats: p }`, with a `pickup` warning. `chartFromBeats`
  passes `pickup.start` to the builder, which writes bar 0 with its own
  one-bar meter (grammar 2.4).
- Otherwise, with `p ≥ 1`: no pickup, and a new warning
  **`beats-before-bar-one`** (`detail.beats`, `detail.start`). Those beats
  stay outside the grid, as in the app.

`grid.bars` is the same either way, so this moves no bar line.

**Why bar one must be a usual bar.** sync's `readPickup` does not take
the pickup's length from listen. It measures the gap against bar one's
own length and ignores a pickup that comes out a bar or longer. In 0.1
bar one was always a usual bar; a tracker's may be an unpaired half bar,
where two beats would measure as a whole bar and be ignored, or a double
bar, where they would be written as one. Requiring a usual bar one keeps
`grid.pickup` and the written chart in step. `pickup.beats` stays
nominal, as in 0.1, and the builder's own diagnostics (`pickup-ignored`
among them) are passed through unchanged, so if the two ever disagree the
caller sees it. A test asserts they agree on the seeded set.

It is **not measured**. Of the app's five real readings, one has beats
before its first downbeat (eat all the clocks: two beats, in a song whose
intro the tracker read in half bars). There the "pickup" is really half of
bar one that the tracker gave no downbeat. Written as a pickup, its chord
is on the chart in a bar marked as partial. Dropped, the chart starts one
second into the song. I think the first is the better failure, and it is
Kevin's call (§13 Q1).

## 5. `declared`, compared and never obeyed

Two warnings, neither a refusal and neither with a threshold:

- **`tempo-drift`** (0.1's code, the same meaning), when `declared` has
  both a meter and a tempo: `declaredBar = beatsOf(meter) × 60 / tempo`
  (0.1's rule, grammar 2.1's beat), and the grid's bar is not it. A tempo
  with no meter is not compared **(design call: the bar's length needs
  both, and guessing 4/4 would report a drift that is only the guess)**. `detail.ratio` is `barSeconds / declaredBar − 1`,
  signed, with `detail.period` (`barSeconds`) and `detail.declaredBar`, as
  in 0.1. So the app's own 4 % rule reads it unchanged. On this path the
  detail also has:
  - `detail.fold`: the nearest of ½, 1 and 2 to `barSeconds /
    declaredBar`, by ratio;
  - `detail.foldRatio`: `barSeconds / (fold × declaredBar) − 1`.

  A host that wants Study 41's reading (a fold is not a wrong draft) tests
  `foldRatio`; one that wants the app's (the bar numbers will not match
  the player's count) tests `ratio`. Not emitted when `ratio` is zero
  within 8 ulps of 1, as in 0.1.
- **`meter-differs`** (new), when `declared` has a meter: the label is not
  it. `detail.meter` and `detail.declared`.

The grid, the meter and the tempo are the tracker's in every case.

## 6. `chartFromBeats`

```ts
type BeatsChartInput = BeatsInput & {
	chords: ListenChordRuns;
	/** Passed to chartFromDetections as given. */
	title?: string;
	key?: Detected<string> | null;
	sections?: { name: string; start: number; confidence?: number }[];
	changes?: Change[];
	recording?: { id?: string };
};

type BeatsChart = {
	chart: string;
	timing: TimingMap;
	confidence: ConfidenceRecord;
	/** The builder's own diagnostics, unchanged. */
	diagnostics: BuildDiagnostic[];
	grid: TrackedGrid;
};

chartFromBeats(input: BeatsChartInput, options?: ListenOptions & { build?: BuildOptions }):
	Ok<BeatsChart> | Refused<{ reading: Partial<BeatsReading> | null }>;
```

- The steps are `gridFromBeats`, then `chartFromDetections({ grid, pickup,
  chords, meter: the label, title, key, sections, changes, recording: {
  id, duration } })`. No tempo is passed (§4.3).
- `recording.duration` is the input's `duration`, the recording's length,
  as in 0.1. The app passes the grid's end (§9).
- **`changes` go to the builder as given (design call).** The app passes
  only its key changes here, because its tempo and meter changes sit on
  the declared timeline. That is the app's knowledge about its own data;
  the README says a host in the same position should do the same.
- A builder `error` is `invalid-input` with the builder's message, never
  an empty chart returned as success (0.1's rule).
- **No fallback inside (design call; §13 Q2).** When the reading is
  refused, the call refuses. A host that has a declared tempo then calls
  `chartFromRecording`, which is what the app does today ("the draft keeps
  the declared grid"). The README shows those few lines. Folding the
  fallback into one call would make it need audio or features for a path
  that otherwise needs neither, and would hide which grid a chart stands
  on.

## 7. Options

Three new options, in 0.1's table form. The app's constants are local to
one file and unprefixed; listen's options share one namespace, so they
take a `TRACKER_` prefix **(design call)**.

| Option | Default | From | Range |
| --- | --- | --- | --- |
| `TRACKER_MIN_BARS` | 4 | The app's (`MIN_BARS`); not a study's | a whole number ≥ 1 |
| `TRACKER_MIN_STEADY_SHARE` | 0.4 | stem-bench Study 44: at 0.6 the rule removed more right readings than wrong; 0.4 removed 12 of 261 census readings and kept every good 6/8 draft | 0 to 1; 0 turns the rule off |
| `TRACKER_MIN_CLOSING_SHARE` | 0.5 | The app's (`MIN_CLOSING_SHARE`); not a study's | above 0, to 1 (at 0 a recording that ends on a bar line would get a bar of no length) |

`MAX_GRID_BARS` and `PICKUP_MAX_BAR_FRACTION` are 0.1's, read here too.
The other grid and alignment options are accepted and unused, as
`findGrid` accepts the alignment's. `chartFromBeats` also takes `build`,
and neither call takes the two sound options, which belong to features
this path never reads. An unknown or out-of-range option is
`invalid-option`.

## 8. Refusals and warnings added

| Reason | When |
| --- | --- |
| `too-few-bars` | Fewer than 2 beats, or fewer than `TRACKER_MIN_BARS + 1` bar lines, as read or after joining. `detail.bars`, `detail.beats`. |
| `bars-unsteady` | The steady share is under `TRACKER_MIN_STEADY_SHARE`. `detail.share`, `detail.beatsPerBar`. |

| Code | When |
| --- | --- |
| `meter-differs` | §5. |
| `beats-before-bar-one` | §4.4. |
| `bars-joined` | Half bars were joined. `detail.lines` is how many bar lines went. The app joins silently. |

`tempo-drift`, `pickup` and `grid-truncated` are 0.1's codes, used as §4
and §5 say. `invalid-input` and `invalid-option` are 0.1's.

## 9. Where it may differ from the app, and why

These join 0.1 §11.3's table. Anything else that differs is a porting
bug.

| Difference | Why |
| --- | --- |
| The app returns `null` for no grid; listen refuses `too-few-bars` or `bars-unsteady` with the reading | 0.1 §4: refusals are values with reasons |
| A pickup when 1 to half a bar of beats come before the first downbeat; the app drops them | §4.4, Kevin's 0.1 pickup decision carried over (§13 Q1). `grid.bars` is unchanged |
| The map's `recording.duration` is the recording's length | As 0.1; the app passes the grid's end |
| `grid-truncated` at `MAX_GRID_BARS` | The app has no cap |
| Input the app never sees (unsorted, non-finite, past the end, over 200,000 beats) is `invalid-input` | The app reads only what it stored; a package reads anything |
| Downbeats are snapped on every call | The app snaps once, before storing. No change on stored beats |
| `changes` reach the builder as given | §6; the app filters its own |
| Warnings `tempo-drift` (with `fold`), `meter-differs`, `bars-joined`, `beats-before-bar-one` | New; the app words its own notice from the same numbers |

## 10. Tests and the equivalence

- **Unit tests** on synthetic beats written in the tests (no fixture
  files): the app's twelve `trackerBarGrid` cases and its `beatThisGrid`
  and `beatThisDownbeats` cases, restated; each refusal and warning; each
  input rule; the pickup's bound and its usual-bar rule; `declared`'s fold
  at ½, 1 and 2, and each part of `declared` alone. Two of the app's
  snapping cases (unsorted downbeats, no beats) are inputs §4.1 refuses,
  so they are tested on the stage export `snapDownbeats`, which takes any
  lists.
- **Scale:** a 100,000-beat reading in linear time, timed relatively with
  `test-support/growth.ts`.
- **Never throws:** hostile input (getters, a Proxy, sparse arrays,
  `NaN`, huge lengths) is a refusal.
- **Equivalence, in a script of its own.**
  `scripts/listen-beats-equivalence.ts <commit>` (at or after `011cee44`)
  runs only the app's `trackerBarGrid` and `beatThisGrid`, and writes only
  `tests/fixtures/beats/equivalence.json`, which records its own commit.
  The three app files import nothing but each other, so the script reads
  them with `git show` into `~/.cache/barmark/` and needs no clone and no
  install. `scripts/listen-equivalence.ts` is not touched. **The 0.1
  goldens stay at `59da1952`
  (design call):** the app has since changed modules they read and moved
  to newer barmark and sync, so regenerating them belongs to a 0.1
  maintenance task, not to this one. The test checks the two commits
  separately. The app's functions do not snap, and they count a bar's
  beats two ways that agree only on snapped input, so the script snaps
  each seeded reading before it calls them. It compares:
  - on a seeded set of synthetic readings (steady 4/4, 3/4 and 6/8, half
    bars, an unsteady reading, a short one, tails either side of the
    closing bound), written as goldens and checked by
    `tests/beats-equivalence.test.ts`;
  - on the app's five real readings in its
    `docs/bench-reply-beats-2026-11-11.json`, read with `git show` and
    compared on the VM only. They are not copied into barmark **(design
    call: as 0.1 keeps its three real mixes out of the repository)**.

  Compared per reading: `bars`, `meter`, `barSeconds`, `beatTempo`,
  `tempo`, `beatsPerBar` and `counts`; and that a `null` from the app is a
  refusal here.

## 11. Open, and later

- **The model-free tempo-following grid** (Kevin's second step): after a
  registered full-corpus study of arm D. Study 39's warning stands:
  bounding the drift keeps the bar and loses the beats under rubato.
- **Beats in `alignChart`.** The alignment's re-phase uses the comb. A
  tracker's beats could stand in for it. Unmeasured.
- **Counts of 2, 5 and 7.** Labelled 4/4 today (§4.3).
- **Folds other than ½ and 2** (a 6/8 read in threes against a declared
  6/8 is ½; a 12/8 read in threes would be ¼). Add when a study shows one.
- **A missed first downbeat.** When a whole bar or more of beats comes
  before the first downbeat, a bar line one usual bar earlier would keep
  that music on the chart. It is new math, so it needs a study; 0.2 only
  warns (`beats-before-bar-one`).
- **A person's start of bar one** (`startAt`) on this path. The app does
  not use it here. Left out until a host asks.
- **Bass lines.** Studies 48 to 51 measured a transcribed bass line on the
  tracker's grid and found the grid is not what limits it (Study 50).
  Nothing for listen.

## 12. Release and adoption

- `@barmark/listen` **0.2.0**, a minor: two new calls, three options, two
  refusal reasons, three warning codes. No dependency changes and no
  change to any 0.1 call, so the 0.1 goldens stand untouched. The CLI does
  not bundle listen, so no CLI release follows. barmark.dev's dev pin is
  raised in its own pull request.
- The README gains "From a beat tracker" (the two calls, the fallback to
  `chartFromRecording`, what the label cannot say). `CLAUDE.md`'s layout
  gains `src/beats/`. The 0.1 design's §13 gains a line pointing here.
- **Adoption is the app's.** A reply on stem-shovel#17 says what 0.2 has
  and what the app would change: `trackerBarGrid` and `beatThisGrid`
  become `gridFromBeats`; `trackerGridNote` reads `tempo-drift` and
  `meter-differs`; the three ported files and their tests can go once the
  equivalence passes on its side. Nothing is written in stem-shovel from
  here.

## 13. Kevin's answers

**Decided by Kevin (2026-11-13): yes to both recommendations below.**
Where the text says "I recommend", read "Decided": beats before the first
downbeat are a pickup when they are at most half a bar and bar one is a
usual bar (§4.4), and `chartFromBeats` is its own call with no fallback
inside (§6).

1. **The pickup (§4.4).** The app drops beats that come before the first
   downbeat. I recommend listen write them as a pickup bar when they are
   at most half a bar, by your 0.1 rule, and warn. The one real case we
   have is a missed half bar, not a true pickup; a pickup bar keeps its
   chord on the chart, where dropping starts the chart a second late. The
   other choice is to port the app exactly (drop, and warn).
2. **One call or two (§6).** I recommend a separate `chartFromBeats` with
   no fallback inside, and the host calling `chartFromRecording` when the
   reading is refused. The other choice is a `beats` field on
   `chartFromRecording` that falls back to the comb by itself.
