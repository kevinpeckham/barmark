# MusicXML Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `@barmark/musicxml`'s `exportMusicXml(text)` and `barmark export --musicxml` turn a barmark chart, several parts included, into MusicXML 4.0 that validates, opens in MuseScore and Dorico, and plays in the chart's play order.

**Architecture:**
- The parse becomes a list of **measure models**, one per part, built from that part's parse. A several-part chart goes through `extractPart` for each part; a single-part chart through `parseChart`.
- The models are in written order, with replays written out (`writtenMeasures`).
- A writer turns the models into XML strings.
- The harmony mapping is a data table of MusicXML kinds plus a degree diff.
- A test-only MusicXML player checks the played order against `parseChart(text).bars`.

**Tech Stack:** Bun workspace, TypeScript strict, Biome, Fallow, `bun test`, `xmllint` against the vendored MusicXML 4.0 XSD.

**Spec:** `docs/superpowers/specs/2026-11-03-musicxml-export-design.md`

## Global Constraints

- New package `@barmark/musicxml` in `packages/musicxml`. Its only runtime dependency is `"barmark": "workspace:^"`. It has `engines: node >=20` and the MIT licence, like `@barmark/render`.
- Output is MusicXML 4.0 `score-partwise`, with the doctype `<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">`.
- `exportMusicXml(text: string, options?: { part?: string }): { ok: true; xml: string; diagnostics: ChartDiagnostic[] } | { ok: false; diagnostics: ChartDiagnostic[] }`. It never throws. A chart with any error gives `ok: false`.
- Every musical fact comes from the parser: `parseChart`, `extractPart` and the chord records. The package never reads chart text.
- Everything is concert pitch. No melody is invented: chord symbols sit over slash notes.
- Repo rules apply: test first; `bun run fallow` stays clean; a CHANGELOG entry for each user-visible change; conventional commits with no AI trailer; `main` takes changes only by PR with green CI.

## Review Focus

1. **A `%` copying a one-bar meter** (`| [2/4] G | % | D |`): two 2/4 measures with one `<time>` change, then the running meter restored on `D`. Test in Task 6.
2. **An open repeat `x ...` next to a counted repeat:** playback treats the open repeat as one pass, and the file still validates (`times` is left out). Test in Task 6.
3. **Chords with alterations, omissions and added tones** (`C7#9b13`, `C(omit3)`, `Cadd9`, `Cm7(b5)`, `C6/9`): kind plus degrees gives exactly the record's intervals. Test in Task 3.
4. **XML-special characters** in a title, a part name, words on a bar and a lyric line (`& < > " '`): escaped, and the file validates. Test in Task 7.
5. **`D.S. al Coda` with a `To Coda`** in a chart that also repeats: the playback of the export matches the parser's bars. Test in Task 6.

---

### Task 1: The package, its pipeline and the empty score

**Files:**
- Create:
  - `packages/musicxml/package.json`
  - `tsconfig.build.json`
  - `README.md`, `LICENSE`, `CHANGELOG.md`
  - `src/index.ts`, `src/xml.ts`, `src/score.ts`
  - `tests/schema.ts`, `tests/schema/` (the vendored MusicXML 4.0 `musicxml.xsd`, `xlink.xsd`, `xml.xsd`, with their licence note)
  - `tests/score.test.ts`
  - `scripts/smoke-musicxml.mjs`
- Modify:
  - `tsconfig.json`: a path for `@barmark/musicxml`
  - `scripts/lib.ts`: `PACKAGES.musicxml`, with `tagPrefix: "musicxml-v"`
  - `scripts/verify-package.ts`: `CONTENTS.musicxml`, the same as barmark's
  - `.github/workflows/ci.yml`: matrix `pkg` adds `musicxml`; the test job installs `libxml2-utils`
  - `.github/workflows/release.yml`: a `musicxml-v*)` case
  - `workflows/workflow-release-check.yaml`: enum adds `musicxml`
  - `CLAUDE.md`: the Layout section

**Interfaces:**
- Produces:
  - `el(name: string, attrs?: Record<string, string | number | undefined>, children?: string | string[]): string`
  - `escapeXml(text: string): string` in `src/xml.ts`
  - `exportMusicXml` with the Global Constraints signature
  - `validate(xml: string): string[]` in `tests/schema.ts`: xmllint's errors, or `[]`

