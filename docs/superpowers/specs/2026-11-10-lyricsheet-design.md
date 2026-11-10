# Lyric sheets (ChordPro import and export): design

Status: draft for Kevin (2026-11-10). Asked for by Kevin on 2026-11-10.
Calls marked **(design call)** are Claude's, each with its reason, and
open to correction; section 8 lists the questions only Kevin can answer.
No grammar change: Kevin ruled on 2026-11-01 that ChordPro inline chords
are not planned as barmark syntax (grammar, "Open questions"), because
barmark places chords in bars, not over words. This package converts; it
never adds syntax.

## 1. Intent

ChordPro is the plain-text format most songbook apps, worship tools and
guitar sites read and write: lyrics with chords in brackets before the
syllable they fall on (`[G]Down by the [C]river`), and directives in
braces (`{title: …}`, `{start_of_chorus}`). A barmark user wants to:

- **give** a chart to someone whose app reads ChordPro (export), and
- **start** a chart from a ChordPro file they already have (import),
  knowing what the import guessed, because ChordPro has no bars.

## 2. The name

Kevin's rule: no "chordpro" in the package name, its exports or the
CLI's flags, so we never look like squatters on the ChordPro project's
name or get confused with its packages. (We did the same for Verovio:
the engraving package is `@barmark/score`, not `@barmark/verovio`; the
brief called it `@barmark/engraver`, but no package has that name.) The
README and docs may say plainly that the package reads and writes
ChordPro.

Checked on npm on 2026-11-10 (`npm view`; weekly downloads from the npm
API):

| Name | Scoped name free? | Unscoped neighbour | Verdict |
|---|---|---|---|
| **`@barmark/lyricsheet`** | free | `lyricsheet`: free; `lyric-sheet`: free | **Recommended.** No ChordPro library or rival format uses the word. "Lyric sheet" describes what most exports are: words with chords on them. The downside is small: the term can mean words alone, and a chart with no lyrics exports as a ChordPro grid. |
| `@barmark/songsheet` | free | `songsheet` 7.8.0, about 30 downloads a week: a parser for its *own* plain-text "Songsheet Format" (chords above lyrics) | The most natural word, but it is another chord-over-lyrics format's name, which is exactly the confusion we are avoiding. |
| `@barmark/chordsheet` | free | `chordsheetjs` 18.0.0, about 5,600 downloads a week: ChordSheetJS, the best-known JavaScript **ChordPro** library; also `chordsheet` (markdown with chords, about 2 a week) | Accurate, but `@barmark/chordsheet` reads like barmark's ChordSheetJS. That is the worst clash of the three. |

The fallback if Kevin wants none of these is `@barmark/chordlyrics`, which
is free both scoped and unscoped.

**CLI (design call).** The CLI names a format with a boolean flag of its
own (`barmark export --musicxml`, `--midi`), not with `--to <format>`.
`--to lyricsheet` would work, but it would be the only format chosen
that way, so the flag is **`barmark export --lyricsheet`**. Import
already picks the reader from the file's extension (`.mid` and `.midi`,
`.mxl`, otherwise MusicXML). Reading `.cho`, `.crd`, `.chopro`, `.chord`,
`.pro` and `.chordpro` (the extensions chordpro.org lists, plus
`.chordpro`) as ChordPro is acceptable: an extension is the format's own
fact, not a name we claim. **`barmark import --lyricsheet <file>`**
forces the format for any other extension, such as `.txt`.

## 3. Package shape

```
packages/lyricsheet/            @barmark/lyricsheet
  package.json                  deps: barmark (workspace:^) only
  README.md  CHANGELOG.md
  src/index.ts                  exportLyricsheet, importLyricsheet, decodeLyricsheetBytes, VERSION, types
  src/version.ts
  src/export/                   one module per stage
    index.ts                    parse, choose the part, plan, write; never throws
    plan.ts                     section occurrences in play order → lyric or grid blocks
    merge.ts                    one line's chords and syllables merged by time
    grid.ts                     bars → grid cells and bar symbols
    spell.ts                    barmark chord → the spelling ChordPro readers know
    meta.ts                     title, credits, key/time/tempo, text lines
    losses.ts                   grouped losses, as @barmark/musicxml's Losses
  src/import/
    index.ts                    run the stages; never throws (catch → "importer bug")
    text.ts                     bytes/BOM/CRLF, lines with numbers, #-comments
    directives.ts               {name: value}, short forms, label="", selectors
    songs.ts                    {new_song} splitting
    sections.ts                 environments → sections, {chorus} recall, replays
    lines.ts                    a lyric line → bars and a lyric row
    grid.ts                     a grid line → bar line, endings, x N
    chords.ts                   chord names → barmark slots; unreadable → ?
    meta.ts                     metadata → title, credits, directives, text
    write.ts                    assemble, printChart, re-parse self-check
  tests/                        bun test; fixtures/ *.cho with expected *.chart.md
```

