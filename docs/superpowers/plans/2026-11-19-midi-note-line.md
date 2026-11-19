# MIDI note line Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `importMidi` writes a file that is one line of notes (a bass line, a melody) as that line: every attack with its pitch and octave, holds and rests, on a grid as fine as sixteenths and triplets. Every other file imports byte for byte as today.

**Architecture:** A second reading beside the chord reading, in `packages/midi/src/import/`, one module per stage: the line test (`attacks.ts`), pitch names (`pitch.ts`), the per-beat grid (`quantize.ts`), holds and rests (`ends.ts`), the bars' text (`cells.ts`), and the chart (`line.ts`). The chart is still built by `@barmark/sync`, from one placeholder run, and each bar's cell is then replaced with the line's; lyric rows go on as today. A self-check plays the chart back with the package's own `perform`; if it fails, the whole import runs again as chords.

**Tech Stack:** TypeScript (strict), Bun test, `barmark` (`parseChart`, `printChart`, `spellPitch`, `beatsOf`, `keyFromText`), `@barmark/sync` (`chartFromDetections`, unchanged), `@barmark/midi/perform`.

**Spec:** `docs/superpowers/specs/2026-11-19-midi-note-line-design.md` (approved 2026-11-19). It extends `docs/superpowers/specs/2026-11-08-midi-design.md` ("MIDI 5.x" below). Section numbers below are the spec's.

## Global Constraints

- The numbers are the spec's, used as written. With `ppq` ticks a quarter: a short note is shorter than `ppq / 16` (a 64th); an attack's window is less than `ppq / 8` (a 32nd); the tolerance is `ppq / 32` (a 128th); a part is never shorter than `ppq / 8`; a sixteenth is `ppq / 4`; divisions are 1, 2, 3, 4 and 6; the line test's two shares are at most one in ten (`count * 10 <= attacks`); the short-note exception is more than a quarter of the pitched notes (`short * 4 > notes`); a rest needs a silence of one beat or more; `rhythm-rounded` names at most eight bars.
- A file that is not one line, and every file with `notes: false`, imports byte for byte as on `main`, text and diagnostics. The seven `.mid` fixtures in `packages/midi/tests/fixtures/` keep their `.chart.md`.
- `@barmark/sync`, the MIDI export, `perform` and the grammar do not change. No new dependency.
- The import never throws and never returns a chart that does not parse.
- New diagnostic codes, exactly: `notes-line` (info), `notes-short` (info), `rhythm-rounded` (warning), `pitch-range` (warning), `notes-fallback` (warning). A message carries no value read from the file except counts and bar numbers (as `report.ts` explains).
- A rest is `--`, never `N.C.`, and every slot or group member in silence is written `--` (never `/` for silence).
- Test first: each test is seen failing for the reason expected before its code. `bun run fallow` stays clean without touching `.fallow-health-baseline.json`. `bun run check` (Biome, tabs) is clean.
- Commits are conventional commits with no `Co-Authored-By` or other AI trailer.
- Tests build files with `packages/midi/tests/helpers/smf.ts` (an event list to bytes). No audio is ever committed.

## Rulings made while planning

These settle what the spec leaves open; each is the plan's call, recorded so a reviewer can weigh it.

