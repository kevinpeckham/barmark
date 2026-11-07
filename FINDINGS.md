# Findings

Gotchas and insights from building barmark: what a tool, a pattern or our
own process did that was not obvious, and what to do about it. Add an
entry whenever one surfaces (CLAUDE.md, "Working agreement"). Newest at
the top of each section; say where the lesson came from so the code can
be found. Conventions belong in CLAUDE.md, RELEASING.md or the grammar,
not here.

## Testing

### Spelling by a chord's start picked the old key (2026-11-07, @barmark/sync)

- **The symptom.** The round trip of `| G | D |` then `key: Db` then `| Gb | Db |`
  passed exactly, but with a little timing jitter it came back `F#`
  for `Gb`.
- **The cause.** Chord edges jitter. The builder spelled a run in the key in
  force where the run starts; an edge a few tens of milliseconds early
  started the run in the old key, and that spelling covered the whole run.
- **The fix.** `symbolRuns` (`packages/sync/src/build/runs.ts`) cuts a run at
  every key change inside it and spells each piece in the key at its own
  start, so the sliver before the bar loses its vote and the rest is
  spelled in the new key. Found because the yardstick's key-change chart
  was spelling-sensitive and its jitter variant ran.

### A path import never reads `exports` (2026-11-07, @barmark/sync)

- **The symptom.** `verify:package` imports a package's built
  `dist/index.js` by path, so it passes even when the `exports` map is
  wrong. `@barmark/sync` has a second entry, `./timing`; a typo in its
  map would ship, and `import "@barmark/sync/timing"` would fail for every
  reader.
- **The cause.** Node applies `exports` only to bare specifiers
  (`@barmark/sync/timing`), never to a file path.
- **The fix.** `scripts/smoke-sync.mjs` reads `exports["./timing"].import`
  from the package.json beside `dist/` and imports that file, so a wrong
  map fails locally; the release's `confirm` job runs it against the
  copy installed from npm, where the bare `@barmark/sync/timing` goes
  through Node's own resolution.

### A round trip that compares only what plays can't see text move (2026-11-07, @barmark/musicxml)

- **The symptom.** Issue #173: a `title:` line before the first heading
  came back inside the first section, a section's closing text came back
  in the next section, and text after the last bar split the last bar
  line, all with the corpus round-trip test green.
- **The cause.** `tests/import/roundtrip.test.ts` compared `played()`:
  bars, meters, sections and timelines. Text lines play nothing, so
  where they landed was invisible to it. Underneath, the export gave
  every text line to the next measure, before its notes, and wrote the
  heading first, so text before and after a heading made the same XML.
- **The fix.** The round trip also compares `texts()`
  (`tests/import/played.ts`): each text line with its section and the
  bars written before it. It caught one more, in the examples:
  Shenandoah's opening line. The export now writes text before a
  heading ahead of it and closing text after a bar's notes
  (`closeText` in `packages/musicxml/src/measures.ts`); the import reads
  them back by their order and position (`textPlace` in
  `src/import/marks.ts`).

### A hold worked out in file order is wrong in played order (2026-11-06, @barmark/musicxml)

- **The symptom.** Random lyric scores (the Task 8 reviewer's lyric
  fuzzers) gave "importer bug: measure N sings nothing, not V 2 0 /":
  the import meant a later verse to hold a syllable where barmark sang
  nothing.
- **The cause.** The import decides a verse's `/` holds measure by
  measure in the file's order. A repeat barmark can't hold is written out
  in played order, so a held bar can follow a bar where that verse
  breathes; barmark's row `/` holds only from the row's start or its last
  syllable, and a breath ends it.
- **The fix.** `settled` in `packages/musicxml/src/import/verses.ts`
  reads each row as barmark does and writes a `/` with nothing to hold as
  `--`; the self-check drops those holds for the written bar whose row
  says so (`holdKey`, keyed by written bar, as one measure can be written
  in two contexts). Tests in `tests/import/lyrics.test.ts`.

### Onsets must be compared as a share of the bar, not in whole notes (2026-11-06, @barmark/musicxml)

- **The symptom.** The import's verse self-check (property tests,
  `packages/musicxml/tests/import/property.test.ts`) reported every
  syllable of some random scores as misplaced, though the chart read
  right.
- **The cause.** barmark's parse places a syllable (`PlayedSyllable.at`)
  in whole notes from the bar's meter, while the importer measures a
  bar by the notes it holds: a pickup or an over-full measure has a
  length its meter doesn't give, so the same syllable sat at two
  different numbers.
- **The fix.** `verseMismatches` (`src/import/selfcheck.ts`) compares an
  onset as a share of its bar on both sides: the parse's `at / (n/d)`,
  the importer's onset over the measure's length (`Words.lengths`).

### The MusicXML corpus misses the grammar's examples after section 6 (2026-11-06, @barmark/musicxml)

- **The symptom.** Grammar 7.7's two new examples parse cleanly, yet the
  sounding corpus (`packages/musicxml/tests/charts.ts`) still had 15
  charts and `sounding.json` needed no new entry.
- **The cause.** `grammarCharts()` finds blocks with
  ``/```[a-z]*\n([\s\S]*?)\n```/g``, which needs a closing fence at the
  start of a line. An indented fence inside a list item (section 6's
  `## Chorus ->` example) opens a match that its own indented closing
  fence can't end, so every later pair is read inside out: prose between
  fences, with errors, which the corpus filter drops. Nothing past
  section 6 has been in the corpus since that example was indented.
- **The fix.** Not made here (a corpus change re-keys `sounding.json`):
  the regex should allow leading spaces on both fences
  (``/^ *```[a-z]*\n([\s\S]*?)\n *```/gm``) and the fixture be
  regenerated for the blocks that join.

### A test player that reads a missing default wrongly hides the bug it should catch (2026-11-05, @barmark/musicxml)

- **The symptom.** `x ...` (an open repeat, played once by barmark) was
  exported as a backward repeat with no `times`, and the play-order tests
  passed. MuseScore and other players play it twice.
- **The cause.** The tests' MusicXML player (`tests/play.ts`) read a
  missing `times` as 1, matching barmark, not MusicXML, whose default is
  2. The player agreed with the exporter's mistake.
- **The fix.** The player takes MusicXML's default, and the export writes
  `times="1"`. A test helper that stands in for another program follows
  that program's rules, defaults included, not ours.

### A site bump updates the site's own version test (2026-11-04, release chain)

Symptom: the credits release chain stopped after `@barmark/cli` 0.3.0
with the site bump applied but never committed; the script's exit code
was 0. Cause: `site/tests/build.test.ts` pins the exact `barmark` and
`@barmark/render` versions the site installs, the bump didn't change it,
and `set -e` killed the script inside a pipeline whose last command
(`grep`) succeeded. Fix: a site bump edits that test with
`package.json`; a chain script runs with `set -o pipefail` or prints a
last line to look for.

### A round-trip yardstick must not use the function it is checking (2026-10-31, printer)

The printer's round-trip test compared bars before and after printing as
`reduceSlots(slots)` on both sides, so when `reduceSlots` itself was wrong
(`| D_E_F / |` printed as `| D_E_F |`, turning quarter-note triplets on
beats 1–2 into half-note triplets) the test called the two charts equal.
The final review caught it. The fix was an independent oracle: a timeline
of when each attack lands, as exact fractions of the bar
(`tests/chart/fixtures.ts`, `timeline`). When a test asserts "same
meaning", compute the meaning without the code under test.

### Character fuzz rarely builds the inputs that matter; add grammar-driven fuzz (2026-10-31, printer)

2,000 random strings from the grammar's alphabet never assembled a valid
cell with a hold after a group, so the bug above survived them. 2,000
random charts built from grammar pieces (slots, groups, `%`, `[3/4]`,
`time:` lines, headings, repeats) found it in 45 ms
(`tests/chart/printChart.test.ts`, "grammar-driven fuzz"). Keep both: the
character fuzz proves the parser never throws, and the grammar fuzz
exercises meaning.

### Read the spec's examples into the tests (2026-10-31, chart parser and printer)

`tests/chart/fixtures.ts` reads the "At a glance" chart out of
`docs/grammar-v0.1-draft.md` instead of copying it, so the tests track
the spec. It paid off twice. A plan arithmetic slip (the verse is 12 bars,
not 8) showed up at once. And the printer's literal "one blank line
before each `##`" made neither the spec's example nor Peaceful Dreams
canonical, because both write a run of replay headings together, which
showed the rule needed refining.

## Performance and robustness

### Two DoS shapes the review's probes didn't build (2026-11-07, @barmark/sync)

- **The symptom.** Vercel's review found two: 300 sections named
  `Verse x9999 (x2)` took 5.7 s (1,000 took 16 s), and a 14 KB input of one
  2,000-note run with short overlays over 200 bars built a 1.2 MB chart
  (about 83 times the input) in 3.5 s.
