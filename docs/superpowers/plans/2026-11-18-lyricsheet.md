# `@barmark/lyricsheet` (ChordPro export) implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `exportLyricsheet(chartText, { part?, title?, diagrams? })` writes a barmark chart as a ChordPro lyric sheet and says what it could not carry; `barmark export --lyricsheet` runs it.

**Architecture:** A new library package beside `@barmark/midi`, shaped like its export: parse (or extract a part), refuse a chart with errors, plan the played bars into section occurrences, write each as a lyric environment or a grid, and collect losses once per code. No importer: the output is proved by golden files, by checks against a played yardstick computed from `parseChart` alone, and on the VM by ChordPro's own Perl tool.

**Tech Stack:** TypeScript, Bun (`bun test`), Biome, Fallow; `barmark` and `@barmark/fretboard` as the only dependencies; the reference `chordpro` 6.101.0 in `~/.local/perl5` (VM only).

**Spec:** `docs/superpowers/specs/2026-11-10-lyricsheet-design.md` (approved by Kevin 2026-11-10, amended 2026-11-18). Section 4 is the behaviour; this plan does not restate it.

## Global Constraints

- **The name.** No export, type, option, flag, file or directory name says "chordpro" (spec section 2), except the VM script `scripts/chordpro-check.ts` and prose in READMEs and comments. The format is "ChordPro" in prose.
- **API.** `exportLyricsheet(chart: string, options?: LyricsheetOptions): LyricsheetResult`, never throwing:
  ```ts
  type LyricsheetOptions = { part?: string; title?: string; diagrams?: "guitar" };
  type LyricsheetLoss = { code: LyricsheetLossCode; message: string; bar?: number; written?: number };
  type LyricsheetResult =
    | { ok: true; text: string; diagnostics: ChartDiagnostic[]; losses: LyricsheetLoss[] }
    | { ok: false; diagnostics: ChartDiagnostic[] };
  ```
  Refusals are `exportMidi`'s (`packages/midi/src/export/index.ts:167-182`): `part` given and unknown → `no part labelled X` plus the chart's diagnostics; any error-severity diagnostic → `ok: false`; no bars → "the chart has no bars to export". One loss per code, at its lowest bar, its message naming how many bars (`once()`, `:157-164`; the importer's `measuresText`, `packages/musicxml/src/import/losses.ts:56`, is the model for "in 12 bars: 1, 2, 3, …").
- **Output.** UTF-8 text, LF line ends, one final newline, ASCII `#` and `b` in chord names, no tabs, no trailing spaces. Directives in ChordPro 6's long forms (`{start_of_verse}`, never `{sov}`).
- **Dependencies:** `barmark` and `@barmark/fretboard`, both `workspace:^`; no others, no dev dependency on a ChordPro library. `"sideEffects": false`. Node ≥ 20.
- **Never throws; linear time.** Every problem is a diagnostic or a loss. A 1,000-bar chart exports in time proportional to its length.
- **Fixtures are ours.** Every fixture chart is written for this package or is one of `examples/` (Kevin's or traditional); no song text is copied from anywhere. No ChordPro file, table or word list is copied into the repository.
- **A golden `.cho` is committed only after it passes the reference check** (`bun scripts/chordpro-check.ts`, VM only) and has been read against spec 4.1–4.7; the commit body says so.
- Test first; `bun run fallow` clean without growing the baseline (a function over 60 lines or cyclomatic 20 is split); a CHANGELOG entry; conventional commits with no AI trailer.

## Review Focus

1. **A chord that lands on no syllable** (over a held syllable, in a breath, in a bar with no words, before the first word of a line, after the last): written in time order as a standalone `[G] `, never attached to a neighbouring syllable, never dropped. And a syllable that starts between two chords stays between them.
2. **Text that ChordPro would read as markup.** A lyric syllable, title, credit, section name or text line holding `[`, `]`, `{`, `}`, `#` at a line's start, or a newline: written so a ChordPro reader shows the same characters and no directive or chord is invented (ChordPro has no escape for brackets in lyrics: the plan's rule is in Task 3).
3. **A section with words in some bars and none in others**, a section with words only on its second pass, and a chart with words in no section at all (grids only) and in every section: the per-occurrence choice of lyric lines or grid (spec 4.1) holds, and environments never nest or go unclosed, including when the chart ends inside a repeat or a jump cuts a section.
4. **Pickups, one-bar meters and meter changes in a grid:** the grid's `shape` and each bar's cell count agree with what the bar plays; a pickup bar is a short first bar, not padded.
5. **Parts:** with `part` given, the harmony is that part's first line and the lyrics are the singer's; a part that plays nothing in a section; a chart whose only words are on a melody line (`Vox.Mel | {D4}:A- …`), not a `lyrics:` row.

---

### Task 1: The package, its refusals and the song's header

**Files:**
- Create: `packages/lyricsheet/{package.json,tsconfig.build.json,README.md,CHANGELOG.md,LICENSE}`, `src/{index.ts,version.ts}`, `src/export/{index.ts,meta.ts,losses.ts,types.ts}`, `tests/{package.test.ts,export.test.ts,meta.test.ts}`, `scripts/smoke-lyricsheet.mjs`
- Modify (register the package; `@barmark/fretboard`'s registration is the template, commits `6e85460`, `4e2ef15`, `47af07a`): `tsconfig.json` (paths), `bun.lock`, `scripts/lib.ts` (`PACKAGES`: `tagPrefix: "lyricsheet-v"`, its smoke script), `scripts/package-contents.ts`, `.github/workflows/ci.yml` (the `pkg:` matrix), `.github/workflows/release.yml` (the tag `case` and its error message), `extensions/behaviors/barmark_checks.ts` (`PkgArg`, its description, and the `version:` string bumped to today's date form), `workflows/workflow-release-check.yaml` (the `pkg` enum)

**Interfaces:**
- Consumes: `parseChart`, `extractPart`, `ChartParse`, `ChartDiagnostic`, `Credits`, `Key`, `Meter`, `printKey` from `barmark`.
- Produces: the three types above; `LyricsheetLossCode` (a string union, each member commented; this task adds `"key-mode"`); `exportLyricsheet` writing the header only; `VERSION`; and for later tasks:
  ```ts
  // src/export/losses.ts
  export class Losses { add(code: LyricsheetLossCode, message: string, bar?: PlayedBar): void; list(): LyricsheetLoss[] }
  // src/export/types.ts
  export type Out = { lines: string[]; losses: Losses };   // every stage appends lines
  // src/export/meta.ts
  export function headerLines(parse: ChartParse, title: string | undefined): string[];
  export function directive(name: string, value?: string): string;   // "{title: X}" / "{end_of_verse}"
  ```

- [ ] **Step 1: Write the failing tests.** `package.test.ts` (as fretboard's): the dependency set is exactly `barmark` and `@barmark/fretboard`, `sideEffects` is false, `VERSION` equals `package.json`'s version (`0.0.0` until the first release bump). `export.test.ts`: a chart with an error → `ok: false` with that diagnostic; `part: "Nope"` → `ok: false`, first diagnostic `no part labelled Nope`; a chart of only a title → `ok: false` "the chart has no bars to export"; never throws on `""`, on 10,000 `|`, on every chart of the corpus (`packages/musicxml/tests/charts.ts` `corpus()`: import it by relative path as midi's tests do). `meta.test.ts`, for `# Down by the River\ncomposer: A. Writer\nlyricist: B. Poet\narranger: C. Hand\ncopyright: 2026 Us\nkey: Bm, time: 6/8, tempo: 145\n\n| Bm | G |\n`, the text begins:
  ```
  {title: Down by the River}
  {composer: A. Writer}
  {lyricist: B. Poet}
  {meta: arranger C. Hand}
  {copyright: 2026 Us}
  {key: Bm}
  {time: 6/8}
  {tempo: 145}
  ```
  Also: no title → `options.title` is used, else no `{title}`; two composers → two `{composer}` lines; `key: D dorian` → no `{key}` and one `key-mode` loss; no `key:` → no `{key}` (never invented); a title holding `{`, `}` or a newline is written with those characters replaced by a space (one rule, in `directive()`, tested).
- [ ] **Step 2: Run them; save the failing output.** `bun test packages/lyricsheet` → FAIL (the package does not exist).
- [ ] **Step 3: Implement** the package and registration. `README.md` says in two sentences what it does and that it writes ChordPro; `scripts/smoke-lyricsheet.mjs` follows `scripts/smoke-musicxml.mjs` (imports the built entry, exports Peaceful Dreams, prints a one-line JSON with `ok` and the first directive).
- [ ] **Step 4: Gates.** `bun test packages/lyricsheet; echo "exit $?"`, `bun run check; echo "exit $?"`, `bun run fallow; echo "exit $?"`, `bun run verify:package lyricsheet; echo "exit $?"`. Expected: all 0.
- [ ] **Step 5: Commit.** `feat(lyricsheet): the package, its refusals and the song's header`

### Task 2: Chord spelling, the test reader and the reference check

**Files:**
- Create: `packages/lyricsheet/src/export/spell.ts`, `tests/spell.test.ts`, `tests/read-cho.ts`, `tests/read-cho.test.ts`, `scripts/chordpro-check.ts`, `packages/lyricsheet/tests/fixtures/spellings.chart.md` and `spellings.cho`
- Modify: `CLAUDE.md` (the script, in the package's layout entry, written in Task 6: leave a note in the report)

**Interfaces:**
- Consumes: `ChordRecord`, `ChordParts`, `printChord`, `parseChord`, `enumerateSuffixes` (tests only) from `barmark`.
- Produces:
  ```ts
  // src/export/spell.ts
  /** A chord as the export writes it: canonical, or the barmark alias ChordPro readers know (spec 4.7). */
  export function spelled(chord: ChordRecord): string;          // "C7b9", "Am7b5", "Cadd9", "F#m(b6)"
  /** Whether the reference is known not to read this spelling (spec 4.7's gaps), for the losses. */
  export function isGap(chord: ChordRecord): boolean;
  // tests/read-cho.ts (test only, not exported from the package)
  export type ChoLine = { kind: "directive"; name: string; value: string } | { kind: "lyrics"; tokens: ({ chord: string } | { word: string })[] } | { kind: "grid"; cells: string[] } | { kind: "blank" };
  export function readCho(text: string): ChoLine[];
  ```
- [ ] **Step 1: Write the failing tests.** `spell.test.ts`: spec 4.7's table row by row (`C7(b9)`→`C7b9`, `C7(#9)`, `C7(#11)`, `C7(b13)`, `C7(b5)`, `C13(b9)`, `C7(b9,#11)`→`C7b9#11`, `Am7(b5)`→`Am7b5`, `C(9)`→`Cadd9`, `C(2)`, `C(4)`, `C(11)`; canonical unchanged for `Cmmaj7`, `C6/9`, `C7alt`, `Csus2`, `C7sus4`, `C5`, `Cdim7`, `Caug7`, `D/F#`); gaps written canonically with `isGap` true (`C(b13)`, `C5(7)`, `C7(no3)`, `C9sus4`, `C7sus2`, `Cb`, `E#m`, `C/F#`, and the 2026-11-18 additions `Cm(b6)`, `C(13)`, `C(#11)`, `Cm7(b13)`); and the rule that makes the export safe: **for every suffix of `enumerateSuffixes()` on roots C, F# and Bb, `parseChord(spelled(chord))` is ok and has the same intervals and bass as `chord`** (so nothing the export writes reads back in barmark as another chord). `read-cho.test.ts`: the reader splits a hand-written sheet of every construct this package writes; it is the tests' instrument, so test it against text typed by hand, not against the export.
- [ ] **Step 2: Run; save the failing output.**
- [ ] **Step 3: Implement** `spelled` from `chord.parts` (a note set never reaches it: Task 3 writes those as annotations) and `isGap` as rules in our own words, not a list of names. Then `scripts/chordpro-check.ts [file.cho…]` (default: every `packages/lyricsheet/tests/fixtures/*.cho`): runs the reference as spec 5.3 gives it, writes the PDF and `.txt` into a `mkdtemp` directory, and fails on any stderr line other than "Running in reference mode.", a warning's indented echo, and the two allowed warnings **only where they are expected**: `Unknown chord` (and its `No chord diagram defined for` summary) for a chord the fixture's chart holds with `isGap` true, and `Song is missing {key} directive` for a chart with no `key:`. It also fails when a chord `isGap` calls a gap does NOT warn, so the rules never go stale.
- [ ] **Step 4: Settle the gap rules against the reference.** Write `spellings.chart.md`: grid sections holding every spelling of spec 4.7's two tables and its gap list, and run the export's spelling through the reference (a temporary driver is fine until Task 4 writes grids: put the spellings in a hand-made `.cho`). Correct `isGap` and the spec's 4.7 lists where the reference disagrees, and say which in the report. Then answer, with the reference's own output: **does a `{define}` for a gap chord quiet its "Unknown chord" warning?** (Task 5 depends on the answer.)
- [ ] **Step 5: Gates** (as Task 1) plus `bun scripts/chordpro-check.ts; echo "exit $?"`.
- [ ] **Step 6: Commit.** `feat(lyricsheet): chord spellings a ChordPro reader knows, and the reference check`

### Task 3: Lyric sections

**Files:**
- Create: `packages/lyricsheet/src/export/{plan.ts,merge.ts,lyrics.ts}`, `tests/{plan.test.ts,merge.test.ts,lyrics.test.ts,yardstick.ts}`, fixtures `verses`, `chorus-recall`, `stacked`, `parts`, `marks`, `changes` (`.chart.md` + `.cho` each)
- Modify: `src/export/index.ts`, `src/export/types.ts` (loss codes), `README.md` (the losses table begins)

**Interfaces:**
- Consumes: Task 1's `Out`, `Losses`, `directive`; Task 2's `spelled`, `isGap`; from `barmark`: `PlayedBar`, `SectionOccurrence`, `Slot`, `PlayedLyrics`, `PlayedSyllable`, `Words`, `Line`, `memberShares`, `DeclaredPart`.
- Produces:
  ```ts
  // src/export/plan.ts
  export type Occurrence = { name: string | null; bars: PlayedBar[]; sung: boolean; replay: boolean; verse: number | null };
  /** The played bars as section occurrences in play order; bars before the first heading are one unnamed occurrence. */
  export function occurrences(parse: ChartParse): Occurrence[];
  // src/export/merge.ts
  export type Piece = { at: number; chord: string } | { at: number; syllable: Syllable };   // at: whole notes from the line's start
  /** One written line's chords and sung syllables as a ChordPro lyric line (spec 4.2). */
  export function lyricLine(pieces: Piece[]): string;
  // src/export/lyrics.ts
  export function lyricSection(o: Occurrence, out: Out, context: { previous: Occurrence[] }): void;
  ```
  Task 4 adds `gridSection(o, out)` beside it and the exporter calls one or the other by `o.sung`.
- [ ] **Step 1: Write the failing tests.**
  - `merge.test.ts`, spec 4.2's example and rules, exact strings: `[G]Down by the [C]river [G]waiting [D]`; a chord that attacks with a word's later syllable goes inside the word (`wait[D]ing`); a chord that attacks where no syllable starts stands alone in time order, with a space after it and one before it when it falls between words (`waiting [D] for`, and `[D] Down` before a line's first word); **a chord that attacks between two syllables of one word** (over a held syllable) cannot stand alone without splitting the word, so it is written before the word's next syllable (`wait[D]ing`) and counted once in a `chord-moved` loss (a design call the spec leaves open: say so in a comment); Review Focus 1's other cases (after the last word; a bar with no words between sung bars: `[G] [C] [D]`, single spaces); a tie puts the chord first; an elision `~` is a space; a held syllable (`/`) writes nothing.
  - `plan.test.ts`: occurrences for a chart with `|: … :|` whose passes sing verses 1 and 2 (two occurrences, `verse` 1 and 2); a `D.S.` return; a `->` cut; a replayed chorus (`replay: true`); bars before the first heading; a section with words only on pass 2 (pass 1 `sung: false`).
  - `lyrics.test.ts`, each against its golden file and with pointed assertions: section names (spec 4.6: Verse/Chorus/Bridge → their environments, anything else sung → `start_of_verse`, the label always the heading as written); a replayed chorus with the same words → `{chorus}`, with new words → written out; stacked verses → one pass per verse and the `stacked-verses` loss; spec 4.3's "In lyric lines" column row by row (`[*N.C.]`, `[*Stop]`, `[*?]`, a note set `[*C E F# B]`, a voicing's name, `[*solo]`, `[*@B]`, a fermata `[*…]`, pushes and accents unmarked with their loss); a key, time or tempo change mid-chart written where it happens; a rit. and a swing feel as `{comment: …}`; text lines as `{comment: …}`; parts (spec 4.4) with and without `part`, and the `other-parts` loss; Review Focus 2 (**the rule: in lyrics, `[` and `]` are written as `(` and `)`, `{` and `}` as `(` and `)`, a `#` that would start a line gets a space before it, and each such line adds to one `text-changed` loss; ChordPro has no escape**) and Review Focus 5.
  - `yardstick.ts` + a test over the corpus: for every chart with words, per occurrence in play order, the chords and sung words read back from the output by `readCho` equal the yardstick computed from `parseChart` alone (words: `PlayedBar.lyrics` syllables joined; chords: each attack's `spelled` name); every `[chord]` that is not an annotation parses with `parseChord` to the attack's chord; environments balance.
- [ ] **Step 2: Run; save the failing output.**
- [ ] **Step 3: Implement.** `occurrences` from `parse.sections` (`firstBar..lastBar` are `PlayedBar.index` ranges; `replayOf`) and, inside an occurrence, a pass boundary where `PlayedBar.written` falls back; `verse` from `lyrics[].verse`. Slot attack times with `memberShares` (whole notes, the unit of `PlayedSyllable.at`; compare with a tolerance of 1e-9, as `packages/musicxml/src/lyrics.ts:30` does). One ChordPro line per written bar line: group an occurrence's bars by `PlayedBar.line`. The harmony is the chosen part's first line; the lyrics are the singer's (`DeclaredPart.sings`, `PlayedLyrics.part`; a melody line's syllables arrive in `lyrics` like a row's).
- [ ] **Step 4: Goldens.** Write each fixture's `.cho` by running the export, read it against the spec, run `bun scripts/chordpro-check.ts`, and commit them only clean.
- [ ] **Step 5: Gates** (as Task 2).
- [ ] **Step 6: Commit.** `feat(lyricsheet): sung sections as ChordPro lyric lines`

### Task 4: Grids

**Files:**
- Create: `packages/lyricsheet/src/export/grid.ts`, `tests/grid.test.ts`, fixtures `grid-cells`, `grid-repeats`, `grid-meters` (`.chart.md` + `.cho`), and goldens for `examples/peaceful-dreams.chart.md` and the grammar's "At a glance" (`AT_A_GLANCE` in `packages/barmark/tests/chart/fixtures.ts`)
- Modify: `src/export/index.ts`, `types.ts`, `README.md`

**Interfaces:**
- Consumes: Task 3's `Occurrence`; `Line` (`opens`, `closes`, `repeat`, `ending`, `continues`) from `parse.lines`.
- Produces: `export function gridSection(o: Occurrence, out: Out, lines: Line[]): void;`
- [ ] **Step 1: Write the failing tests** (exact text, then goldens): spec 4.3's "In a grid" column row by row (a hold `.`, a repeated name `/`, `%`, `N.C.`, `*Stop`, `*?`, a note set as an annotation cell, a finer slot or a group as `C~G` in its beat's cell, words as right-margin text, `@B` as left-margin text, a fermata cell); the `shape` (`{start_of_grid: label="Intro" shape="1+4x4+1"}`: the meter's beats by the line's bar count, a margin cell each side; the unnamed section has no label); an occurrence that plays its written bars straight through keeps `|:`, `:|`, voltas `|1` `|2` and `x N` as right-margin text; one a jump or `->` cuts short is written as played, with no repeat signs; an open repeat `x ...` once, then `{comment: repeat ad lib.}`; Review Focus 4 (a pickup, a one-bar meter, a meter change: each bar's cell count is its own); 6/8 and 12/8 (cells are the bar's beats: say in a comment which beats, from `beatsOf`); and over the corpus, for every occurrence with no words, the chords read back from the grid by `readCho` (expanding `/`, `%` and repeats) equal the yardstick's attacks.
  **"Straight through"** is decided so: the occurrence's bars, grouped by written line in order, are exactly the section's written bar lines, each played its full count (its `repeat` or its `|: :|` passes with its endings), with no line missing and none partial. Anything else is "cut".
- [ ] **Step 2: Run; save the failing output.**
- [ ] **Step 3: Implement.** A cell per beat; a chord that attacks between beats shares its beat's cell with `~`. Keep `grid.ts`'s functions under Fallow's thresholds: one for a bar's cells, one for a line, one for the section.
- [ ] **Step 4: Goldens**, each through `bun scripts/chordpro-check.ts` (the reference warns "No margin cell for trailing comment" when an `x2` has no right margin: the `shape` must give one).
- [ ] **Step 5: Gates** (as Task 2).
- [ ] **Step 6: Commit.** `feat(lyricsheet): sections with no words as ChordPro grids`

### Task 5: Chord shapes, scale and the README

**Files:**
- Create: `packages/lyricsheet/src/export/defines.ts`, `tests/{defines.test.ts,export-scale.test.ts,corpus.test.ts}`, fixture `defines` (`.chart.md` + `.cho`), goldens for `examples/shenandoah.chart.md` and `examples/morning-song.chart.md`
- Modify: `src/export/index.ts`, `README.md`, `CHANGELOG.md`

**Interfaces:**
- Consumes: `shapeFor`, `Shape` from `@barmark/fretboard`; Task 2's `spelled`.
- Produces: `export function defineLines(chords: { chord: ChordRecord; voicing: ChordRecord | null }[]): string[];` and `diagrams` honoured by `exportLyricsheet`.
- [ ] **Step 1: Write the failing tests.** `{define: Am base-fret 1 frets x 0 2 2 1 0}` for `Am`; frets relative to `base-fret` (`Shape.frets` are absolute, `-1` muted, `0` open: `f < 0 ? "x" : f === 0 ? 0 : f - base + 1`); a shape up the neck (`F#m7(b5)`: its `base`); the name is `spelled(chord)` so `[Am7b5]` and its define match; one define per distinct name, in first-written order, after the header and before the first section; a written voicing that fits defines the voicing's shape under the chord's name **only when every use of that name in the chart writes the same voicing** (ChordPro has one shape per name): otherwise the name's own shape, and one `voicing` loss; note sets, `N.C.`, `?`, single notes and chords with no playable shape get no define; without `diagrams`, the output is byte-identical to before this task; a define for every chord the body writes and for none it does not (compare the set of `[chord]` and grid-cell names with the set of defined names, over the corpus). `export-scale.test.ts` in `packages/midi/tests/export-scale.test.ts`'s form (warm up, best of three, a 1,000-bar chart against a 100-bar one, ratio under 20, with and without words and with `diagrams`). `corpus.test.ts`: every corpus chart exports `ok` or is refused for a diagnostic the chart really has; the output is well formed (every directive name is one this package writes, listed once in the test; environments balanced; no line has trailing space; ends with one newline).
- [ ] **Step 2: Run; save the failing output.**
- [ ] **Step 3: Implement.** If Task 2 found that a define quiets "Unknown chord", `isGap` losses are not reported for a chord that got a define, and `scripts/chordpro-check.ts` expects no warning for it; if it found the opposite, nothing changes: say which in the README.
- [ ] **Step 4: The README:** what it writes (ChordPro, in prose), the API, one example in and out (run it), the losses table (every `LyricsheetLossCode` with what is lost and why), the known gaps, how it is checked. `CHANGELOG.md` `[Unreleased]`: the first release's entry.
- [ ] **Step 5: Gates** (as Task 2), then `bun test; echo "exit $?"` (the whole suite: about ten minutes).
- [ ] **Step 6: Commit.** `feat(lyricsheet): chord shapes as defines, scale and corpus tests, the README`

### Task 6: The CLI and the release's wiring

**Files:**
- Modify: `packages/cli/package.json` (`"@barmark/lyricsheet": "workspace:*"`), `bun.lock`, `packages/cli/src/{export.ts,help.ts,io.ts,binary.ts,node-io.ts,main.ts}`, `packages/cli/tests/{export.test.ts,main.test.ts,node.test.ts,binary.test.ts,io.ts}`, `scripts/smoke-cli.mjs`, `packages/cli/{README.md,CHANGELOG.md}`, `scripts/verify-release.ts` (`RELEASED_CODE`: `lyricsheet: ["src"]`), `.github/workflows/release.yml` (the CLI's `for dep in …` loop), `RELEASING.md`, `CLAUDE.md`, `.claude/skills/release/SKILL.md`, `site/bunfig.toml` (`minimumReleaseAgeExcludes`)

**Interfaces:**
- Consumes: `exportLyricsheet`, `LyricsheetLoss`.
- Produces: `barmark export --lyricsheet <file> [--out <file>] [--part <label>] [--diagrams guitar]`.
- [ ] **Step 1: Write the failing tests** in `packages/cli/tests/export.test.ts`'s form: `--lyricsheet` writes to stdout exactly `exportLyricsheet(text, { title }).text` and to `--out`; `--part`; `--diagrams guitar` (and `--diagrams ukulele` → the usage error `--diagrams must be guitar, not "ukulele"`; `--diagrams` with `--musicxml` or `--midi` → `--diagrams goes with --lyricsheet`); losses print as MIDI's do (`file: bar N: warning: …`); a chart with errors prints its diagnostics (with their suggestions) and "not written", exit 1; `formatOf`'s usage errors name three formats ("give one format: --musicxml, --midi or --lyricsheet"); `--version` lists `@barmark/lyricsheet` (update the four tests and the smoke script's pattern that pin that line); the help text; `packages/cli/tests/release-wiring.test.ts` passes once both lists have `lyricsheet`.
- [ ] **Step 2: Run; save the failing output.**
- [ ] **Step 3: Implement**, then the documents: `RELEASING.md` (the count of packages, the table, the tag ruleset list, the caret dependants of `barmark` and of `@barmark/fretboard`, a paragraph for lyricsheet, the `<pkg>` lists, step 12's dev dependencies, step 13's triggers and `src` folders, the first-release checklist); `CLAUDE.md` (the layout entry: the stages, the tests, the VM script; the scripts' package list; the working agreement's tags and the dependency paragraph: a lyricsheet release is followed by a CLI release; after a `barmark` or `fretboard` minor a lyricsheet patch raises the dependency); the release skill; `site/bunfig.toml`.
- [ ] **Step 4: Gates:** `bun test; echo "exit $?"`, `bun run check; echo "exit $?"`, `bun run fallow; echo "exit $?"`, `bun run verify:package lyricsheet; echo "exit $?"`, `bun run verify:package cli; echo "exit $?"`, `bun scripts/chordpro-check.ts; echo "exit $?"`.
- [ ] **Step 5: Commit.** `feat(cli): export --lyricsheet` and `build: lyricsheet among the packages`

---

## After the plan

1. Kevin's one-time steps for `@barmark/lyricsheet` (spec section 3): the npm placeholder, the trusted publisher, the tag ruleset and `npm` environment rules, and `package (20|22|24, lyricsheet)` among main's required checks.
2. Release: with the delta spellings' `barmark` minor first if it has not shipped (then every caret dependant's patch), `@barmark/lyricsheet` 0.1.0, the CLI minor, `kevinpeckham/songs`, and the site (pins, a Get Started line).