- **Dependencies (design call): `barmark` alone, with a caret
  (`workspace:^`), as `@barmark/musicxml` has.** ChordPro is line-based
  text, and a hand-written reader is small. A parser dependency would
  bring in a second chord grammar that disagrees with Appendix A.
- **API (design call)**, shaped like the two existing converters:
  - `exportLyricsheet(chart, { part?, title? })` returns
    `{ ok: true; text; diagnostics: ChartDiagnostic[]; losses: LyricsheetLoss[] }`,
    or `{ ok: false; diagnostics }` when the chart has errors.
  - A `LyricsheetLoss` is `{ code; message; bar?; written? }`, as
    `MidiLoss` is, and losses are grouped per code.
  - `importLyricsheet(text, { instrument?, song? })` returns
    `{ text; diagnostics: LyricsheetImportDiagnostic[] }`.
  - A `LyricsheetImportDiagnostic` is
    `{ severity: "error" | "warning"; message; line?; token? }`, where
    `line` is the ChordPro source line.
  - `decodeLyricsheetBytes(bytes)` mirrors `decodeXmlBytes`.
  - No export, type or option says "chordpro".
- **CLI.**
  - `export.ts` gains `--lyricsheet`, which writes to stdout or `--out`
    and takes `--part`. Losses print as MIDI's do
    (`file: bar N: warning: …`).
  - `import.ts` gains the extensions above and `--lyricsheet`.
    Diagnostics print as `file:line: severity: message`.
  - `@barmark/cli` pins the new package exactly, and its binaries bundle
    it.
- **Repository work in the building PR:**
  - `tsconfig.json` paths;
  - the CI `package (N, lyricsheet)` matrix entries;
  - `verify-package.ts` and `verify-release.ts`, including the CLI's list
    of bundled `src` directories;
  - RELEASING.md's tables and step 13;
  - CLAUDE.md's layout;
  - the `/release` skill's package list and the Swamp `pkg` input.
- **barmark.dev: deferred.** Later, the site could get a Get Started line
  (`barmark export --lyricsheet`) and perhaps a "Copy as ChordPro"
  button. The site installs from npm, so either change follows the first
  release.

**Kevin's one-time npm steps** (RELEASING.md "A new package's first
release"; listed here, not done):

1. Publish placeholder `@barmark/lyricsheet@0.0.0` (and `0.0.0-stage`, as
   for sync and midi) from his Mac, after `npm whoami`.
2. On npmjs.com, set the trusted publisher: GitHub Actions,
   `kevinpeckham/barmark`, `release.yml`, environment `npm`. Then require
   2FA and disallow tokens.
3. Add `lyricsheet-v*` to the "release tags" ruleset. Add
   `package (20, lyricsheet)`, `package (22, lyricsheet)` and
   `package (24, lyricsheet)` to the "main" ruleset's required checks.
4. Add a `lyricsheet-v*` tag rule to the `npm` environment.

## 4. Export: barmark → ChordPro

The export reads `parseChart`'s played bars (`PlayedBar`, with `line`,
`section`, `slots`, `words` and `lyrics`), so `%`, replays and repeats
are already resolved. A chart with errors is not exported, as for
MusicXML and MIDI.

**4.1 Lyric lines or a grid (design call).**

- A section occurrence in which any bar sings words becomes a lyric
  environment. In it:
  - each written bar line (or system) is one ChordPro line;
  - a bar line with no words becomes a chord-only line (`[G] [C] [D]`).
