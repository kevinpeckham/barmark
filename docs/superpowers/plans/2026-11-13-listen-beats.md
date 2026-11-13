# @barmark/listen 0.2: the grid from a tracker's beats: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `gridFromBeats` and `chartFromBeats` to `@barmark/listen`: a beat tracker's beats and downbeats, as data, to a bar grid, a meter, a tempo and a chart.

**Architecture:** A port of three pure files from Stem Shovel (`beatThisDownbeats`, `beatThisGrid`, `trackerBarGrid`) into a new `src/beats/` folder, with listen's own input checks, refusals, warnings and options around them. `chartFromBeats` runs the grid and then `@barmark/sync`'s `chartFromDetections`, sharing the builder call with `chartFromRecording`. No 0.1 call changes.

**Tech Stack:** TypeScript (strict), Bun test, Biome (tabs), Fallow. No new dependency.

**Spec:** `docs/superpowers/specs/2026-11-12-listen-beats-design.md` ("the spec"; approved by Kevin 2026-11-13). It extends `docs/superpowers/specs/2026-11-09-listen-design.md` ("the 0.1 design").

## Global Constraints

- **The app's source is read only.** Read it with `git -C ~/projects/stem-shovel show 8714cf36:<path>`. Never write, commit, check out or change anything in `~/projects/stem-shovel` or `~/projects/stem-bench`.
- The ported arithmetic is the app's, in the app's order (spec §4.2). `grid.bars`, `meter`, `barSeconds`, `beatTempo`, `tempo`, `beatsPerBar` and `counts` equal the app's on every input the app accepts.
- **Never throws.** Every call returns `Ok` or `Refused`. A read that throws (a getter, a Proxy) is `invalid-input`.
- **Linear time.** No per-bar scan of all beats (the app's `beats.filter` in a loop is quadratic). Walk both lists once, or search by bisection.
- `packages/listen/tsconfig.build.json` has `"types": []`: no DOM or Node global in `src/` (no `performance`, no `Buffer`).
- No change to `findGrid`, `alignChart`, `chartFromRecording`, `scripts/listen-equivalence.ts` or the 0.1 goldens (`tests/fixtures/equivalence/case-*.json`). The 0.1 tests pass unchanged.
- Option names and defaults: `TRACKER_MIN_BARS` 4, `TRACKER_MIN_STEADY_SHARE` 0.4, `TRACKER_MIN_CLOSING_SHARE` 0.5.
- The input cap is 200,000 elements in each of `beats` and `downbeats`.
- `bun test packages/listen`, `bun run check` and `bun run fallow` are clean at the end of every task. Refactor rather than grow Fallow's baseline.
- Commits are conventional commits with **no** `Co-Authored-By` or other AI trailer.
- The package version stays `0.1.1`; the release is a separate step after the merge (`RELEASING.md`).
- Messages are one plain sentence, in seconds and bar counts, fit to show a person.

## Review Focus

1. **Every beat is a downbeat** (a tracker that marks each beat as bar one): the modal count is 1, the label `4/4`, no join. Expected: an `ok` grid of one-beat bars, no throw, no division by zero. Test in Task 3.
2. **The recording ends exactly on the last bar line** (`duration` equals the last downbeat): the tail is 0, so no closing bar, and no bar of no length. Test in Task 3.
3. **Snapping collapses the reading**: downbeats that all fall nearest one or two beats leave fewer than five bar lines. Expected: `too-few-bars`, not a throw or a grid. Test in Task 3.
4. **Truncation with a pickup**: a reading over `MAX_GRID_BARS` bars with one beat before bar one keeps the pickup and the first `MAX_GRID_BARS` bars, and warns both. Test in Task 4.
5. **A declared 3/4 against a tracker's 6/8** (two declared bars to one): `meter-differs`, and `tempo-drift` with `fold: 2` and a `foldRatio` near 0. Test in Task 4.

---

### Task 1: Refusal reasons, warning codes and options

**Files:**
- Modify: `packages/listen/src/result.ts`
- Modify: `packages/listen/src/options.ts`
- Test: `packages/listen/tests/options.test.ts`

**Interfaces:**
- Produces: `RefusalReason` gains `"too-few-bars" | "bars-unsteady"`. `WarningCode` gains `"meter-differs" | "beats-before-bar-one" | "bars-joined"`.
- Produces: `ListenOptions` and `Settings` gain `TRACKER_MIN_BARS`, `TRACKER_MIN_STEADY_SHARE`, `TRACKER_MIN_CLOSING_SHARE` (numbers). `OptionScope` gains `"beats"`: every option `"listen"` accepts, plus `build`. `resolveOptions(options, "beats")` returns `Ok<{ settings: Settings; build?: BuildOptions }> | Refused`.

- [ ] **Step 1: Write the failing tests** in `tests/options.test.ts`

```ts
test("the tracker options: defaults and ranges", () => {
	expect(DEFAULTS.TRACKER_MIN_BARS).toBe(4);
	expect(DEFAULTS.TRACKER_MIN_STEADY_SHARE).toBe(0.4);
	expect(DEFAULTS.TRACKER_MIN_CLOSING_SHARE).toBe(0.5);
	const refuses = (o: object) => {
		const r = resolveOptions(o, "listen");
		return !r.ok && r.refusals[0]?.reason === "invalid-option";
	};
	expect(refuses({ TRACKER_MIN_BARS: 0 })).toBe(true);
	expect(refuses({ TRACKER_MIN_BARS: 2.5 })).toBe(true);
	expect(refuses({ TRACKER_MIN_STEADY_SHARE: -0.1 })).toBe(true);
	expect(refuses({ TRACKER_MIN_STEADY_SHARE: 1.1 })).toBe(true);
	expect(refuses({ TRACKER_MIN_CLOSING_SHARE: 0 })).toBe(true);
	expect(resolveOptions({ TRACKER_MIN_STEADY_SHARE: 0 }, "listen").ok).toBe(true);
	expect(resolveOptions({ TRACKER_MIN_CLOSING_SHARE: 1 }, "listen").ok).toBe(true);
});

test('the "beats" scope: the grid and alignment options and build, not the sound options', () => {
	expect(resolveOptions({ TRACKER_MIN_BARS: 8, build: {} }, "beats").ok).toBe(true);
	const sound = resolveOptions({ ALIGNMENT_SOUND_FLOOR: 0.1 }, "beats");
	expect(sound.ok).toBe(false);
	expect(resolveOptions({ build: {} }, "listen").ok).toBe(false);
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `bun test packages/listen/tests/options.test.ts`
Expected: FAIL (`DEFAULTS.TRACKER_MIN_BARS` is undefined; `"beats"` is not a scope).

- [ ] **Step 3: Implement.** In `result.ts`, add the two reasons and three codes to the unions. In `options.ts`, add the three options to `ListenOptions`, to `DEFAULTS` (each with a doc comment giving its origin from the spec's §7 table) and to `RANGES` (`whole`; `v >= 0 && v <= 1`; `upTo1`); add `"beats"` to `OptionScope` and to `acceptedKeys` (the listen keys, or `build`). If an existing test pins the list of `DEFAULTS` keys, extend its list.

- [ ] **Step 4: Run the package's tests**

Run: `bun test packages/listen`
Expected: PASS, no test removed.

- [ ] **Step 5: Commit**

```bash
git add packages/listen/src/result.ts packages/listen/src/options.ts packages/listen/tests/options.test.ts
git commit -m "feat(listen): the tracker options, refusal reasons and warning codes"
```

---

### Task 2: The ported stages

**Files:**
- Create: `packages/listen/src/beats/snap.ts`, `packages/listen/src/beats/label.ts`, `packages/listen/src/beats/bars.ts`
- Create: `packages/listen/tests/helpers/beats.ts`
- Test: `packages/listen/tests/beats-stages.test.ts`

Port from `src/lib/utils/beatThisDownbeats.ts`, `beatThisGrid.ts` and `trackerBarGrid.ts` at `8714cf36`. Read all three and their `.test.ts` files first.

**Interfaces:**
- Produces, `snap.ts`: `snapDownbeats(beats: readonly number[], downbeats: readonly number[]): number[]`. `beats` ascending. Each downbeat moves to its nearest beat, the earlier one on a tie; the result is sorted with duplicates removed. With no beats, a copy of `downbeats`. By bisection, not a scan per downbeat.
- Produces, `label.ts`:
  ```ts
  export type BeatsMeter = "4/4" | "3/4" | "6/8";
  export type BeatsLabel = {
  	beatTempo: number | null; // the app's `tempo`
  	tempo: number | null; // the app's `chartTempo`
  	beatsPerBar: number | null;
  	meter: BeatsMeter | null;
  	counts: Record<number, number>;
  };
  export function beatsLabel(beats: readonly number[], downbeats: readonly number[]): BeatsLabel;
  ```
  A bar's count is the beats strictly between two downbeats, plus one (the app's `barCounts`), taken in one pass.
- Produces, `bars.ts`:
  ```ts
  /** Beats in [lines[i], lines[i + 1]) for each bar, in one pass. */
  export function barBeats(beats: readonly number[], lines: readonly number[]): number[];
  export function joinHalfBars(beats: readonly number[], downbeats: readonly number[], usual: number): number[];
  export function steadyShare(beats: readonly number[], lines: readonly number[], usual: number): number;
  /** numpy's median: the mean of the two middle values for an even count. */
  export function median(values: readonly number[]): number;
  ```
- Produces, `tests/helpers/beats.ts`: `reading(counts: number[], tail = 0, beat = 0.5): { beats: number[]; downbeats: number[]; duration: number }`, the app test's helper (one bar per entry, a last downbeat where the last bar ends, `tail` seconds after it), and `evenBeats(bpm: number, perBar: number, bars: number): { beats: number[]; downbeats: number[] }`, the app's `grid` helper.

- [ ] **Step 1: Write the failing tests.** Restate every case of the app's `beatThisDownbeats.test.ts` (4) and `beatThisGrid.test.ts` (7) with the same inputs and expected values, the two tempo fields renamed. Add, for `bars.ts`:

```ts
test("joinHalfBars: pairs only, and never for an odd usual count", () => {
	const a = reading([2, 2, 2, 4, 4, 4, 4, 4]);
	expect(joinHalfBars(a.beats, a.downbeats, 4)).toEqual([0, 2, 3, 5, 7, 9, 11, 13]);
	const b = reading([3, 3, 3, 3, 3, 3, 1, 1]);
	expect(joinHalfBars(b.beats, b.downbeats, 3)).toEqual(b.downbeats);
});

test("steadyShare: the share of bars holding the usual count", () => {
	const r = reading([3, 3, 3, 2, 4, 5, 2, 4, 5]);
	expect(steadyShare(r.beats, r.downbeats, 3)).toBeCloseTo(3 / 9, 12);
});

test("barBeats counts each bar's beats, the bar line's own beat included", () => {
	const r = reading([4, 2, 5]);
	expect(barBeats(r.beats, r.downbeats)).toEqual([4, 2, 5]);
});
```

- [ ] **Step 2: Run and see them fail**

Run: `bun test packages/listen/tests/beats-stages.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement the three modules.** `joinHalfBars` keeps the app's loop exactly: push `downbeats[i]`; the pair test is `i + 2 < downbeats.length` and both bars' counts equal `usual / 2`; on a pair skip one line. Take the counts from one `barBeats` pass.

- [ ] **Step 4: Run the tests**

Run: `bun test packages/listen/tests/beats-stages.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/listen/src/beats packages/listen/tests/helpers/beats.ts packages/listen/tests/beats-stages.test.ts
git commit -m "feat(listen): the tracker's stages ported: the snap, the label and the bars"
```

---

### Task 3: `gridFromBeats`: the input, the reading, the grid

**Files:**
- Create: `packages/listen/src/beats/input.ts`, `packages/listen/src/beats/grid.ts`
- Test: `packages/listen/tests/beats-grid.test.ts`, `packages/listen/tests/beats-scale.test.ts`

**Interfaces:**
- Consumes: Task 1's options and reasons; Task 2's stages.
- Produces, `input.ts`:
  ```ts
  export const MAX_BEATS = 200_000;
  export type BeatsDeclared = { meter: Meter | null; tempo: number | null };
  export type CheckedBeats = { beats: number[]; downbeats: number[]; duration: number; declared: BeatsDeclared };
  /** The input checked in spec §4.1's order; the first problem refused. Never throws. */
  export function readBeats(input: unknown): CheckedBeats | Refusal;
  ```
  `detail.field` is `input`, `duration`, `beats`, `downbeats`, `declared`, `declared.meter` or `declared.tempo`; a bad element also has `detail.index`. `declared` absent or null gives both parts null; either part may be given alone.
- Produces, `grid.ts`:
  ```ts
  export type BeatsInput = { beats: number[]; downbeats: number[]; duration: number; declared?: { meter?: string; tempo?: number } | null };
  export type BeatsReading = { beatTempo: number; tempo: number; beatsPerBar: number; counts: Record<number, number>; joined: number; steadyShare: number; barSeconds: number };
  export type TrackedGrid = { grid: BarGrid; pickup: { start: number; beats: number } | null; meter: BeatsMeter; reading: BeatsReading };
  export type BeatsGridResult = Ok<TrackedGrid> | Refused<{ reading: Partial<BeatsReading> | null }>;
  export function gridFromBeats(input: BeatsInput, options?: ListenOptions): BeatsGridResult;
  /** `gridFromBeats` on options already resolved (the pipeline's). */
  export function beatsGridWith(input: unknown, s: Settings): BeatsGridResult;
  ```
  In this task `pickup` is always `null` and `declared` is read but not compared; Task 4 adds both.

The steps are the spec's §4.2, numbered 1 to 9. Refusals:
- `too-few-bars` at step 2 (`reading: null`; `detail: { bars, beats }`, `bars` the bar lines less one, never below 0) and at step 5 (the reading so far: `beatTempo`, `tempo`, `beatsPerBar`, `counts`, `joined`).
- `bars-unsteady` at step 6 (`detail: { share, beatsPerBar }`; the reading so far plus `steadyShare`).
- `invalid-input` and `invalid-option` carry `reading: null`.

Warnings: `bars-joined` (`detail: { lines }`) when `joined > 0`; `grid-truncated` (`detail: { bars: MAX_GRID_BARS }`, the message the comb path uses) when the grid has more than `MAX_GRID_BARS` bars and is cut to the first `MAX_GRID_BARS`.

- [ ] **Step 1: Write the failing tests** in `tests/beats-grid.test.ts`. With `const grid = (r, o?) => gridFromBeats(r, o)` and `reading` from the helper:

The app's twelve `trackerBarGrid` cases, each on the same input, asserting `value.grid.bars`, `value.meter` and `value.reading.barSeconds` where the app asserts `bars`, `meter` and `barSeconds`, and a refusal where the app asserts `null`:
- `reading([4, 4, 4])` and `{ beats: [], downbeats: [], duration: 30 }`: `too-few-bars`.
- the two unsteady readings (`[3,3,3,2,4,5,2,4,5]`, `[3,3,3,2,4,5,2,4]`): `bars-unsteady`, with `reading.steadyShare` 3/9 and 3/8 and `reading.beatsPerBar` 3.

Then listen's own:

```ts
test("the reading: the label, the counts, the joins and the share", () => {
	const r = grid(reading([2, 2, 4, 4, 4, 4]));
	if (!r.ok) throw new Error("refused");
	expect(r.value.reading).toEqual({
		beatTempo: 120, tempo: 120, beatsPerBar: 4, counts: { 2: 2, 4: 4 },
		joined: 1, steadyShare: 1, barSeconds: 2,
	});
	expect(r.warnings.map((w) => w.code)).toEqual(["bars-joined"]);
	expect(r.warnings[0]?.detail).toEqual({ lines: 1 });
});

test("6/8: the tempo is a third of the beat's", () => {
	const r = grid({ ...evenBeats(143, 6, 8), duration: (48 * 60) / 143 });
	if (!r.ok) throw new Error("refused");
	expect([r.value.meter, r.value.reading.beatTempo, r.value.reading.tempo]).toEqual(["6/8", 143, 48]);
});

test("every beat a downbeat: one-beat bars labelled 4/4", () => {
	const beats = Array.from({ length: 9 }, (_, i) => i * 0.5);
	const r = grid({ beats, downbeats: beats, duration: 4 });
	if (!r.ok) throw new Error("refused");
	expect(r.value.meter).toBe("4/4");
	expect(r.value.reading.beatsPerBar).toBe(1);
	expect(r.value.grid.bars).toEqual(beats);
});

test("a recording that ends on the last bar line closes no extra bar", () => {
	const r = grid(reading([4, 4, 4, 4], 0));
	if (!r.ok) throw new Error("refused");
	expect(r.value.grid.bars).toEqual([0, 2, 4, 6, 8]);
});

test("downbeats that snap onto too few beats are too-few-bars", () => {
	const r = grid({ beats: [0, 10], downbeats: [1, 2, 3, 6, 7, 8], duration: 10 });
	expect(!r.ok && r.refusals[0]?.reason).toBe("too-few-bars");
});

test("the options move the rules", () => {
	expect(grid(reading([4, 4, 4]), { TRACKER_MIN_BARS: 3 }).ok).toBe(true);
	expect(grid(reading([3, 3, 3, 2, 4, 5, 2, 4, 5]), { TRACKER_MIN_STEADY_SHARE: 0.3 }).ok).toBe(true);
	const closed = grid(reading([4, 4, 4, 4], 0.5), { TRACKER_MIN_CLOSING_SHARE: 0.25 });
	expect(closed.ok && closed.value.grid.bars.at(-1)).toBe(8.5);
});

test("more than MAX_GRID_BARS bars: the first MAX_GRID_BARS, with grid-truncated", () => {
	const r = grid(reading(Array(12).fill(4)), { MAX_GRID_BARS: 10 });
	if (!r.ok) throw new Error("refused");
	expect(r.value.grid.bars).toHaveLength(11);
	expect(r.warnings.map((w) => w.code)).toContain("grid-truncated");
});
```

Input rules, each asserting `reason: "invalid-input"`, `detail.field` and, for an element, `detail.index`: a non-object input; `duration` of 0, `NaN` and a string; `beats` not an array; a `NaN`, a negative, a value above `duration`, an equal neighbour and a descending pair in `beats` and in `downbeats`; an array of 200,001 elements (no element read); a `declared` that is a string; `declared: { meter: "nope" }`; `declared: { tempo: 0 }`. And accepted: `declared: null`, `{ meter: "3/4" }`, `{ tempo: 120 }`.

Never throws: an input whose `beats` getter throws; a Proxy that throws on any read; `beats` an array-like object; a sparse array (`[0, , 1]`); each is `invalid-input`. An unknown option is `invalid-option`.

- [ ] **Step 2: Write the scale test** in `tests/beats-scale.test.ts`: `growth` from `test-support/growth.ts` on `gridFromBeats` over a steady 4/4 reading of 12,500 beats against one of 100,000 (`balance: 8`, `MAX_GRID_BARS` raised so neither is cut), expecting a ratio under 16 (linear is 8), with the package's `TIMING_TIMEOUT` pattern from `tests/grid-scale.test.ts`. Add the same for a reading whose every bar is a half-bar pair, so the join is timed too.

- [ ] **Step 3: Run and see them fail**

Run: `bun test packages/listen/tests/beats-grid.test.ts packages/listen/tests/beats-scale.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 4: Implement `input.ts` and `grid.ts`.** Read each array once into a copy inside a `try`. Keep each function under Fallow's thresholds: one function per step of §4.2 works well.

- [ ] **Step 5: Run the package's tests, the check and Fallow**

Run: `bun test packages/listen && bun run check && bun run fallow`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add packages/listen/src/beats packages/listen/tests/beats-grid.test.ts packages/listen/tests/beats-scale.test.ts
git commit -m "feat(listen): gridFromBeats, a tracker's beats to a bar grid"
```

---

### Task 4: The pickup and `declared`

**Files:**
- Create: `packages/listen/src/beats/declared.ts`
- Modify: `packages/listen/src/beats/grid.ts`
- Test: `packages/listen/tests/beats-pickup.test.ts`, `packages/listen/tests/beats-declared.test.ts`

**Interfaces:**
- Consumes: `tempoDrift(period, declaredBar)` from `src/grid/drift.ts`; `beatsOf` from `barmark`; `CheckedBeats` and `BeatsReading` from Task 3.
- Produces, `declared.ts`: `declaredWarnings(declared: BeatsDeclared, meter: BeatsMeter, barSeconds: number): ListenWarning[]`.
- Produces: `gridFromBeats` now fills `pickup` and adds the warnings `pickup`, `beats-before-bar-one`, `tempo-drift` and `meter-differs`.

Rules (spec §4.4 and §5):
- `p` is the number of beats before the first bar line of the joined grid.
- A pickup when `1 ≤ p ≤ PICKUP_MAX_BAR_FRACTION × beatsPerBar` and bar one holds exactly `beatsPerBar` beats: `{ start: beats[0], beats: p }`, with the `pickup` warning in the comb path's shape (`detail: { start, beats }`).
- Otherwise, when `p ≥ 1`: `beats-before-bar-one`, `detail: { beats: p, start: beats[0] }`.
- `meter-differs` when `declared.meter` is given and is not the label's meter (compare `n` and `d`): `detail: { meter: "6/8", declared: "3/4" }`.
- `tempo-drift` when `declared` has both parts: `tempoDrift(barSeconds, beatsOf(meter) × 60 / tempo)`, and when it is not null, add `detail.fold` (the nearest of 1, 0.5 and 2 to `barSeconds / declaredBar` by the absolute log of the quotient, the earlier in that order on a tie) and `detail.foldRatio` (`barSeconds / (fold × declaredBar) − 1`).
- Warning order: `bars-joined`, `grid-truncated`, `pickup` or `beats-before-bar-one`, `meter-differs`, `tempo-drift`.

- [ ] **Step 1: Write the failing tests.**

`tests/beats-pickup.test.ts`, with `lead(r, n)` a helper that shifts a reading later by `n` beats and puts `n` beats before its first downbeat:

```ts
test("one beat before bar one is a pickup", () => {
	const r = gridFromBeats(lead(reading([4, 4, 4, 4]), 1));
	if (!r.ok) throw new Error("refused");
	expect(r.value.pickup).toEqual({ start: 0, beats: 1 });
	expect(r.value.grid.bars[0]).toBe(0.5);
	expect(r.warnings.map((w) => w.code)).toEqual(["pickup"]);
});

test("half a bar is still a pickup; more is beats-before-bar-one", () => {
	const two = gridFromBeats(lead(reading([4, 4, 4, 4]), 2));
	expect(two.ok && two.value.pickup?.beats).toBe(2);
	const three = gridFromBeats(lead(reading([4, 4, 4, 4]), 3));
	if (!three.ok) throw new Error("refused");
	expect(three.value.pickup).toBeNull();
	expect(three.warnings[0]).toMatchObject({ code: "beats-before-bar-one", detail: { beats: 3, start: 0 } });
});

test("3/4: one beat is a pickup, two are not", () => {
	expect(gridFromBeats(lead(reading([3, 3, 3, 3]), 1)).ok).toBe(true);
	const two = gridFromBeats(lead(reading([3, 3, 3, 3]), 2));
	expect(two.ok && two.value.pickup).toBeNull();
});

test("no pickup when bar one is not a usual bar", () => {
	// Bar one is an unpaired half bar: the builder would measure two beats as a whole bar.
	const r = gridFromBeats(lead(reading([2, 4, 4, 4, 4, 4]), 2));
	if (!r.ok) throw new Error("refused");
	expect(r.value.pickup).toBeNull();
	expect(r.warnings.map((w) => w.code)).toContain("beats-before-bar-one");
});

test("the grid's bars are the same with and without the leading beats", () => {
	const plain = gridFromBeats(reading([4, 4, 4, 4]));
	const led = gridFromBeats(lead(reading([4, 4, 4, 4]), 1));
	if (!plain.ok || !led.ok) throw new Error("refused");
	expect(led.value.grid.bars).toEqual(plain.value.grid.bars.map((t) => t + 0.5));
});

test("a truncated grid keeps its pickup", () => {
	const r = gridFromBeats(lead(reading(Array(12).fill(4)), 1), { MAX_GRID_BARS: 10 });
	if (!r.ok) throw new Error("refused");
	expect(r.value.pickup).toEqual({ start: 0, beats: 1 });
	expect(r.warnings.map((w) => w.code)).toEqual(["grid-truncated", "pickup"]);
});
```

`tests/beats-declared.test.ts`:

```ts
const four = reading([4, 4, 4, 4]); // bars of 2 s: 4/4 at 120

test("declared and read agree: no warning", () => {
	const r = gridFromBeats({ ...four, declared: { meter: "4/4", tempo: 120 } });
	expect(r.ok && r.warnings).toEqual([]);
});

test("tempo-drift carries the raw ratio and the fold", () => {
	const drift = (tempo: number) => {
		const r = gridFromBeats({ ...four, declared: { meter: "4/4", tempo } });
		if (!r.ok) throw new Error("refused");
		return r.warnings.find((w) => w.code === "tempo-drift")?.detail;
	};
	expect(drift(125)).toMatchObject({ fold: 1, period: 2, declaredBar: 1.92 });
	expect(drift(125)?.ratio).toBeCloseTo(2 / 1.92 - 1, 12);
	expect(drift(125)?.foldRatio).toBeCloseTo(2 / 1.92 - 1, 12);
	expect(drift(240)).toMatchObject({ fold: 2, ratio: 1, foldRatio: 0 });
	expect(drift(60)).toMatchObject({ fold: 0.5, ratio: -0.5, foldRatio: 0 });
});

test("a declared 3/4 against a read 6/8: meter-differs, and a fold of two", () => {
	const six = reading([6, 6, 6, 6], 0, 0.25); // bars of 1.5 s
	const r = gridFromBeats({ ...six, declared: { meter: "3/4", tempo: 240 } }); // bars of 0.75 s
	if (!r.ok) throw new Error("refused");
	expect(r.warnings.map((w) => w.code)).toEqual(["meter-differs", "tempo-drift"]);
	expect(r.warnings[0]?.detail).toEqual({ meter: "6/8", declared: "3/4" });
	expect(r.warnings[1]?.detail).toMatchObject({ fold: 2, foldRatio: 0 });
});

test("each part alone: a meter compares the meter, a tempo compares nothing", () => {
	const meter = gridFromBeats({ ...four, declared: { meter: "3/4" } });
	expect(meter.ok && meter.warnings.map((w) => w.code)).toEqual(["meter-differs"]);
	const tempo = gridFromBeats({ ...four, declared: { tempo: 60 } });
	expect(tempo.ok && tempo.warnings).toEqual([]);
});

test("declared never moves the grid, the meter or the tempo", () => {
	const plain = gridFromBeats(four);
	const told = gridFromBeats({ ...four, declared: { meter: "3/4", tempo: 77 } });
	if (!plain.ok || !told.ok) throw new Error("refused");
	expect(told.value).toEqual(plain.value);
});
```

- [ ] **Step 2: Run and see them fail**

Run: `bun test packages/listen/tests/beats-pickup.test.ts packages/listen/tests/beats-declared.test.ts`
Expected: FAIL (`pickup` is null; no `tempo-drift`).

- [ ] **Step 3: Implement** `declared.ts` and the pickup in `grid.ts`.

- [ ] **Step 4: Run the package's tests, the check and Fallow**

Run: `bun test packages/listen && bun run check && bun run fallow`
Expected: all clean.

- [ ] **Step 5: Commit**

```bash
git add packages/listen/src/beats packages/listen/tests/beats-pickup.test.ts packages/listen/tests/beats-declared.test.ts
git commit -m "feat(listen): the tracker grid's pickup, and declared compared with a fold"
```

---

### Task 5: `chartFromBeats`, the entries and the documents

**Files:**
- Create: `packages/listen/src/build.ts`, `packages/listen/src/beats/pipeline.ts`
- Modify: `packages/listen/src/pipeline.ts` (use `build.ts`; no behavior change), `packages/listen/src/index.ts`, `packages/listen/src/stages.ts`
- Modify: `packages/listen/README.md`, `packages/listen/CHANGELOG.md`, `CLAUDE.md`, `docs/superpowers/specs/2026-11-09-listen-design.md` (§13: one line pointing to the spec)
- Test: `packages/listen/tests/beats-pipeline.test.ts`, `packages/listen/tests/entries.test.ts`

**Interfaces:**
- Consumes: `beatsGridWith` and its types (Tasks 3 and 4); `resolveOptions(options, "beats")` (Task 1); `readRecording`, `invalid`, `isRefusal` from `src/input.ts`.
- Produces, `build.ts` (the builder call both pipelines share, moved out of `pipeline.ts`):
  ```ts
  export type Built = { chart: string; timing: TimingMap; confidence: ConfidenceRecord; diagnostics: BuildDiagnostic[] };
  /** The builder on the detections: its chart, map and confidence, or its error (or a throw) as `invalid-input`. */
  export function buildChart(d: Detections, options: BuildOptions | undefined): Built | Refusal;
  /** The title, key, sections and changes a caller gave, copied onto the detections as given. */
  export function withMarks(d: Detections, given: Record<string, unknown>): Detections;
  ```
- Produces, `beats/pipeline.ts`:
  ```ts
  export type BeatsChartInput = BeatsInput & {
  	chords: ListenChordRuns;
  	title?: string;
  	key?: Detected<string> | null;
  	sections?: { name: string; start: number; confidence?: number }[];
  	changes?: Change[];
  	recording?: { id?: string };
  };
  export type BeatsChart = Built & { grid: TrackedGrid };
  export function chartFromBeats(
  	input: BeatsChartInput,
  	options?: ListenOptions & { build?: BuildOptions },
  ): Ok<BeatsChart> | Refused<{ reading: Partial<BeatsReading> | null }>;
  ```
- Produces: the root exports `gridFromBeats`, `chartFromBeats` and the types `BeatsInput`, `BeatsReading`, `TrackedGrid`, `BeatsChartInput`, `BeatsChart`, `BeatsMeter`. `./stages` exports `snapDownbeats`, `beatsLabel`, `joinHalfBars`, `steadyShare` and the type `BeatsLabel`.

Order in `chartFromBeats`: the options; the input is an object; `chords` is an object (`invalid-input`, field `chords`, as `chartFromRecording`); `recording.id`; then the grid; then `buildChart` on `{ grid, chords, meter: the label, recording: { id?, duration } }` with `pickup: { start }` when the grid has one, and the marks as given. No tempo is passed. The result's warnings are the grid's.

- [ ] **Step 1: Write the failing tests** in `tests/beats-pipeline.test.ts`. With `runsOn(bars, symbols)` giving one symbol run per bar:

```ts
test("a chart on the tracker's bars, with the label's meter and the grid's tempo", () => {
	const r = reading([4, 4, 4, 4]);
	const out = chartFromBeats({ ...r, chords: runsOn([0, 2, 4, 6, 8], ["C", "F", "G", "C"]), title: "Four Bars" });
	if (!out.ok) throw new Error("refused");
	expect(out.value.chart).toContain("| C | F | G | C |");
	expect(out.value.chart).toContain("time: 4/4");
	expect(out.value.chart).toContain("tempo: 120");
	expect(out.value.timing.bars.map((b) => b.start)).toEqual([0, 2, 4, 6]);
	expect(out.value.timing.recording?.duration).toBe(8);
	expect(out.value.grid.meter).toBe("4/4");
});

test("6/8 by the count: the chart's tempo is in dotted quarters", () => {
	const r = reading([6, 6, 6, 6], 0, 0.25);
	const out = chartFromBeats({ ...r, chords: runsOn([0, 1.5, 3, 4.5, 6], ["Am", "Dm", "E", "Am"]) });
	if (!out.ok) throw new Error("refused");
	expect(out.value.chart).toContain("time: 6/8");
	expect(out.value.chart).toContain("tempo: 80");
});

test("a pickup is bar 0 on the chart and play position 1 in the map", () => {
	const led = lead(reading([4, 4, 4, 4]), 1);
	const out = chartFromBeats({ ...led, chords: { runs: [{ start: 0, end: led.duration, symbol: "G" }] } });
	if (!out.ok) throw new Error("refused");
	expect(out.value.grid.pickup).toEqual({ start: 0, beats: 1 });
	expect(out.value.chart).toContain("[1/4]");
	expect(out.value.timing.bars[0]?.start).toBe(0);
	expect(out.value.diagnostics.map((d) => d.code)).not.toContain("pickup-ignored");
});

test("a refused reading refuses the chart, with the reading", () => {
	const out = chartFromBeats({ ...reading([3, 3, 3, 2, 4, 5, 2, 4, 5]), chords: { runs: [] } });
	expect(!out.ok && out.refusals[0]?.reason).toBe("bars-unsteady");
	expect(!out.ok && out.reading?.beatsPerBar).toBe(3);
});

test("the marks reach the builder as given", () => {
	const r = reading([4, 4, 4, 4]);
	const out = chartFromBeats({
		...r,
		chords: runsOn([0, 2, 4, 6, 8], ["C", "F", "G", "C"]),
		key: "C",
		sections: [{ name: "Verse", start: 0 }],
		changes: [{ kind: "key", start: 4, value: "G" }],
	});
	if (!out.ok) throw new Error("refused");
	expect(out.value.chart).toContain("## Verse");
	expect(out.value.chart).toContain("key: C");
});
```

Also: `chords: null` and `chords: "x"` are `invalid-input` (field `chords`); `recording: { id: 3 }` is `invalid-input`; `recording: { id: "mix-1" }` reaches `timing.recording.id`; `ALIGNMENT_SOUND_FLOOR` is `invalid-option`; `build: 3` is `invalid-option`; an input whose `chords` getter throws is `invalid-input`. Read the exact field names of `TimingMap` and `Change` from `@barmark/sync` before writing the assertions, and correct the snippets above where they differ.

In `tests/entries.test.ts`: add `gridFromBeats` and `chartFromBeats` to the root's expected names and the four stage names to `STAGES`.

- [ ] **Step 2: Run and see them fail**

Run: `bun test packages/listen/tests/beats-pipeline.test.ts packages/listen/tests/entries.test.ts`
Expected: FAIL (module not found; names missing).

- [ ] **Step 3: Move the builder call.** Create `build.ts` from `pipeline.ts`'s `build` and the title, key, sections and changes copying in `detectionsOf`; make `pipeline.ts` use it. Run `bun test packages/listen`: the 0.1 tests and goldens pass unchanged.

- [ ] **Step 4: Implement `beats/pipeline.ts` and the exports.**

- [ ] **Step 5: Write the documents.**
  - `README.md`: a section "From a beat tracker" after "A recording to a chart": what the two calls take and return, a short example of each, the fallback (when `chartFromBeats` refuses and the host has a declared tempo, call `chartFromRecording`), which tempo to show (the chart's, spec §4.3), that a host whose tempo and meter changes sit on a declared timeline passes only its key changes, and what the label cannot say (one meter for the piece; 5 and 7 read as 4/4). Add the new reasons, codes and options to the README's tables. Change "The four calls" heading and count where they appear.
  - `CHANGELOG.md` under `[Unreleased]`, `### Added`: the two calls, the three options, the two reasons, the three codes and `tempo-drift`'s `fold` and `foldRatio` on this path, naming stem-bench Studies 41 and 44.
  - `CLAUDE.md`: in `packages/listen/`'s layout, a `src/beats/` line and the two calls.
  - The 0.1 design's §13, under "Free tempo": one sentence that the grid from a tracker's beats is designed in `2026-11-12-listen-beats-design.md`.

- [ ] **Step 6: Run everything**

Run: `bun test packages/listen && bun run check && bun run fallow && bun run verify:package listen`
Expected: all clean.

- [ ] **Step 7: Commit**

```bash
git add packages/listen CLAUDE.md docs/superpowers/specs/2026-11-09-listen-design.md
git commit -m "feat(listen): chartFromBeats, a tracker's beats and the chords to a chart"
```

---

### Task 6: The equivalence with the app

**Files:**
- Create: `scripts/listen-beats-equivalence.ts`
- Create: `packages/listen/tests/helpers/beats-cases.ts`
- Create (written by the script): `packages/listen/tests/fixtures/beats/equivalence.json`
- Test: `packages/listen/tests/beats-equivalence.test.ts`
- Modify: `CLAUDE.md` (the script's line), `FINDINGS.md` (only if something surprised)

**Interfaces:**
- Consumes: `gridFromBeats`, `snapDownbeats`, `reading` and `evenBeats`.
- Produces, `beats-cases.ts`: `BEATS_CASES: { name: string; input: { beats: number[]; downbeats: number[]; duration: number } }[]`, at least 16 named readings, each already snapped: steady 4/4, 3/4 and 6/8; a half-bar intro (`[2,2,2,2,4,4,4,4]`); an unpaired half bar; three half bars in a row; a 6/8 read half in threes (`[3,3,6,6,3,3,6,6,6]`); the app's unsteady reading; a share of exactly 0.4 (`[3,3,3,3,2,4,5,2,4,5]`); a short reading (`[4,4,4]`); tails of 0.99, 1.0 and 1.5 s on bars of 2 s; counts of 2 and of 5; one beat before bar one; and two seeded readings on a 20 ms frame grid (a 4/4 near 143 bpm with times rounded to 0.02 s, and the same with half-bar stretches), made with `tests/helpers/seeded.ts`.
- Produces, the golden: `{ app: { commit: string }, cases: { name, input, app: { grid: { bars: number[]; meter: string; barSeconds: number } | null; label: { tempo, beatsPerBar, meter, chartTempo, counts } } }[] }`, numbers written so they read back exactly.

- [ ] **Step 1: Write the script.** `bun scripts/listen-beats-equivalence.ts <commit>`:
  1. Resolve the commit with `git -C ~/projects/stem-shovel rev-parse --verify <commit>^{commit}` and refuse one that is not `011cee44` or a descendant (`git merge-base --is-ancestor`). Read-only git commands only.
  2. Write `src/lib/utils/beatThisBeats.ts`, `beatThisGrid.ts` and `trackerBarGrid.ts` from `git show <commit>:<path>` into `~/.cache/barmark/stem-shovel-beats-<commit8>/`, unchanged, and import the last two from there. Their `./x.js` specifiers name `.ts` files; if Bun does not resolve them, register a resolver plugin as `scripts/listen-equivalence.ts` does. Do not edit the files.
  3. For each of `BEATS_CASES`: call the app's `trackerBarGrid({ version: "equivalence", duration, beats, downbeats })` and `beatThisGrid(beats, downbeats)`, and write the golden.
  4. Compare listen with the app on each case and on the five real readings from `git show <commit>:docs/bench-reply-beats-2026-11-11.json` (snap each first and assert the snap changed nothing): `grid.bars`, `meter`, `barSeconds`, `beatTempo` against `tempo`, `tempo` against `chartTempo`, `beatsPerBar`, `counts`; a `null` grid against a `too-few-bars` or `bars-unsteady` refusal. Print one line a reading and the count of differences; exit 1 on any.
  The real readings are never written into this repository.

- [ ] **Step 2: Write the failing test** `tests/beats-equivalence.test.ts`:

```ts
test("the golden: one entry per case, from one app commit", () => {
	expect(golden.app.commit).toMatch(/^[0-9a-f]{40}$/);
	expect(golden.cases.map((c) => c.name)).toEqual(BEATS_CASES.map((c) => c.name));
	for (const [i, c] of golden.cases.entries()) expect(c.input).toEqual(BEATS_CASES[i]?.input);
});

for (const c of golden.cases)
	test(`${c.name}: the app's grid`, () => {
		const r = gridFromBeats(c.input);
		if (c.app.grid === null) {
			expect(r.ok).toBe(false);
			if (!r.ok) expect(["too-few-bars", "bars-unsteady"]).toContain(r.refusals[0]?.reason);
			return;
		}
		if (!r.ok) throw new Error(`${c.name}: refused`);
		expect(r.value.grid.bars).toEqual(c.app.grid.bars);
		expect(r.value.meter).toBe(c.app.grid.meter);
		expect(r.value.reading.barSeconds).toBe(c.app.grid.barSeconds);
		expect(r.value.reading.beatTempo).toBe(c.app.label.tempo);
		expect(r.value.reading.tempo).toBe(c.app.label.chartTempo);
		expect(r.value.reading.beatsPerBar).toBe(c.app.label.beatsPerBar);
		expect(r.value.reading.counts).toEqual(c.app.label.counts);
	});
```

Run: `bun test packages/listen/tests/beats-equivalence.test.ts`
Expected: FAIL (no golden file).

- [ ] **Step 3: Run the script** at the app's `dev` head read for the spec:

Run: `bun scripts/listen-beats-equivalence.ts 8714cf36`
Expected: every case and the five real readings print 0 differences; `equivalence.json` is written. Mop Heart is `null` in the app and `bars-unsteady` here. Any other difference is a porting bug: fix the port, not the golden.

- [ ] **Step 4: Run the tests**

Run: `bun test packages/listen && bun run check && bun run fallow`
Expected: all clean.

- [ ] **Step 5: Document and commit.** In `CLAUDE.md`, beside `listen-equivalence.ts`: `bun scripts/listen-beats-equivalence.ts <stem-shovel commit>` (at or after `011cee44`), what it reads, what it writes, VM only, never in CI.

```bash
git add scripts/listen-beats-equivalence.ts packages/listen/tests CLAUDE.md
git commit -m "test(listen): the tracker grid's equivalence with the app, on seeded and real readings"
```

---

## After the plan

Not tasks of this plan; they follow the merge:

1. Release `@barmark/listen` 0.2.0 by `RELEASING.md` (no CLI release; listen is not bundled).
2. Raise barmark.dev's dev pin of `@barmark/listen` in its own pull request.
3. Reply on kevinpeckham/stem-shovel#17 with what 0.2 has and what the app would change (spec §12).