- [ ] **Step 1: Write the failing tests** in `tests/score.test.ts`:
  - `"a chart with an error exports nothing"`: `exportMusicXml("| H |")` has `ok` false and the parser's diagnostics.
  - `"a title and a part name"`: `exportMusicXml("# Morning & Night\npart: Gtr = Guitar\n| G |")`. Its `xml` contains:
    - `<work-title>Morning &amp; Night</work-title>`
    - `<part-name>Guitar</part-name>`
    - `<part-abbreviation>Gtr</part-abbreviation>`
    - `<score-part id="P1">`
  - `"a chart with no part: is one part named Chart"`
  - `"several parts are score-parts in score order"`: Morning Song (`packages/barmark/tests/chart/morning-song.ts`) gives P1 = Electric Guitar 1 and P2 = Piano.
  - `"the encoding names the software"`: `<software>@barmark/musicxml 0.1.0 (barmark 0.14.1)</software>`, with both versions read from the two package.json files.
  - `"it validates"`: `validate(xml)` is `[]` for each of the charts above.
- [ ] **Step 2: Run** `bun test packages/musicxml`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `exportMusicXml`. For now each part holds one measure per played bar of the first pass, as `<measure number>` with whole-measure rests. Task 2 replaces that.
  - The versions come from JSON imports of the two package.json files. tsc's `resolveJsonModule` already applies (render's tests import JSON).
- [ ] **Step 4: Run** `bun test packages/musicxml`, then `bun run check`, `bun run fallow` and `bun run verify:package musicxml`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(musicxml): the package and an empty score`.

### Task 2: Measures, attributes and the rhythm of slots

**Files:**
- Create: `src/measures.ts`, `src/rhythm.ts`, `src/measure-xml.ts`, `tests/rhythm.test.ts`

**Interfaces:**
- Produces:
  - `Measure = { shown: number; meter: Meter; key: Key | null; cells: MeasureCell[]; tacet: boolean; marks: Marks; directives: Directives | null; text: { text: string; note: boolean }[] }`
  - `MeasureCell = { slot: Slot; words: Words[] }` (the slot from the `PlayedBar`, `%` resolved)
  - `Marks` is filled in by Task 6. Its fields are `repeatStart`, `repeatEnd` (`number | "open" | null`), `ending`, `heading`, `rehearsal`, `directions`, `fermataBefore`, `cut`.
  - `writtenMeasures(parse: ChartParse): Measure[]`. Here, one measure per written bar in written order, slots taken from the first `PlayedBar` with that `written` number. Task 6 adds replays and marks.
  - `divisionsFor(measures: Measure[]): number`
  - `durations(cells: MeasureCell[], meter: Meter, divisions: number): number[]`
  - `measureXml(m: Measure, ctx: { divisions: number; first: boolean; previous: Measure | null }): string`

- [ ] **Step 1: Write the failing tests** in `tests/rhythm.test.ts`. All files must also validate.
  - `"slots split the bar equally"`: `| C D |` in 4/4 is two half-note slash notes. `<type>half</type>` and `<notehead>slash</notehead>`, each on B4.
  - `"a hold is a slash note with no harmony; a silence is a rest"`: `| C / -- / |`.
  - `"a group whose share isn't a power of two is a tuplet"`: `| C D_E_F |` gives three notes with `<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes>`.
  - `"divisions make every duration whole"`, for `| C D E |` in 4/4 and `| C D_E_F_G_A |`.
  - `"key, time and clef on the first measure"`:
    - `key: Eb` gives `<fifths>-3</fifths>`;
    - `key: D dorian` gives `<mode>dorian</mode>`;
    - `time: 6/8` gives `<beats>6</beats><beat-type>8</beat-type>`;
    - every part has `<clef><sign>G</sign><line>2</line>`.
  - `"slash notation is switched on"`: `<measure-style><slash type="start" use-stems="no"/>`.
  - `"a tacet bar is a measure rest"`: Morning Song's Piano part, measures 9–12, have `<rest measure="yes"/>`.
  - `"measure numbers show barmark's written numbers"`: `number` attributes run 1..N, and `text` shows `written`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `divisionsFor` is the least common multiple, over all measures, of the slot denominators. A quarter note is `divisions`.
  - `<type>` comes from a duration's power-of-two fraction, with `<dot/>` for 3/2 of one. A duration that is neither is written as a tied pair, larger first.
- [ ] **Step 4: Run** `bun test packages/musicxml` and the gates. Expected: all pass.
- [ ] **Step 5: Commit** `feat(musicxml): measures and slot rhythm`.

### Task 3: Harmony

**Files:**
- Create: `src/kinds.ts` (the 33 MusicXML kind values with their intervals), `src/harmony.ts`, `tests/harmony.test.ts`

**Interfaces:**
- Consumes: `ChordRecord`, `Interval` from `barmark`.
- Produces: `harmonyXml(record: ChordRecord, offset?: number): string`, `noChordXml(): string`, `kindOf(intervals: Interval[]): { kind: string; degrees: Degree[] }`.

- [ ] **Step 1: Write the failing tests:**
  - `"root, alter and bass"`: `F#m7/C#` gives `<root-step>F</root-step><root-alter>1</root-alter>`, `<kind text="m7">minor-seventh</kind>` and `<bass><bass-step>C</bass-step><bass-alter>1</bass-alter></bass>`.
  - `"kind text is barmark's canonical quality"`: `Cø` gives `text="m7(b5)"` and kind `half-diminished`.
  - `"degrees make the exact chord"`, for each of `C7#9b13`, `C(omit3)`, `Cadd9`, `C6/9`, `Cm7(b5)`, `C7sus4` and `C5`: rebuilding the intervals from kind plus degrees equals `parseChord(x).value.intervals`. This is Review Focus 3.
  - `"every chord in Appendix A.4 round-trips"`, read from the grammar file the way `packages/barmark/tests` read the spec.
  - `"N.C. is kind none"`: `<harmony><root><root-step>C</root-step></root><kind text="N.C.">none</kind></harmony>`. The root is required by the XSD and hidden with `print-object="no"`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `kindOf` picks the kind whose intervals are a subset of the chord's with the fewest left over. Ties go to the earlier kind in `kinds.ts`, which lists the common chords first.
  - The rest become degrees: `add` for extra intervals, `alter` where a kind's degree is moved, `subtract` for a missing degree.
  - A chord slot in `measureXml` writes `harmonyXml` before its slash note.