- **The cause.** (1) `sectionName` checked each repaired name with
  `parseChart`, which expands a hidden `x9999` into thousands of bars, and
  dropping a typo like `(x2)` exposed a repeat the one-time mark strip had
  missed. (2) A symbol had no size limit, so a long note set resumed after
  every overlay was written in full at each attack.
- **The fix.** `readsPlain` reads the document only (`readDocument`, no
  expansion) and marks are stripped again after each dropped word;
  names of plain letters skip the parse, and a build parses names at most
  2,000 times, then drops (never renames) any name that still needs one (`packages/sync/src/build/marks.ts`). Symbols over 64 characters or 16
  notes are `?` (`packages/sync/src/build/spell.ts`), which bounds the chart
  at a fixed factor of the slots with no extra budget. The counts and
  sizes are pinned in `scale.test.ts`; a timing ratio alone would not have
  seen the first.

### fast-xml-parser counts `&amp;` against the entity cap, and leaves `&#233;` alone (2026-11-06, MusicXML import)

- **The symptom.** A score with more than 1,000 `&amp;`, `&apos;` or
  `&lt;` (a long lyric sheet, a part named "Bass & Drums" in every
  measure's words) was refused as "not well-formed XML"; and `&#233;`
  came through as the literal text `&#233;` in titles, lyrics and part
  names.
- **The cause.** `processEntities.maxTotalExpansions`, set to 1,000 as a
  billion-laughs bound, counts every replacement, the five predefined
  entities included, not only the DOCTYPE's own. Numeric character
  references are decoded only with `htmlEntities: true`.
- **The fix.** `tree.ts` raises `maxTotalExpansions` to 10,000,000 and
  keeps the bounds that stop billion laughs (expanded length 100,000,
  depth 10, 100 entities); it sets `htmlEntities: true`, and the control
  characters are still stripped after decoding, so `&#27;` can't reach
  a terminal. Tested with 5,000 `&apos;` beside the billion-laughs test.

### A search inside a loop over measures turns a hostile file into a slow one (2026-11-06, MusicXML import)

- **The symptom.** 5,000 measures each with an unwritable time signature
  took 2.2 s to import; one measure of 3,000 notes on two staves with 200
  chord symbols at odd offsets took 8.9 s.
- **The cause.** Lookups written as `findIndex`, `find`, `filter` or
  `includes` inside loops and sort comparators: the meter losses sorted
  by finding each measure's index twice per comparison, snapping chords
  searched the kept onsets for each chord and then tried every count of
  snapped chords, and merging staves searched the upper staff for each
  low note. Each is fine on a real score and quadratic (or worse) on a
  file built to be large.
- **The fix.** Each such lookup is a `Map` or `Set` keyed by index or by
  onset (fractions are in lowest terms, so `n/d` is a key), or a binary
  search over a sorted list; at most 16 snap counts are tried before
  every chord snaps (`grid.ts`). `tests/import/scale.test.ts` holds the
  large files, timed as the best of two warmed-up runs, and checks that
  ten times the measures doesn't take a hundred times as long.

### Don't parse your own rendered messages; the file's text is in them (2026-11-06, CLI import)

- **The symptom.** `barmark import` took 13 s on a file whose one
  measure number was 100,000 digits long, and printed a 100,000-character
  line.
- **The cause.** To avoid printing "measure N" twice, the CLI searched
  each message with `/\d+ measures: /`. Measure numbers and part names
  come from the file and are copied into messages, so a long run of
  digits without the suffix made that search quadratic. The reader also
  kept those names at whatever length the file gave.
- **The fix.** `ImportDiagnostic` carries `measures` (every measure its
  message names), and the CLI prints "measure N" only when it is absent,
  never reading the message. The reader cuts measure numbers to 64
  characters and part names to 200 (`read.ts`). Tested in
  `packages/cli/tests/import.test.ts` and `tests/import/scale.test.ts`.

### A repeat inside a repeat exports as two backward repeats, which no program plays as barmark does (2026-11-05, MusicXML import)

- **The symptom.** `|: D | x2` then `| A :|` plays six bars in barmark
  (D D A, twice). Exported and imported again, it plays four (D D A A);
  MuseScore 4.7 plays the exported file as five (D D A D A).
- **The cause.** An export bug, found by the import: `@barmark/musicxml`
  writes the line's `x2` as a backward repeat on bar 1 and the outer
  `:|` as another on bar 2, with the one forward repeat on bar 1. MusicXML
  repeats don't nest, so the second backward repeat is ambiguous: the
  importer (`packages/musicxml/src/import/order.ts`, as notation
  programs commonly do) sends it back to the bar after the last finished
  repeat, MuseScore to bar 1 for one more pass.
- **The fix.** Not yet made. The export should write a repeated section
  that holds a repeat of its own in play order, as it already does for
  repeated sections (`inPlayOrder` in
  `packages/musicxml/src/measures.ts`). Until then, a nested repeat
  isn't safe to export.

### An unanchored `\s*x\s*…$` regex is quadratic on long whitespace (2026-10-31, chart parser)

`/\s*x\s*(\d+|\.\.\.|…)\s*$/` found repeat tails, and on a line of 100 KB
of spaces with no `x` it took 9 s (200 KB, 34 s): the engine retries
every start position and backtracks across the whole run each time. The
fix scans from the right with `lastIndexOf` and tests only the remainder
with an anchored pattern (`repeatTail` in `src/chart/barLine.ts`). Watch
for `\s*` or `.*` at the start of an unanchored pattern that ends in `$`.

### Cap the work, not just the output (2026-10-31, chart parser)

Expansion stopped at 10,000 bars, but a repeat whose body emits no bars
(a fermata-only bar, a bar line with no cells) never reached the cap:
`## A x 99999` holding `| ... | x 99999` looped about 10^10 times. The
automated security review found it. `expand` now counts every pass and
every cell against `MAX_WORK` as well as bars against `MAX_EXPANDED_BARS`.
Any loop driven by user-supplied counts needs a budget on iterations.

### A plain object used as a lookup table answers for `constructor` (2026-10-31, chord module)

`INTENDED[shorthand]` read a Harte shorthand from user input, so
`C:constructor`, `C:toString` and `C:__proto__` found
`Object.prototype` members and then threw instead of returning null.
`Object.hasOwn` guards it (`intendedShape` in `src/chords/harte.ts`).
Random fuzzing never produces those words, so test them by name.

### A written bar sounds the same on every pass, so MusicXML can't hold some charts as written (2026-11-03, musicxml)

The MusicXML export's play-order test (a small MusicXML player,
`packages/musicxml/tests/play.ts`, checked against `parseChart().bars`)
found two shapes that look fine and play wrong. A push at the start or
end of a repeat puts its early note in a bar that every pass plays, so it
sounds on the wrong pass. And a repeated section holding repeats of its
own (written out, since MusicXML repeats don't nest) replays all its
passes after a D.S., where barmark plays each repeat once. The fixes are
in `src/events.ts` (such a push stays on the beat, marked "push") and
`src/measures.ts` (`inPlayOrder`: such a chart is written in play order).
When converting to a format that keeps written order, test the played
order, not just the written marks.

## Design

### Half-length bars skewed a derived tempo (2026-11-07, @barmark/sync)

- **The symptom.** Built from Stem Shovel's ChordMini grids, Letter Lands
  came out `tempo: 141` and Eat All the Clocks `tempo: 130`; the corpus
  charts say 132 and 120. No synthetic test had shown it.
- **The cause.** The reference's bar rendering leaves many half-length
  bars: 24 of 76 bars in Letter Lands and 22 of 86 in Eat, at half the
  main cluster. A share that size, all on one side, pulls the median down
  onto the short end of the main cluster.
- **The fix.** `gridTempo` (`packages/sync/src/build/marks.ts`) folds before
  the median: a bar under 0.6 times the plain median counts as half a bar
  (its beat length doubled), one over 1.6 times as two (halved). It gives
  132 and 120 on the real grids, and `real.test.ts` pins the charts. No
  diagnostic was added for an uneven grid; that would change the spec.

### Syllables drawn as rows of their own drifted off their notes (2026-11-06, @barmark/render)

- **The symptom.** The first draft drew each verse as a row under the
  melody row, its slots built like the melody's. In Chromium, bar 2 of
  Amazing Grace put "ing" 13px right of its B (`render.pw.ts`, "lyrics").
- **The cause.** A bar's slots are `flex: 1 1 0` with `min-width:
  max-content`, so they share a bar equally only when it has room to
  spare. A bar column is exactly as wide as its widest row's content, so
  the row that sets the width has no slack: each slot keeps its own
  content's width, and the pitch row and a verse row, with different
  contents, split the same width differently.
- **The fix.** Each note of a singing line is a column (`.bm-sung`): the
  pitch name, then one line per verse, so a syllable is under its note
  however the bar is laid out or wrapped. The singing bar's body is a
  grid of `1fr` columns, which sizes every column to the widest one:
  slots are spaced by beat, and the chord row above, sharing the bar
  column, gets the slack to space its chords the same way. A lyric row on
  no melody went the same way in review: drawn as a row of its own, it
  wrapped at different bars from its chord row on a phone (words under no
  chord), so its lines now sit inside the bars they cover.

### The spec's lead sheet read as two systems with no diagnostic (2026-11-06, barmark)

- **The symptom.** The voice-and-lyrics spec's Amazing Grace, a bare
  `Vox` chord line over `Vox.Mel`, parsed cleanly into 10 bars: the
  chords played first, then the melody, and `lyrics 2:` covered only
  the melody line.
- **The cause.** Grammar 7.6 said a part writes its lines or its bare
  line in a system, not both, and `systems.ts` started a new system when
  they met. The spec was written and approved against what part lines
  "already" did, and nobody parsed its example until building verses.
  Every line read cleanly, so nothing warned.
- **The fix.** Kevin amended 7.6: named lines written after their
  part's bare line join it, the bare line first, `""` in
  `DeclaredPart.lines` (`claimsOf` in `systems.ts`, `checkLines`). A
  first cut let a bare line join named lines before it too, which
  silently changed `Pno.RH`/`Pno.LH` then `Pno` from one after the other
  to together; only a bare line written first joins now. A spec example
  belongs in a test as soon as the spec is approved.
- **The same gap in the export.** MusicXML's `voicesFor` placed lines by
  index, so the new `""` line took voice 1 on the upper staff: the lead
  sheet came out as a slash voice with the melody as voice 2, stems
  down, and a piano's chord line pushed its right hand onto the lower
  staff, in every system, even those without the bare line. A bare line
  beside named lines is now `<harmony>` over the first named line, or
  the next upper-staff voice when it writes notes (`bare.ts`,
  `bareAlone` in `score.ts`). A new line kind needs checking in every
  place that numbers lines, not just where it is read.

### Timing alone can't tell comping from a melody; pitch motion can (2026-11-06, MusicXML import)

- **The symptom.** The first melody-in-thirds rule (a bar's attacks are
  voicings only on chord changes or beats) dropped ordinary comping: a
  Charleston, stabs on the and of 4, eighth-note rock or 6/8 comping, and
  a push into the next chord all came in as chords alone. One push in
  bar 15 of a 16-bar part cost all 15 bars their voicings, and the
  warning listed bars 2, 3, 4, never 15.
- **The cause.** Syncopated comping and a melody both attack between the
  beats, so timing alone can't separate them. What separates them is
  motion: comping re-strikes the voicing it holds, a melody changes
  pitch. And the rule was applied to the whole part, where the spec
  said per bar.
- **The fix.** An attack off the changes and beats makes its bar a
  melody's only when its pitches differ from the voicing sounding in
  that line (a chord change clears it) and it isn't a push (an eighth
  or sixteenth before a change, holding into it, or tied over the bar
  line into a chord on the next downbeat). The rule is per bar: a
  melody bar writes its chords alone and the warning names it.
  `melodyBars` in `packages/musicxml/src/import/melody.ts`, used by
  `decide` in `parts.ts` and read per bar by `readLine` in `cells.ts`
  (`Reading.melodyBars`). Tests in `tests/import/import.test.ts`,
  "comping off the beat stays voicings".

### Two labelled systems in a row join into one, and still parse cleanly (2026-11-06, MusicXML import)

- **The symptom.** Trading fours (the guitar's four bars, then the
  piano's) imported as `G | A | B | C | D |` over `P | E | F | G | A |`:
  both parts playing bars 1 to 4 together, bars 5 to 8 gone. A part
  entering after four bars came back playing the first four. The chart
  parsed without an error, so the importer's self-check (parse, look for
  errors) passed it.
- **The cause.** Grammar 7.4 joins consecutive labelled lines into one
  system until a label repeats; blank lines don't separate them. A
  system whose first row (in score order) names a part the system before
  didn't write joins that system.
- **The fix.** Where nothing else (a heading, a directive, text, lyrics)
  stands between two labelled systems and the second would join the
  first, the importer writes `---` between them. At first it wrote a cue
  as a text line, naming who stops (`G tacet`) or, when nobody stops,
  who starts (`G enters`), since text lines have no musical meaning
  (grammar 1) and the other options (a resting part's line of `--` or
  `N.C.`, or a restated directive) each change the music or the score's
  marks. The grammar had no silent system separator; Kevin added one
  (2026-11-06): a line of three or more hyphens ends a labelled system
  and means nothing else, and the importer now writes it instead of the
  cue (`separator` in `write.ts`). And the guard: `writeChart` now plays
  the chart back (`selfcheck.ts`) and compares every part's line, bar by
  bar in play order, with the cells it meant to write; any difference is
  an "importer bug" error. A property test (`tests/import/property.test.ts`)
  runs random multi-part scores through it. Its first run found three
  more charts that didn't read back as written: a bar written in played
  order (after a jump) starting with `/`, holding a bar that no longer
  comes before it (now the held chord is written again); `%` copying a
  bar with a one-bar meter, which every line of a system must write; and
  a part whose first system of two lines left out its first line, so the
  reader took another line as the one carrying the harmony (grammar 7.6
  orders lines by that system; now it writes all of them there). The
  reviewer's fuzz then found one more: after a section written as a
  replay, each part's next bar restates the chord it held, but the
  parts had been merged into one tutti line before the writer knew a
  replay came first, so both played the first part's chord. Parts are
  now tutti only if they also agree with every leading hold restated
  (`playingOf` in `rows.ts`).

### Jumps written only as words don't reach the played order (2026-11-05, MusicXML import)

- **The symptom.** A score whose "D.C. al Fine" or "To Coda" is plain
  words, with no `<sound dacapo>` or `<sound tocoda>`, imports with its
  direction cells, but if its repeats can't be paired and the score is
  written out in played order instead, the jump isn't taken: the
  written-out chart plays the bars once, in written order.
- **The cause.** The played order (`playedOrder` in
  `packages/musicxml/src/import/order.ts`) follows what a program plays,
  the `<sound>` attributes; words name a jump only for a reader, and are
  read as direction cells later (`marks.ts`).
- **The fix.** None yet: it only matters for a file that both writes its
  jumps as words and has repeats barmark can't write. The written-out
  chart's warning says it was written out; the jump's cell is still on
  its bar. If such files turn up, `playedOrder` could take the jump the
  words name.

### A chart can't write a directive inside, or between, endings (2026-11-05, MusicXML import)

- **The symptom.** An imported score with a meter or tempo change in a
  second ending had nowhere to put its `time:` or `tempo:` line: an
  ending is one bar line, and only text and credits may come between
  endings (grammar 5.1), so the line made the chart an error.
- **The cause.** The grammar ties directives to whole lines; scores
  change meter and tempo anywhere.
- **The fix.** The importer (`packages/musicxml/src/import/endings.ts`)
  writes a meter change there as one-bar meters (`[3/4]`) and moves any
  other directive to the bar after the endings, with a warning. A grammar
  gap for Kevin, like the next: a text line that would read as something
  else (`| la |`, `key: G`) has no escape, so the importer prefixes a
  backslash, which barmark keeps as text (`text.ts`), only when the line
  would not read as text at all; a text line that merely warns
  (`Chorus:`) stays as written. Whether barmark should have its own text
  escape is a grammar question for Kevin.

### A new grammar section breaks the site before its parser is on npm (2026-11-04, sustain pedal)

Symptom: grammar 2.9 (pedal marks) failed the site's required check: its
coverage test wants a guide row for every grammar section, and a row's
example is parsed by the barmark the site installs from npm, which can't
read `+G` until the release. Cause: the grammar lives at the repo root
and changes with the parser; the site runs the published one. Fix: the
coverage test's `PENDING` lists a section with the release that brings
it, and fails once the site installs that release without its row
(`site/tests/coverage.test.ts`).

### The sounding fixture named grammar examples by position (2026-11-04, sustain pedal)

Symptom: adding grammar 2.9's example failed "grammar block 8/13/14
sounds as it did" though nothing sounded different. Cause: grammar blocks
were named by their index, so a new block renamed every later one. Fix:
blocks are named by a hash of their text (`packages/musicxml/tests/charts.ts`);
the regenerated fixture's twelve old entries were checked identical under
their new names.

### Dorico files a chart's credits under Flow 1, not the project (2026-11-05, musicxml)

Symptom: Dorico showed the title but no composer, lyricist, arranger or
copyright, and Project Info's project fields were empty. Six encodings
through mac-bench changed nothing on the page: `creator`/`rights`
(what the export writes), a `movement-title`, typed page `<credit>`s,
positioned ones, untyped ones. Cause: Dorico does import them, from the
export's own `creator` and `rights`, but into Flow 1's information
(Kevin checked Project Info); the default first page prints project
fields only. A `movement-title` becomes the flow's title. Steinberg's
forum reports the same. No MusicXML route to the project fields turned
up, and none of Dorico's MusicXML import preferences touch it. Fix:
none in the export; the package README's "In Dorico" section says to
copy Flow 1's fields to the project.

### Dorico drops a leading word "a" from direction text (2026-11-05, musicxml)

Symptom: a heading "A" never showed in Dorico while "B" did; "A section"
showed "section". Found by mac-bench's Dorico checks, bisected in a few
runs: transposition, bold and bar 1 made no difference; "A." and "Ab"
showed; plain "a tempo" became Dorico's tempo mark. Cause: Dorico's import
reads a leading word "a" as the article in "a tempo" and strips it. Fix:
chart text written as words holds that "a" to the next word with a
no-break space (`ownText` in `packages/musicxml/src/directions.ts`);
barmark's own "a tempo" stays plain so Dorico still recognises it.

### Dorico ignores `system="only-top"` (2026-11-05, musicxml score marks)

Symptom: with every part writing the headings under MusicXML 4.0's
`system="only-top"`, Dorico still showed "Verse" and "Bridge" over every
staff, where they ran into the piano's Ped. brackets. Cause: Dorico's
import doesn't read the attribute; each part's direction becomes staff
text. Fix: the score's marks are written in the top part only
(`MeasureContext.score` in `packages/musicxml/src/measure-xml.ts`), the
attribute kept for programs that read it; spec section 5 amended.

### Dorico doesn't reliably hide a `print-object="no"` rest (2026-11-04, musicxml two staves)

Symptom: Morning Song's piano, exported with a hidden whole-bar rest on
the lower staff of every slash bar, showed the rest in bars 1–9 and an
empty staff in bars 13–16, with identical XML in both. Cause: Dorico's
import decides for itself; we couldn't find a rule. Fix: the rest is
shown (`measureRestXml` in `packages/musicxml/src/measure-xml.ts`), as a
piano chart would engrave it; spec section 5 amended.

### Dropping a broken line can change what its neighbours mean (2026-10-31, chart parser)

A bar line with an error was simply left out of the document, so a
section whose only bar line failed had no bars and became a *replay* of
an earlier section with the same name, playing those bars with no
warning. Broken lines now stay in the document as `{ kind: "invalid" }`
lines (`src/chart/types.ts`), which count as written content and are
printed back as written. When error recovery removes something, check
whether its absence is itself meaningful.

### An `index.ts` that re-exports can hide an import cycle (2026-10-31, printer)

`print.ts` imported `parseChart` from `./index.js`, which re-exports
`print.ts`, so the two modules imported each other. It worked only
because no top-level code ran first. `parseChart` moved to its own module
(`src/chart/parse.ts`). Import from the defining module, never from the
package index, inside the package.

### Two rules naming "the first line" must name the same one (2026-11-04, grammar 7.6)

The final review of part lines found that `format` could break a valid
piano chart. Score order was the order lines first appear, but the line
allowed chord symbols was the first *written* in each system. A piano
intro for the left hand alone made `Pno.LH` first in score order, so the
canonical form sorted LH above RH in the verse, and the RH's chords then
failed the notes-only rule; MusicXML put the LH on the treble staff.
Each rule's tests passed on its own. Kevin's fix: score order comes from
the part's first system writing two or more lines, and the harmony line
is the first in score order (`lines.ts`, `scoreOrder`). The lesson:
when two rules each define "first", test a chart that tells them apart,
and round-trip it through `format`.

## Tooling

### Raising an exact pin left Bun's nested copies of the old version (2026-11-07, site bump)

- **The symptom.** barmark.dev's bump to `barmark` 0.19.1 left `bun.lock`
  with `@barmark/render/barmark` and `@barmark/sync/barmark` entries at
  0.19.0, so the site would have shipped two barmarks, although render
  and sync both ask for `^0.19.0`.
- **The cause.** `bun install` after editing an exact pin in
  `package.json` resolves the new version for the site and keeps the
  dependents' existing resolution beside it rather than deduplicating.
- **The fix.** Delete the nested `…/barmark` entries from `site/bun.lock`
  and run `bun install` again; check with
  `grep '/barmark": \["barmark@' site/bun.lock` (no lines) after every
  site bump. RELEASING.md step 12.

### Dorico's .mxl has no mimetype entry (2026-11-07, .mxl fixtures)

- **The symptom.** None: `readMxl` read all five of Dorico 6.2's `.mxl`
  exports. They are worth keeping because they differ from MuseScore's
  and from the archives our tests build: no `mimetype` entry at all, and
  in some the score (`<title> - Full score - 01 <flow>.xml`) comes before
  `META-INF/container.xml`.
- **The fix.** None needed; `dorico-*.mxl` and MuseScore's `*.mxl` for
  every fixture are checked in, each tested to read as its `.musicxml`
  (`programs.test.ts`). Made by mac-bench's `dorico --export mxl` and
  `scripts/musescore-fixtures.ts`.


### What Dorico 6.2 changes when it round-trips MusicXML (2026-11-07, MusicXML import)

- **The symptom.** Dorico Elements 6.2.31 opened the five MuseScore
  import fixtures and exported each again (mac-bench, Full score layout);
  all five imported differently from MuseScore's charts. Some of the
  difference is Dorico's data, some was the importer reading Dorico's
  way of writing the same thing.
- **The cause, Dorico's data** (kept in the expected charts as Dorico
  wrote it):
  - Chord symbols are global in Dorico, so the band's piano chords
    (`G/B`, `Em`) became the guitar's (`G`, `G`); with the same chords
    the two parts merge into one bare line.
  - The lead sheet's `Tristan` chord, which MuseScore kept as text and
    the import wrote `"FTristan" ?`, is gone: Dorico dropped it, so the
    bar holds the chord before (`/`).
  - The hymn's `'Twas` came back with a typographic apostrophe
    (`‘Twas`, U+2018).
- **The cause, how Dorico writes things** (fixed in the import):
  - Half-diminished is `<kind text="m7" parentheses-degrees="yes">half-diminished</kind>`
    with no `<degree>`, so the shown `m7` isn't the chord; its meaning
    went through `harteToBarmark("F#:(1,b3,b5,b7)")`, which picked
    `dim(7)` (alphabetical first of the equal names) over `m7(b5)`.
  - Section names are system text with no `font-weight`, so the
    bold-words heading rule missed `Intro` and `Verse`.
  - Empty project info is written as greyed page credits `Project
    Composer`, `Project Lyricist` and `Project Copyright`.
  - A comping bar's slashes are voice 2 and its voicing voice 1, each
    silent (a `<forward>`) where the other plays, so the import gave two
    lines.
- **The fix.** The import names a kind with no `<degree>` by its own
  Harte shorthand where one spells exactly its notes (`kinds.ts`,
  `chords.ts`: half-diminished is `hdim7`, so `m7(b5)`), and
  `harteToBarmark` also prefers a shorthand's name on a tie
  (`packages/barmark/src/chords/harte.ts`). Words that are plain (not
  bold, not italic), above the staff at the bar's start, on the score's
  first part, in a file barmark didn't write, and name a section from the
  list in `packages/musicxml/src/import/marks.ts` (`SECTION`, a trailing
  `:` or `.` left out) are a heading. `Coda` is not in the list (Kevin,
  2026-11-07): plain "Coda" is where a To Coda or al Coda jump lands, and
  reading it as a heading would change the play order; a missed heading
  only leaves the word over the bar. Bold `Coda` is a heading as before.
  Revisit only for a real file that needs it. Dorico's placeholders are dropped
  (`read.ts`). A voice of slashes and rests whose slashes sound only
  where the other voice is silent folds into it (`merge.ts`,
  `foldRhythm`), a rest with the other voice's sound in it read as a gap.
  The files and their charts are
  `packages/musicxml/tests/fixtures/import/dorico-*`, tested in
  `tests/import/programs.test.ts`.

### Dorico's MusicXML export can't be driven without a dialog, so Dorico import fixtures are exported by hand (2026-11-06, MusicXML import)

- **The symptom.** The import plan's Dorico spike wanted mac-bench to open
  a file in Dorico and send `File.Export?FilterID=…` over Remote Control.
  The command list Dorico Elements 6.2 reports (mac-bench's
  `tests/recordings/spike1.log`) gives `File.Export` an optional
  `FilterID` but lists no filter IDs, and no command names a file to
  export to.
- **The cause.** Dorico already ignores the `File` parameter of
  `File.Save` and opens the Save dialog (mac-bench FINDINGS). An export
  that can't be given a path will do the same. A dialog left open on the
  unattended cloud Mac blocks Remote Control, and with it every mac-bench
  job, until someone dismisses it by screen sharing. So the spike was not
  run live.
- **The fix.** Dorico's MusicXML files for the import tests are exported
  by hand, once: open each `packages/musicxml/tests/fixtures/import/*.musicxml`
  in Dorico and choose File > Export > MusicXML. They are checked in as
  `dorico-*.musicxml` with expected charts. Revisit if a Dorico release
  documents export filter IDs and a destination parameter.
- **Superseded (2026-11-07).** mac-bench now answers the dialog itself:
  it opens File > Export > MusicXML… from Dorico's menu and fills in the
  dialog and its folder picker through macOS Accessibility (a small
  helper app, `MacBenchAX`, granted Accessibility for Dorico alone), so
  the export runs unattended (`mac-bench dorico --export musicxml|mxl`;
  mac-bench FINDINGS). The `dorico-*` fixtures were made that way, not
  by hand; see "What Dorico 6.2 changes when it round-trips MusicXML".

### MuseScore keeps a melisma only on its syllable, and writes an elision as a glyph (2026-11-06, voice and lyrics)

- **The symptom.** An exported lead sheet went through MuseScore 4.7
  (`mscore -o`) with its lyric numbers and `syllabic` intact, but the
  `:/` notes' `<lyric number="1"><extend/></lyric>` came back as no
  lyric at all, and `<text>the</text><elision/><text>end</text>` came
  back as three `<text>`s, the middle one SMuFL's lyrics elision glyph
  (U+E551) in Leland Text, with no `<elision/>`.
- **The cause.** MuseScore models a melisma as an extension line on the
  syllable that is held, so it reads `<extend>` only beside a `<text>`
  and drops a `<lyric>` that has none. It stores an elision as a
  character in the lyric's text, and writes it back that way.
- **The fix.** The export also writes `<extend type="start"/>` on the
  syllable a `:/` holds (spec, Claude's call 11), which MuseScore keeps
  (as `<extend/>`). `scripts/musescore-fixtures.ts` checks an exported
  lead sheet's lyrics survive MuseScore, reading U+E551 as an elision.
  The import (Task 8) must read both forms: an extend on a syllable
  holds it over the following unsung notes, and U+E551 between texts is
  `~`.
- **And only on a word's last syllable** (found in review). MuseScore
  keeps `<extend>` only on an end or single syllable. A begin or middle
  syllable held by `:/` (`{G4}:maz-_{A4}:/`) comes back with no extend:
  MuseScore draws the word's hyphens across the unsung notes instead, so
  the import must read a begin or middle syllable followed by unsung
  notes as held over them too.

### MuseScore's AppImage needs `xvfb-run`; it ignores `QT_QPA_PLATFORM=offscreen` (2026-11-05, MusicXML import)

- **The symptom.** `mscore -o out.musicxml in.mscx` on the bench VM, with
  no display, aborted ("no Qt platform plugin could be initialized")
  even with `QT_QPA_PLATFORM=offscreen`, though `offscreen` is among the
  plugins it lists.
- **The cause.** MuseScore 4 picks its Qt platform itself and still
  tries `xcb`, which needs a display (and `libxcb-cursor0`).
- **The fix.** `~/.local/bin/mscore` runs the AppImage under `xvfb-run
  -a`. It still prints Qt warnings, and its exit code isn't trustworthy,
  so `scripts/musescore-fixtures.ts` judges a conversion by the file it
  wrote. The script runs only on the VM; CI reads the checked-in files.
- **Also from writing `.mscx` by hand:** a note is a MIDI `pitch` plus a
  `tpc` (its spelling on the line of fifths: F 13, C 14, … D♯ 23), at
  concert pitch even on a transposing instrument. A wrong `tpc` respells
  the note without complaint (a D♯ written as C♯ came out of MuseScore
  as C♯, and the import rightly dropped the voicing it was in). MuseScore
  4's `.mxl` names its rootfile `score.xml`, so `readMxl` must follow
  `META-INF/container.xml` rather than look for a `.musicxml` name.

### TypeScript 7's `tsc` won't run on Node 20.6, though the CLI it builds does (2026-11-02, @barmark/cli)

- **The symptom.** A CI job testing the CLI on its `engines` floor,
  Node 20.6.0, failed in `verify:package cli` with only "build failed".
  The build's own error: `ERR_UNKNOWN_FILE_EXTENSION` for
  `typescript/bin/tsc`.
- **The cause.** TypeScript 7's `bin/tsc` is an extensionless file in a
  `"type": "module"` package; Node only loads those from 20.10 or so. The
  CLI's own `dist/` runs fine on 20.6 (`--version`, `check`, `render`).
- **The fix.** The floor gets its own job (`cli-node-floor` in ci.yml,
  "package (20.6.0, cli)"): build with Node 24, switch to 20.6, then
  `verify:package cli --no-build` packs, installs and runs the CLI.
  `verify-package.ts`'s build failure also hides the build's output; to
  see it, run `bun run build` with the same Node.

### Node's `parseArgs` message for an unknown option ends on an unbalanced quote (2026-11-02, @barmark/cli)

- **The symptom.** `barmark check --foo` printed `Unknown option
  '--foo'. To specify a positional argument starting with a '-', place it
  at the end of the command after '--', as in '-- "--foo"`: the last
  quote never closes.
- **The cause.** Node's own `ERR_PARSE_ARGS_UNKNOWN_OPTION` message
  (seen on Node 22.23); the CLI passed it through.
- **The fix.** `packages/cli/src/args.ts` recognises that error and
  writes its own: `unknown flag "--foo"; a file name starting with -
  goes after --`. Other `parseArgs` messages still pass through.

### A new package's tags need the `npm` environment's tag rule too (2026-11-02, @barmark/cli 0.1.0)

- **The symptom.** The first `cli-v0.1.0` release run failed its
  `publish` job in two seconds, with no steps run and no approval asked
  for. The log was empty; the only clue was the job's annotation: "Tag
  "cli-v0.1.0" is not allowed to deploy to npm due to environment
  protection rules."
- **The cause.** Besides its required reviewer, the `npm` environment
  allows deployments only from listed tag patterns (`barmark-v*`,
  `render-v*`, `v*`). The first-release checklist covered npm's trusted
  publisher and the repository rulesets, but not this list.
- **The fix.** Kevin added `cli-v*`; the failed jobs were rerun on the
  same tag, so no version was lost. RELEASING.md's "A new package's
  first release" now has the step. When a job fails with no log, read its
  annotations (`gh api repos/<repo>/check-runs/<job id>/annotations`).

### In 0.x a caret range stops at the next minor, so a `barmark` minor leaves the renderer behind (2026-11-02, barmark 0.8.0)

- **The symptom.** Bumping barmark.dev to `barmark` 0.8.0 installed two
  copies: 0.8.0 for the site and 0.7.0 nested under `@barmark/render`
  0.7.0, whose dependency is `^0.7.0`. The renderer would have drawn
  `Am(add9)` as an error while the site's own reader accepted it, and
  `@barmark/cli` (pinning `barmark` 0.8.0 and the renderer exactly) would
  have run two grammars in one command.
- **The cause.** Semver carets treat 0.x minors as breaking: `^0.7.0`
  means `>=0.7.0 <0.8.0`. The design assumed npm would resolve one copy;
  that holds only within a minor.
- **The fix.** A `barmark` minor release is followed by a renderer patch
  that requires it (`@barmark/render` 0.7.1). RELEASING.md, "Versions",
  says so.

### Vercel Analytics' SvelteKit entry breaks every page on SvelteKit 3 (2026-11-02, barmark.dev)

- **The symptom.** With `injectAnalytics` from `@vercel/analytics/sveltekit`
  (2.0.1) the pages stopped hydrating: "`$app/stores` has been removed in
  favour of `$app/state`". svelte-check had already refused
  `$app/environment`, which Kit 3 renamed `$app/env`.
- **The cause.** The package's `/sveltekit` entry still imports
  `$app/environment` and `$app/stores`.
- **The fix.** Stem Shovel's pattern (its FINDINGS and
  `src/lib/observability.ts`): inject the generic entry once from the root
  `+layout.ts` and report each route from `afterNavigate`
  (`site/src/lib/analytics.ts`). The local preview has no
  `/_vercel/insights/script.js`, so the browser tests answer it with an
  empty script.

### A commit pushed after its PR merged never reaches main (2026-11-02, /try)

- **The symptom.** /try's follow-up fixes were on `feat/site-try` and on
  GitHub, yet main and the dev server still showed the old page.
- **The cause.** They were pushed six minutes after #42 had merged. A
  merged PR takes no more commits into main, and nothing says so.
- **The fix.** Cherry-picked into #51. Before pushing more to a PR's
  branch, check it is still open (`gh pr view <n> --json state`).

### The dev server can keep serving the branch it started on (2026-11-02, barmark.dev)

- **The symptom.** After several branch switches, barmark.bench.lj.dev
  served chart markup the working tree no longer produced (no
  `wrap="off"`), while `chartHtml` itself returned the new markup.
- **The fix.** Restart Vite after switching branches before judging the
  dev site.

### A stacked PR merged after its base lands on the base branch, not main (2026-11-01, #33/#34)

- **The symptom.** #34 (numerals) was opened against #33's branch
  `feat/transpose`. Both showed "merged", but `main` had only #33.
- **The cause.** GitHub retargets a stacked PR to `main` only when its
  base branch is deleted. #33 merged without deleting `feat/transpose`,
  so #34 stayed based on it and merged into that branch.
- **The fix.** The release PR (#35) carried #34's commit to `main`. When
  stacking, either delete the base branch when merging the first PR, or
  check that the second PR shows `main` as its base before merging it.

### `bun test` can't resolve the site's `#lib/…` imports at runtime (2026-11-02, /try)

- **The symptom.** `site/src/lib/try/read.ts` imported `matches` from
  `#lib/guide/query.js`, and `bun test` failed with "Cannot find module
  '#lib/guide/query.js'". Its earlier `import type` from the same path
  had worked.
- **The cause.** `package.json` maps `#lib/*` to `./src/lib/*`, so the
  `.js` specifier names a file that doesn't exist. Vite and svelte-check
  map `.js` to `.ts`; Bun's runtime doesn't. A type-only import is erased
  before it runs, which hid the problem.
- **The fix.** Modules under `src/lib/` that tests run import each other
  relatively, with `.ts` (as `guide/query.ts` does). `#lib/…` stays for
  `.svelte` files and routes.

### Playwright's `fill()` is itself slow on tens of thousands of characters (2026-11-02, /try)

- **The symptom.** A test pasting 60,000 characters into `/try` timed
  out inside `locator.fill`. That looked like a frozen page, but the
  page wasn't the slow part.
- **The fix.** Set the value in the page and send an `input` event
  (`locator.evaluate`), as the home page's long-text test already did.
  Before trusting a slow-input test, check that it fails against the
  code without the fix (here: with the length limit disabled).

### A scrolling box doesn't hold an absolutely placed child (2026-11-02, home page)

- **The symptom.** Giving the home page's chart a 26rem minimum width
  inside its window (`overflow-x: auto`) made the whole page scroll
  sideways on a phone, by 17px, though the window itself scrolled.
- **The cause.** The renderer's screen-reader labels (`.bm-sr`) are
  `position: absolute`. A scroll container clips only descendants whose
  containing block is inside it; with no positioned ancestor in
  between, the labels sat against the page and widened it.
- **The fix.** The window's scrolling body is `position: relative`
  (`site/src/lib/components/Window.svelte`).

### `</script>` in a Svelte component's string ends its script (2026-11-02, /try)

- **The symptom.** `/try` puts a small inline script in `<svelte:head>`
  with `{@html}`, from a template string in the component. svelte-check
  failed with "Unterminated template" and "`</script>` attempted to
  close an element that was not open".
- **The cause.** Svelte, like the HTML parser, ends the component's
  `<script>` block at the first `</script>`, even inside a string.
- **The fix.** Spell the tag in two pieces, `</${"script"}>` (as
  `site/src/routes/try/+page.svelte` does).

### SvelteKit 3 deprecates `replaceState` (2026-11-02, /try)

- **The symptom.** In development every keystroke in `/syntax` or `/try`
  logged "`replaceState(...)` is deprecated. Use `goto(url, { state,
  shallow: true, replace: true })` instead."
- **The fix.** Both pages write their query through `keepQuery` in
  `site/src/lib/url.ts`: `goto` with `replace` and `shallow`, after a
  300 ms pause, since Safari refuses rapid history writes. A build test
  fails if a page imports `replaceState` again.

### svelte-check cannot run on TypeScript 7 (2026-10-31, site scaffold)

With `typescript` 7.0.2 (the native compiler the root uses), `svelte-kit
sync` fails with "Cannot read properties of undefined (reading
'readFile')": TypeScript 7's JavaScript API has no `ts.sys`, which Kit's
tsconfig handling reads. `site/` pins `typescript` 6.0.3 for
`svelte-check` alone; the root stays on 7. Retry 7 when Kit or
svelte-check announce support.

### Biome reads only the script of a `.svelte` file (2026-10-31, site scaffold)

Biome 2.6 formats and lints the `<script>` block of a Svelte component but
not its markup, so a prop used only in the template (`children` in
`+layout.svelte`) is "unused". `biome.json` has Biome's documented Svelte
override (unused variables and imports, `useConst`, `useImportType` off for
`**/*.svelte`); `svelte-check` covers the markup.

### npm can take minutes to serve a version it has accepted (2026-10-31, 0.1.0 release)

The release workflow logged `+ barmark@0.1.0` and its provenance, yet
`npm view barmark version` said 0.0.3 for about three minutes, and the
`latest` tag lagged the version itself. Anything that checks a publish
must wait and retry: the release workflow's `confirm` job polls `npm view
barmark@<version> --prefer-online` for up to ten minutes before
installing.

### Fallow's first run: three exports nobody imported, and a baseline for the parser's complexity (2026-10-31, Fallow)

`normalizeSymbol`, `QUALITIES` and the test fixture `timeline` were
exported but used only inside their own modules; they lost `export`. The
two verify scripts had grown the same six-line header, now
`scripts/lib.ts`. Seventeen functions sit above Fallow's complexity
thresholds, mostly the parser's line readers and `enumerateSuffixes`
(cognitive 38); rather than refactor working, well-tested code to land
the gate, `.fallow-health-baseline.json` accepts them as they stand and
fails on anything new or worse (checked by adding a cognitive-35
function: exit 1). Fallow's config is JSONC, so Biome needs
`json.parser.allowComments` for `.fallowrc.json`.

### Biome formats files that belong to other tools (2026-10-31, release process)

The first Swamp `release-check` run failed its own lint gate: Biome
reformatted Swamp's generated YAML, its Deno extension and the gitignored
`.claude/settings.local.json`. `biome.json` now reads `.gitignore`
(`vcs.useIgnoreFile`) and excludes `extensions/`, `models/`,
`workflows/` and `.swamp.yaml`, which Swamp owns. When a tool generates
files into the repo, exclude them from the formatter in the same commit.

### Swamp needs a signed-in account before `swamp repo init` (2026-10-31, release process)

`swamp repo init` stopped with "Run `swamp auth login`" because the VM's
Swamp session had expired. Sign-in is interactive, and `! swamp auth
login` in Claude Code fails ("Username and password are required")
because `!` gives the command no terminal to prompt on. The fix is an API
token: `SWAMP_API_KEY` (and `SWAMP_SIGNIN_TOKEN`) in barmark's 1Password
environment, loaded by varlock (`.env.schema`), with Swamp run as
`bunx varlock run -- swamp …`, as replicator does. Running Swamp in
GitHub Actions would need
`SWAMP_API_KEY` and `SWAMP_SIGNIN_TOKEN` as repository secrets, which is
why CI runs the same checks as plain `bun run` scripts, and Swamp wraps
those scripts locally as the release check.

### npm trusted publishing needs npm 11.5 or later (2026-10-31, release workflow)

Node 22 ships npm 10.9, which signs provenance but then publishes
unauthenticated: the first release run failed with a 404. The workflow
installs an exactly pinned npm (`npm install -g npm@12.2.1`) before
publishing. Pin anything installed in a job that holds the OIDC identity,
exactly as the actions are pinned to SHAs.

### Identical charts screenshot differently on two pages (2026-10-31, renderer browser suite)

The hostile-CSS test compares the chart's screenshot on a plain page and
on a page with hostile CSS. The charts were identical, yet 864 pixels
differed. Two causes, neither in the chart. Text anti-aliasing varies with
where an element sits on the page, and the hostile page's margins put the
chart 64 pixels further along. And the chart was 1007.3 pixels tall, so
its last pixel row was mostly page background, black on one page and
white on the other. The plain page now places the chart at the hostile
page's exact position, and both screenshots are clipped to whole pixels
(`packages/render/browser/`). To check that the test still catches leaks,
removing `:host{all:initial}` made it fail, after the hostile page gained
inherited properties the chart doesn't set itself (letter-spacing,
text-transform, font-style).

### A specificity race between bar lines (2026-10-31, renderer styles)

The repeat bar line (`.bm-bar[data-repeat-start]`, a double border) lost
to the rule that gives a row's first bar its left border
(`.bm-row>div.bm-bar:first-of-type`), so `‖:` never showed. Unit tests
saw the attribute in the markup; only a screenshot showed the line
missing. Both rules now share the same selector shape, and the repeat
rule comes later.

### npm pack would publish `workspace:*` as written (2026-10-31, workspace releases)

`@barmark/render` depends on `barmark` through the workspace
(`"barmark": "workspace:^"`). `npm pack` copies that range into the
tarball unchanged, and npm cannot install it. `bun pm pack` rewrites it to
`^` the local version, so the release workflow and `verify:package` pack
with Bun, and `verify:package` fails if any `workspace:` range survives.
The rewrite uses the version in the checkout, so `verify:release render`
also checks that version of `barmark` is already on npm: release `barmark`
first when the renderer needs something new in it.

### A package that builds only because the other one already had (2026-10-31, workspace CI)

`verify:package render` passed on the dev VM and failed on a clean
checkout: render's build resolves `barmark` through `node_modules` to
`packages/barmark/dist`, which only existed because something had built it
earlier. CI's package job would have been red for render on the first PR.
The final review caught it by running the checks in a fresh worktree.
`verify-package` now builds the whole workspace (in dependency order)
first, and the release workflow builds before packing. Before calling a
CI change done, run its steps in a fresh `git worktree` after `bun
install --frozen-lockfile`.

### `bun pm pack` takes a workspace dependency's version from bun.lock (2026-10-31, render 0.1.0 release)

Preparing `@barmark/render` 0.1.0, its packed `package.json` depended on
`barmark@^0.1.0`, although `barmark` was already 0.2.0 and the renderer
needs 0.2.0's `form` and `parts`. `bun pm pack` turns `workspace:^` into
a range using the version recorded in `bun.lock`, and neither `bun install`
nor `bun install --lockfile-only` updates a workspace package's version
there; `--frozen-lockfile` doesn't notice either. The `barmark` 0.2.0
release had left it at 0.1.0. RELEASING.md now bumps the version in
`bun.lock` too, and `verify:package` fails when a packed workspace range
is not `^` the package's own version.

### Even flex slots wrap a triplet that had room (2026-11-01, render layout)

Left-aligning chords in even shares of a bar (`flex:1 1 0` on each slot)
broke a triplet group onto two lines below about 670px, with plenty of
room left. A zero flex basis lets a slot shrink to its minimum content
width, and once the chart switches to its wrapping layout a group's
minimum is a single chord. `min-width:max-content` keeps slots whole on
a wide screen, but it also stopped a busy bar wrapping on a phone at
large text. The wide layout now keeps slots whole and the wrapping
layout gives them `flex:1 1 auto`, so they shrink only when they do not
fit. Browser tests cover both widths and the phone (`packages/render/browser/render.pw.ts`).

### A grid's auto column grows for items that span it (2026-11-01, render layout)

Indenting lyrics to the first bar line with a margin left the bar-number
column 4px wider in one section than the rest: items spanning every
column (lyrics, notes, mid-chart changes) with a margin feed their size
into the `auto` tracks they span. The bar-number column is now a fixed
width (`GUTTER` in `packages/render/src/styles.ts`), so every section's
first bar line lines up.

### `italic: true` in UnoCSS web fonts loads only the italic (2026-11-01, site chart look)

Adding Noto Serif's italic to barmark.dev with `{ name: "Noto Serif",
weights: ["400"], italic: true }` made every lyric italic too: the preset
then requests only the italic faces, and a browser with no upright face
draws upright text in the italic. Two entries, one upright and one
italic, give both faces (`site/uno.config.ts`). The site's browser suite
now checks an upright Noto Serif exists as well as the italic.

### UnoCSS gives up on web fonts after 2 seconds (2026-11-01, CI site job)

`main`'s CI went red on the merge of the barmark 0.4.0 release PR, in
the `site` job: the build stopped with "[unocss] Fetch web fonts
timeout" while fetching Noto from fonts.bunny.net. A rerun passed.
`presetWebFonts` fails the build when the font CSS takes longer than
2 s (`timeouts.failure`, default 2000), and a CI runner sometimes
takes longer. `site/uno.config.ts` then allowed 30 s and warned at 5 s.
Stem Shovel sidesteps the same problem with the `"none"` provider
under tests.

It failed again on 2026-11-02 (barmark 0.8.0's release PR), at 30 s, so
a longer timeout was never the fix: the build depended on a third
party's response time. The site now serves Noto itself: the
`@fontsource` packages (pinned) are imported in `+layout.svelte`, Vite
emits the files with hashed names under `/_app/immutable/`, and Vercel's
adapter serves that folder with `immutable, max-age=31536000`. The build
makes no font request, and readers no longer fetch fonts from bunny.
`presetWebFonts` is gone; the font stacks are in `uno.config.ts`'s
theme.
### A misspelt custom property removes the whole border (2026-11-01, renderer)

The dashed line over bars inside a rit. didn't appear, and no test
failed. The rule used `var(--bm-directive)`, which doesn't exist; the
directive colour is `var(--barmark-directive,var(--bm-muted))`. A
`var()` with no value and no fallback makes the whole declaration
invalid at computed-value time, so `border-top` became `none` rather
than falling back to a default colour. The linkedom tests check
markup, not computed style, so only a browser can catch it: the
Playwright test "bars inside a rit. carry a dashed line in the
directive colour" now does.

### A prerendered control used before the page's script runs is lost (2026-11-01, site CI)

PR #32's `site` job failed in "sorting moves rows and keeps every
example rendered": the test chose a sort and the URL never gained
`sort=name`. It passed locally. The guide is prerendered, so its search
box and sort select exist and accept input before SvelteKit hydrates;
a change made in that window never reaches the page's state, and
hydration doesn't replay it. More guide rows made hydration slower on
the CI runner, which opened the window. Delaying the site's scripts by
3 s reproduces it. The guide's interaction tests now repeat the action
until the URL follows (`untilUrl` in `site/browser/site.pw.ts`).

### A git worktree inside the repo breaks `bun run check` and Fallow (2026-11-03)

With a worktree checked out at `.worktrees/site`, the root `bun run
check` failed with "Biome exited because the configuration resulted in
errors", and Fallow warned it skipped a hidden directory. The worktree
carries its own `biome.json`, which Biome reads as a second root
configuration, and `.worktrees/` is not gitignored. Keep worktrees
outside the repository (the session scratchpad, or a sibling folder).

### xmllint reads a document's doctype from the network unless told not to (2026-11-03, musicxml)

MusicXML files carry a doctype naming the partwise DTD on musicxml.org,
and xmllint fetches it, so schema validation in tests was slow and failed
offline. `--nonet` stops the fetch; validation is against the vendored
XSD only (`packages/musicxml/tests/schema.ts`). The XSD's own imports of
`xml.xsd` and `xlink.xsd` were remote too, and point at local copies
(`tests/schema/README.md`).

### npm answers a logged-out scoped publish with 404, not 401 (2026-11-04, release)

The placeholder publish of `@barmark/musicxml` 0.0.0 failed with "404 Not
Found - PUT https://registry.npmjs.org/@barmark%2fmusicxml", which reads
as "the scope doesn't exist". The scope was fine (`npm view
@barmark/render maintainers` named Kevin); the terminal wasn't logged in
to npm. `npm login` fixed it. RELEASING.md's first-release step now says
to run `npm whoami` first.

### Dorico ends a slash region after the last measure with a direction (2026-11-04, musicxml)

Peaceful Dreams imported into Dorico showed beat slashes up to bar 125
and hollow diamonds from bar 126 to the end. The export turned slash
style on in bar 1 and never off, which the MusicXML spec says lasts to
the end of the part. Small test files showed the rule: the region ends
after the last measure holding a `<direction>` or `<attributes>` (bar
125 had the "Outro" heading; with no heading it ended after bar 1).
Restating `<slash type="start">` there or in the last bar didn't help.
Past the region Dorico shows the placeholder note itself, a whole note
with a slash notehead, which it draws as a diamond. The export now
writes one slash note per beat (`beatPieces` in
`packages/musicxml/src/rhythm.ts`), which looks right with or without
slash style; the measure-style stays for programs that use it.

### Dorico neither reads nor writes a repeat's play count in MusicXML (2026-11-04, musicxml)

Peaceful Dreams' outro `x5` imported into Dorico as a plain repeat: the
end barline's play count stayed at 2 and nothing printed it, though the
export wrote `<repeat direction="backward" times="5"/>`. Setting the play
count to 5 in Dorico 6.2 and exporting wrote a bare `<repeat
direction="backward"/>`, so the count has no MusicXML route into Dorico
at all. The export now also prints a count above 2 as words, "×N"
(`repeatWords` in `packages/musicxml/src/measure-xml.ts`).

### Dorico hides rests under slash style, and imports chord symbols as global (2026-11-04, musicxml)

Morning Song imported into Dorico showed the piano playing slashes
through its tacet bars, with the guitar's chords on both staves. Two
causes. Ours: the export kept slash style on through a tacet bar's
`<rest measure="yes"/>`, and Dorico draws slashes over a rest and hides
it. Slash style now stops in any bar with a rest (`slashed` in
`packages/musicxml/src/notes.ts`), as the MusicXML spec's own slash
example does. Dorico's: it imports every `<harmony>` as a global chord
symbol, shown on every staff that shows chord symbols, with the first
part's chord kept where parts differ, though Dorico has local
(per-staff) chord symbols and each MusicXML part writes its own. Nothing
in MusicXML marks a chord local, so a chart whose parts play different
chords loses the later parts' chords in Dorico; they are fixed by hand
there.

### A grammar section needs its barmark.dev guide row in the same pull request (2026-11-04, site)

The credits pull request (#130) failed CI's `site` job twice over: the
guide's coverage test (`site/tests/coverage.test.ts`) reads the grammar
from the repository, so a new section (7.5) needs a guide row at once;
and the home page's demo must equal `examples/peaceful-dreams.chart.md`,
which had gained credit lines. The site installs the published packages,
so before the release a credits row renders its credits as text, and the
demo would too. The guide row went into the grammar's pull request; the
example's credits wait for the site bump that installs the new barmark,
which changes the example and `site/src/lib/demo.chart.md` together.

### The release check refuses an untracked `.playwright-mcp/` (2026-11-04, process)

`verify:release` needs a clean `main`, and the Playwright MCP's
screenshots and logs land in `.playwright-mcp/` at the repository root,
untracked: the CLI 0.2.2 gate failed on them after a preview check. They
are now listed in `.git/info/exclude` on the bench VM (`git status`
doesn't count excluded files); they are never committed.

### The musicxml build has no DOM types, so `readMxl` types the platform itself (2026-11-05, musicxml)

`readMxl` passed `bun run check` and every test, then failed the package
build that the CLI's Node test runs: `tsconfig.build.json` sets `lib` to
`ESNext` alone, with no DOM or Node types, so `DecompressionStream` and
`TextDecoder` don't exist there, though Bun, Node and browsers all have
them (the root `tsconfig.json` sees Bun's types). `mxl.ts` now declares
the slice of the platform it uses (`Platform`, read off `globalThis`),
which also lets it see a missing `DecompressionStream` and say "reading
.mxl needs Node 20.12 or later". Run `bun run --filter '*' build` (or the
whole `bun test`) after adding a platform API to `src/`.

### The round trip's yardstick reuses barmark's `timeline` rather than copying it (2026-11-05, musicxml)

The import's round-trip test needed the barmark package's `timeline`
(each attack's exact place in its bar), and the plan said to copy it.
Fallow's duplication check failed the copy at once. barmark's
`tests/chart/fixtures.ts` now exports `timeline`, and
`packages/musicxml/tests/import/played.ts` imports it across packages:
one yardstick for both round trips.

### MuseScore reads a dotted note's `<dots>` only before its `<durationType>` (2026-11-06, musicxml)

The hand-written `hymn.mscx` fixture's dotted half came out of MuseScore
as a plain half followed by a quarter rest: in a `.mscx` `<Chord>`,
MuseScore reads `<dots>1</dots>` only when it comes before
`<durationType>`, and silently fills the bar with a rest otherwise. Write
`<dots>` first in a hand-written `.mscx`, and read each regenerated
`.musicxml`'s durations (and the `.chart.md` the script writes beside it)
before committing.

### Our export's pickup isn't MuseScore's (2026-11-06, musicxml)

barmark's export writes a `[1/4]` pickup as a short first measure in a
`<time>` of its own, then the full meter, with no `implicit="yes"`
(MuseScore's mark for a pickup); the import read that back as
`time: 1/4` then `time: 3/4`, so Amazing Grace never came back as
written. The import now reads both shapes as a pickup
(`settleFirstPickup` in `import/read.ts`).

### A lyric row ends its system (grammar 7.7), and examples feed several tests (2026-11-06, examples)

**Symptom:** the first draft of `examples/shenandoah.chart.md` failed the
examples test (warnings that a syllable "falls where the voice starts no
note"), then the MusicXML sounding snapshot and the export/import round trip:
the import wrote the guitar as a second system with a line of `Vox` slashes.
**Cause:** by design (grammar 7.7, not a bug), a lyric row covers the system just above it, so a part line
written after the row starts a new system; and a row's cells divide a bar on
their own grid, so three words under four notes put one where no note
starts. Every file in `examples/` also feeds `sounding.json` and the
round-trip test.
**Fix:** put the row last in its system, give it as many tokens per bar as
the melody has slots, generate the canonical text with `printChart`, and add
the chart to `sounding.json` with `bun scripts/musicxml-sounding.ts` (the
other entries do not change). Lives in `examples/shenandoah.chart.md`.

### Two programs, two shapes of a melisma's `<extend>` (2026-11-06, musicxml)

**Symptom:** a melisma our own export wrote never ended on import: the
unsung note after it came back as `:/`, a breath after a row's melisma as
`/`, and a melisma before a repeat's endings held into the first ending
(an "importer bug" and a spurious row).
**Cause:** MuseScore writes `<extend/>` on the syllable and nothing on the
notes it holds over, and draws a word's first or middle syllable held as
hyphens, so the import held a syllable until the next syllable or rest.
Our export writes the syllable with `<extend type="start"/>` and a lyric
holding only `<extend/>` on each held note, which says where the hold
ends; the import read that lyric as more of the hold and never stopped.
A row starting with `/` had the same root on barmark's side: its start
was read as holding, so the export wrote an `<extend/>` with no start.
**Fix:** a held note's own lyric (ours, or an extend's `stop`) sings `/`
and ends the hold; the begin/middle guess applies only until a verse
writes such a lyric (`tokensAt` and `Holds` in `import/lyrics.ts`). A
row starting with `/` holds what its verse last left held in play order
(`ends` in barmark's `chart/verses.ts`), and nothing before the verse has
sung; the import's `settled` (`import/verses.ts`) carries the same state
from row to row. A first cut made every row's start hold nothing, which
broke a word held across a line break, an ordinary lead-sheet shape.

### A hold follows play order, but the import reads measures in written order (2026-11-06, musicxml)

**Symptom:** a verse 2 melisma from a repeat's body into its second ending
came back with a spurious `lyrics 2: | -- |` under the first ending, a
false "verse 2 is never sung", and `-- z` for `/ z`. Carrying a row's
leading `/` from the row written before it raised importer bugs whenever
a repeat or ending lay between them.
**Cause:** MusicXML holds a syllable in written order, through the first
ending's notes; barmark holds it in play order, where pass 1 never sings
verse 2 and the second ending follows the body directly.
**Fix:** the import's holds enter each ending from what the body held,
and holds no verse its passes don't sing (`enterEnding` in
`import/lyrics.ts`, `Bar.ending` from `barsOf`). A row's leading `/`
carries from the row just before it in play order only where that is
sure (`carried` in `import/verses.ts`); elsewhere it is `--`, reported as
a loss naming the measure.

### A verse in every measure made the lyric import verses × measures (2026-11-06, musicxml)

**Symptom:** Vercel's Security Review on PR #162 flagged a denial of
service: a MusicXML file whose every measure sings a lyric `number` no
other measure sings. 4,000 such measures took 84 s to import.
**Cause:** three loops over every verse of the piece. `wordsOf` worked
out each verse's row cell in every measure up front. Each system asked
every verse whether its bars sang it. `tokensAt` looked at every verse
ever seen on each new note, because a verse that stopped holding stayed
in `holds.on` as `false`. `verseOf` also rebuilt the set of taken verse
numbers for each new one.
**Fix:** row cells are worked out when a row asks for one (`Words.cell`).
Each measure keeps its own verses (`Words.versesIn`), and a system reads
only its bars' verses (`versesOver` in `import/verses.ts`). `holds.on`
holds only the verses holding now. `PartState.taken` grows as verses are
numbered. The same 4,000 measures import in about 2 s, and
`scale.test.ts` checks the ratio against 400.

### Only the site's speed test caught a quadratic layout (2026-11-07, render)

**Symptom:** bumping barmark.dev to `@barmark/render` 0.15.0, the site's
"a 2,000-line paste renders quickly" test took 959 ms against its 500 ms
bound. `layoutChart` took about 1 s, against 0.3 s in 0.14.0.
**Cause:** `singerOf` (`render/src/verses.ts`), new in 0.15.0, asked
"does any bar of this chart sing on notes?" for each line of a chart
with no `part:` lines, reading every bar each time. The package had no
speed test of its own; the site's runs the published package, so it
noticed only after the release.
**Fix:** the answer is worked out once a parse (`singsOnNotes`, a
`WeakMap`). `render/tests/scale.test.ts` now holds the layout to linear
time (ten times the lines, at most 25 times as long), and 0.15.1
shipped the fix.
**Then:** that test's bound hid three more scans of the same kind (each
bar line filtering every played bar to find its own), because parsing,
which is linear, was most of the time it measured. A review found them by
profiling 8,000 lines. 0.16.0 indexes the bars by line once; the test
also times a chart with parts and lyric rows, where the scans cost most,
and both bounds are now 20. A ratio test only sees a quadratic term as
large as the linear work around it: profile the long case too.

### A quadratic scan no timing test could see (2026-11-07)

**Symptom:** Vercel's security review of #174 flagged the MusicXML
import: placing each text line under the staff looked the line up in
its measure's marks (`indexOf`), so a file with many words in one
measure cost n²/2 comparisons.
**Cause:** a ratio test (ten times the words, at most 25 times as
long) passed before the fix. The engine runs `indexOf` so fast that
at 250,000 words the scan was 8 of 14 seconds, still under the bound.
**Fix:** the marks before the heading are gathered once per measure
(`readMarks`, `ahead`). `musicxml/tests/import/scale.test.ts` counts
the work instead of timing it: it wraps the marks in a `Proxy`, counts
element reads, and fails at n²/2 (2,007,003 reads for 2,000 lines;
under 10 per mark now). Where a quadratic term is cheap per step,
count the steps.
**Then:** a review profiling the same file found two more per-word
scans the finding didn't name: words above the staff looked for a
`<swing>` in the whole measure (`marks.ts`, now `Context.swing`), and
text after a heading was compared with every line before it
(`structure.ts`, now a `Set`). Worst was the barmark parser:
`readWords` re-read the whole cell and re-split what came before each
quoted word, and the import's self-check parses what it writes. The
security report named one site; the class was "per word, look at all
the words". Search for the class, not the line.