- A section occurrence with no words becomes `{start_of_grid}`. The grid
  is the one ChordPro construct with bars, so a chart with no lyrics
  loses almost nothing.

Environments cannot nest, so the choice is made per section, not per
line.

**4.2 Chords over syllables (design call).** On each line, the chords'
attacks and the sung syllables (`PlayedSyllable.at`) are merged by time:

- A chord that attacks where a syllable starts goes directly before that
  syllable, as `[C]riv`.
- A chord that attacks where no syllable starts goes in its time order,
  written as a standalone chord with a space after it, and before it too
  when it falls between words (`waiting [D]`). This happens over a held
  syllable, a breath, or a bar with no words.
- On a tie, the chord comes first.
- Syllables that continue a word (`riv-`) join with no hyphen and no
  space; other syllables are separated by a space; an elision (`~`)
  becomes a space.

ChordPro keeps order, not duration, so this rule is exact about order
and drops nothing but timing. Example:

```
key: G
## Verse
        | G             | C       | G         | D |
lyrics: | Down / by the | riv- er | wait- ing | / |
```

```
{key: G}
{start_of_verse: label="Verse"}
[G]Down by the [C]river [G]waiting [D]
{end_of_verse}
```

Reason: placing a chord before the syllable it lands on is what ChordPro
means, and a chord that lands on no syllable must neither move nor
claim a syllable.

**4.3 Slots and symbols (design call).** The table gives each symbol in
lyric lines and in a grid. The cells of a grid bar are its beats.

| barmark | In lyric lines | In a grid | Lost |
|---|---|---|---|
| several slots | one chord per attack, in time order | one cell per beat; a finer slot or a group as `C~G` in its beat's cell | lyric lines: positions in the bar |
| `/` hold | nothing written | `.` | — |
| repeated name (`G G`) | `[G]` again | `/` (ChordPro: play here) | — |
| `%` | the copied chords | `%` | — |
| `N.C.` | `[*N.C.]` (an annotation, printed as text) | `N.C.` cell | — |
| `--` | `[*Stop]` | a `Stop` cell (the reference check, 6, confirms readers print `N.C.`, `Stop` and `?` cells as text) | the stop is text |
| `?` | `[*?]` | `?` | — |
| note set `{E}` | `[*E]`, `[*C E F# B]`: the notes as text | the same | not a chord to readers; octaves, `!` |
| voicing `Cmaj7{…}` | `[Cmaj7]` | `Cmaj7` | the voicing |
| push, accent, hit, pedal | the chord, unmarked | the same | the mark |
| words `"solo"` | `[*solo]` at their slot | right-margin text | — |
| rehearsal mark `@B` | `[*@B]` | left-margin text `@B` | — |
| one-bar meter | the bar's chords | the bar's own cell count | lyric lines: the meter |
| `...` fermata | `[*…]` | `…` cell | duration |

Each "Lost" is reported once per code, naming the bars. Reason: an
annotation (`[*…]`) is printed as text and never transposed or given a
diagram, so a reader never mistakes `N.C.`, a stop or a note for a
chord.

**4.4 Several parts (design call).**

- The export writes one part's harmony: the `--part` named, else the
  first declared part that writes chord symbols. Other parts are a
  single loss.
- Part lines (7.6) other than the first are dropped; only their sung
  syllables are used.
- Lyrics are the singer's (grammar 7.7, "Who sings").

Reason: ChordPro has one chord line per lyric line. `@barmark/musicxml`
and `@barmark/midi` take the same `--part`.

**4.5 Repeats, endings, jumps and `x2` (design call): played order, by
section occurrence.**

- ChordPro is read top to bottom, and each verse's words are different,
  so the lyric environments are written in played order. A `|: :|` whose
  passes sing verses 1 and 2 becomes two passes of lines; a D.S. is
  unfolded; `->` cuts as played.
- A grid occurrence that plays its written bars straight through keeps
  its `|:`, `:|`, voltas (`|1`, `|2`) and `x N` (as right-margin text).
  A grid occurrence that a jump or `->` cuts short is written as played.
- A replayed chorus that sings the same words as the chorus before it
  becomes `{chorus}`, ChordPro's recall. Any other replay is written out,
  because ChordPro recalls choruses only.