1. **A rounded beat is reduced.** After 4.2's rounding moves a beat's attacks, the beat takes the smallest allowed division that has a point at every attack, not always 4 (or 6). One attack 40 ticks late then reads `{C3}`, not `{C3}_/_/_/`. The attacks are where 4.2 puts them either way.
2. **Silence is always `--`.** A rest two beats long in the middle of a bar is `-- --`; spec 6.1 allows `--` as a slot and as a member and says a bar of rest is `--`.
3. **A note stops at the next attack.** The line is one voice: an attack's end is never later than the next attack's point.
4. **The beat a silence is measured by** is the beat of the last point the note sounds on (a note ending on a bar line ends in the bar before).
5. **The chart's last beat has no end point** for 4.2's rounding (there is no next beat to move to), and the grid is made long enough that every attack's beat exists: the line's last tick is `max(start + ppq / 32 + 1, end - ppq / 4)` over its notes.
6. **The fallback runs the import again** with `notes: false` and a fresh report, with `notes-fallback` as its first diagnostic. Nothing of the failed line reading is reported.
7. **The placeholder harmony** is one run of `C` from the grid's start to its end. Sync raises no chord diagnostic for it (checked 2026-11-19), so "sync's diagnostics about the placeholder are not reported" needs no filter beyond a test.
9. **A beat has two clocks** (added after Task 3's review). `gridOf` can cut a bar at a time signature and write it in a meter rounded to sixteenths, so the bar's span in the file and its length in the chart differ. Attacks are assigned and fitted by the file's ticks (`Beat.start`); a point's time is the chart's (`Beat.at`, `pointTick`), which is what `perform` plays and the self-check compares. Task 4 finds the beat a note-off falls in by `start` and measures silences by `pointTick`.
10. **A line's notes are paired first in, first out** (added after Task 6's review; spec 3 now says so). The chord reading keeps MIDI 5.2's pairing.
11. **Anything that stops the line reading falls back**: an error it raises (`too-large`), a throw, or no pitch left in range; the chord reading then reports its own errors.
8. **Existing import tests** whose file is one line keep testing what they test: they pass `notes: false` (they are tests of the chord reading's stages). The new reading has its own tests.

## Review Focus

Inputs the spec implies and a person will meet; each has its test in the task named.

1. A played attack a few ticks before a bar line, including before the first full bar after a pickup: it must be the next bar's first attack, and the bar must exist (Task 3, Task 6).
2. A file at a small or odd division (`ppq` 24, 96, 1) where a 128th note is a fraction of a tick: no crash, no attack lost (Task 3, Task 7 fuzz).
3. A line whose notes overlap slightly (legato) or whose last note-off is missing: still a line, each note stopping at the next attack (Task 1, Task 4).
4. A file of one long note, one very short note, or two notes at one tick: sensible bars, no empty chart, no throw (Task 6).
5. A key change, a meter change (3/4 to 6/8) and a section marker in the middle of a line: spelling follows the key, beats follow the meter, a ringing note is `/` under the new heading (Task 5, Task 6).

---

### Task 1: The pitched notes and the line test

**Files:**
- Create: `packages/midi/src/import/attacks.ts`
- Modify: `packages/midi/src/import/streams.ts` (split `harmonyNotes`)
- Modify: `packages/midi/src/import/types.ts` (the option and the codes)
- Test: `packages/midi/tests/import-attacks.test.ts`

**Interfaces:**
- Consumes: `Note` (`notes.ts`), `notesOf`, `readSmfInto`, `createReport`.
- Produces:
  - `streams.ts`: `export function selectedNotes(notes: Note[], names: (string | null)[], options: Pick<MidiImportOptions, "tracks">, report: Report): { pitched: Note[]; chosen: Set<number> | null }` (reports `drums-left-out` and `track-unknown`; `pitched` is the notes outside channel 10 on the chosen tracks, or on all); `export function harmonyOf(selected: { pitched: Note[]; chosen: Set<number> | null }, names: (string | null)[], report: Report): Note[]` (the default choice or the chosen tracks' notes, and `no-notes`). `harmonyNotes` stays, as the two in order, so nothing else changes.
  - `types.ts`: `notes?: boolean` on `MidiImportOptions` with the spec's doc comment (section 7); the five codes added to `MidiImportCode`.
  - `attacks.ts`:
    - `export type Attack = { tick: number; end: number; pitches: number[] }` (`tick` is its first note's start; `end` the latest note-off of its notes; `pitches` ascending, each once).
    - `export function withoutShort(notes: Note[], ppq: number): { kept: Note[]; short: number }` (4.1).
    - `export function attacksOf(notes: Note[], ppq: number): Attack[]` (3, step 2; `notes` by start).
    - `export function isLine(attacks: Attack[], ppq: number): boolean` (3, step 3; no attacks is not a line).
    - `export function lineOf(pitched: Note[], ppq: number): { attacks: Attack[]; notes: Note[]; short: number } | null` (the three in order; `notes` are the kept ones; null when not a line).

- [ ] **Step 1: Write the failing tests** in `import-attacks.test.ts`:
  - `withoutShort` at `ppq` 480: a 29-tick note is left out and counted, a 30-tick note is kept; with 3 short notes among 10 (`3 * 4 > 10`) none is left out and `short` is 0; with 2 among 10, both are.
  - `attacksOf` at 480: notes starting at 0 and 59 are one attack with both pitches ascending; at 0 and 60 they are two; three notes at 0, 50 and 100 are two attacks (the window is from the attack's first note); two notes of one pitch in one attack give one pitch; `end` is the latest note-off.
  - `isLine`: 10 single-note attacks end to end → true; with 1 of 10 a double stop → true, with 2 of 10 → false; 10 attacks where one starts 121 ticks before the previous note's end → true, two such → false; a start exactly 120 ticks before the end does not count; `[]` → false.
  - `lineOf` on a line across three tracks and two channels, end to end → not null, attacks in time order.
  - **The spec's table** (section 3), reading each fixture with `readSmfInto` and `notesOf`, then `selectedNotes(…).pitched`: `band.mid` with `tracks: [4]` is a line of 8 attacks; `band`, `bass-and-chords`, `comping-guitar`, `hymn`, `lead-sheet`, `piano`, `piano-comping` with no `tracks` are not lines.
  - `selectedNotes` + `harmonyOf` give what `harmonyNotes` gives, notes and diagnostics in order, for `band.mid` with `tracks: ["nobody"]`, `tracks: [4]` and none.
- [ ] **Step 2: Run** `bun test packages/midi/tests/import-attacks.test.ts`. Expected: FAIL (module not found, `selectedNotes` not exported).
- [ ] **Step 3: Implement** the split in `streams.ts` (moving code, no change in behaviour), the option and codes in `types.ts`, and `attacks.ts`. The struck-under test keeps a running maximum of earlier attacks' `end`.
- [ ] **Step 4: Run** `bun test packages/midi`. Expected: PASS, every existing test included.
- [ ] **Step 5: Commit** `feat(midi): the line test: short notes, attacks, and when a file is one line`.

### Task 2: Pitch names

**Files:**
- Create: `packages/midi/src/import/pitch.ts`
- Modify: `packages/midi/src/import/segments.ts` (only to share the key lookup, if one is extracted)
- Test: `packages/midi/tests/import-pitch.test.ts`

**Interfaces:**
- Consumes: `Attack` (Task 1); `KeyAt` (`directives.ts`: `{ tick; name; scale }`); barmark's `spellPitch(pc, key)`, `keyFromText`, `conventionalKey`, `Key`.
- Produces:
  - `export function pitchName(midi: number, key: Key | null): string | null`: the spelled letter and accidental, then the octave of the **letter** (`octave = floor((midi - alter) / 12) - 1`, `alter` +1 for a sharp, -1 for a flat); null when that octave is outside 0–8.
  - `export type Named = Attack & { names: string[] }` (`names[i]` is `pitches[i]`'s).
  - `export function named(attacks: Attack[], keys: KeyAt[]): { attacks: Named[]; outOfRange: number }`: each pitch spelled for the key in force at the attack's `tick` (the last `KeyAt` at or before it; none: `null`, as the chord reading spells with no key); a pitch with no name is left out and counted; an attack left with no pitch is left out.

- [ ] **Step 1: Write the failing tests:** `pitchName(60, C major)` is `C4`; `pitchName(59, Gb major)` is `Cb4`; `pitchName(60, C# major)` is `B#3`; `pitchName(61, Db major)` is `Db4` and in D major `C#4`; `pitchName(12, null)` is `C0`, `pitchName(11, null)` is null, `pitchName(11, Gb major)` is `Cb0`; `pitchName(119, null)` is `B8`, `pitchName(120, null)` is null; with a key change at tick 1920 from C to Gb, an attack of MIDI 59 at 0 is `B3` and at 1920 is `Cb4`; an attack of pitches 5 and 40 keeps `E2` and counts 1; an attack of pitch 5 alone is left out.
- [ ] **Step 2: Run** the file. Expected: FAIL (module not found).
- [ ] **Step 3: Implement.** Use the same key lookup the chord reading uses in `segments.ts` (`namedRuns`); extract it to a shared function rather than writing a second one, if it is not already one.
- [ ] **Step 4: Run** `bun test packages/midi`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(midi): a line's pitches, spelled for the key with the letter's octave`.

### Task 3: The grid inside a beat

**Files:**
- Create: `packages/midi/src/import/quantize.ts`
- Test: `packages/midi/tests/import-quantize.test.ts`

**Interfaces:**
- Consumes: `Attack` (Task 1); `Grid` (`grid.ts`: `{ ppq; bars: { start; meter }[]; end; pickup }`); barmark's `beatsOf(meter)`.
- Produces:
  - `export type Beat = { bar: number; start: number; at: number; length: number; dotted: boolean }` (`bar` is the index in `grid.bars`; ticks; `start` is in the file, `at` on the chart's clock: the meter lengths of the bars before, so the two differ only after a bar cut by a time signature and written in a rounded meter (ruling 9); `dotted` when the meter's beat is three of its units, as `beatsOf` counts 6/8, 9/8 and 12/8).
  - `export function beatsOfGrid(grid: Grid): Beat[]` (each bar's length over `beatsOf(meter)`, in order).
  - `export function divisionsFor(length: number, ppq: number): number[]` (those of 1, 2, 3, 4, 6 with `length / n >= ppq / 8`; always at least `[1]`).
  - `export type Struck<A extends Attack = Attack> = { beat: number; point: number; attacks: A[] }` (every input attack that landed on the point, in input order).
  - `export type Quantized<A extends Attack = Attack> = { beats: Beat[]; parts: number[]; struck: Struck<A>[]; rounded: number[]; joined: number }` (`parts[b]` is beat `b`'s division; `struck` in time order, one per point; `rounded` the indices of bars with a rounded beat, ascending, each once; `joined` the attacks that landed on a point another already held).
  - `export function quantize<A extends Attack>(attacks: A[], grid: Grid): Quantized<A>`
  - `export const pointTick = (q: Pick<Quantized, "beats" | "parts">, beat: number, point: number): number` (`at + point * length / parts`: the chart's clock).

**The algorithm** (4.2, with rulings 1 and 5), beats in order:
1. An attack belongs to beat `b` when `start_b - ppq / 32 <= tick < start_(b+1) - ppq / 32` (the last beat takes everything from its own bound on).
2. An attack carried in from the beat before (step 4) is at this beat's start. If the beat has an attack within the tolerance of its start, the two are one `Struck` (and `joined` counts one).
3. A division `n` **fits** when every attack is within `ppq / 32` of `start + k * length / n` for some `k` in `0..n-1`, no two on one `k`. The beat takes the smallest of `divisionsFor` that fits.
4. If none fits, the beat is **rounded**: with `n` = 4, or 6 when `dotted`, or the largest of `divisionsFor` when that is smaller, each attack moves to the nearest of the points `k = 0..n` (`k = n` is the beat's end; not offered in the chart's last beat), a tie to the smaller `k`. Attacks on one `k` become one `Struck`. An attack on `k = n` is carried to the next beat. Then `n` is reduced to the smallest of `divisionsFor` with a point at every remaining attack, and the points renumbered. The beat's bar goes in `rounded`.
5. A beat with no attack has `parts` 1.

- [ ] **Step 1: Write the failing tests** (4/4 at 480 unless said; a helper makes a `Grid` of `n` bars of a meter):
  - `beatsOfGrid`: 4/4 gives four beats of 480; 6/8 two of 720, `dotted`; 3/8 three of 240; 7/16 seven of 120.
  - `divisionsFor(480, 480)` is `[1,2,3,4,6]`; `(720, 480)` the same; `(240, 480)` is `[1,2,3,4]`; `(120, 480)` is `[1,2]`; `(60, 480)` is `[1]`.
  - Quarters on the beat: `parts` all 1. Eighths at 0 and 240: 2. A triplet at 0, 160, 320: 3. Sixteenths at 0, 120, 360: 4. Sextuplet points 0, 80, 400: 6. One attack at 240 only: 2 (`point` 1).
  - Tolerance: an attack at 495 (15 late) is beat 1's point 0; at 496 beat 1 fits nothing and is rounded. An attack at 465 (15 early) is beat 1's point 0 and beat 0 does not see it; at 464 it is beat 0's, fits nothing there, and is rounded to the beat's end, so it lands on beat 1's point 0 with bar 0 in `rounded`.
  - A bar line: an attack at 1905 in bar 1 is bar 2's first attack (`beat` 4, `point` 0).
  - Rounded: attacks at 0 and 40 → one `Struck` at point 0 with both attacks, `joined` 1, `parts` 1, `rounded` `[0]`. One attack at 50 alone → point 0, `parts` 1. One at 60 (a tie between 0 and 120) → point 0. One at 430 alone in beat 0 → carried, beat 1's point 0; with an attack already at 480 → joined to it. Attacks at 0, 50 and 240 → 0 and 50 join at point 0 and 240 is point 2 of 4, reduced to points 0 and 1 of 2, `joined` 1.
  - 6/8: a beat with attacks at 0, 240 and 500 (fits nothing) is rounded on 6 parts: 500 moves to 480 (point 4), then reduces to 3 parts with points 0, 1 and 2.
  - 3/8 (eighth beats): attacks at 0 and 60 are 4 parts; at 0 and 40 (a sextuplet) are rounded on 4.
  - `ppq` 24 and `ppq` 1 (tolerance under a tick): quarters on the beat quantize with `parts` 1 and nothing rounded; at `ppq` 1 an attack on every tick of a 4/4 bar is four beats of one attack.
  - The last beat of the grid: an attack 30 ticks before the grid's end with nothing fitting rounds to that beat's last point, never past the end.
  - `pointTick` for beat 1, point 3 of 4 is 840.
- [ ] **Step 2: Run** the file. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `quantize.ts`. Keep each step a small function (Fallow's complexity limits): which beat, fit one beat, round one beat, reduce.
- [ ] **Step 4: Run** `bun test packages/midi`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(midi): a line's attacks on the grid: a division for each beat, the rest rounded`.

### Task 4: Where a note ends

**Files:**
- Create: `packages/midi/src/import/ends.ts`
- Test: `packages/midi/tests/import-ends.test.ts`

**Interfaces:**
- Consumes: `Quantized`, `Struck`, `pointTick` (Task 3); `Grid`.
- Produces:
  - `export type State<A extends Attack = Attack> = { kind: "attack"; struck: Struck<A> } | { kind: "hold" } | { kind: "rest"; first: boolean }` (`first`: the rest starts here).
  - `export function statesOf<A extends Attack>(q: Quantized<A>, grid: Grid): State<A>[][]`: one state per point of every beat, `states[beat][point]`.

**The rule** (section 5, rulings 3 and 4). For each `Struck`, in order:
1. Its raw end is the latest `end` of its attacks, at most `grid.end`.
2. Its end point: the raw end falls in beat `e`, by the file's ticks (`beats[e].start <= raw < beats[e+1].start`; `grid.end` is the end of the last beat); it moves to the nearest of that beat's points `k = 0..parts[e]` (`k = parts[e]` is the beat's end), measured from `beats[e].start` in steps of `length / parts[e]` (a raw end past the last point is at the beat's end), a tie to the larger `k`.
3. The end is at least the point after the attack's, and at most the next `Struck`'s point (the chart's end after the last).
4. The silence is from the end point to the next `Struck`'s point (or the chart's end), in ticks by `pointTick`. The beat it is measured by is the beat of the last point before the end.
5. Silence shorter than that beat's `length`: every point from the attack to the next `Struck` is `hold`. Otherwise: `hold` up to the end, then `rest` (`first` on the first) to the next `Struck`.
6. Every point before the first `Struck` is `rest` (`first` on the chart's first point). No attacks at all: everything is rest.

- [ ] **Step 1: Write the failing tests** (4/4 at 480, built with `quantize`, read as a string of states per bar, e.g. `A h h h`):
  - A whole note: `A h h h`. Four quarters each 470 long: `A A A A`. A quarter 200 long then silence to beat 3 (two beats): `A r r A` with `first` on the first rest only.
  - The spec's own case: an eighth (240 long) at beat 1, the next attacks on beats 3 and 4 → `A r A A` (the end ties between the beat's start and its end and goes later; one beat of silence is a rest).
  - A note 300 long on beat 1, the next attack at the start of beat 3: 300 is past the beat's midpoint, so the end is the end of beat 1; the silence is one beat → `A r A h`. A note 100 long on beat 1 with the next attack on beat 2: the end is the end of beat 1 (at least one point after the attack), no silence → `A A …`, no rest.
  - Sixteenths at points 0 and 1 of beat 1, the second 120 long, the next attack on beat 3 → beat 1 is `A A r r` (a rest starting on a point the attacks made), beat 2 `r`.
  - Legato: a note whose `end` is 30 ticks after the next attack stops at that attack (no overlap in the states).
  - A note ringing over a bar line for two bars: `A h h h | h h h h`; a note ending at the bar line with a bar of silence: `A h h h | r r r r` with `first` on bar 2's first only.
  - The last note 100 long with three beats left in the grid: rest to the end; with half a beat left: held to the end.
  - The first attack on beat 3: `r r A h`. No attacks: all rest.
  - 6/8: the beat is 720; a silence of 480 after a note is under a beat, so it is held.
  - A meter change 4/4 to 3/8: a note ending in the last 4/4 beat with 240 of silence into the 3/8 bar is held (240 < 480, the beat it ends in).
- [ ] **Step 2: Run** the file. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `ends.ts`.
- [ ] **Step 4: Run** `bun test packages/midi`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(midi): a line's holds and rests: a note rings to the next attack unless a beat is silent`.

### Task 5: A bar's text

**Files:**
- Create: `packages/midi/src/import/cells.ts`
- Test: `packages/midi/tests/import-cells.test.ts`

**Interfaces:**
- Consumes: `State` (Task 4), `Quantized` (Task 3), `Named` (Task 2).
- Produces:
  - `export function noteSet(struck: Struck<Named>): string`: every pitch of its attacks, each once, low to high, by its name: `{C3}`, `{F3 F4 A4}`.
  - `export function barTexts(states: State<Named>[][], q: Quantized<Named>): string[]`: one text per bar of the grid (no `%`, no meter prefix).
  - `export function withSimile(texts: string[], same: (bar: number) => boolean): string[]`: bar `i` becomes `%` when `texts[i] === texts[i - 1]`, `texts[i]` starts with `{`, and `same(i)` (the caller's word that bar `i` has the meter of the bar before and no heading or directive line between them).

**The rule** (6.1, ruling 2). A point's token is its note set, `/` for a hold, `--` for a rest. For a bar of `B` beats:
- If any beat has more than one part: one slot a beat. A beat of one part is its token; a beat of several is a group, its tokens joined with `_`; except a beat of 4 parts reading attack, hold, hold, attack is `X._Y`, and attack, attack, hold, hold is `X_Y.`.
- Otherwise the bar has `d` slots, `d` the smallest divisor of `B` such that every beat that is not the first of its slot is a hold, or a rest that is not `first`. Each slot is its first beat's token.

- [ ] **Step 1: Write the failing tests** (from hand-made states, or through `quantize` and `statesOf` with named attacks):
  - `noteSet`: one pitch `{C3}`; a double stop of MIDI 53, 65, 69 in F `{F3 F4 A4}`; two joined attacks of one pitch give it once.
  - A whole note `{E1}`; two halves `{A1} {A1}`; four quarters `{E1} {E1} {E1} {E1}`; `A h A h` is `{A1} {A1}`; `A h h A` is four slots `{A1} / / {A1}`; a bar of rest `--`; `A h r r` is `{C3} --`; `A r r r` is `{C3} -- -- --` (the rest starts inside what would be a two-beat slot); `h h h h` is `/`; `r r A h` is `-- {C3}`.
  - 3/4: `A h h` is one slot, `A A h` three. 6/8: two beats, `A h` one slot. 5/4: one slot or five.
  - Groups: eighths `{G2}_{G2}`; `A h A A` in one beat `{C3}_/_{E3}_{D3}`; a triplet `{C3}_{D3}_{E3}`; a beat `h A` is `/_{C3}`; a beat `A A r r` is `{C3}_{D3}_--_--`.
  - Dotted: `A h h A` in a beat is `{C3}._{D3}`; `A A h h` is `{C3}_{D3}.`; `A h h r` is not dotted (`{C3}_/_/_--`); six parts are never dotted.
  - The spec's two bars (section 5, reading A), from attacks with the timings that give them: `{C3} {C3}_{C3} /_{C3} {C3}_{C3}` and `{G2}_{G2} {C3}_{C3} /_{C3} {C3}_/_{E3}_{D3}`.
  - `withSimile`: two equal bars starting with a note → the second is `%`; equal bars of `--` stay `--`; equal bars starting with `/` stay; `same` false keeps the text; three equal bars give `%` twice.
- [ ] **Step 2: Run** the file. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `cells.ts`.
- [ ] **Step 4: Run** `bun test packages/midi`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(midi): a line's bars as text: slots, groups, dotted figures and simile`.

### Task 6: The chart, the self-check and the option

**Files:**
- Create: `packages/midi/src/import/line.ts`
- Modify: `packages/midi/src/import/index.ts`
- Modify: the existing `packages/midi/tests/import*.test.ts`, `real.test.ts`, `roundtrip.test.ts`, `property.test.ts`, `smf-fuzz.test.ts` and helpers, only where a file that is one line now reads differently (ruling 8)
- Test: `packages/midi/tests/import-line.test.ts`

**Interfaces:**
- Consumes: everything above; `gridOf`, `writable`/`withWritablePickup`, `directivesOf`, `sectionsOf`, `titleOf`, `detectionsOf`, `built` (index.ts), `withLyrics`, `lastLyric`; `perform` from `../perform/index.js`.
- Produces:
  - `line.ts`: `export function lineChart(line: { attacks: Attack[]; notes: Note[]; short: number }, smf: Smf, names: (string | null)[], allNotes: Note[], options: MidiImportOptions, report: Report): string | null` — the chart, or null when the self-check fails (the caller falls back). It reports only into `report`.
  - `index.ts`: `chartOf` returns `string | null` (null: fall back); `importMidi` runs it again with `notes: false` on a fresh report whose first diagnostic is `notes-fallback`.

**The order inside `lineChart`:**
1. `notes-line` (info), its message saying `notes: false` reads chords; `notes-short` (info) with the count when `short > 0`.
2. The grid: `gridOf(smf, last, report)` with `last` the larger of ruling 5's tick over `line.notes` and `lastLyric(smf) + 1` (lyrics on); then the writable pickup, as `chartOf` does.
3. `directivesOf(smf, grid, line.notes, report)` (so `key-doubtful` is judged on the line's notes); `named(line.attacks, directives.keys)`; `pitch-range` (warning) with the count when any pitch was left out.
4. `quantize`, `statesOf`, `barTexts`.
5. `rhythm-rounded` (warning) when `rounded` is not empty: one diagnostic, its `bar` the first; the message names the first eight bars by their written numbers (a pickup is bar 0; otherwise the first bar is 1), then "and N more" bars, and says how many attacks were joined when `joined > 0`.
6. Sync's chart from `detectionsOf(grid, [one run of "C" from grid.bars[0].start to grid.end], directives, sections, title)`, through `built` (sections', changes' and the pickup's diagnostics are reported as today).
7. Replace each bar's cell. The bars are found through `parseChart(chart)`: its played bars must number `grid.bars.length` (else null); each bar line is split at `|`; a cell keeps a leading `[n/d]` if it has one and takes the bar's text; `withSimile` first, when `options.simile !== false`, with `same(i)` true when bar `i`'s cell had no `[n/d]`, its meter equals bar `i - 1`'s, and no heading or directive line lies between the two bars' lines. Then `printChart`.
8. Lyric rows: `withLyrics(chart, smf, grid, allNotes, report)` unless `options.lyrics === false`, exactly as `chartOf` does.
9. The self-check (6.4): `parseChart` gives no error; the notes of `perform(parse)`, over its tracks, have `(at, pitch)` pairs that are exactly the `Struck` points' `(pointTick / ppq, pitch)` pairs (compare in quarters within `1e-6`). Otherwise return null.

- [ ] **Step 1: Write the failing tests** in `import-line.test.ts` (files from `helpers/smf.ts`; `importMidi(bytes)` unless said):
  - The spec's first example (section 1): the line `| {E1} | {E1} {E1} {E1} {E1} | {A1} / {A1} / | {G1} {G1}_{G1} / {B1} |` exported with `exportMidi` and imported comes back as those four bars (held against re-struck, octaves kept).
  - `notes: false` on the same file gives exactly what `main` gives today: `| {E} | / | {A} | {G} / / {B} |` under the same header, with `harmony-from-melody`.
  - Diagnostics of a clean line: `notes-line` (info) and nothing else about notes; no `harmony-from-melody`; none of sync's chord codes.
  - A flat key (key signature Gb, MIDI 59) is written `{Cb4}`.
  - A line across three tracks and two channels, end to end, is one line (every region's notes in the chart, no `N.C.`).
  - A double stop among single notes is one note set, low to high.
  - A note 10 ticks before a bar line is the next bar's first note; the same before the first full bar after a pickup (Review Focus 1).
  - Sixteenths, a triplet and a 6/8 bar read as groups; a beat that fits nothing gives `rhythm-rounded` (warning) naming its bar; ten such bars name eight and count two more; two attacks joined are counted in the message.
  - A short rest is held, a long one is `--`; silence before the first note and a silent bar are `--`.
  - A marker in the middle of a ringing note: the bar under the new `##` heading starts `/`.
  - A key change and a 4/4 to 6/8 change mid-line: the spelling follows the key, the 6/8 bars have two beats (Review Focus 5).
  - `%` for a repeated bar with `simile` on, the text again with `simile: false`; never `%` for bars of rest, after a heading, or across a meter change.
  - `pitch-range`: MIDI 5 and 125 among the notes are left out, counted 2, the rest written.
  - `notes-short`: 2 stray 5-tick notes among 20 are left out and counted; when 6 of 20 are that short they are all read.
  - Lyrics: a melody with lyric events has its `lyrics:` rows under the line's bars, the same rows `notes: false` writes.
  - One long note; one short note; two notes at one tick; a note with no note-off (Review Focus 3 and 4): each gives a chart that parses, no throw.
  - `ppq` 24 and 96: quarters and eighths read exactly (Review Focus 2).
  - `tracks: [4]` on `band.mid` gives that track's line as notes; `tracks: [4], notes: false` gives today's chart.
  - The seven fixtures: `importMidi(file)` equals `importMidi(file, { notes: false })`, text and diagnostics, and the text is the fixture's `.chart.md`.
  - The fallback: with the self-check made to fail (a test seam on `lineChart`, as `withLyrics` has its `seam`), the result is the `notes: false` chart with `notes-fallback` (warning) first and no `notes-line`.
  - The options reader ignores a `notes` that is not a boolean.
- [ ] **Step 2: Run** the file. Expected: FAIL (`notes` not read; the line imports as chords).
- [ ] **Step 3: Implement** `line.ts` and the wiring in `index.ts`: `selectedNotes` → `options.notes !== false && lineOf(pitched, smf.ppq)` → `lineChart`, else `harmonyOf` and today's path unchanged.
- [ ] **Step 4: Run** `bun test packages/midi`. Expected: the new file passes; existing tests fail only where their file is one line.
- [ ] **Step 5: Move those tests** (ruling 8): pass `notes: false` where the test is about the chord reading's stages (the grid, directives, markers, lyric rows, streams, segments), by the smallest edit (a shared helper where a file has many). In the report, list each test file, how many calls changed, and any test moved to the new reading instead, with why. Do not weaken an assertion.
- [ ] **Step 6: Run** `bun test packages/midi && bun run check && bun run fallow`. Expected: PASS, clean.
- [ ] **Step 7: Commit** `feat(midi): a file that is one line of notes imports as that line`.

### Task 7: The round trip, a real file, scale and safety

**Files:**
- Create: `packages/midi/tests/import-line-roundtrip.test.ts`, `packages/midi/tests/import-line-real.test.ts`
- Create: `packages/midi/tests/fixtures/interbellum-bass-09.mid`, `packages/midi/tests/fixtures/interbellum-bass-09.chart.md`, `packages/midi/tests/fixtures/interbellum-bass-09.NOTICE.md`
- Modify: `packages/midi/tests/import-scale.test.ts`, `packages/midi/tests/smf-fuzz.test.ts`

**Interfaces:**
- Consumes: `importMidi`, `exportMidi`, `perform`; the fixture file at `/tmp/claude-1000/-home-exedev-projects-barmark/b9e2ce65-505f-4adc-b8af-ff831103312c/scratchpad/bass-file/interbellum-bass-09.mid` (8,186 bytes; copy it, do not download anything).

- [ ] **Step 1: The round trip** (spec section 9), as `property.test.ts` generates charts (a seeded generator, no new dependency): charts of one bare note line in 4/4, 3/4 and 6/8, each beat on a division it may take (4.2), members a note set, `/` or `--`, with every rest a beat or longer and starting on a beat or on a point an attack in its beat makes. For each: `exportMidi` then `importMidi`; the imported chart's performance has the same `(at, pitch)` attacks as the original's; and the same lengths. A second generator drops the limit on rests and checks the attacks only. At least 200 charts each, the seed in the test's name on failure.
- [ ] **Step 2: Run.** Expected: PASS if Tasks 1 to 6 are right. A failure is a finding: fix the code (with its own failing unit test first), never the generator's limits beyond the spec's.
- [ ] **Step 3: The real file.** Copy the `.mid` in. Write the notice, in these words: "`interbellum-bass-09.mid` is a bass line arranged and played by Kevin Peckham for a song written by Karl Ward. The song is all rights reserved and is used here with permission. Neither the file nor its transcription, `interbellum-bass-09.chart.md`, is covered by this repository's MIT licence." Generate the expected chart with `importMidi` and **read it** before committing it: 465 attacks less those joined; no `N.C.`; every region present (`## Intro`, `## Verse`… as the file's markers give); its first two bars are the spec's reading A bars (section 5); its diagnostics are `notes-line`, `notes-short` (22), `rhythm-rounded`, and the existing `marker-dropped` if the file still raises it. If the chart does not show this, stop and report rather than commit a wrong golden.
- [ ] **Step 4: Tests on it** in `import-line-real.test.ts`: the import equals the `.chart.md`; the chart parses with no error; its performance has as many attacks as the line's `Struck` points; the diagnostics above; `notes: false` still reads only what `main` reads. And a packing test: `npm pack --dry-run --json` (as the package's existing pack test or `scripts/verify-package.ts` reads it) lists no file under `tests/` and none named `interbellum`.
- [ ] **Step 5: Scale.** In `import-scale.test.ts`, a 1,000-bar line of eighths imports in linear time, timed relatively as the file's other tests are (4,000 bars within its factor of 1,000 bars). In `smf-fuzz.test.ts`, the fuzzed files run through `importMidi` with the default options (the line reading on) and with `notes: false`; neither throws, and a returned chart parses.
- [ ] **Step 6: Run** `bun test packages/midi && bun run check && bun run fallow`. Expected: PASS, clean.
- [ ] **Step 7: Commit** `test(midi): the note line round trip, a played bass line, scale and fuzz`.

### Task 8: The CLI flag and the words

**Files:**
- Modify: `packages/cli/src/import.ts`, `packages/cli/src/help.ts` (where `--tracks` is described), `packages/cli/tests/` (the import tests)
- Modify: `packages/midi/README.md`, `packages/midi/CHANGELOG.md`, `packages/cli/README.md`, `packages/cli/CHANGELOG.md`
- Modify: `docs/superpowers/specs/2026-11-08-midi-design.md` (a pointer at its two non-goals), `CLAUDE.md` (the `packages/midi/` layout lines: the import's modules)

**Interfaces:**
- Consumes: `importMidi(bytes, { notes: false })`.
- Produces: `barmark import song.mid --chords`.

- [ ] **Step 1: Write the failing CLI tests:** `import line.mid` prints the line as notes; `import line.mid --chords` prints the chord reading (equal to `importMidi(bytes, { notes: false }).text`); `import song.musicxml --chords` is a usage error with the same exit code and form as `--tracks` with MusicXML; `--help` lists `--chords` beside `--tracks`.
- [ ] **Step 2: Run** the CLI's tests. Expected: FAIL (unknown option).
- [ ] **Step 3: Implement** the flag, following `--tracks` in `import.ts`.
- [ ] **Step 4: Words.** `packages/midi/README.md`: what a single line imports as, with the spec's first example, `notes: false`, the five diagnostics, and the two limits of lyric rows (6.3) in a sentence each. `packages/midi/CHANGELOG.md` `[Unreleased]`: under `### Changed`, that a file that is one line of notes now imports as its notes, with `notes: false` as the way back; under `### Added`, the option and the codes. `packages/cli` README and CHANGELOG: `--chords`. The MIDI design: at "a bass line as note sets" and "sub-beat rhythm on import", "done in `2026-11-19-midi-note-line-design.md`". Do not bump any version.
- [ ] **Step 5: Run** from the root: `bun test`, `bun run check`, `bun run fallow`. Expected: PASS, clean.
- [ ] **Step 6: Commit** `feat(cli): import --chords reads chords from a line of notes` and `docs(midi): a single line imports as its notes`.

---

## After the plan (the controller's, not a task)

The whole-branch review, the pull request, then the releases in the spec's order (section 10): `@barmark/midi` 0.4.0, the CLI's next minor (the flag), the pin in `kevinpeckham/songs`, barmark.dev's pins and any sentence there that describes MIDI import.
