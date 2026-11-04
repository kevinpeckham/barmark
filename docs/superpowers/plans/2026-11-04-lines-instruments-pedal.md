# Part lines, instruments, pedal, dotted figures and clefs: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** barmark charts can write up to four lines per part (`Pno.RH |`),
name a part's instrument and clef on its `part:` line, mark the sustain
pedal (`+X`, `*X`) and write dotted figures (`C._D`). The parser, the
renderer and the MusicXML export all support these.

**Architecture:** In the parser, a part's line is a **stream**: it is
grouped into systems, projected and played exactly as a part is today
(`systems.ts`, `parts.ts`, `parse.ts`), then zipped back into its part's
bar as `lines`. The instrument table is grammar, so it lives in
`barmark`; `@barmark/musicxml` reads it in place of its name guess
whenever `instrument:` is written. Pedal and dots are slot marks, read
where accents and pushes are read.

**Tech Stack:** Bun workspace, TypeScript strict, Biome, `bun test`,
linkedom (render), xmllint against the vendored MusicXML 4.0 XSD.

**Spec:**
- `docs/superpowers/specs/2026-11-04-part-lines-instruments-design.md` (#131)
- `docs/superpowers/specs/2026-11-04-piano-gaps-design.md` (#140)

Both were approved by Kevin on 2026-11-04 with every recommendation taken.

## Global Constraints

- The grammar draft (`docs/grammar-v0.1-draft.md`) is binding: each
  grammar task updates it (sections 2.2, 2.9, 7.3, 7.6, A.7, the
  decisions log) **in the same commit** as the code.
- Nothing that reads today changes meaning. Every existing test passes
  unchanged, apart from the expected-change updates named in a step. The
  sounding fixture (`packages/musicxml/tests/fixtures/sounding.json`)
  stays byte-identical.
- Parsers never throw. Every problem is a diagnostic with a line number.
- Up to **four** lines per part; a fifth is an error.
- A line name is letters and digits (`RH`, `LH`, `2`). Labels match in
  any case.
- A chord name, `N.C.` or `?` on a part's non-first line is an
  **error** suggesting a note set, or a voicing on the first line. Pedal
  marks on a non-first line are an **error**.
- Pedal marks: `+X` presses or changes the pedal, `*X` lifts it. They go
  on a chord or a note set, before an accent or a push (`+>G`, `+<G`).
  On `/`, `N.C.`, `--` or `?` they are an **error**. A `*` with the pedal
  up is a **warning**. The pedal lifts at a `*`, a `--`, a tacet bar and
  the end of the chart.
- Dots: one dot after one member of a two-member group (3:1, or 1:3 for
  `C_D.`). Read the member whole first, so `N.C.` is undotted and
  `N.C..` is dotted. A dot in a group of three or more, on a lone slot,
  or on both members is an **error** suggesting `/` holds.
- `clef:` is one of `treble`, `bass`, `treble 8vb` or `alto`. It is an
  **error** on a two-staff instrument.
- The instrument list is exactly the 16 rows of #131's table, including
  the corrected guitar rows (sounding pitch, treble 8vb). An unknown
  name is an **error** listing the near ones.
- Concert pitch, always. Only converters write a part transposed.
- `@barmark/render` never changes the music.
- A CHANGELOG `[Unreleased]` entry in each changed package. A FINDINGS
  entry for any surprise. Fallow stays clean. Conventional commits with
  no AI trailer.

## Rulings made while planning (Kevin can overturn)

- **A bare `Pno |` line,** and a tutti line, play as the part's
  **first line**; its other lines rest there.
- **A line not written in a system** where its part plays is a stand-in
  tacet stream internally, so `/` and `%` after it are the existing
  "tacet in the bar before" errors. In the output, its `lines` entry is
  absent and converters write rests. When the whole part is absent, the
  part is tacet as today.
- **A part's `slots`** are those of its first line that plays in that
  bar, in score order. The harmony check uses written order within the
  system.
- **Label lookup:** an exact declared label wins (`part: Gtr.1 = …`
  keeps working). Otherwise the label is split at its last dot into a
  part label and a line name.
- **A pedal change in MusicXML** is written as a stop sign followed by a
  start sign at the same place (Ped. ✱ Ped.), not as `type="change"`,
  which belongs to the bracket-line style.
- **A transposing part** writes its key, notes and chord symbols at
  written pitch, with `<transpose>`. Kevin checks this in Dorico.
- **An explicit `clef:`** makes MusicXML treat the part as one staff,
  even when its name would have been guessed as a keyboard. The parser
  errors only on a two-staff `instrument:`.
- **Render:** a system shows one row per line written in it, labelled
  `Pno.RH`. A part with no line in the system gets its tacet row, as
  today.

## Review Focus

1. **A tutti (unlabelled) bar line in a chart whose piano writes
   lines:** the piano's first line plays it and its other lines rest.
   Neither drops nor doubles a bar. (Task 5,
   `tutti line plays as the first line`.)
2. **`%` or `/` on `Pno.LH` after a system where only `Pno.RH` was
   written:** an error naming the line, never a silent copy of RH.
   (Task 5, `percent after a system without the line errs`.)
3. **Marks combined with dots and every no-chord spelling:**
   `>C._D`, `+C._D`, `NC._G`, `N.C.._G`. Each reads as the table says,
   and none changes an existing chart. (Task 2, `dots with marks and
   N.C. spellings`.)
4. **A trumpet in B♭ through a key change** (`key: C` then `key: F`):
   written keys D, then G, with notes spelled in those keys. (Task 9,
   `trumpet follows key changes`.)
5. **The pedal across a repeat, a D.S. and a tacet bar,** in play order:
   it carries into the repeat and lifts at the tacet bar, so no Ped.
   runs past a rest of the part. (Task 3, `pedal state in play order`;
   Task 10, `pedal lifts at a tacet bar`.)

---

### Task 1: The instrument table and `part:` attributes

**Files:**
- Create: `packages/barmark/src/chart/instruments.ts`
- Modify: `packages/barmark/src/chart/types.ts` (`Part`),
  `document.ts` (`readPart`), `print.ts` (the part line),
  `index.ts` (exports), `docs/grammar-v0.1-draft.md` (7.3, A.7, decisions log)
- Test: `packages/barmark/tests/chart/instruments.test.ts`

**Interfaces:**
- Produces:
  - `type InstrumentName` (the 16 list names, lower case as listed:
    `"trumpet in Bb"` keeps its capital B).
  - `type ClefName = "treble" | "bass" | "treble 8vb" | "alto"`.
  - `type InstrumentInfo = { name: InstrumentName; clef: ClefName; staves: 1 | 2; written: { diatonic: number; chromatic: number }; program: number }`,
    where `written` is how far above sounding pitch it is written.
  - `INSTRUMENTS: readonly InstrumentInfo[]`, in the table's order.
  - `instrumentInfo(name: string): InstrumentInfo | null`, matching in
    any case.
  - `Part = { name: string; label?: string; instrument?: InstrumentName; clef?: ClefName }`.

`written` values:
- Bass and double bass: {7, 12}.
- Trumpet: {1, 2}.
- Alto sax: {5, 9}.
- Tenor sax: {8, 14}.
- All others: {0, 0}.

- [ ] **Step 1: Write the failing tests** in `instruments.test.ts`:
  - `reads instrument: after the name`:
    `part: Tpt = Trumpet, instrument: trumpet in Bb` gives
    `{ label: "Tpt", name: "Trumpet", instrument: "trumpet in Bb" }`;
    `instrument: PIANO` gives `"piano"`.
  - `reads clef:`: `part: Ld = Lead, clef: bass` gives `clef: "bass"`.
    `part: Bs = Bass, instrument: electric bass, clef: treble` gives
    both.
  - `unknown instrument errs with near names`: `instrument: bass` is an
    error whose message names `electric bass` and `double bass`, and the
    part line is text.
  - `clef on a keyboard errs`:
    `part: Pno = Piano, instrument: piano, clef: bass` is an error.
  - `other attributes still err`: `part: Guitar, key: G` keeps today's
    "a line of its own" error.
  - `the table`: `INSTRUMENTS.length === 16`.
    `instrumentInfo("electric guitar")` has `clef: "treble 8vb"` and
    written `{0,0}`; `instrumentInfo("tenor sax")` has written `{8,14}`.
  - `prints canonically`: `printChart` gives
    `part: Pno = Piano, instrument: piano, clef: …`, in that order, and
    round-trips.
- [ ] **Step 2: Run** `bun test packages/barmark/tests/chart/instruments.test.ts`.
  Expected: FAIL (no `instrumentInfo` export).
- [ ] **Step 3: Implement.** `readPart` peels trailing
  `, instrument: …` and `, clef: …` attributes, in either order, off the
  value before the label/name split, and returns the problem strings for
  the errors. Near names are the list names containing every word
  written; when there are none, those within edit distance 2.
- [ ] **Step 4: Update grammar 7.3** (attributes, the table, errors),
  A.7 (`instrument`, `clef` on parts) and the decisions log. Add a
  CHANGELOG entry.
- [ ] **Step 5: Run** `bun test packages/barmark && bun run check`.
  Expected: all pass.
- [ ] **Step 6: Commit** `feat(barmark): instrument: and clef: on the part line`.

### Task 2: Dotted figures

**Files:**
- Modify: `packages/barmark/src/chart/barLine.ts` (`slotOf`,
  `markedSlot`), `types.ts` (`SimpleSlot` gains `dotted?: true`),
  `expand.ts` (`timed`), `print.ts` (`printSimple`), `transpose.ts`
  (keeps `dotted`), grammar 2.2 and A.7
- Create: `packages/barmark/src/chart/shares.ts`
- Test: `packages/barmark/tests/chart/dotted.test.ts`

**Interfaces:**
- Produces: `memberShares(members: SimpleSlot[]): number[]`, exported
  from `barmark`. It gives fractions of the slot that sum to 1:
  `[3/4, 1/4]`, `[1/4, 3/4]`, or `1/n` each when nothing is dotted.

- [ ] **Step 1: Write the failing tests:**
  - `a dotted first member`: `| {C4}._{D4} {E4} {F4} {G4} |` has a
    group whose first member is `dotted: true`, with
    `memberShares → [0.75, 0.25]`.
  - `a scotch snap`: `| C_D. / / / |` gives `[0.25, 0.75]`.
  - `dots with marks and N.C. spellings`:
    - `>C._D` is accented and dotted.
    - `NC._G` and `N.C._G` are undotted no-chord then G.
    - `N.C.._G` is a dotted no-chord.
    - `/._C` is a dotted hold.
  - `dot errors`: `C._D._E`, `C.` alone, and `C._D.` are each one error,
    suggesting `/` holds.
  - `print and transpose keep the dot`: `printChart` round-trips
    `C._D`, and `transposeChart(…, { semitones: 2 })` gives `D._E`.
  - `lengths`: in `expand`, the dotted bar's play lengths are 3/16 and
    1/16 of a whole note in 4/4.
- [ ] **Step 2: Run** `bun test packages/barmark/tests/chart/dotted.test.ts`.
  Expected: FAIL.
- [ ] **Step 3: Implement.** In `slotOf`, try each member whole first.
  If it fails and ends in `.`, read it without the dot and mark it
  dotted. Check the dot rules after all members have been read.
  `timed` uses `memberShares`.
- [ ] **Step 4: Update grammar 2.2 and A.7** and the barmark CHANGELOG.
  Run `bun test packages/barmark && bun run check && bun run fallow`.
  Expected: all pass.
- [ ] **Step 5: Commit** `feat(barmark): dotted figures in two-member groups`.

### Task 3: Pedal marks

**Files:**
- Modify: `barLine.ts` (`readMarks`, `marksProblem`), `types.ts` (a
  chord `SimpleSlot` gains `pedal?: Pedal`), `print.ts`,
  `transpose.ts`, `expand.ts` (the warning, in play order), grammar
  2.9 (new) and A.7
- Test: `packages/barmark/tests/chart/pedal.test.ts`

**Interfaces:**
- Produces:
  - `type Pedal = "press" | "release"`.
  - `pedalStates(bars: PlayedBar[]): boolean[][]`: whether the pedal
    is down during each slot of each bar, over the top-level slots,
    with the lifts at `--`, tacet and the end applied. Consumers use it.

- [ ] **Step 1: Write the failing tests:**
  - `reads + and *`: `| +G / +C / | *D |` gives `pedal: "press"` on G
    and C and `"release"` on D. `+>G` and `+<G` keep their accent and
    push.
  - `wrong order`: `>+G` is an error suggesting `+>G`.
  - `pedal on a non-chord errs`: `+/`, `+N.C.`, `*--` and `+?` are each
    an error.
  - `release with the pedal up warns`: `| *G |` gives one warning.
  - `pedal state in play order`:
    `|: +G | C :| D -- | @A | +E |`, then a `D.S.`.
    `pedalStates` shows the pedal down through both passes of the
    repeat, up from the `--`, and down again at E.
  - `print round-trips` `+G`, `*C` and `+>G`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** `readMarks` reads one leading `+` or `*`
  before the push. The `*`-with-pedal-up warning is reported once per
  slot, in `expand`, for each part's own stream.
- [ ] **Step 4: Update grammar 2.9 and A.7** and the barmark CHANGELOG.
  Run the barmark tests, check and Fallow. Expected: all pass.
- [ ] **Step 5: Commit** `feat(barmark): sustain pedal marks`.

### Task 4: Line labels, systems and the harmony rule

**Files:**
- Modify: `document.ts` (`labelledLine`, `LABELLED` lookup),
  `types.ts` (a bars or invalid line gains `lineName?: string`;
  `ChartParse.parts` becomes `DeclaredPart[]`), `systems.ts`
  (`numberSystems` keys on `part` plus `lineName`; new `checkLines`),
  `print.ts` (sorts a system's lines into score order), grammar 7.6
  (new) and A.7
- Test: `packages/barmark/tests/chart/lines.test.ts`

**Interfaces:**
- Consumes: `Part` (Task 1), `Pedal` (Task 3).
- Produces:
  - `type DeclaredPart = Part & { lines: string[] }`: the line names in
    score order (first appearance), empty when none.
  - `streamKey(part: string, lineName?: string): string`, giving
    `"pno"` or `"pno.rh"` in lower case.

- [ ] **Step 1: Write the failing tests:**
  - `line labels`: in Morning Song's spec example (#131 section 1),
    `Pno.RH` and `Pno.LH` lines have `part: "Pno"` and `lineName` set,
    sit in one system with `Bs`, and `parts[0].lines` is
    `["RH", "LH"]`.
  - `single part with lines`: `part: Pno = Piano` with `Pno.RH |` and
    `Pno.LH |` lines makes one system.
  - `exact label wins`: `part: Gtr.1 = Guitar` with a `Gtr.1 | G |`
    line has no `lineName`.
  - `bad line name`: `Pno.R-H | G |` is an error.
  - `chord on a second line errs`: `Pno.LH | G |` after `Pno.RH` in a
    system is an error suggesting a note set. The LH line is `dropped`.
  - `pedal on a second line errs`.
  - `fifth line errs`.
  - `structure across lines`: an LH line missing the RH's `:|` is
    today's system error.
  - `canonical order`: a system written LH, Bs, RH prints RH, LH, Bs.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** with the label rule from the planning
  rulings. Lines are labelled whenever the chart has several parts
  **or** the label names a line. `groupSystems` runs when either holds.
- [ ] **Step 4: Update grammar 7.6 and A.7** and the barmark CHANGELOG.
  Run the barmark tests and check. Expected: all pass.
- [ ] **Step 5: Commit** `feat(barmark): part lines (grammar 7.6)`.

### Task 5: Playing lines

**Files:**
- Modify: `parts.ts` (`projectPart` gains an optional
  `lineName: string | null`), `parse.ts` (`playParts` plays streams
  and zips them into parts; `extractPart` keeps the lines),
  `types.ts` (`LineBar`; `PartBar` and `PlayedBar` gain
  `lines?: LineBar[]`)
- Test: `packages/barmark/tests/chart/play-lines.test.ts`

**Interfaces:**
- Consumes: `DeclaredPart`, `streamKey` (Task 4).
- Produces:
  - `type LineBar = { name: string; line: number; slots: Slot[]; words?: Words[] }`.
  - On a part that writes lines, each played `PartBar` (and an
    extracted part's `PlayedBar`) has `lines`: one entry per line that
    plays the bar, in score order. Its `slots` and `words` are its first
    playing line's.

- [ ] **Step 1: Write the failing tests:**
  - `each line plays its own`: in the #131 example, bar 3's piano
    `lines` are RH `D{D4 F#4 A4}` and LH `{D3} / {F#2} /`.
  - `tutti line plays as the first line`: a tutti `| G | C |` in that
    chart gives the piano a `lines` entry of RH only, and the bass its
    bar.
  - `a bare part line plays as the first line`.
  - `percent after a system without the line errs`: `Pno.LH | % |`
    right after a system that wrote only `Pno.RH` gives the
    tacet-before error.
  - `slash and percent per line`: `Pno.LH | % |` copies LH's bar, not
    RH's.
  - `extractPart keeps lines`: `extractPart(text, "Pno")` bars carry
    `lines`. `printPart` prints `Pno.RH |` and `Pno.LH |` lines.
  - `charts without lines unchanged`: every corpus chart's
    `parseChart` is deep-equal to before. Use the existing fixtures
    yardstick from `tests/chart/fixtures.ts`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** A part's streams are
  `lines.length ? lines : [null]`. Play every stream through
  `projectPart` and `expand`, zip them all with `zipEvents`, then fold
  each part's streams into its `PartBar`. The `share` argument of
  `expand` counts streams.
- [ ] **Step 4: Run** `bun test && bun run check && bun run fallow`
  (all packages). Expected: all pass.
- [ ] **Step 5: Commit** `feat(barmark): play each part line`.

### Task 6: Render

**Files:**
- Modify: `packages/render/src/model.ts` (system rows per line),
  `html.ts` (pedal mark, dotted group), `speech.ts`, `styles.ts`,
  `types.ts`
- Test: `packages/render/tests/lines-pedal-dots.test.ts`, plus a
  browser check in `packages/render/browser/`

**Interfaces:**
- Consumes: `LineBar`, `DeclaredPart`, `Pedal`, `memberShares`.

- [ ] **Step 1: Write the failing tests:**
  - `a row per line`: the #131 example's system has rows labelled
    `Pno.RH`, `Pno.LH` and `Bs`.
  - `a system writing only RH`: rows `Pno.RH` and `Bs`.
  - `pedal marks`: `+G` draws `data-pedal="press"` with "Ped." under
    the slot, and `*G` draws `data-pedal="release"` with "✱".
  - `dotted group`: `C._D` draws a group with `data-dotted` and no
    `.bm-tuplet`, and a `.bm-dot` after C.
  - `speech`: "C dotted, D". "pedal" and "pedal up" are spoken with
    their slot.
  - `render --part Pno` shows both lines.
- [ ] **Step 2: Run** `bun test packages/render`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `bun test packages/render && bun run test:browser && bun run check`.
  Expected: all pass. Add the render CHANGELOG entry.
- [ ] **Step 5: Commit** `feat(render): part lines, pedal marks and dotted figures`.

### Task 7: MusicXML instruments from `instrument:` and `clef:`

**Files:**
- Modify: `packages/musicxml/src/instruments.ts` (`instrumentOf`
  prefers `part.instrument`), `clefs.ts` (`Clef` gains `"C"`, alto),
  `measure-xml.ts` (`transposeXml` takes an interval), `notes.ts` (a
  written pitch), `harmony.ts` (written root), `directions.ts` (a
  written key), `score.ts`
- Create: `packages/musicxml/src/written.ts`
- Test: `packages/musicxml/tests/written.test.ts`

**Interfaces:**
- Consumes: `instrumentInfo`, `InstrumentInfo`, `ClefName` (Task 1).
- Produces:
  - `writtenPitch(p: Pitch, by: { diatonic: number; chromatic: number }): Pitch`.
  - `writtenKey(fifths: number, by): number`.
  - `Instrument` gains `written: { diatonic: number; chromatic: number }`,
    replacing `octaveUp`.

- [ ] **Step 1: Write the failing tests:**
  - `trumpet`: `part: Tpt = Trumpet, instrument: trumpet in Bb` in
    `key: C` with `{C5}` writes key fifths 2, note D5, and
    `<transpose><diatonic>-1</diatonic><chromatic>-2</chromatic></transpose>`.
  - `trumpet follows key changes`: `key: F` later writes fifths 1
    (G major).
  - `chords written`: a C chord in the trumpet part writes root D.
  - `alto and tenor`: C4 is written A4 for alto sax and D5 for tenor sax.
  - `clef: alto` writes `<sign>C</sign><line>3</line>`. A fixed clef
    writes no clef changes.
  - `named instrument over the guess`: `part: Keys 2 = Keys 2, instrument: synth`
    gets two staves and program 81.
  - `clef: on a guessed keyboard`: one staff.
  - The output still validates against the XSD.
  - `sounding unchanged`: the sounding fixture is unchanged.
- [ ] **Step 2: Run** `bun test packages/musicxml`. Expected: FAIL.
- [ ] **Step 3: Implement.** The bass keeps today's output exactly:
  written `{7, 12}` is the old octave change.
- [ ] **Step 4: Run** the musicxml tests and check. Expected: all pass.
  Add the CHANGELOG entry.
- [ ] **Step 5: Commit** `feat(musicxml): instruments, transposition and clefs from the part line`.

### Task 8: MusicXML lines as staves and voices

**Files:**
- Modify: `measure-xml.ts` (generalise `UPPER`/`LOWER` to a list of
  `{ voice, staff, clef }`), `staves.ts` (the split only for a
  one-line keyboard), `events.ts`, `score.ts`
- Test: `packages/musicxml/tests/lines.test.ts`

**Interfaces:**
- Consumes: `LineBar` (Task 5).
- Produces:
  - `voicesFor(staves: 1 | 2, lines: number): { voice: number; staff: number }[]`.
  - For 2 staves: line 1 is voice 1 on staff 1, line 2 voice 5 on
    staff 2, line 3 voice 2 on staff 1, line 4 voice 6 on staff 2.
  - For 1 staff: voices 1 to 4 on staff 1. Voice 1 has stems up and
    voice 2 stems down.

- [ ] **Step 1: Write the failing tests:**
  - `piano lines`: the #131 example's piano writes RH as voice 1 on
    staff 1, and LH as voice 5 on staff 2 with no middle-C split (an
    LH F#2 stays on staff 2).
  - `a resting line`: a system writing only RH gives the lower staff a
    whole-bar rest.
  - `third line`: `Pno.RH2 | {D4} / / / |` writes voice 2 with stems
    down on staff 1.
  - `guitar two lines`: one staff, voices 1 and 2.
  - `one-line piano unchanged`: Morning Song's export is byte-identical
    to before.
  - The output validates against the XSD.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the musicxml tests, check and Fallow. Expected:
  all pass. Add the CHANGELOG entry.
- [ ] **Step 5: Commit** `feat(musicxml): part lines as staves and voices`.

### Task 9 (folded into Task 7)

Key changes for transposing parts are covered by Task 7's
`trumpet follows key changes`. The number is kept so that Review Focus
references stay stable.

### Task 10: MusicXML pedal and dotted values

**Files:**
- Modify: `events.ts` (`memberLength` uses `memberShares`),
  `directions.ts` (pedal directions), `measure-xml.ts`
- Test: `packages/musicxml/tests/pedal-dots.test.ts`

**Interfaces:**
- Consumes: `pedalStates`, `memberShares`, `Pedal`.

- [ ] **Step 1: Write the failing tests:**
  - `pedal start and stop`: `| +G / / / | *C |` writes
    `<pedal type="start" sign="yes"/>` with
    `<sound damper-pedal="yes"/>` before G, and a stop with
    `damper-pedal="no"` before C. Both go on the lowest staff
    (`<staff>2</staff>` for a keyboard).
  - `pedal change`: a second `+` writes a stop then a start at the same
    place.
  - `pedal lifts at a tacet bar`: in a two-part chart where the piano
    is tacet in bar 3 after `+G`, a stop is written at bar 3's start.
  - `pedal lifts at the end`.
  - `dotted values`: `| {C4}._{D4} {E4} {F4} {G4} |` writes a dotted
    eighth and a sixteenth, beamed, with no tuplet.
  - The output validates against the XSD. The sounding fixture is
    unchanged.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** all tests, check and Fallow. Expected: all pass.
  Add the CHANGELOG entry.
- [ ] **Step 5: Commit** `feat(musicxml): pedal marks and dotted figures`.

### Task 11: Examples, CLI check and the branch

**Files:**
- Modify: `examples/morning-song.chart.md` only if a test demands it
  (otherwise leave it).
- Create: `packages/musicxml/tests/fixtures/piano-lines.chart.md` (the
  #131 example, with pedal and a dotted figure). Add it to the sounding
  fixture, which adds a new entry and changes no existing one.
- Test: `packages/cli/tests/` (`check`, `format` and
  `export --musicxml` on the new fixture)

- [ ] **Step 1:** Add CLI tests: `format --check` passes on the fixture,
  and `export --musicxml` validates.
- [ ] **Step 2:** Run `bun test && bun run check && bun run fallow`.
  Expected: all pass.
- [ ] **Step 3:** Write Dorico test files to
  `site/static/dorico-tests/` (not committed) for Kevin: piano lines
  with pedal, a horn chart (trumpet and alto sax), and an alto-clef part.
- [ ] **Step 4:** Do the final whole-branch review (executing-plans),
  then open the PR and merge it when green.

### Task 12: Release

Follow RELEASING.md for each package in turn:
1. `barmark` 0.16.0 (the grammar minor).
2. `@barmark/render` 0.14.0.
3. `@barmark/musicxml` 0.4.0.
4. `@barmark/cli` 0.5.0.
5. barmark.dev: the Syntax Guide gets rows for 2.2 dots, 2.9 pedal,
   7.3 instrument and clef, and 7.6 lines, so the grammar-coverage test
   passes. Bump the site's versions, including `site/tests/build.test.ts`.
6. Bump songs to CLI 0.5.0.