- [ ] **Step 4: Run** and the gates. Expected: all pass.
- [ ] **Step 5: Commit** `feat(musicxml): chord symbols as harmony`.

### Task 4: Note sets, voicings, accents, hits, words and ?

**Files:**
- Create: `src/notes.ts`, `tests/notes.test.ts`
- Modify: `src/measure-xml.ts`, `src/score.ts` (choosing the clef)

**Interfaces:**
- Produces:
  - `pitchesOf(record: ChordRecord): { step: string; alter: number; octave: number }[]`. Written octaves are kept. Without octaves, notes rise from octave 4 in written order.
  - `clefFor(measures: Measure[]): "G" | "F"`

- [ ] **Step 1: Write the failing tests:**
  - `"a note set is a chord of real notes"`: `| {C E G} |` gives three `<note>`s, C4 E4 G4, with `<chord/>` on the second and third, and no `<harmony>`. Slash style is off in that measure (`<slash type="stop"/>`).
  - `"a voicing is the harmony over its notes"`: `| Cmaj7{E3 G3 B3} |`.
  - `"a part of low note sets gets a bass clef"`: `| {E2 B2} | {A2 E3} |`.
  - `"an accent, and a hit as accent plus staccato"`: `| >C ^G |`.
  - `"words on a bar are words before their slot"`: `| "solo" D | A "fill" |`.
  - `"? is a slash note marked ?"`
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** The clef is F when more than half of the part's note-set pitches are below C4.
- [ ] **Step 4: Run** and the gates. Expected: all pass.
- [ ] **Step 5: Commit** `feat(musicxml): note sets, voicings, marks and words`.

### Task 5: Pushes

**Files:**
- Modify: `src/measure-xml.ts`, `src/rhythm.ts`
- Test: `tests/push.test.ts`