- An open repeat (`x ...`) is written once, followed by
  `{comment: repeat ad lib.}`.
- Stacked verses on bars that play once (7.7) are written as one pass
  per verse. This is reported as a loss, since ChordPro has no stacking.

Reason: a ChordPro reader has no repeat semantics outside grids, and
written order would print verse 2's words nowhere.

**4.6 Sections and directives (design call).**

- **Section names.** A heading whose first word is Verse, Chorus or
  Bridge (any case) maps to `sov`, `soc` or `sob`. Any other sung
  section maps to `start_of_verse`. In every case the label is the
  heading as written: `{start_of_verse: label="Intro"}`.
- **Unsung sections and the unnamed section.** A section with no words
  becomes `{start_of_grid: label="Intro" shape="4x4"}`, whose shape is
  the meter's beats by the line's bar count. The unnamed section gets no
  label.
- **Title and credits.** `# Title` maps to `{title}`. `composer:`,
  `lyricist:` and `copyright:` map to their own directives. `arranger:`
  maps to `{meta: arranger …}`.
- **Key, time and tempo.**
  - `key:` maps to `{key: D}` or `{key: Bm}`. A church mode is left out,
    and that is a loss.
  - `time:` maps to `{time: 6/8}`, and `tempo:` to `{tempo: 145}`.
  - A change mid-chart is written where it happens, because ChordPro
    applies each key and time "from where it was specified".
  - A rit., an accel. or a non-straight feel becomes `{comment: …}`.
- **Text lines** become `{comment: …}`. `part:` lines are dropped.

**4.7 Chord spelling (design call).** barmark's canonical spellings,
except where ChordPro's built-in chord list writes the same chord as
another barmark **alias**:

| barmark canonical | Written as |
|---|---|
| `m7(b5)` | `m7b5` |
| `7(b9)` | `7b9` |
| `(9)` | `add9` |
| `mmaj7` | `m(maj7)` |

Use ASCII `#` and `b` only. A test checks that every exported spelling
parses back in barmark to the same chord. A symbol with no ChordPro form
(`7(b9,#11)`, `(no3)`) is written canonically, and the reference
implementation's check (7.3) lists which ones it cannot read. Reason:
what is read must be the chord we meant, both in a ChordPro reader and
back in barmark.

## 5. Import: ChordPro → barmark

**5.1 Bars (design call): (a) and (b), with (c)'s honesty. Grids are
read exactly; lyric lines get inferred bars, one per chord, with a
warning.**

- A `{start_of_grid}` gives bars, cells and repeats exactly:
  - `.` becomes `/`, `/` repeats the chord, and `C~G` becomes `C_G`;
  - `%` stays `%`, and `%%` is written out as its two bars;
  - `|:`, `:|` and `:|:` become repeats. A volta `|2` starts an ending
    bar line, so a grid line is split there;
  - right-margin `x3` becomes `x3`; other margin text becomes a text
    line.
- A lyric line becomes one bar line with **one bar per chord**, in
  order. The file holds nothing else to go on.
  - Each section with inferred bars warns once: "bars inferred, one per
    chord change: check bar lengths", naming the source lines.
  - Words before a line's first chord get a leading bar: `/`, holding
    the chord before. At the song's start, where `/` would have nothing
    to hold, it is `N.C.`.
