# MusicXML Notation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `@barmark/musicxml` writes charts the way an engraver would: rhythm slashes in off-beat bars, meter-aware values, beams, clefs by bars with clef changes, instruments from the part's name (octave transposition, guitar clef, playback sound) and keyboard parts on two staves — with what plays unchanged.

**Architecture:** All in `packages/musicxml`. A sounding-music test fixture is built first and frozen, so every later task proves it changes notation only. Rhythm logic stays in `rhythm.ts` (values, beams); bar classification and clefs in `notes.ts` / a new `clefs.ts`; the instrument table in a new `instruments.ts`; the keyboard split in a new `staves.ts`; `measure-xml.ts` and `score.ts` wire them.

**Tech Stack:** Bun, TypeScript strict, Biome, Fallow; `xmllint` validates every export against the vendored MusicXML 4.0 XSD (`tests/schema.ts`).

**Spec:** `docs/superpowers/specs/2026-11-04-musicxml-notation-design.md` (merged in #129 on Kevin's "proceed and merge", 2026-11-04).

## Global Constraints

- No grammar change; only `packages/musicxml` (and its CHANGELOG, FINDINGS) change. `barmark` and `@barmark/render` are untouched.
- **What plays never changes:** the sounding fixture (Task 1) stays equal after every task.
- Every export validates against the XSD (the `xmlOf` test helper already fails otherwise).
- `<note>` children in schema order: `chord`, `pitch|rest`, `duration`, `tie`, `voice`, `type`, `dot`, `time-modification`, `stem`, `notehead`, `staff`, `beam`, `notations`.
- Beat bar: every attack on the beat grid of `beatLength(meter)` and no tuplet. Rhythmic bar: otherwise.
- 4/4 (and 2/2) middle rule: a note value never crosses the half bar unless it starts on a beat and fills whole beats; a rest never crosses it. Other meters: a value starting off a beat never crosses the next beat.
- Beams: within a beat; in 4/4 and 2/2 an all-eighth run beams within the half bar. Rests, quarters and longer, and beat boundaries break beams. `<beam number="1">` for eighths, `number="2"` added for 16ths, and so on.
- Clef by bars: bass when most bars sit below middle C (a bar sits below when most of its notes do). **Slash bars vote treble** (plan's ruling: the spec says slash bars don't vote, but then Example Song's four `{D2}` bars would make its whole part bass, contradicting the spec's own example; voting treble gives the spec's stated result). Slash-only parts treble. Clef change for a run of ≥ 2 such bars, or 1 bar needing > 3 ledger lines.
- Instrument table (whole words, any case): `bass` (alone, or with guitar/electric/upright/acoustic/double/fretless; not `bassoon`, not with `voice`) → bass clef, written an octave up; `guitar` (not with bass) → treble 8vb (`clef-octave-change -1`), written an octave up; `piano`, `keys`, `keyboard`, `keyboards`, `organ`, `rhodes`, `wurlitzer`, `synth` → two staves, sounding pitch; else unmatched. Octave-up parts carry `<transpose><diatonic>0</diatonic><chromatic>0</chromatic><octave-change>-1</octave-change></transpose>`.
- Playback names and GM programs: Electric Bass (34), Electric Guitar (28), Piano (1); unmatched parts get no `<score-instrument>`.
- Keyboard: split at middle C (C4 and above upper); voice 1 staff 1, voice 5 staff 2, joined by `<backup>`; slashes and harmony on the upper staff; a lower staff with no notes in a bar gets one whole-bar rest with `print-object="no"`; no clef changes.
- Release `@barmark/musicxml` 0.3.0 (0.2.0 carries credits and holds), then CLI, barmark.dev, songs (RELEASING.md).
- Test first; Fallow clean (refactor rather than grow the baseline); CHANGELOG entry per user-visible change; conventional commits, no AI trailer.

## Review Focus

1. 6/8 and 12/8 bars with pushes and triplets: meter rule, beat pieces and beams agree, and ties across the bar line survive.
2. A keyboard part in a multi-part chart with tacet bars: a tacet measure writes one whole-measure rest per staff and validates.
3. A note set crossing middle C that is held across a bar line: both staves tie.
4. A bass part's octave transposition: the sounding fixture is unchanged (the fixture applies `octave-change`).
5. A bar of `N.C.` or `?` slots in a rhythmic bar: stemmed slashes, the "?" words kept, no harmony invented.

---

### Task 1: The sounding fixture

**Files:**
- Create: `packages/musicxml/tests/sounding.ts` (reader), `packages/musicxml/tests/sounding.test.ts`, `packages/musicxml/tests/fixtures/sounding.json` (generated), `packages/musicxml/scripts/sounding-snapshot.ts`

**Interfaces:**
- Produces: `sounding(xml: string, partId?: string): Sounded` where `type Sounded = { notes: { pitch: number; at: string; length: string }[]; harmonies: { text: string; at: string }[] }`. `pitch` is the sounding MIDI number (written pitch plus the part's `<transpose>` chromatic and `octave-change`×12); `at` and `length` are exact fractions of a quarter note as `"n/d"`, counted from the part's start in written measure order; tied notes merge into one; notes on every staff and voice are read (`<backup>` and `<forward>` move the clock; `<chord/>` shares the onset). Slash notes and rests are not notes. Harmonies use `play.ts`'s `harmonyText`.
- Consumes: nothing new.

- [ ] **Step 1:** Write `sounding.test.ts`: (a) `sounding(xmlOf("| {C4} / {E4} {G4} |"))` has notes `[{60,"0/1","2/1"},{64,"2/1","1/1"},{67,"3/1","1/1"}]`; (b) `"| {D2} | / |"` gives one D2 of length `"8/1"`; (c) a hand-written measure with `<transpose><octave-change>-1</octave-change>` and a written E3 reads pitch 40; (d) `<backup>` returns the clock (hand-written two-voice measure); (e) for every chart of the corpus (examples plus the grammar's blocks, as `corpus.test.ts` collects them; move `grammarCharts` and `examples` into `tests/charts.ts` and import them in both tests), every part's `sounding` equals the entry in `fixtures/sounding.json`.
- [ ] **Step 2:** Run `bun test packages/musicxml/tests/sounding.test.ts` — Expected: FAIL (no module).
- [ ] **Step 3:** Implement `sounding.ts`; write `scripts/sounding-snapshot.ts` that writes the fixture keyed by chart name then part id, run it once on the current code (`bun packages/musicxml/scripts/sounding-snapshot.ts`).
- [ ] **Step 4:** Run — Expected: PASS; `bun test` all green.
- [ ] **Step 5:** Commit `test(musicxml): what each export sounds, frozen`.

The fixture is never regenerated in later tasks. A task that changes it has changed the music: a bug, not a fixture update.

### Task 2: Meter-aware values

**Files:**
- Modify: `packages/musicxml/src/rhythm.ts` (`meterValues`), `packages/musicxml/src/measure-xml.ts` (`valuesOf` uses it for notes and rests)
- Test: `packages/musicxml/tests/meter-values.test.ts`

**Interfaces:**
- Produces: `meterValues(start: Frac, length: Frac, meter: Meter): NoteValue[]` — tied values for a sound `start` into its bar, split where Global Constraints' meter rule says, each piece through `noteValues`.

- [ ] **Step 1:** Tests of `meterValues` (types, with `.` for a dot; tied in order): 4/4 — a half from beat 2 (`start 1, len 2`) → `quarter, quarter`; a dotted half from 0 → `half.`; a half from 0 → `half`; a whole → `whole`; 3½ beats from 0 → `half, quarter.`. 3/4 — two beats from the "and" of 1 (`start 1/2, len 2`) → `eighth, quarter.`. 6/8 — a dotted quarter from 0 → `quarter.`; a quarter from the third eighth (`start 1, len 1`) → `eighth, eighth`. Export: `| {C4} {D4} / {E4} |` writes `quarter, quarter~quarter, quarter`; `| {C4} -- / / |` writes the rest as `quarter, half` (a rest never crosses the half bar).
- [ ] **Step 2:** Run — Expected: FAIL.
- [ ] **Step 3:** Implement; route note sets, voicings and rests in `valuesOf` through it (slashes keep `beatPieces` until Task 3). Update existing tests whose expectations follow the new rule only (`holds.test.ts`' eighth case if it changes), saying so in the commit body.
- [ ] **Step 4:** Run `bun test packages/musicxml` — Expected: PASS, sounding fixture equal.
- [ ] **Step 5:** Commit `feat(musicxml): note values follow the meter`.

### Task 3: Rhythm slashes

**Files:**
- Modify: `packages/musicxml/src/notes.ts` (`rhythmic(bar)`, `slashed` excludes rhythmic bars), `packages/musicxml/src/events.ts` (in a rhythmic bar, a chord's `/` holds join its event, as `applyHolds` joins a note set's), `packages/musicxml/src/measure-xml.ts` (`valuesOf`: rhythmic slashes through `meterValues`, stemmed), `packages/musicxml/src/notes.ts` (`soundValueXml` takes `stem: "none" | "up"` for slashes)
- Test: `packages/musicxml/tests/rhythm-slashes.test.ts`

**Interfaces:**
- Produces: `rhythmic(bar: MeasureEvents): boolean` (exported from `notes.ts`).

- [ ] **Step 1:** Tests: `| D / / /_G |` → D lasts 3½ beats (its holds joined), written `half, quarter.` tied, then G `eighth`; every note `<notehead>slash</notehead>` and none `<stem>none</stem>`; two harmonies; the measure is outside slash style; `| C | <D |` bar 1 is rhythmic (its push note is off the beat); `| C D E |` (triplets) is rhythmic, stemmed; `| C D |` stays a beat bar: four stemless quarters under slash style; a bar of `?` and `N.C.` with a push (`| ? <N.C. |`) is rhythmic, keeps its "?" words and writes no harmony for `?`.
- [ ] **Step 2:** Run — Expected: FAIL.
- [ ] **Step 3:** Implement. Slash style (`slashStyleXml`) treats a rhythmic bar as not slashed, so it stops and restarts around it.
- [ ] **Step 4:** Run `bun test packages/musicxml` — Expected: PASS; update `beat-slashes.test.ts`' push and triplet cases to the rhythmic expectation (commit body names them).
- [ ] **Step 5:** Commit `feat(musicxml): rhythm slashes in a bar off the beat`.

### Task 4: Beams

**Files:**
- Modify: `packages/musicxml/src/rhythm.ts` (`beamsOf`), `packages/musicxml/src/notes.ts` (`<beam>` after `<notehead>`/`<staff>`), `packages/musicxml/src/measure-xml.ts` (positions per value)
- Test: `packages/musicxml/tests/beams.test.ts`

**Interfaces:**
- Produces: `type Beam = "begin" | "continue" | "end"`; `beamsOf(values: { start: Frac; v: NoteValue; rest: boolean }[], meter: Meter): Beam[][]` — per value, one entry per beam level (`[]` for unbeamed).

- [ ] **Step 1:** Tests: four eighths in a beat pair `| {C4} {D4} {E4} {F4} {G4} {A4} {B4} {C5} |` (eighths) → `begin, continue, continue, end` twice (half-bar rule in 4/4); in 3/4 six eighths beam in three pairs; 6/8 six eighths → two groups of three; sixteenths `| {C4}_{D4}_{E4}_{F4} / / / |` → level 1 and level 2 both begin…end; a rest in the middle breaks (`{C4}_--_{E4}_{F4}`); a quarter between eighths breaks; a triplet group of eighths beams within itself; rhythm slashes beam too (`| D / / /_G |`'s eighth stands alone: unbeamed).
- [ ] **Step 2:** Run — Expected: FAIL.
- [ ] **Step 3:** Implement; a single eighth alone in its group has no beam.
- [ ] **Step 4:** Run `bun test packages/musicxml` — Expected: PASS, schema-valid.
- [ ] **Step 5:** Commit `feat(musicxml): beam eighths and shorter`.

### Task 5: Clefs by bars, and clef changes

**Files:**
- Create: `packages/musicxml/src/clefs.ts` (`clefPlan`)
- Modify: `packages/musicxml/src/notes.ts` (remove `clefFor`), `packages/musicxml/src/measure-xml.ts` (`MeasureContext.clef` becomes the bar's clef; `attributesXml` writes a `<clef>` when it differs from the previous bar's), `packages/musicxml/src/score.ts`
- Test: `packages/musicxml/tests/clefs.test.ts` (move the existing clef tests from `notes.test.ts`)

**Interfaces:**
- Produces: `type Clef = "G" | "F"`; `clefPlan(measures: Measure[]): Clef[]` — one clef per measure.

- [ ] **Step 1:** Tests: Example Song (grammar's first block): the part's clef is treble (slash bars vote treble), measure 1 writes a bass `<clef>` for the `{D2}` run of bars 1–4, and measure 5 writes treble again; one long low note with 60 slash bars → the part is treble with a bass run, not all bass; a part of mostly low bars → bass throughout, with a single high bar that needs ≤ 3 ledger lines staying bass, and one needing 4 (`{C6}`) changing for that bar; two consecutive high bars in a bass part change and change back; slash-only parts treble with no `<clef>` after measure 1.
- [ ] **Step 2:** Run — Expected: FAIL.
- [ ] **Step 3:** Implement (held bars count with the notes they hold: use `applyHolds`' result, so a bar of `/` after `{D2}` votes low).
- [ ] **Step 4:** Run — Expected: PASS.
- [ ] **Step 5:** Commit `feat(musicxml): clefs by bars, with clef changes`.

### Task 6: Instruments from the part's name

**Files:**
- Create: `packages/musicxml/src/instruments.ts` (`instrumentOf`)
- Modify: `packages/musicxml/src/score.ts` (`<score-instrument>`, `<midi-instrument>` in `score-part`; instrument clef overrides `clefPlan`; written pitch up an octave for octave-up instruments), `packages/musicxml/src/measure-xml.ts` (`<transpose>` and the guitar clef in measure 1's attributes)
- Test: `packages/musicxml/tests/instruments.test.ts`

**Interfaces:**
- Produces: `type Instrument = { kind: "bass" | "guitar" | "keyboard"; sound: string; program: number; clef: { sign: "G" | "F"; octaveChange?: -1 }; octaveUp: boolean; staves: 1 | 2 }`; `instrumentOf(part: Part | null): Instrument | null`.

- [ ] **Step 1:** Tests: `instrumentOf` for `Bass Guitar`, `Electric Bass`, `Bass` (bass), `Bassoon`, `Bass Voice` (null), `Acoustic Guitar`, `Gtr = Guitar` (guitar), `Bass Guitar` not guitar, `Piano`, `Keys`, `Rhodes`, `Synth Pad` (keyboard), `Vocals`, null part (null). Export: a `part: Bass Guitar` chart writes `{G2}` as written G3 with `octave-change -1`, bass clef, `<score-instrument>` "Electric Bass", `<midi-program>34`; a guitar part writes the treble-8vb clef and an octave-up written pitch; an unmatched part writes no `<score-instrument>`; the sounding fixture is unchanged for every corpus chart (the Three Parts chart in `examples/` is not there; add the dev-test three-part chart from the session as `packages/musicxml/tests/fixtures/three-parts.chart.md` and assert its bass part sounds at G2 while written at G3).
- [ ] **Step 2:** Run — Expected: FAIL.
- [ ] **Step 3:** Implement. Clef changes (Task 5) apply only to unmatched parts: an instrument has its own clef (plan's ruling; the spec orders instrument clef first and is silent on changes for one-staff instruments).
- [ ] **Step 4:** Run — Expected: PASS, fixture equal.
- [ ] **Step 5:** Commit `feat(musicxml): instruments from the part's name`.

### Task 7: Two-staff keyboards

**Files:**
- Create: `packages/musicxml/src/staves.ts` (`splitStaves`)
- Modify: `packages/musicxml/src/measure-xml.ts` (two voices per measure with `<backup>`; `<staves>2</staves>`, two `<clef number="1|2">` in measure 1), `packages/musicxml/src/notes.ts` (`<staff>` on every note of a two-staff part)
- Test: `packages/musicxml/tests/staves.test.ts`

**Interfaces:**
- Consumes: `Instrument.staves` (Task 6), `beamsOf` (Task 4), `meterValues` (Task 2).
- Produces: `splitStaves(bar: MeasureEvents): { upper: SoundEvent[]; lower: SoundEvent[] }` — each event's notes split at middle C; an event with no notes on a staff becomes a rest there of the same length; consecutive rests on a staff merge; slashes go upper with a rest lower.

- [ ] **Step 1:** Tests (part `Pno = Piano`): `{G2 D3 B3 G4}` → lower G2 D3 B3, upper G4, both whole; the Three Parts piano bar 2 arpeggio `{C3}_{E3}_{G3}_{C4}_{E4}_{G4}_{C5}_{G4} {C4 E4 G4}` → C3 E3 G3 lower with upper rests, the rest upper; a slash bar → upper slashes with harmony, lower one `print-object="no"` whole rest, `measure-style` on staff 1 only (`number="1"`); a tacet measure → one `<rest measure="yes"/>` per staff; `| {B3 D4} | / |` held → B3 tied on staff 2, D4 tied on staff 1; voices 1 and 5, `<backup>` of the measure's duration between; no `<clef>` after measure 1; validates; sounding fixture unchanged.
- [ ] **Step 2:** Run — Expected: FAIL.
- [ ] **Step 3:** Implement. Keep `measureXml` under Fallow's thresholds: a `voiceXml(events, staff, voice, ctx)` helper writes one staff's notes.
- [ ] **Step 4:** Run `bun test` and `bun run fallow` — Expected: PASS, clean.
- [ ] **Step 5:** Commit `feat(musicxml): keyboard parts on two staves`.

### Task 8: CHANGELOG, Dorico check and release

- [ ] `packages/musicxml/CHANGELOG.md` `[Unreleased]`: Added (rhythm slashes, beams, instruments, two staves) and Changed (meter-aware values, clefs by bars).
- [ ] Re-export Example Song, Three Parts and Morning Song to `site/static/dorico-tests/*-v4.musicxml` (not committed) for Kevin's Dorico import; record what Dorico does in FINDINGS.
- [ ] Release per RELEASING.md: `@barmark/musicxml` 0.3.0, then `@barmark/cli` (minor: export output changes), barmark.dev, songs.
