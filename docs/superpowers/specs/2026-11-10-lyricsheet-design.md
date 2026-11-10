# Lyric sheets (ChordPro export): design

Status: approved by Kevin (2026-11-10). Asked for by Kevin on 2026-11-10.
Kevin decided on 2026-11-10 that **phase 1 (0.1.0) is export only**;
import is phase 2, deferred, and is sketched in section 8 as notes, not
commitments. Calls marked **(design call)** are Claude's, each with its
reason; Kevin's decisions are marked as his, and section 9 records them.

No grammar change: Kevin ruled on 2026-11-01 that ChordPro inline chords
are not planned as barmark syntax (grammar, "Open questions"), because
barmark places chords in bars, not over words. This package converts; it
never adds syntax.

## 1. Intent

ChordPro is the plain-text format most songbook apps, worship tools and
guitar sites read and write: lyrics with chords in brackets before the
syllable they fall on (`[G]Down by the [C]river`), and directives in
braces (`{title: …}`, `{start_of_chorus}`). A barmark user wants to
**give** a chart to someone whose app reads ChordPro, knowing exactly
what the export could not carry.

## 2. The name

**Decided by Kevin (2026-11-10): `@barmark/lyricsheet`, with the CLI flag
`barmark export --lyricsheet`.**

Kevin's rule: no "chordpro" in the package name, its exports or the
CLI's flags, so we never look like squatters on the ChordPro project's
name or get confused with its packages. (We did the same for Verovio:
our trimmed Verovio build is `@barmark/engraver`, not `@barmark/verovio`;
its placeholder is on npm and the package is in review, PR #245.) The
README and docs may say plainly that the package writes ChordPro.

The names considered, checked on npm on 2026-11-10:

| Name | Unscoped neighbour | Why |
|---|---|---|
| **`@barmark/lyricsheet`** (chosen) | none (`lyricsheet` and `lyric-sheet` are free) | No ChordPro library or rival format uses the word. |
| `@barmark/songsheet` | `songsheet`, a parser for its own "Songsheet Format" (about 30 downloads a week) | It is another chord-over-lyrics format's name. |
| `@barmark/chordsheet` | `chordsheetjs`, ChordSheetJS, the best-known JavaScript ChordPro library (about 5,600 a week) | It reads like barmark's ChordSheetJS. |

The CLI names a format with a boolean flag of its own (`--musicxml`,
`--midi`), not with `--to <format>`, so the flag is `--lyricsheet`.

## 3. Package shape

```
packages/lyricsheet/            @barmark/lyricsheet
  package.json                  deps: barmark (workspace:^) only
  README.md  CHANGELOG.md
  src/index.ts                  exportLyricsheet, VERSION, types
  src/version.ts
  src/export/                   one module per stage
    index.ts                    parse, choose the part, plan, write; never throws
    plan.ts                     section occurrences in play order → lyric or grid blocks
    merge.ts                    one line's chords and syllables merged by time
    grid.ts                     bars → grid cells and bar symbols
    spell.ts                    barmark chord → the spelling ChordPro readers know
    meta.ts                     title, credits, key/time/tempo, text lines
    losses.ts                   grouped losses, as @barmark/musicxml's Losses
  tests/                        bun test; fixtures/ *.chart.md with golden *.cho
```

- **Dependencies (design call): `barmark` alone, with a caret
  (`workspace:^`), as `@barmark/musicxml` has.** Writing ChordPro needs
  nothing more.
- **API (design call)**, shaped like the MIDI export:
  - `exportLyricsheet(chart, { part?, title? })` returns
    `{ ok: true; text; diagnostics: ChartDiagnostic[]; losses: LyricsheetLoss[] }`,
    or `{ ok: false; diagnostics }` when the chart has errors.
  - A `LyricsheetLoss` is `{ code; message; bar?; written? }`, as
    `MidiLoss` is, grouped per code.
  - No export, type or option says "chordpro".
- **CLI.** `export.ts` gains `--lyricsheet`, which writes to stdout or
  `--out` and takes `--part`. Losses print as MIDI's do
  (`file: bar N: warning: …`). `barmark import` is unchanged in phase 1.
  `@barmark/cli` pins the new package exactly, and its binaries bundle
  it.
- **Repository work in the building PR:**
  - `tsconfig.json` paths;
  - the CI `package (N, lyricsheet)` matrix entries;
  - `verify-package.ts` and `verify-release.ts`, including the CLI's list
    of bundled `src` directories;
  - RELEASING.md's tables and step 13;
  - CLAUDE.md's layout;
  - the `/release` skill's package list and the Swamp `pkg` input.
- **barmark.dev: deferred.** Later, a Get Started line
  (`barmark export --lyricsheet`) and perhaps a "Copy as ChordPro"
  button, after the first release, since the site installs from npm.

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
| `--` | `[*Stop]` | `*Stop` (an annotation cell) | the stop is text |
| `?` | `[*?]` | `*?` | — |
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
chord. Checked with the reference `chordpro` 6.101.0 on 2026-11-10: a
bare `Stop` or `?` grid cell is an "Unknown chord" warning, while
`*Stop`, `*?` and `N.C.` cells print as text with no warning.

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
- **Decided by Kevin (2026-11-10):** stacked verses on bars that play
  once (7.7) are written as one pass per verse, each with its chords,
  and reported as a loss, since ChordPro has no stacking.

Reason: a ChordPro reader has no repeat semantics outside grids, and
written order would print verse 2's words nowhere.

**4.6 Sections and directives (design call).**

- **Section names.** A heading whose first word is Verse, Chorus or
  Bridge (any case) maps to `sov`, `soc` or `sob`. Any other sung
  section maps to `start_of_verse`. In every case the label is the
  heading as written: `{start_of_verse: label="Intro"}`.
- **Unsung sections and the unnamed section.** A section with no words
  becomes `{start_of_grid: label="Intro" shape="1+4x4+1"}`: the meter's
  beats by the line's bar count, with a margin cell on each side. The
  reference warns "No margin cell for trailing comment" when an `x2` is
  written in a grid with no right margin. The unnamed section gets no
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
except where the reference `chordpro` knows the same chord under another
barmark **alias**. Every spelling below was checked with `chordpro`
6.101.0 in strict mode on 2026-11-10: the canonical form warns and the
alias doesn't.

| barmark canonical | Written as |
|---|---|
| an alteration in parentheses after an extension: `7(b9)`, `7(#9)`, `7(#11)`, `7(b13)`, `7(b5)`, `13(b9)`, `7(b9,#11)` | without parentheses: `7b9`, `7#9`, `7#11`, `7b13`, `7b5`, `13b9`, `7b9#11` |
| `m7(b5)` | `m7b5` (the canonical form reads too; the alias is the usual spelling) |
| `(9)`, `(2)`, `(4)`, `(11)` on a triad | `add9`, `add2`, `add4`, `add11` |

`mmaj7`, `m(maj7)`, `6/9`, `7alt`, `sus2`, `sus4`, `7sus4`, `5`,
`dim7`, `aug7` and most slash chords are known as written.

What the reference doesn't know in any spelling is written canonically
and is a **known gap**:

- a tone with no extension (`C(b13)`);
- `5(7)`;
- omissions (`(no3)`, `(no5)`);
- `9sus4` and `7sus2`;
- the roots `Cb` and `E#`;
- some slash chords whose bass isn't a chord tone (`C/F#` and `C/Db`
  warn, though `D/F#`, `C/E` and `C/Bb` don't).

Use ASCII `#` and `b` only. Reason: what is read must be the chord we
meant, both in a ChordPro reader and back in barmark. Section 5 says how
both are checked.

## 5. Proving the export right

Phase 1 has no importer, so a round trip back to barmark is not
available. **Decided by Kevin (2026-11-10):** no ChordSheetJS. CI runs
golden files and our own checks. The independent check is ChordPro's
own Perl `chordpro`, on the VM only.

**5.1 Golden files (in CI).** Each fixture chart has a hand-checked
expected `.cho` beside it, and the export must match it byte for byte.

- Catches: any change in output; that is, regressions.
- Misses: a mistake in the golden file itself. It is only as right as
  the person who checked it, so each golden file is reviewed once
  against sections 4.1–4.7 when it is added, and passes 5.3 before it
  is committed.

**5.2 Our own checks (in CI).** A small test-only reader in `tests/`
(`read-cho.ts`) splits our output into directives, environments, and
`[chord]` and word tokens. It is just enough for these assertions, is
not exported, and is not an importer: it builds no chart. The tests
compare what it reads with a **played yardstick** computed from the
chart alone through `parseChart`:

- **Words and chords:** per section occurrence, in played order, its
  name and the sequence of chords and sung words. A word is the
  syllables of `PlayedBar.lyrics` joined; a chord is each attack.
- **Spellings:** every `[chord]` reads back with barmark's `parseChord`
  to the same chord as the attack it came from (intervals and bass).
  Every spelling in Appendix A's tables does too.
- **Metadata:** title, credits, key, time and tempo.
- **Well-formed output:** every directive name is on ChordPro 6's list,
  and environments are balanced, so CI catches what the reference's
  strict mode would.
- **Robustness:** the export never throws on the barmark corpus, and a
  chart with errors gives `ok: false`.
- **Scale:** a 1,000-bar chart exports in linear time, as
  `export-scale.test.ts` does in `@barmark/midi`. FINDINGS records two
  quadratic surprises.

These catch chords attached to the wrong word, words lost or reordered,
spellings barmark reads differently, and malformed or unbalanced
directives. They share our reading of ChordPro, so they cannot catch a
misreading of the format itself; 5.3 does that.

**5.3 The reference implementation (VM only, never in CI):
`scripts/chordpro-check.ts`.** **Decided by Kevin (2026-11-10):** the
Perl tool is installed on the VM. Installed on 2026-11-10:
`App::Music::ChordPro` 6.101.0 (`chordpro --version`: "ChordPro core
6.101.0") in `~/.local/perl5`.

- **How it was installed.** `cpanm --local-lib ~/.local/perl5 --notest`,
  with no sudo and no GUI (wxPerl is absent, so `wxchordpro` is
  installed but won't run).
- **HarfBuzz.** Its required `HarfBuzz::Shaper` needs harfbuzz's
  headers. They come from Ubuntu's `libharfbuzz-dev` 8.3.0 `.deb`
  (`apt-get download`, unpacked into `~/.local/harfbuzz-dev`, its `.pc`
  pointed there). The module links to the system's `libharfbuzz.so.0`.
- **The environment.** Nothing is in the shell profile. Each run sets
  `PERL5LIB`, and `PATH` too if `chordpro` is called by name.

The script runs, for each golden file:

```
PERL5LIB=$HOME/.local/perl5/lib/perl5 \
  $HOME/.local/perl5/bin/chordpro --reference --strict -o <out>.pdf <file>.cho
```

- `--reference` loads no user or system configuration, so runs
  reproduce.
- `--strict` adds the "Unknown directive" warning, and "Song is missing
  {key} directive"; without it, unknown directives pass in silence.
- PDF output is used because the text backend (`-o <out>.txt`) doesn't
  draw grids. The script also writes the `.txt` beside the PDF, for a
  person to compare, like the MuseScore and Dorico checks.
- **chordpro exits 0 even when it warns.** So the script fails on any
  stderr line other than "Running in reference mode." and each warning's
  indented echo of the source line.
- Warnings seen on hand-written test files:
  - `"f.cho", line N, Unknown chord: "X"`
  - `Unknown directive: …`
  - `Not in Chorus context`
  - `Unterminated context in song: verse`
  - `No margin cell for trailing comment`
  - `Song is missing {key} directive`
  - `No chord diagram defined for …` (a summary of the unknown chords)

What it catches: whatever the format's own implementation won't
accept. That covers our chord spellings, grid cells and margins,
directives and environments. What it misses: regressions between runs,
since nothing runs it in CI. The known gaps of 4.7, and a chart with no
`key:`, would make it fail; question 1 asks how to treat them.

**Fixtures (design call): we write them all.** No song text is copied,
copyrighted or not.

- **Examples.** These are Kevin's or traditional: Peaceful Dreams
  (grid-only), Morning Song (parts), Shenandoah (a pickup and two
  verses), and the grammar's "At a glance".
- **Hand-written charts** cover:
  - each row of 4.3;
  - repeats with verses on passes, endings, a D.S. and `->`;
  - a replayed chorus with the same words, and one with new words;
  - `x ...`;
  - stacked verses;
  - key, time and tempo changes;
  - a church mode;
  - several parts.

  Their lyrics are nonsense or ours.

## 6. Scope

**Phase 1, 0.1.0:**

- Section 4 in full.
- `barmark export --lyricsheet`.
- The checks of section 5.
- A README with an "Exporting" section and its losses table.
- Then a CLI minor, the songs bump and the site's Get Started line, per
  RELEASING.md.

**Later:**

- **Guitar diagrams.** With diagrams on, the export writes `{define}`
  for every chord, using `@barmark/fretboard`'s shapes. This comes after
  fretboard ships; see the guitar-diagrams spec on branch
  `docs/chord-diagrams`, approved by Kevin on 2026-11-10.
- Phase 2, import (section 8).
- Export options: a capo (chord shapes plus `{capo}`), and grid-only
  output.
- The barmark.dev option.

**Risks:**

1. **Readers differ** in what chord spellings and grid cells they
   accept. 4.7 and section 5 reduce this; they don't remove it.
2. **Our checks share our reading of the format**, and only the
   VM-only reference check is independent. So a golden file passes 5.3
   before it is committed.
3. **Golden files are trusted once checked**, so they need that first
   review.
4. **Complexity.** `plan.ts` will want to grow, so Fallow's thresholds
   shape it.

## 7. Phase 2 boundary

Nothing in phase 1 depends on import, and nothing in it should make
import harder:

- The losses and the yardstick are computed from barmark's own parse.
- **Decided by Kevin (2026-11-10):** the output carries no hidden
  `x_barmark` hints in phase 1.

## 8. Phase 2: import (deferred, sketch)

These are notes from the first draft, kept for when import is
scheduled. They are not commitments; each needs Kevin's decisions again.

- **Bars.** ChordPro has no bars or durations. A grid section gives bars
  exactly:
  - `.` reads as a hold, grid `/` as a repeated chord, and `C~G` as
    `C_G`;
  - `%%` is written out as its two bars;
  - voltas start ending lines.

  For lyric lines the options were:
  - (a) require a grid or bar marks the author adds;
  - (b) one bar per chord change, with a warning per section;
  - (c) a draft full of `?`.

  (b) looked best: (a) refuses almost every real file; a `?` meter would
  be a grammar change; and (c) throws away the chords the file gives.
  Words before a line's first chord would need a leading `/` bar, or
  `N.C.` at the start.
- **Lyrics.** Each line becomes a `lyrics:` row:
  - a bar's words in one `_`-divided slot (no uneven-slot warning);
  - a word split by a chord continues with `-`;
  - a chord with no words gets `/`, or `--` before anything is sung;
  - characters a syllable can't hold (`"` `{` `}` `_` `|`) are replaced,
    with a warning.

  Lines with words but no chords become text lines, under a replay
  heading when the section's name matches an earlier one (grammar 6).
- **Environments.** `sov`, `soc`, `sob` and custom `start_of_xxx` become
  `##` headings named by their labels. `{chorus}` is a replay of the
  chorus before it, its label a text line. With no chorus before it, it
  becomes text with a warning. Identical repeated sections become
  replays, as in the MusicXML import's call 4.
- **Chord names.** Kevin ruled on 2026-11-10 that an unreadable chord
  keeps its bar as unknown harmony with its text (`"H7" ?`) and stays an
  error.
  - Suggestions such as `CM7` → `Cmaj7` are reported, never applied.
  - `[d]` is a note, `{D}`.
  - `[*N.C.]`, `[*Stop]`, `[*?]` and `[*@B]` read back as what this
    export writes.
  - Nashville and Roman-numeral names stay unreadable unless numerals
    become input.
- **Everything else.**
  - Metadata becomes `#`, credits, directives or text lines.
  - `{transpose}` is applied to the chords after it.
  - A capo: sounding pitch plus a `Capo N` text line looked right,
    since charts are concert pitch (7.3).
  - Dropped: `{define}`, `#` comments and layout directives.
  - Tab, abc and ly blocks are kept as `\` text lines.
  - `{new_song}`: song 1 only.
  - Selectors apply against an `instrument` option.
- **Encoding.** Strip the BOM; turn CRLF and CR into LF; NFC; read
  bytes that aren't UTF-8 as Windows-1252 with a warning.
- **Behaviour.**
  - It never throws; every problem is a diagnostic with a source line.
  - The CLI reads `.cho`, `.crd`, `.chopro`, `.chord`, `.pro` and
    `.chordpro` by extension, with a flag to force the format.
- **Round trips** then become possible: ChordPro → barmark → ChordPro
  idempotent after one pass, and the `meaning` yardstick for grid-only
  charts.

## 9. Kevin's decisions (2026-11-10)

1. **Name:** `@barmark/lyricsheet`, with `barmark export --lyricsheet`
   (section 2).
2. **Phase 1 is export only;** import is deferred to phase 2
   (section 8).
3. **No ChordSheetJS.** CI runs golden files and our own importer-free
   checks; the independent check is ChordPro's Perl `chordpro`, VM only
   (section 5).
4. **The Perl tool is installed on the VM** (5.3).
5. **Stacked verses:** one pass per verse, each with its chords,
   reported as a loss (4.5).
6. **No hidden `x_barmark` hints** in phase 1 (section 7).

**Open, found when the reference was installed:**

1. **Two things in a valid export make strict mode warn:**
   - a chord in 4.7's known gaps (`C(b13)`, `5(7)`, omissions, `9sus4`,
     `7sus2`, the roots `Cb` and `E#`, some slash chords);
   - a chart with no `key:` ("Song is missing {key} directive"; barmark
     never invents a key).

   Taken literally, "fail on any warning" fails these. Recommended: the
   check fails on any warning except those two kinds, and only where the
   chart itself has a gap chord or no key. A test keeps the gap list
   exact: an entry that stops warning fails, so the list never goes
   stale.