- Rejected:
  - Refusing lyric lines without a grid ((a) alone). Almost no ChordPro
    file has grids, so the import would refuse nearly every file.
  - A `?` meter ((b)'s alternative). barmark has no unknown meter, and
    adding one would be a grammar change.
  - Bars entirely of `?`. That would discard the chords the file does
    give.

The chart is a draft that parses. The warning says exactly what was
guessed.

**5.2 Lyrics and inline chords (design call).**

- **One row per line.** Each lyric line that has words gets a `lyrics:`
  row under its bar line.
- **A bar's words.** Bar *i*'s cell holds the words sung from chord *i*
  up to chord *i+1*:
  - one word is one syllable;
  - several words are one slot divided with `_` (`Down_by_the`).
    Durations are unknown, and a `_` group never triggers the
    uneven-slot warning that a slot count of 3 in 4/4 would;
  - a word split by a chord (`riv[C]er`) gives `riv-` (the word
    continues), then `er`.
- **A chord with no words.** Its cell is `/`, holding the last word, as
  a trailing chord is usually read. Before anything has been sung in the
  verse, the cell is `--`.
- **Characters a syllable can't hold.** Straight quotes become curly
  quotes. `{` `}` `_` `|` become `(` `)` `‿` `¦`. One warning is given.
- **Chord-only lines** get no row.
- **Lyrics-only lines** (no chords) become text lines. When their
  environment has the name of an earlier one, its heading is a replay
  (grammar 6: "a section holding only lyrics … replays the changes").

Reason: this is the most the file says. Barmark's own export joins
syllables into words, and the words come back intact.

**5.3 Environments and `{chorus}` (design call).**

- **Section names.** `sov`, `soc`, `sob` and custom `start_of_xxx` each
  become a `## ` heading with the label, else Verse, Chorus, Bridge, or
  Xxx. Both `{sov: Verse 1}` and `label="Verse 1"` are read.
- **Grids** are sections too, named by their label.
- **Lines outside any environment** belong to the unnamed section, or to
  the section before.
- **Replays.** A section whose chords and line shapes match an earlier
  section of the same name is written as a replay, with its words as
  `lyrics:` rows. This is the MusicXML import's rule (its call 4).
- **`{chorus}`** becomes `## <the recalled chorus's name>`, a replay. A
  label (`{chorus: Final}`) becomes a text line under it.
- **`{chorus}` with no chorus before it** becomes a text line and a
  warning.

Reason: barmark's replay is exactly ChordPro's recall, by name and
looking backward.

**5.4 Chord names (Kevin's ruling, 2026-11-10).** Each bracketed name is
read with `parseChord`:

- **Readable names.** Aliases are canonicalised, so `Am7b5` prints as
  `Am7(b5)`.
- **Unreadable names.** A name barmark cannot read keeps its bar as
  unknown harmony with its text: `"H7" ?`. It also stays an **error**
  diagnostic with the line and token, and carries barmark's suggestion
  where there is one: `CM7` suggests `Cmaj7` or `C`, and `H` suggests
  `B`.
  - The importer never applies a suggestion itself (design call). `C2`
    and `CM` are rejected because they are ambiguous, and guessing would
    change the chord.
  - Nashville and Roman-numeral names are unreadable in 0.1.0.
- **Special cases (design call).**
  - A lowercase root alone (`[d]`), which ChordPro reads as a note,
    becomes the note set `{D}`.
  - `[N.C.]`, `[NC]` and `[*N.C.]` become `N.C.`.
  - `[*Stop]` becomes `--`, and `[*?]` becomes `?`.
  - `[*@B]` becomes the rehearsal mark `@B`.
  - Any other `[*text]` becomes words on the bar, `"text"`.
- **The CLI with an import error (design call).** The chart is still
  written, so the person can fix it, but the exit status is 1. This
  differs from MusicXML import, whose errors all mean nothing was
  imported.

**5.5 Everything else (design call).**

| ChordPro | barmark | Diagnostic |
|---|---|---|
| `{title}`/`{t}`, `{meta: title …}` | `# Title` (the first; later ones are text) | — |
| `{subtitle}`, `{artist}`, `{album}`, `{year}`, `{duration}`, `{tag}`, other `{meta}` | a text line, as `Artist: …` (barmark has no subtitle; Kevin, 2026-11-07) | — |
| `{composer}`, `{lyricist}`, `{copyright}`, `{meta: arranger …}` | credit lines | — |
| `{key}`, `{time}`, `{tempo}`, again mid-song | `key:`, `time:`, `tempo:` at that point; an unreadable value is a text line | warning |
| `{tempo}` in 6/8, 9/8 or 12/8 | written as is; barmark counts dotted quarters, and ChordPro doesn't say | warning |
| `{capo: N}` | Kevin's question 3; recommended: chords and key transposed up N semitones to sounding pitch (`transposeChart`), plus a text line `Capo N` | warning |
| `{transpose: N}` | applied to the chords after it, as ChordPro means | — |
| `{comment}`, `{c}`, `{ci}`, `{cb}`, `{highlight}` | a text line; one matching a feel or `rit.` the export wrote becomes that directive | — |
| `# comment` lines | dropped: ChordPro ignores them | — |
| `{define}`, `{chord}` | dropped: fingerings are not harmony | one warning |
| `{start_of_tab}`, `{start_of_abc}`, `{start_of_ly}`, `{start_of_textblock}` | text lines, each with a leading `\`, so a tab line starting with `\|` stays text | one warning per block |
| `{start_of_svg}` | dropped | warning |
| fonts, sizes, colours, `{new_page}`, `{columns}`, `{image}`, `x_` directives | ignored: layout, not music | — |
| `{new_song}` | only song 1 is imported, or `options.song`; the warning counts the songs | warning |
| a selector, `{key-guitar: …}`, `{start_of_verse-piano}` | applied when it matches `options.instrument`; a `!` inverts the match. With no instrument given, only `!`-selected directives apply | one warning listing the selectors skipped |
| unknown directive | a text line | warning |

**Unicode, BOM and line endings (design call).**

- A UTF-8 BOM is stripped.
- CRLF and CR become LF before lines are numbered.
- Text is NFC-normalised.
- `decodeLyricsheetBytes` reads UTF-8. Bytes that are not valid UTF-8
  are decoded as Windows-1252 with one warning, because older `.cho`
  files are often Latin-1.
- Control characters become U+FFFD, as the CLI already shows them.
- `♯` and `♭` in chord names are accepted, as barmark accepts them.

**Never throws.** Every stage reports into one diagnostics list. The
whole run is wrapped, as `importMusicXml` is, so a bug becomes an
"importer bug" error, not an exception. The result is always printed
with `printChart` and re-parsed. A parse error in our own output is
reported as an importer bug at the source line it came from.

## 6. Round trips

The `meaning` yardstick (`packages/barmark/tests/chart/fixtures.ts`)
compares title, part, sections, events, and per played bar the meter,
key, tempo, feel, section, slot timeline, mark and words. It does not
compare lyrics. The package adds a `sung` yardstick: per played bar and
verse, the syllables' text in order (from `PlayedBar.lyrics`), joined
into words.

| Direction | Promise | Not promised |
|---|---|---|
| barmark → ChordPro → barmark, chart without lyrics (all grids) | `meaning` holds except where a "Lost" row of 4.3 applies; the yardstick test skips charts with those features, as the MusicXML round trip skips rhythm figures | pushes, marks, note sets, voicings, modes, parts beyond one |
| barmark → ChordPro → barmark, chart with lyrics | the same chords in the same order and the same `sung` words per section occurrence, in played order | bar lengths and slot positions; repeats come back unfolded |
| ChordPro → barmark → ChordPro | **idempotent after one pass:** `export(import(x))` is equal to `export(import(export(import(x))))`, byte for byte; and against `x` itself, the same chords (canonically spelled) before the same words, and the same environments, labels and metadata | `#` comments, `{define}`, layout directives, selectors not applied, word spacing |
| barmark → ChordPro → barmark → ChordPro | the two ChordPro texts are identical | — |

**Fixtures (design call): we write them all.** No song text is copied,
copyrighted or not.

- **Examples.** The examples are Kevin's or traditional: Peaceful Dreams
  (grid-only), Morning Song (parts) and Shenandoah (a pickup and two
  verses). The grammar's "At a glance" is also used.
- **Hand-written ChordPro files** in `tests/fixtures/`, each with its
  expected `.chart.md`. Their lyrics are nonsense or ours. They cover:
  - every directive and abbreviation in 5.5;
  - a grid with voltas and `%%`;
  - `{chorus}` with and without a label, and with no chorus;
  - selectors;
  - `{new_song}`;
  - a capo and a transpose;
  - CRLF with a BOM, and a Windows-1252 file;
  - unreadable chords (`H7`, `CM7`, `C2`, `IV`);
  - tab and abc blocks.
- **A scale test.** A 1,000-line file imports in linear time, as
  `export-scale.test.ts` does. FINDINGS records two quadratic surprises.

**A reference implementation (design call): two checks, neither shipped
nor run on users' files.**

- **In CI: an independent parser,** as `@barmark/midi` reads its files
  back with `midi-file`. ChordSheetJS (`chordsheetjs`, pinned exactly as
  a devDependency) parses every exported fixture, and the test compares
  its chord and lyric pairs with ours. Note: it is GPL-2.0-only. A
  devDependency used only in tests is never distributed, but Kevin
  decides (question 7).
- **On the VM only, never in CI:** the reference Perl `chordpro` from
  CPAN (`App::Music::ChordPro`). It is not installed yet; `cpanm`
  installs it in `~/.local`.
  - `bun scripts/lyricsheet-reference.ts` runs it over every export and
    fails on any warning it prints (unknown chords, malformed
    directives).
  - It keeps its text and ChordPro backends' output for a person to
    compare, like the MuseScore and Dorico checks.
  - A spike confirms the exact backend flags.

## 7. Scope

**0.1.0:**

- Export: everything in section 4.
- Import: everything in section 5, with options `instrument` and `song`.
- The CLI flags.
- README sections "Exporting" and "Importing", each with its losses
  table.

**Later:**

- **Exact round trips** through `x_barmark` hint directives, which other
  readers ignore by ChordPro's rule. This would be like the MusicXML
  export's `<?barmark root?>`. See question 5.
- **Reading more than one song.** `--song N` is in 0.1.0; a whole
  songbook as several charts is later.
- **Nashville and Roman names, resolved against `{key}`,** if Kevin wants
  numerals as input, which is not planned as syntax.
- **A German `H` option.**
- **`{define}` to voicings.**
- **abc blocks through a real converter.**
- **Export options:** a capo (shapes, plus `{capo}`) and grid-only
  output.
- **The barmark.dev option.**
- **Plain "chords over words" text** (two-line, not ChordPro), which is
  a different reader.

**Risks:**

1. **Inferred bars are often wrong** where a bar holds two chords. This
   is mitigated by the warning per section, and grids are exact.
2. **ChordPro dialects** (SongSelect, Ultimate Guitar exports,
   OnSong extensions) put non-standard text in brackets. Unreadable
   chords are errors with the text kept, so nothing is lost, but some
   files will import with many errors.
3. **Readers differ** in what chord spellings they accept. 4.7 and the
   reference check reduce this; they don't remove it.
4. **The GPL test oracle** (question 7).
5. **Name collisions.** `lyricsheet` has none today. Kevin's placeholder
   publish reserves it.
6. **Complexity.** `plan.ts` and `sections.ts` will want to grow, so
   Fallow's thresholds shape them, one module per stage.

## 8. Questions for Kevin

1. **The name.** Recommended: `@barmark/lyricsheet` and
   `export --lyricsheet`. The alternatives are `@barmark/songsheet`
   (clashes with the unscoped `songsheet` format) and
   `@barmark/chordsheet` (reads as barmark's ChordSheetJS, a ChordPro
   library), with `@barmark/chordlyrics` as a fallback. All are free on
   npm today.
2. **Import by extension**, with `--lyricsheet` to force the format.
   Recommended: yes, including `.pro`, which other tools use too; the
   flag covers anything ambiguous.
3. **Capo on import.** Recommended: transpose to sounding pitch, because
   charts are always concert pitch (7.3), and keep a `Capo N` text line.
   The alternative keeps the chord shapes and makes the chart wrong by N
   semitones.
4. **Bars for lyric lines.** Recommended: one bar per chord, with a
   warning per section. The alternatives are refusing lyric lines
   outside grids, or proposing an unknown meter (a grammar change, which
   I don't recommend).
5. **Exact round trips** through hidden `x_barmark` directives (slot
   shapes per line). Recommended: not in 0.1.0. Ship the honest lossy
   export first, then decide whether invisible hints in someone's
   songbook file are welcome.
6. **Exit status of an import with unreadable chords.** Recommended:
   write the chart and exit 1, so CI notices and a person can still fix
   the draft.
7. **ChordSheetJS (GPL-2.0-only) as a test-only devDependency.**
   Recommended: yes. It is never bundled or published, and it is the
   only independent ChordPro parser that can run in CI. If not, only the
   VM Perl check runs.
8. **Release order.** Recommended: export and import together as 0.1.0,
   then the CLI minor, then songs, then the site line. The alternative is
   export first, since it is the simpler direction and ships about a
   week sooner.