- [ ] **Step 1: Write the failing tests:**
  - `"a push starts its slot an eighth early, tied from the slot before"`: `| C <G |` in 4/4 gives C as a dotted quarter plus an eighth tied into G's harmony (the harmony's `<offset>` is 0 on the eighth), then G as a half.
  - `"a push across a bar line"`: `| C | <G |`. The last eighth of bar 1 carries G's harmony, with `<tie type="start"/>` into bar 2.
  - `"<< is a sixteenth"`
  - `"a pushed N.C. or silence"`: `| C <N.C. |` and `| C <-- |`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Pushes are applied over the part's whole measure list, before the XML is written. The pushed slot's onset moves into the end of the slot before it, in play order within written order. The slot that loses time is shortened, and the harmony moves to the early note.
- [ ] **Step 4: Run** and the gates. Expected: all pass.
- [ ] **Step 5: Commit** `feat(musicxml): pushes as played`.

### Task 6: Order: repeats, endings, sections, replays, jumps and the playback check

**Files:**
- Modify: `src/measures.ts`, `src/measure-xml.ts`
- Create: `tests/play.ts`, `tests/order.test.ts`

**Interfaces:**
- Produces:
  - `writtenMeasures` now fills `Marks` and writes out replays.
  - `play(xml: string, part?: string): { shown: string; harmony: string[] }[]` in `tests/play.ts`. It is a test-only MusicXML player:
    - it follows `<repeat>` (`times`, defaulting to 2, and an open repeat played once);
    - it follows `<ending number>`;
    - it follows `<sound segno dalsegno coda tocoda fine dacapo>`;
    - it returns each played measure's `text` and its harmonies' kind text (or `/` for a slash note without one).
  - `expected(text: string): same shape`, built from `parseChart(text).bars` (`written`, and each slot's canonical symbol).

- [ ] **Step 1: Write the failing tests** in `tests/order.test.ts`. Each one asserts `play(xml)` equals `expected(text)`, and that the XML validates.
  - `"|: :| and x N are repeat bar lines"`: `|: G | C :| x3` gives forward and backward repeats with `times="3"`.
  - `"x ... is an open repeat played once, with the words repeat as needed"`. This is Review Focus 2.
  - `"endings"`: `|: G | C |` then `|1 D :|` then `|2 G |`.
  - `"a section heading is bold words; a rehearsal mark is rehearsal"`
  - `"## Chorus x2 repeats the section"`
  - `"a replay is written out with its own numbers shown"`: Peaceful Dreams (`examples/peaceful-dreams.chart.md`).
  - `"an elision drops its bar; x2 -> uses two endings"`: `## Chorus x2 ->`.
  - `"D.S. al Coda with To Coda"`: segno, To Coda, coda, and a repeat. This is Review Focus 5.
  - `"D.C. al Fine"`
  - `"a fermata cell is a fermata on the bar line before it"`
  - `"a % of a one-bar meter keeps the meter, then the running one returns"`: `| [2/4] G | % | D |`. This is Review Focus 1.
  - `"Morning Song's two parts each play the whole timeline"`: `play(xml, "P2")` equals `expected` for `extractPart(text, "Pno")`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `writtenMeasures` walks `parse.lines` in written order. A section heading with no bars (`SectionOccurrence.replayOf !== null`) emits the written section's measures again. Their slots and words come from the `PlayedBar`s of that occurrence (`firstBar..lastBar`), so a replay's own lyric lines are used.
  - An elided occurrence drops the last bar. With `x2 ->`, it writes ending 1 as the last bar and ending 2 as empty.
  - Jumps use `<sound>` with `segno="s1"`, `dalsegno="s1"`, `coda="c1"`, `tocoda="c1"`, `fine="yes"` and `dacapo="yes"`, beside the words and signs.
- [ ] **Step 4: Run** and the gates. Expected: all pass.
- [ ] **Step 5: Commit** `feat(musicxml): repeats, endings, sections, replays and jumps`.

### Task 7: Directives, text lines and escaping

**Files:**
- Modify: `src/measure-xml.ts`, `src/measures.ts`
- Test: `tests/directives.test.ts`

- [ ] **Step 1: Write the failing tests** (each XML also validates):
  - `"tempo is a metronome mark and a sound tempo"`: `tempo: 120` gives `<per-minute>120</per-minute>` and `<sound tempo="120"/>`.
  - `"rit. to 90 is its words, then the target tempo"`
  - `"swing is sound swing; a swing percent sets its ratio"`: `feel: swing 60`.
  - `"straight is straight"`
  - `"a mid-chart key: or time: is attributes on the next bar"`
  - `"lyric and note lines are words below the next bar"`
  - `"XML-special characters are escaped"`: `& < > " '` in the title, a part name, words on a bar and a lyric line. This is Review Focus 4.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Swing is `<swing><first>p</first><second>100-p</second><swing-type>eighth</swing-type></swing>`, with p rounded. A bare `swing` is 2:1.
- [ ] **Step 4: Run** and the gates. Expected: all pass.
- [ ] **Step 5: Commit** `feat(musicxml): directives and text lines`.

### Task 8: Real charts, the README and the CHANGELOG

**Files:**
- Test: `tests/corpus.test.ts`
- Modify: `packages/musicxml/README.md`, `CHANGELOG.md`

- [ ] **Step 1: Write the failing test** `"every example and every clean grammar example exports, validates and plays as parsed"`. It covers `examples/*.chart.md` and the fenced charts of `docs/grammar-v0.1-draft.md` that parse without errors.
- [ ] **Step 2: Run.** Expected: the test fails or passes. If it passes at once, ledger it: it pins real charts, and Tasks 2–7 may already have covered them.
- [ ] **Step 3: Fix** what it finds, each fix with its own failing test first. Write the README:
  - install;
  - `exportMusicXml`;
  - the mapping in brief;
  - what isn't exported yet: import, MIDI, `<lyric>`.
  - Add the CHANGELOG `[Unreleased]` entry.
- [ ] **Step 4: Run** and the gates. Expected: all pass.
- [ ] **Step 5: Commit** `test(musicxml): real charts export and play as parsed`.

### Task 9: `barmark export`

**Files:**
- Create: `packages/cli/src/export.ts`, `packages/cli/tests/export.test.ts`
- Modify:
  - `packages/cli/package.json` (dependency `"@barmark/musicxml": "workspace:*"`)
  - `src/main.ts`, `src/help.ts`, `src/io.ts`, `src/node-io.ts`, `src/binary.ts`
  - `scripts/verify-release.ts` (`RELEASED_CODE.musicxml: ["src"]`)
  - `.github/workflows/release.yml` (the CLI's libraries check includes musicxml)
  - `tsconfig.json`
  - the CLI's README and CHANGELOG

**Interfaces:**
- Consumes: `exportMusicXml`.
- Produces: `export(args: string[], io: Io): Promise<number>`. `Versions` gains `musicxml: string`, and `--version` prints `@barmark/cli X (barmark A, @barmark/render B, @barmark/musicxml C)`.

- [ ] **Step 1: Write the failing tests:**
  - `"export --musicxml prints the score"`: the output equals `exportMusicXml(text).xml`.
  - `"--out writes the file"`
  - `"--part exports one part"`
  - `"an error goes to stderr, exits 1, and --out is not written"`
  - `"export without --musicxml is a usage error"`, with the message `give a format: --musicxml`.
  - `"help lists export"`
  - `--version` includes musicxml.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement**, in the same shape as `transpose.ts` and `part.ts`.
- [ ] **Step 4: Run** `bun test`, the gates and `bun run verify:package cli`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(cli): export --musicxml`.

### Task 10: The release and the notation-program check

- [ ] **Step 1:** Export Peaceful Dreams and Morning Song. Import both into MuseScore 4, installed on the VM for this check. Screenshot each in the PR. Dorico isn't on the VM: ask Kevin to check it on his Mac.
- [ ] **Step 2:** PR, then merge.
- [ ] **Step 3: Kevin does RELEASING.md "A new package's first release" steps 1–4.** These are a placeholder publish, the trusted publisher, the rulesets (`musicxml-v*` and the `package (N, musicxml)` checks) and the `npm` environment's tag rule. Stop here and ask him: these are security settings, which Claude doesn't change.
- [ ] **Step 4:** Release `@barmark/musicxml` 0.1.0, then `@barmark/cli` 0.2.0 (RELEASING.md 1–13). Then the site bump with a Get Started line, and the songs bump (step 14).
