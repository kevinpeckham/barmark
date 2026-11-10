# Findings

Gotchas and insights from building barmark: what a tool, a pattern or our
own process did that was not obvious, and what to do about it. Add an
entry whenever one surfaces (CLAUDE.md, "Working agreement"). Newest at
the top of each section; say where the lesson came from so the code can
be found. Conventions belong in CLAUDE.md, RELEASING.md or the grammar,
not here.

## Testing

### linkedom is not a browser for custom elements (2026-11-08, @barmark/score)

- **The symptom.** Writing `<barmark-score>`'s tests on linkedom, three
  things behaved unlike a browser: switching to the score asked the
  engine twice; a server-drawn element connected after `define` never
  upgraded; and every engraving was asked for at width `undefined`.
- **The cause.** linkedom's `MutationObserver` reports attribute changes
  to an observer that asked only for `childList` and `characterData`, so
  setting `view` looked like a new chart; its `customElements.define`
  upgrades only elements already connected, not ones connected later;
  and it has no layout, so `clientWidth` is `undefined`, not 0.
- **The fix.** The element ignores `attributes` records and reads
  `clientWidth || 0`, both harmless in a browser; the test connects the
  server markup before importing the element. The browser behaviour
  itself is Task 6's Playwright suite's to prove
  (`packages/score/src/element.ts`, `packages/score/tests/element.test.ts`).

### The package gate failed for six tasks without anyone running it (2026-11-08, @barmark/midi)

- **The symptom.** At Task 15, `bun run verify:package midi` failed:
  the Node smoke test wanted the main entry to export exactly
  `exportMidi` and `VERSION`, and it had gained `importMidi` and
  `readSmf` in Tasks 9 to 13.
- **The cause.** `scripts/smoke-midi.mjs` pins the entry's exports, which
  is its point, but the plan runs the package gate only at the end of
  each phase, and `bun test` doesn't run it.
- **The fix.** The smoke test now expects the four exports and imports
  the file it exported. A task that adds a public export runs
  `verify:package` for its package.

### Reporting each code once a track hid distinct problems (2026-11-08, @barmark/midi)

- **The symptom.** A track with a tempo of 0, a time signature of 7/32
  and a key of 9 sharps reported only the tempo: the dropped key, which
  changes every chord's spelling, went unmentioned.
- **The cause.** The SMF reader kept one diagnostic per (code, track)
  and its first message, so three different `meta-invalid` problems
  collapsed into one.
- **The fix.** One counted report for the whole import,
  `packages/midi/src/import/report.ts`, which the reader reports into:
  each problem is a (code, track, message), repeats counted with their
  first five bars. A message never carries a per-event value read from
  the file (the time signature's message no longer prints its numbers),
  or a hostile file could raise one diagnostic per value; a message
  raised once per track or per import may name tracks, eight at most.

### A malformed-file test can fail for an earlier reason than the rule it names (2026-11-08, @barmark/midi)

- **The symptom.** The SMF reader's `not-midi` tests passed with the
  `MThd` id check deleted, and with a header length of 4 accepted; the
  truncated-file test passed with a `bad-event` wrongly reported for an
  event cut by the end of the file.
- **The cause.** The hand-built bytes were shorter than 14, so the
  reader refused them for being too short before it ever looked at the
  id or the length; and the "100 bytes short" file was cut exactly on an
  event boundary, so no event was ever half read.
- **The fix.** Mutation runs over every rule of `packages/midi/src/smf/read.ts`
  (deleting or bending each check and seeing a test fail) found all
  three; the tests now use files that are otherwise good (a whole header
  after a `MTrk` id, a short header in a long enough file, a cut inside
  an event). For hostile-input tests, make the input fail only the rule
  under test, and mutate the rule to prove it.

### A plan's charts don't parse until something parses them; barmark's syllable times are floats (2026-11-08, @barmark/midi)

- **The symptom.** Task 4 of the MIDI plan wrote `| @B C |` and
  `| @A C |` for rehearsal-mark markers: both are errors ("a rehearsal
  mark is a cell of its own", grammar 2.5). And lyric onsets came back
  as `0.3333333333333333`, not a third.
- **The cause.** The plan's charts were written from memory of the
  grammar, never run. `PlayedSyllable.at` is a float in whole notes
  (barmark's `slotTimes`, `chart/shares.ts`), where the performance needs
  exact quarters.
- **The fix.** The tests write `| C | @B | C |`. `nearest` in
  `packages/midi/src/perform/quarters.ts` turns four times the float back
  into the fraction it came from (the first continued-fraction
  convergent within 1e-9), and `perform-map.test.ts` checks thirds come
  back exact. Parse every chart a plan or brief quotes before relying on
  it.

### A repeat mark on a bar line with no bar had no measure to go on (2026-11-07, @barmark/musicxml)

- **The symptom.** `| Gm |`, `|: % |`, `| ... :|` plays Gm Gm Gm; the
  export played two bars. `|: Segno |` then `| C :|` went back to the
  chart's start.
- **The cause.** `lineMarks` in `packages/musicxml/src/measures.ts` puts
  `|:` on a line's first measure and `:|` on its last, and returned when
  the line wrote none: a line of directions or `...` alone.
- **The fix.** `barlessMarks`: such a line's `:|` closes the repeat on
  the measure before it, its `|:` waits (`Pending.opens`) for the next
  measure. Found by the round trip's property test.

### Hand-picked jump charts all round-tripped; random ones didn't (2026-11-07, @barmark/musicxml)

- **The symptom.** A review of PR #174 reported that "a D.C. chart's
  round trip drops its last bar", with no example. Nine hand-written
  jump charts (D.C., D.S., al Fine, al Coda, after repeats, mid-line,
  with replays) all came back playing the same.
- **The cause.** The bugs were in combinations nobody writes by hand: a
  jump back through a replay that repeats or holds the Fine, a jump on
  its own bar line after a `:|`, a `:|` on a bar line with no bar, text
  among bars that never play, a text line written twice. The dropped
  last bar itself never turned up in about 5,800 random charts (seeds 1
  to 9000). Two shapes still failed. A replay with `->` that the Fine or
  To Coda ends after the jump (seeds 1827, 3674): barmark cut the bar
  before the Fine and played none of it, a grammar question (does the cut
  take the replay's last written bar or its last played one?). Kevin
  decided (2026-11-08, grammar 6): the last written bar, which a stop
  before it never reaches; `reachesEnd` in
  `packages/barmark/src/chart/expand.ts`, and the `test.todo` is now a
  test. (Those seed numbers no longer make that chart: the generator has
  changed since. A sweep of seeds 1 to 9000 on 2026-11-08 fails on 2479,
  3839 and 4318, on main too, none with an elision.) And seed 6404:
  the import, falling back to played order (it can't hold an unplayed
  `## Chorus x2` after a To Coda), writes the D.S.'s return into the
  section before it, losing its heading; the same happens on main.
  A known limit of any chart written in play order: bars before the
  first heading (the unnamed section) that a jump plays again can't be
  named again, since barmark writes no heading for it mid-chart, so
  `| C | G |`, `## Verse`, `|: Am | F :|`, `| D.C. |` comes back with
  the return's C G under `## Verse`. The generator starts one chart in
  five with such bars, and those are compared without their sections
  (a `test.todo` keeps the case).
- **The fix.** `packages/musicxml/tests/import/jumps-property.test.ts`
  round-trips 300 seeded charts from `jump-charts.ts` (one jump with its
  signs, repeats, endings, `x N` on lines and headings, replays,
  elisions, `%`, a closing `...`, text lines, two parts) and asks that
  each plays the same, keeps every text line in order and prints
  canonically, and that the tests' player (`tests/play.ts`) plays the
  export as barmark plays the chart: two readers. The player missed
  self-closing `<measure/>`s (a bar no pass plays, with nothing in it)
  until this check met one. Where a text line lands among bars written out isn't
  asked: writing passes out puts more bars before it. Shrink a failure
  by deleting lines and cells while it still fails.

### Reading a mark once per score also reads a repeated line once (2026-11-07, MusicXML import)

- **The symptom.** `| C |` then `hi` twice imported with one `hi`.
- **The cause.** The export writes text lines in every part, so the
  import read each text once (`once` in
  `packages/musicxml/src/import/structure.ts`), which also collapsed a
  line one part writes twice.
- **The fix.** `shared` keeps each line as many times as one part writes
  it. Found by the round trip's property test, whose generator wrote the
  same line twice by chance. Dedupe across sources, not within one.

### Writing bars out in play order drops the text of bars that never play (2026-11-07, @barmark/musicxml)

- **The symptom.** `| E | Fine |`, `| F | D.C. al Fine |`, then `mid`,
  `| G |` and `watch`, in a chart the export writes in play order: both
  text lines were gone after the round trip.
- **The cause.** Play order has no place for a bar no pass plays (here
  G, after the Fine), and the text lines went with their bar: in the
  export's `inPlayOrder` and `rewrite`, and in the import's written-out
  fallback (`readStructure`). And `bracketPlays` ran past its repeat when
  a jump inside it sent play elsewhere, taking a replay's bars and their
  text with it.
- **The fix.** Both sides hang the text of unplayed bars on the foot of
  the played bar written last before them, at its first play
  (`hangUnplayed` in `packages/musicxml/src/measures.ts` and
  `packages/musicxml/src/import/structure.ts`). Putting it after the
  chart's last bar, the first try, moved it past text written later (a
  Coda's): the property test's codas now carry a text line. And
  `bracketPlays` stops at its own bars and its section's occurrence.
  Found by the round trip's property test, which asks that every text
  line come back, in order.

### A jump on a repeat's last measure is taken on its first pass (2026-11-07, @barmark/musicxml)

- **The symptom.** `|: A | B :|` then `| D.C. |` and `|: A | B | D.C. :|`
  exported to the same file: the D.C. on measure 2, beside its backward
  repeat. barmark plays the first A B A B A B, the second A B A B.
- **The cause.** MusicXML has one place for both. MuseScore 4.7 takes
  the jump on the first pass (checked by exporting each chart to MIDI
  with `mscore -o` and counting the notes: the first played four bars,
  the second, with a C after it, five), as the import's `playedOrder`
  and the tests' player already did.
- **The fix.** A jump cell after a measure that already closes a repeat
  (on a later bar line) makes `directionCell` in
  `packages/musicxml/src/measures.ts` send the chart out in play order;
  a jump inside the repeat keeps its marks, which mean what barmark
  means. Found by the round trip's property test.

### A replay written out carries neither its repeats nor its directions (2026-11-07, @barmark/musicxml)

- **The symptom.** `## A` then `| Am | x3`, a replay `## A`, then a
  D.C.: barmark plays the replay's `x3` once after the jump (grammar
  5.2), but the exported file played it three times. A replay holding
  the Fine (`D.S. al Fine` back through it) played on past the Fine.
- **The cause.** The export writes a replay as the bars it plays, with
  no repeat marks or directions: right the first time through, but a
  jump back through it plays the written-out passes again, and never
  meets the Fine or To Coda its section holds.
- **The fix.** `playedOut` in `packages/musicxml/src/measures.ts` marks
  a replay that repeats (its heading's `x N`, or a repeat in the section
  it replays: after the jump it plays one pass, and an elision cuts from
  that pass), or whose bars (the one its elision cuts included) are
  followed by a Fine or To Coda, and a chart with a jump then goes out in
  play order (`inPlayOrder`). Found by the round
  trip's property test (`tests/import/jumps-property.test.ts`).

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

### A download's Content-Length is not the size of what you read (2026-11-10, @barmark/score)

- **The symptom.** Measuring `<barmark-score>`'s Verovio download as
  bytes read over `Content-Length` would end the bar at 367% from
  jsDelivr (brotli, 2,014,350 bytes; 312% gzipped, 2,373,768), while
  Verovio is 7,400,749 bytes.
- **The cause.** With `Content-Encoding`, `Content-Length` is the
  compressed size, but `response.body`'s reader yields decoded bytes.
  Worse, a cross-origin response hides `Content-Encoding` unless the
  server sends `Access-Control-Expose-Headers` (jsDelivr sends `*`; many
  servers don't), while `Content-Length` is safelisted and always shown:
  the response looks uncompressed. Measured through a pass-through
  without the expose header, the bar read "30% (0.7 of 2.4 MB)" and then
  jumped back to 32% once the body outgrew the length (the bytes read
  over Verovio's size).
- **The fix.** `downloadMeter` measures against `Content-Length` only
  when the response is not encoded; otherwise against Verovio's known
  decoded size (`VEROVIO_MODULE_BYTES`, test-checked against the
  installed file), else not at all. Cross-origin, a length short of that
  size is taken as compressed; a body that outgrows its length falls to
  the next rule. Measured in Chromium: same-origin unencoded, 0 to 100%
  with "of 7.4 MB"; jsDelivr brotli, gzip and gzip with the header
  hidden, 0 to 100%, monotone, never "MB"
  (`packages/score/src/download.ts`, `packages/score/tests/download.test.ts`,
  `packages/score/browser/score.pw.ts`).

### A bundled 7 MB module is parsed at every start of a compiled binary (2026-11-08, cli)

- **The symptom.** Adding `render --score` put Verovio (`verovio/wasm`, a
  7.4 MB single-file module with the wasm inlined) into the CLI's binary,
  and every command got slower, not just `--score`. linux-x64, this VM
  (timings noisy, three runs each): `--version` 0.12 s / 67 MB RSS before
  Verovio, 0.17–0.29 s / 92–95 MB with it; `check` on Morning Song
  0.17 s / 72 MB before, 0.18–0.21 s / 100 MB with it.
- **The cause.** Under Node the CLI imports Verovio with a dynamic
  `import()` on the first score, so nothing else loads it. `bun build
  --compile` follows that literal `import()` into the one start bundle, and
  the binary parses all of it at launch (`bun build src/binary.ts` emitted a
  14.5 MB `binary.js`).
- **The fix.** The binary embeds the module as a file (`import … from
  "verovio/wasm" with { type: "file" }`, as it embeds Edwin) and imports it
  by that path only when a score is drawn; the command gets the module
  through `Io.verovio` (`packages/cli/src/binary.ts`, `node-io.ts`,
  `score.ts`). After: `--version` 0.12–0.15 s / 68 MB, `check` 0.15–0.18 s /
  73 MB, back to before; `render --score` 0.8–1.1 s / 240 MB, as with the
  module bundled (0.8 s); binary 102.5 MB (95.1 MB before Verovio,
  109.2 MB bundled in). `packages/cli/tests/binary.test.ts` ("the binary's
  start bundle") keeps the start bundle under 2 MB with Verovio emitted
  beside it.

### Node refuses a spread Bun allows, so `bun test` couldn't see the limit (2026-11-08, @barmark/midi)

- **The symptom.** The SMF writer appended each event with
  `bytes.push(...eventBytes(event))`. Under `bun test` a 200,000-byte
  text meta wrote; the built package under Node 22 threw `RangeError:
  Maximum call stack size exceeded` from about 130,000 bytes (found in
  review, not by a test).
- **The cause.** Spread call arguments go on the stack, and the limit is
  the engine's: about 130,000 in Node (V8), about 1,000,000 in Bun (JSC).
  `midi-file` has the same limit reading text (`String.fromCharCode.apply`),
  so it can't read back a megabyte meta event either.
- **The fix.** `src/smf/write.ts` never spreads a payload into a call: it
  pushes byte by byte and assembles chunks with `Uint8Array.set`. The test
  writes a megabyte meta event, which fails under Bun too if anything
  spreads, and checks its bytes directly rather than through `midi-file`.
  Size a limit test past both engines' limits.

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
- **The fix.** The export writes a `|: … :|` that holds a bar line's
  `x N` (endings included) in play order, with no repeat marks, as it
  already did for a repeated section holding repeats (`bracketLine` and
  `rewrite` in `packages/musicxml/src/measures.ts`), as many bars as its
  lines play (`countLine`: each body line times its own `x N`, each
  ending once per pass it takes), not counted by plays of its last bar,
  which a `| ... :|` makes the inner line's; a `## X x2` around
  it keeps its repeat bar lines, and a jump through it writes the whole
  chart in play order (`inPlayOrder`). Every nesting the grammar allows
  is covered by `NESTED` in `packages/musicxml/tests/charts.ts`, played
  by the export's test player (`order.test.ts`) and round-tripped
  (`roundtrip.test.ts`). Repeats with none inside keep their marks.

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

### One unreadable chord dropped its whole line, so a chart played short (2026-11-10, barmark)

- **The symptom.** Porting the listening tool, a chart with one `CM7`
  played shorter than its recording: every bar on that line was gone, so
  everything after it was early.
- **The cause.** `parseBarLine` treated every error alike: any error, a
  chord symbol it couldn't read included, made `bars` null, and the line
  was excluded. The error was reported, but play order, timing and every
  export silently lost the line's bars.
- **The fix.** Kevin's decision: an unreadable slot (chord symbol, note
  set, voicing, syllable or mark) is still an error but becomes unknown
  harmony with the author's `text`, `{ kind: "unknown", text: "CM7" }`;
  only an error in the bar line's structure, where the bar count itself is
  unknown, drops it. The slot reader is its own function, `slotReader`,
  with two ways to report: `error` breaks the line, `unread` keeps the
  slot (`packages/barmark/src/chart/barLine.ts`; grammar principle 4,
  2.3; `packages/barmark/tests/chart/unreadable-slots.test.ts`). Tests
  that used `Hm` to make a line fail now use a structural error.

### A passing tone at exactly a quarter of the chord named a 9th (2026-11-08, @barmark/midi import)

- **The symptom.** A fill of eighths D5 E5 F5 E5 D5 from beat 2 over a
  held C triad read `C(9)`, and a C chord's pedal ringing one beat into
  an F bar read `Fmaj9` (Task 12 fix round 3's probes); each is a chart
  no one would write.
- **The cause.** Spec 5.5's passing-tone rule dropped a pitch class
  sounding *under* a quarter of the strongest one's weight
  (`w >= PASSING * strongest` kept it). The fill's D sounds 480 of the
  bar's 1,920 ticks, the pedal's C E G one beat of four: exactly a
  quarter, so each was kept. Common figures land on the threshold
  exactly, because they are made of the beat the bar is made of.
- **The fix.** `keptOf` in `packages/midi/src/import/segments.ts` keeps
  a pitch class only when `w > PASSING * strongest`: a tone at a quarter
  or under is passing, so a note must sound more than a quarter of the
  segment to be a chord tone (Claude's ruling, fix round 4, 2026-11-08;
  spec 5.5, "Claude's calls" 17). `import-segments.test.ts` pins both
  sides (481 ticks of A over a C bar is `C6`, 480 is `C`), the fill and
  the pedal. Cost: a real added tone held exactly a quarter of its chord
  is dropped. Spec 5.5 makes a change of either tuned number (the 16th
  attack window, the quarter) a FINDINGS entry; this is that entry.

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

### `bun run --filter '!pkg'` does not leave a package out (2026-11-10, @barmark/engraver)

- **The symptom.** The root `bun run build` (`bun run --filter '*'
  build`) runs in every CI `package` row and before `test:browser`. Giving
  the engraver a `build` that runs emcc would have compiled Verovio there,
  and `--filter '*' --filter '!@barmark/engraver'` still ran it.
- **The cause.** In Bun 1.3.14 a negated filter does not exclude a
  workspace package from `bun run --filter` (checked on the VM).
- **The fix.** Two scripts: the engraver's `build` never runs emcc (it
  emits `dist/info.js`, the types, and checks a compiled `dist/` against
  `info.ts` when one is there), and the emcc build is `bun run compile`
  (`--update` rewrites `info.ts`).
- **Where.** `packages/engraver/package.json`, `packages/engraver/build/dist.ts`,
  `packages/engraver/build/compile.ts`.

### Emscripten's glue holds `/home/web_user` and `/tmp` (2026-11-10, @barmark/engraver)

- **The symptom.** The first leaked-path scan of the build, a plain search
  for `/home/` and `/tmp/` in both files, failed on a build that leaked
  nothing.
- **The cause.** The glue carries Emscripten's virtual filesystem: the
  user's home `/home/web_user` and the `/tmp` and `/home` directories it
  creates at start. They are paths inside the module, not the builder's.
- **The fix.** The scan matches a home, temp, opt, macOS or runner path
  only with a name after the directory (`/tmp/x`, not `/tmp`), allows
  `/home/web_user`, and also looks for the source, emsdk, build and
  working directories as literals, so a real leak is still caught.
- **Where.** `packages/engraver/build/paths.ts` (tested in
  `packages/engraver/tests/paths.test.ts`).

### The glue ignores `instantiateWasm` unless it is linked to accept it (2026-11-10, @barmark/engraver)

- **The symptom.** The spike's worker passed the factory an
  `instantiateWasm` hook to download and check the `.wasm` itself; the
  build never called it and fetched the `.wasm` on its own.
- **The cause.** With `-s STRICT=1`, the glue reads only the incoming
  `Module` properties `INCOMING_MODULE_JS_API` names, and the default list
  in strict mode leaves `instantiateWasm` out. Once it is named, a second
  trap: a hook that returns `{}` and never calls `receive` (its download
  failed) leaves the factory's promise unsettled for ever.
- **The fix.** The link names it:
  `INCOMING_MODULE_JS_API=onRuntimeInitialized,instantiateWasm`, the one
  flag that makes the build behave differently from stock. `@barmark/score`
  (0.4.0) races the factory against a promise the hook rejects on failure,
  so a failed download fails the load instead of hanging it.
- **Where.** `packages/engraver/build/build.sh`; the spec's Loading section
  (`docs/superpowers/specs/2026-11-10-engraver-package-design.md`).

### Trimming Verovio's `data/` breaks more than the font left out (2026-11-10, @barmark/engraver)

- **The symptom.** The spike's build kept only `Bravura.xml`,
  `Leipzig.xml`, `Leipzig/`, `Leipzig.css` and `text/`. Other music fonts
  failed, as expected (Bravura drew no glyphs; Leland and Gootville drew
  Leipzig), but so did `fontTextLiberation` (no Liberation embedded),
  `footer: "always"` (no footer) and a custom tuning (`tuningFile`: missing
  `tuning-glyphnames.json`), all but the last with nothing logged.
- **The cause.** Those options read files from the `data/` tree that was
  left out; the embedded filesystem holds only what `--embed-file`
  packed, and Verovio falls back quietly when a file is missing.
- **The fix.** None needed for barmark: `@barmark/score` sets no `font*`
  key, no tuning and `footer: "none"` (`packages/score/src/engrave.ts`),
  and the equivalence gate covers what it asks. The engraver README's
  Limits section states what the build does for anyone calling it with
  other options.
- **Where.** `packages/engraver/build/data.txt`, `packages/engraver/README.md`.

### `NO_EDIT_SUPPORT` does not compile at Verovio 6.4.1 (2026-11-10, @barmark/engraver)

- **The symptom.** Building Verovio 6.4.1 with `-DNO_EDIT_SUPPORT=ON`, to
  leave out the editor toolkit barmark never calls, fails to compile.
- **The cause.** Upstream does not keep the option building at this
  version; we did not dig further, since the editor is small beside what
  the importers and `data/` cost.
- **The fix.** The build does not use it; the editor stays in, and the
  size is won elsewhere (importers and `data/` left out, `-Oz`).
- **Where.** `packages/engraver/build/build.sh`, the plan's Global
  Constraints.

### Verovio's CMake builds Release, so `-Oz` in `CMAKE_CXX_FLAGS` alone is overridden (2026-11-10, @barmark/engraver)

- **The symptom.** In the spike, `-Oz` passed only in `CMAKE_CXX_FLAGS`
  did not make the library smaller.
- **The cause.** Verovio's CMake defaults `CMAKE_BUILD_TYPE` to Release,
  and CMake appends `CMAKE_CXX_FLAGS_RELEASE` (`-O3 -DNDEBUG`) after
  `CMAKE_CXX_FLAGS`, so the last `-O` wins.
- **The fix.** The same flags go in both `CMAKE_CXX_FLAGS` and
  `CMAKE_CXX_FLAGS_RELEASE`, and `-Oz` on the link too.
- **Where.** `packages/engraver/build/build.sh`.

### `git archive` of a subdirectory came out empty, then not reproducible (2026-11-10, @barmark/engraver)

- **The symptom.** `source.sh` packs `packages/engraver/build/` for the
  Corresponding Source. Run as `git -C build archive HEAD:packages/engraver/build`,
  the tarball held only its prefix directory. Fixed, two runs a few
  seconds apart gave different digests.
- **The cause.** Run inside a subdirectory, `git archive` limits itself
  to that subdirectory's paths, so a tree named from the root matched
  nothing. And an archive of a tree, unlike one of a commit, stamps every
  entry with the current time.
- **The fix.** Run it from `git rev-parse --show-toplevel`, and pass
  `--mtime` with HEAD's commit time (`git log -1 --format=%cI`; the flag
  needs git 2.41 or later). The same commit now packs to the same bytes.
- **Where.** `packages/engraver/build/source.sh`.

### The Verovio build is reproducible across machines once paths are mapped (2026-11-10, @barmark/engraver)

- **The symptom.** The spike's lighter Verovio build (variant d3) put
  absolute paths of the machine that built it into the `.wasm`:
  `__FILE__` strings from `jsonxx.cc` and clang's resource directory. With
  those mapped, `build.sh`'s first two VM builds (two cache roots) still
  differed (`.wasm` 2,957,006 and 2,957,082 bytes, and the glue), and the
  path scan named the leak:
  `<emsdk>/upstream/emscripten/cache/sysroot/share/verovio`.
- **The cause.** `__FILE__` and the resource directory hold the paths of the
  source, emsdk and the build tree. The last leak is Verovio's CMake:
  `add_compile_definitions(RESOURCE_DIR="${CMAKE_INSTALL_PREFIX}/share/verovio")`
  becomes the `resourcePath` option's default, and emcmake sets the install
  prefix to emsdk's absolute sysroot. Stock npm Verovio 6.4.1 holds its
  builder's path there (`/Users/laurent/tools/emsdk/…/sysroot/share/verovio`).
  A prefix map does not touch it: it is a string literal, not a file name.
- **The fix.** `build.sh` maps the source, emsdk and build roots
  (`-ffile-prefix-map=…=verovio|emsdk|build`, on compile and link), passes
  clang's `-resource-dir` explicitly and sets `-DCMAKE_INSTALL_PREFIX=/usr/local`,
  so the default is Verovio's own fallback, `/usr/local/share/verovio` (the
  JS constructor sets `/data` before every toolkit, so nothing reads it).
  `paths.ts` fails the build on any home, temp, opt, macOS or runner path, or
  on the source, emsdk, build or working directory anywhere in either file;
  it allows `/home/web_user`, which is Emscripten's virtual filesystem.
- **The result.** Two VM builds from different cache roots (one with a
  copied emsdk, one downloaded fresh) and a GitHub `ubuntu-latest` runner
  build agree byte for byte: `verovio-module.mjs` 29,534 bytes, sha256
  `a3021db201e9a2392b5159086d55eb765d06274d4d9d82d162cfb426cf929bd3`;
  `verovio-module.wasm` 2,956,941 bytes, sha256
  `74273b7167510dc2f0bf83c3cd37658e07dedc4261ed99ffcfebc1e02ade0a6c`, on
  both machines.
- **Where.** `packages/engraver/build/build.sh`, `packages/engraver/build/paths.ts`.

### A batch of releases lost one: a newer waiting run cancels the older (2026-11-09, render, musicxml and sync releases)

- **The symptom.** Three GitHub releases created back to back
  (`render-v0.18.0`, `musicxml-v0.8.0`, `sync-v0.3.0`) started three
  release runs; musicxml's ended `cancelled` without running a job, while
  render's waited for approval and sync's sat pending.
- **The cause.** `release.yml` has `concurrency: { group: release,
  cancel-in-progress: false }`. GitHub keeps one run in progress and one
  pending per group; a newer pending run cancels the older pending one.
  A run waiting for the `npm` approval is still in progress, so the
  queue stays full until it is approved.
- **The fix.** `gh run rerun <id>` on the cancelled run once the run ahead
  of it has started, so it isn't cancelled again. Create one release at a
  time, the next only when the previous run is running or done, not
  while one is pending.
- **Where.** RELEASING.md step 9; `.github/workflows/release.yml`.

### Verovio's npm package carries no licence text (2026-11-08, cli)

**Symptom:** bundling Verovio into the CLI's binaries for `render
--score`, we went to attach its licence as the release attaches Edwin's
(`Edwin-OFL.txt`, copied from `@barmark/render`'s `fonts/`), and there was
nothing to copy: `verovio@6.4.1` publishes only `README.md`,
`package.json` and `dist/`. **Cause:** its `files` is `["dist"]`; the
licence (`COPYING.LESSER`, and the GPL it builds on, `COPYING`) lives only
in the GitHub repository. **Fix:** `packages/cli/licenses/` holds both, as
Verovio's tag `version-6.4.1` has them (they differ from Debian's copies
only in whitespace); the release workflow's binaries job copies them
beside the binaries as `Verovio-LGPL-3.0.txt` and `Verovio-GPL-3.0.txt`,
and `packages/cli/tests/licences.test.ts` keeps both the files and the
copy step. An npm install needs nothing from us: Verovio arrives as its
own package.

### Verovio beside Dorico, first run (2026-11-08, score)

**Symptom:** `scripts/score-dorico.ts` exported four charts (Morning Song, Peaceful Dreams,
Shenandoah and Amazing Grace's lead sheet) to MusicXML, and Verovio 6.4.1 (`@barmark/score`)
and Dorico Elements 6.2 engraved the same file. We compared them by eye, the music only and
not house style, and checked each difference against the MusicXML. Kevin's goal is a chart
that renders "however Dorico renders [the] exported musicxml"; this run is advice, not a gate.
The two agree on measure counts (16, 129, 5, 5), key and time signatures, every repeat
(including `times="5"`), section names, the tempo (145), staves and clefs (treble-8 guitar,
piano grand staff), the pitches and rhythms of both melodies, and both lyric verses with their
hyphens and extender. What differs, most important first:
1. *Dorico draws one part's chord symbols on every part* (Dorico). Morning Song's piano verse
   is `G/B C Em D` in the XML and in Verovio; Dorico shows the guitar's `G C G D`, and puts the
   guitar's `G C D G` over bars 9 to 12, where the piano rests and has no `<harmony>`.
   Shenandoah's guitar pickup is `C`; Dorico shows the voice's `N.C.`. Its import seems to make
   chord symbols global, so a chart whose parts play different changes loses them.
2. *Verovio slashes the piano's left hand* (Verovio). `<measure-style number="1"><slash>` puts
   staff 1 in slashes and staff 2 holds whole-bar rests; Dorico draws the rests, Verovio draws
   slashes on both staves (Morning Song, bars 1 to 8 and 13 to 16).
3. *Chord spelling* (export, then each engraver its own way). `<kind text>` already spells the
   symbol and we also write the `<degree>` that means it: `7sus4` plus add 7, `5(7)` plus
   subtract 3. MusicXML prints a degree unless `print-object="no"`, so Verovio shows
   `D7sus4(7)` and `G5(7)(no3)`. Dorico ignores `text` and names the chord from kind and
   degrees: `D7sus4`, but `C5` as `C(omit3)`, `G5(7)` as `G7(omit3)`, `A5` as `A(omit3)`.
   The same notes, not the chart's spelling.
4. *A pickup is a 1/4 bar* (export). The grammar calls a first bar in a one-bar meter (`[1/4]`)
   a pickup, but the export writes `<time>` 1/4 then 4/4 (or 3/4) and no `implicit="yes"`, so
   both print a 1/4 time signature and count the pickup as bar 1 (Shenandoah, Amazing Grace).
5. *Dorico drops a mid-sentence "a"* (Dorico; our workaround is partial). Shenandoah's
   description reads "every note  quarter." in Dorico. `ownText`'s no-break space covers a
   leading "a" only. Dorico also draws this `placement="below"` text above the staff.
6. *Smaller, both alike.* `×5` is a `<direction>` after the last note of bar 128, so both draw
   it over bar 129, not at the repeat it counts (export). Measure `text` holds the chart's bar
   numbers (Peaceful Dreams' second Verse reads 13 again, bar 129 is "81"); both ignore it and
   number 1 to 129 (export, if those numbers matter). The description is a direction in every
   part, so both show it twice (export). Shenandoah's "Acoustic Guitar" has `instrument-name`
   Electric Guitar and MIDI program 28, which neither score shows (export). House style only:
   Dorico's slash-region counts "(4)", "(8)", its "Gtr 1" for our `Gtr`, and a final barline
   the XML does not write.
**Cause:** 1 and 5 are Dorico's MusicXML import, 2 is Verovio's; 3, 4 and 6 are our export,
where the XML says something an engraver may fairly read another way.
**Fix:** none yet. Candidates, nearest the goal first: `print-object="no"` on a `<degree>` the
kind text already spells (3); a first bar in a one-bar meter written `implicit="yes"` under
the running time signature (4); `ownText` for every lone "a", not only a leading one (5); the
`×5` placed so neither engraver reads it as bar 129's (6). For 1, look for a Dorico import
option or per-part chord symbols by hand before changing the XML. For 2, try leaving
`<measure-style>` out of a two-staff part (its notes already carry slash noteheads and
`stem none`): if Dorico is unchanged and Verovio draws rests, do that; else report it upstream.
Fixed (2026-11-08, `fix/score-export`; Dorico re-run 2026-11-09, 4 of 4 PDFs): 2, 3, 4, 5 and three of 6.
(3) A `<degree>` is `print-object="no"` when the root and kind text, read as a chord symbol,
name exactly the chord (`textSpells` in `harmony.ts`); every barmark chord's text does, so in
practice all its degrees are hidden, and they still mean the chord. Verovio 6.4.1 ignores
`print-object` on a degree (`ConvertDegreeToText` in its `iomusxml.cpp` appends every one), so
`@barmark/score` drops a hidden degree before Verovio reads the file (`forVerovio` in
`packages/score/src/engrave.ts`); Verovio now draws `D7sus4` and `G5(7)`. (2) A two-staff part
writes no slash style, and a part after one that left slash style on writes `<slash
type="stop"/>` in its first measure unless it starts in slashes: Verovio ignores
`measure-style`'s `number` and keeps its slash state from one part to the next (one reader-wide
`m_slash`), so the guitar's slash style alone turned the piano's lower-staff rests into
slashes. Verovio now draws the rests (`engrave.test.ts`). Dorico used the piano's
`<measure-style>` for a slash region on its upper staff (FINDINGS 2026-11-04, "slash
regions"; the "(4)" and "(8)" counts); the piano's slashes are now plain stemless
slash-notehead notes there, which may show as notes, not a region. (4) The pickup is measure 0,
`implicit="yes"`, under the running `<time>`, numbering from 1 after it, as MuseScore writes
one (`opensWithPickup` in `measure-xml.ts`, since 2026-11-09 `sayablePickup`); a first bar whose length would read back as
another meter in the running beat (`[1/4]` in 6/8) or that a one-bar meter follows keeps its own
`<time>`. Verovio draws one 4/4 and a measure 0 (`metcon="false"`). (5) `ownText` holds every
whitespace-delimited "a"/"A" to the next word. (6) `×N` (and "repeat as needed") carries an
`<offset>` back to its bar's last beat (Verovio's tstamp 4, not 5); the description (lead text)
is written in the top part only; a guitar named acoustic is barmark's listed acoustic guitar
(program 26, as `@barmark/midi`'s table). Left: 1 (Dorico), measure `text`, and the
description's `placement="below"` drawn above in Dorico.
*Dorico re-run (2026-11-09):* hidden degrees change nothing there (`D7sus4`, `C(omit3)`,
`G7(omit3)` as before, so Dorico still reads kind and every degree, printed or not); the piano's
upper staff shows stemless slashes and its lower staff whole-bar rests, the "(4)" count now on
the guitar only; `×5` sits over bar 128, the repeat it counts; Shenandoah opens 4/4 with an
uncounted pickup, an "Acoustic Guitar", the description once, and "every note a quarter." whole.
**Where:** `scripts/score-dorico.ts` (`score-dorico-page.ts` draws the page);
`packages/musicxml/src/harmony.ts` (degrees), `measure-xml.ts` (time, slash style),
`directions.ts` (`ownText`).

### Verovio prints hidden chord degrees and carries slash style across parts (2026-11-08, score)

**Symptom:** after the export marked a degree its kind text already spells
`print-object="no"`, Verovio still drew `D7sus4(7)`; and after a two-staff
piano stopped writing `<measure-style number="1"><slash>`, Verovio still drew
its lower staff's whole-bar rests as four slashes. **Cause:** Verovio 6.4.1's
MusicXML reader (`src/iomusxml.cpp`, read at the `version-6.4.1` tag):
`ConvertDegreeToText` appends every `<degree>` and never reads `print-object`;
and slash style is one member, `m_slash`, set by any `measure-style/slash`
whatever its `number`, never reset at a new part, which turns any
`<rest measure="yes"/>` into beat slashes while it is on. So the guitar's slash
style ran on into the piano. **Fix:** `@barmark/score` drops a hidden degree
before Verovio reads the file (`forVerovio`, `packages/score/src/engrave.ts`);
a part's first measure writes `<slash type="stop"/>` when the part before left
slash style on and it doesn't start in slashes itself (a two-staff part never does),
so no part inherits the one before's, and a slash-free chart writes no slash element (`slashStyleXml`, `packages/musicxml/src/measure-xml.ts`). A one-staff part
after a slashed one (`Gtr | G | C |` then a tutti `| D | G |`: the bass's opening
rest drew as four slashes) was caught in review and fixed the same day; it moved
the score round trip's `replay-holds` rests from 71 to 73. Both Verovio behaviours
are still worth reporting upstream.

### Vite 7 pre-bundles `<barmark-score>` out of reach of its worker and font; Vite 8 does not (2026-11-08, @barmark/score)

- **The symptom.** In a scratch Vite app installing the packed
  `@barmark/score` 0.1.0 (with `barmark`, `@barmark/render` and
  `@barmark/musicxml` packed beside it), Vite 7.3.7's `vite dev` drew the
  grid but clicking Score showed "The score couldn't be drawn": the worker
  (`node_modules/.vite/deps/worker.js?worker_file&type=module`) was a 404
  and Edwin failed to decode ("OTS parsing error: invalid sfntVersion").
  `vite build` failed outright: `Invalid value "iife" for option
  "worker.format" - UMD and IIFE output formats are not supported for
  code-splitting builds`. Vite 8.3.5 and `@voidzero-dev/vite-plus-core`
  1.4.0 (what Stem Shovel runs as `vite`) engraved the score, with the font
  loaded, in both `vite dev` and `vite build && vite preview`, with no
  config at all.
- **The cause.** Vite 7's esbuild pre-bundler moves `element.js` into
  `node_modules/.vite/deps/` without rewriting its
  `new URL("../../render/fonts/…", import.meta.url)` or
  `new URL("./worker.js", import.meta.url)`, so they resolve inside the
  deps folder: the worker isn't there, and the font path falls through to
  the dev server's HTML fallback (a 200 of HTML, hence the decode error).
  Vite 8's Rolldown pre-bundler rewrites both URLs to the package's own
  files. Separately, Vite 7 builds workers as `iife` by default, which
  cannot hold the worker's dynamic import of Verovio.
- **The fix.** A README note, not a code change (Vite 8 already works, and
  the font path is `@barmark/render`'s layout):
  `optimizeDeps: { exclude: ["@barmark/score"] }` for dev and
  `worker: { format: "es" }` for the build. Each was needed on its own
  (dev still broke with only the format; the build still failed with only
  the exclude), and both together are harmless on Vite 8 and vite-plus,
  rechecked in dev and preview (`packages/score/README.md`, "Bundling the
  worker"). The scratch app was not kept; to repeat it, `bun pm pack` the
  four packages, install the tarballs with a pinned `vite`, put a
  `<barmark-score>` on the page and click Score in Playwright in both modes.

### A script's own 1Password environment leaked into mac-bench (2026-11-08, scripts/dorico-midi.ts)

- **The symptom.** `bun scripts/dorico-midi.ts` failed every job with
  varlock's "MAC_BENCH_TOKEN is required", though `bin/mac-bench dorico
  --health` worked from mac-bench's own folder.
- **The cause.** Bun loads barmark's `.env.local` into the script, and its
  `OP_ENV_ID` and `OP_TOKEN` name barmark's 1Password environment (the
  one Swamp uses). The spawned `bin/mac-bench` inherited them, so
  mac-bench's varlock read barmark's environment instead of its own and
  found no `MAC_BENCH_TOKEN`. Running the wrapper from mac-bench's folder
  doesn't help: varlock prefers variables already set.
- **The fix.** The script spawns mac-bench without `OP_ENV_ID` and
  `OP_TOKEN` (`scripts/mac-bench.ts`), so mac-bench's `.env.local`
  decides. Any script that calls another varlock repo needs the same.
- **Where.** `scripts/mac-bench.ts`, `scripts/dorico-midi.ts`.

### The release gate failed on main because the checkout's packages were older than main (2026-11-08, barmark 0.21.0)

- **The symptom.** After the barmark 0.21.0 release PR merged on green
  CI, `swamp workflow run release-check --input pkg=barmark` on `main`
  failed: lint failed, four tests failed and `bun run --filter '*' build`
  failed. The same commit was green in CI.
- **The cause.** The local checkout had pulled `main` but not run
  `bun install` since before `@barmark/midi` joined the workspace, so its
  `node_modules` had no link for the new package or its dependencies.
  CI installs fresh on every run; a long-lived checkout does not.
- **The fix.** `bun install` after pulling `main`, then the gate passed
  unchanged. RELEASING.md step 6 now says to run it.
- **Where.** RELEASING.md step 6.

### MuseScore pedals one staff's track, and its slash notes sound only when a file asks (2026-11-08, midi import fixtures)

- **The symptom.** Writing the import's real files
  (`bun scripts/midi-fixtures.ts`), four things weren't as expected. (1)
  The pedalled piano (`packages/midi/tests/fixtures/piano-comping.mscx`)
  came out of MuseScore 4.7.6 as two tracks, one a staff, both on
  channel 1, with controller 64 only in the left hand's track (the staff
  the pedal line is on), pressed two ticks after the downbeat and, at a
  change, lifted a tick after the next note-on. (2) The musicxml
  fixtures' slash notes didn't sound at all, though spec 8 says MuseScore
  plays slashes as B3 or B4. (3) `importMidi(bytes, { tracks: [1] })` on
  the band with bass and drums read `Cmaj7`, `F(#11)`, `Am(9)` for C, F,
  Am. (4) The lead sheet's `FTristan`, a chord symbol MuseScore can't
  parse, sounds as F2 and F4 only, and imports as `{F}`.
- **The cause.** (1) MuseScore writes the pedal where the spanner is;
  a sequencer holds both staves (one channel), but the import held a
  released note only on the pedal's own track (`src/import/notes.ts`),
  so a right-hand arpeggio (bar 8 of the fixture) read as `{F}`, not
  `Fmaj7`. (2) Our hand-written `.mscx`
  slashes carry `<play>0</play>`; a MusicXML file's slashes, as Dorico
  writes them, come into MuseScore as notes that play (`dorico-band`
  sounds B3 and B4 on two parts), which is what spec 8 saw. (3) `tracks` reads every note of the named
  tracks, and a MuseScore part's track holds its slash notes (B3) beside its chord-symbol
  playback. (4) MuseScore plays an unparsed symbol as its root.
- **The fix.** (1) The pedal holds its channel on every track (spec 5.2,
  Claude's ruling): `notesOf` reads the tracks in one pass, merged by
  tick, then track, then file order, with the pedal per channel. (2) `bass-and-chords.mscx` writes
  its slashes without `<play>0</play>`, so one fixture has sounding
  slashes, left out as a melody (`melody-left-out`). (3) The README says
  to leave `tracks` out for MuseScore's files. (4) As intended: one pitch
  class is a note set. To learn `.mscx` syntax for a pedal, a slash
  chord's bass (`<bass>` on the line of fifths), a rehearsal mark or a
  drum kit, write the smallest MusicXML with it and have MuseScore
  convert it (`mscore -o x.mscx x.musicxml`).

### MuseScore's MIDI import keeps one text event a tick, and makes credits a lyric (2026-11-08, midi export)

- **The symptom.** `bun scripts/midi-fixtures.ts --check-export` sent
  Peaceful Dreams, Morning Song and the lead sheet through MuseScore 4.7.6
  (`mscore -o x.musicxml x.mid`). Bars, meters, keys, tempos (the
  fermata's third of the tempo included), programs and track names came
  through, and every part had the chart's played bars. But the lead
  sheet's second verse was gone (`Hap`, not `Whis`, at the first tick),
  the conductor track's `Composer: Kevin Peckham` text event became a
  verse-1 lyric on the first note of one part (the only part in Peaceful
  Dreams; in the lead sheet the chords part, `Voice chords`, not the
  melody), `Lyricist: …` at the same tick was dropped, and neither the markers (section headings), the
  title (track 1's name), the copyright nor the words (`FTristan`, a text
  event on the `Voice chords` track) appeared anywhere.
- **The cause.** MuseScore's importer, not our file: the file holds both
  verses at one tick in verse order, as MuseScore's own export writes
  them (spec 8), and `midi-file` reads every event back. The importer
  seems to take one lyric or text event a tick and to read a text event
  as a lyric; it reads no markers.
- **The fix.** None in the export: the file follows the spec, and other
  programs (GarageBand, Logic, Dorico) are checked before the release.
  The check compares measures only, not lyrics. Phase 2's import must not
  expect MuseScore's round trip to keep a second verse or the markers.

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
Bun's own cache can lag too: `bun add` may still miss a version `npm view`
already shows, and `bun add --exact --no-cache` fixes it.

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
(`settleFirstPickup` in `import/read.ts`). Since 2026-11-08 the export writes
MuseScore's shape (`opensWithPickup` in `measure-xml.ts`, since 2026-11-09 `sayablePickup`), except for a
first bar the implicit shape would read back as another meter.

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

### A mutation script in a shared worktree broke another agent's tests (2026-11-08, midi)

**Symptom:** during the Task 12 fix round, a parallel implementer's
tests in the same worktree failed for about three minutes, with
`segments.ts` behaving in ways no commit explained.
**Cause:** a mutation script rewrote `packages/midi/src/import/segments.ts`
in place, ran the tests and restored it. Any other process reading the
file during the run, such as a test run, a reviewer or a type check, saw
the mutant.
**Fix:** run mutants on a copy, never on the live file. Make the copy
with `git archive HEAD | tar -x -C <scratch>`, then symlink the root
`node_modules` and copy each package's `node_modules` (their links are
relative), or use a separate `git worktree`. Task 13b's experiments ran
this way.

### What the import fixtures lose on the way to a score (2026-11-08, score)

**Symptom:** `packages/score/tests/round-trip.test.ts` draws each
`musicxml/tests/fixtures/import/*.musicxml` with Verovio, imports it to a
chart, exports the chart (no `part`) and draws that, then counts measures,
staves, notes, rests, harmonies and lyric verses in Verovio's MEI. Of 17
fixtures (none refuses), `comping-guitar`, `dorico-comping-guitar` and
`dorico-lead-sheet` come back identical; the other 14 differ. Kevin's goal is
"close to the original", so each difference is pinned in `KNOWN`,
`MEASURE_KNOWN` and `STAFF_KNOWN` (original, redrawn) and fails if it moves
either way.
**Cause**, by group. "Expected" follows from the grammar; "candidate" is a
fix worth considering. Causes were read from the import diagnostics, the
fixture's `.chart.md` and the exported MusicXML, then traced into the code.
1. *Melody dropped, chords filled in* (`piano`, `dorico-piano`,
   `melody-rest`, `melody-measure-rest`, `harmony-edges`: notes 24 to 12,
   4 to 20, 5 to 28, rests 3 to 0). Import: "notes read as a melody and left
   out", so the chart is chords only. Export: a chord-only line is drawn as
   slash or voiced notes, so the note count goes up or down with no relation
   to the original. Expected (a chord-only line has no melody); the melody
   case is a candidate if a bar could keep its tune.
2. *Parts with no chord symbols are dropped* (`band`, `dorico-band`: the bass,
   notes 72 to 64 and 32, rests 8 to 0). Import warns "no chord symbols in
   these parts, left out". Expected. (2026-11-08: `band`'s rests are 8 again,
   and `part-enters` 4 to 12, `trading-fours` 8 to 16: the re-export's
   two-staff piano writes no slash style any more, so Verovio draws its
   lower staff's whole-bar rests instead of slashing them; FINDINGS "Verovio
   beside Dorico, first run", item 2.)
3. *Parts that carry the same chords become one line* (`dorico-band` staves
   4 to 1, harms 16 to 8; `six-guitars` staves 6 to 1, harms 18 to 3).
   `import/rows.ts:136` `playingOf` calls a bar tutti when every part's first
   line plays alone and all are alike; `import/write.ts:319-323` then leaves
   out the `part:` header (`labelled` is false). Expected as far as the chart
   goes: a tutti bar is one line in the grammar.
4. *A keyboard changes staves* (`piano`, `dorico-piano` 2 to 1;
   `part-enters`, `trading-fours` 2 to 3). Two causes. (i) `piano` and
   `dorico-piano` have one part, so `write.ts:321` writes no `part:` line:
   the name and the instrument are both lost and the export draws 1 staff.
   (ii) `part-enters` and `trading-fours` have `<part-name>Piano` with no
   instrument name or MIDI program, so `import/parts.ts:214` (`instrumentOf`)
   returns null and no `instrument:` is written; the export then guesses a
   two-staff keyboard from the word (`musicxml/src/instruments.ts`
   `KEYBOARD_WORDS`, used at `score.ts:183`). Candidates: the export should
   not infer a grand staff from a name when the chart's lines fit one staff,
   and the import should keep a `part:` line for a lone two-staff part.
5. *A pickup gains a no-chord symbol, an unreadable symbol loses its harmony*
   (`hymn`, `dorico-hymn` harms 6 to 7; `lead-sheet` 7 to 6). Import writes
   `N.C.` in the pickup, which the export draws as a `none` harmony the
   original never had; `FTristan` becomes `?` plus words, which draws as text
   and not a `<harmony>`. The second is expected (grammar: `?`); the first is
   a candidate.
6. *Four bars more* (`replay-holds`: measures 16 to 20, notes 137 to 160,
   rests 35 to 71, harms 33 to 42). This is a `@barmark/musicxml 0.4.0`
   fuzz export (`hand-written.test.ts:134`), not a MuseScore file, with repeats,
   endings, To Coda and a segno. `import/repeats.ts` (`placeStructure`)
   decides barmark can't hold those repeats, and `import/structure.ts`
   (`readStructure`, lines 283-292) writes out the play order
   `import/order.ts` works out, giving 20 literal bars with no repeat marks. Candidate; the extra bars
   also account for the note, rest and harmony counts.
**Fix:** none yet; the test pins the gap. To close a group, fix it, then
update the table and this entry together.
**Where:** `packages/score/tests/round-trip.test.ts`,
`packages/score/tests/helpers/music.ts` (`musicOf`, test-only);
`packages/musicxml/src/import/` (`rows.ts`, `write.ts`, `parts.ts`,
`order.ts`, `repeats.ts`, `structure.ts`), `packages/musicxml/src/instruments.ts` and
`packages/musicxml/src/score.ts`.

### Dorico's MIDI import of our exports, first full run (2026-11-08, midi)

**Symptom:** the first full live run of `bun scripts/dorico-midi.ts`
(Dorico Elements 6.2.31, all 12 charts: `scripts/dorico-midi-charts.ts`,
the examples and the lead sheet) matched every note exactly, yet the
pickup charts reported "1/4 at bar 1: changed to 3/4; 3/4 at bar 2:
dropped" (`pickup`) and "1/4 at bar 1: changed to 4/4; 4/4 at bar 2:
dropped" (`shenandoah`).
**Cause:** a comparison bug, not Dorico. Dorico kept the pickup: its first
measure is `<measure number="X0" implicit="yes">` with the full meter in
its `<time>` and one beat of music. MusicXML writes a pickup as an
implicit measure shorter than its time signature, and
`scripts/dorico-compare.ts` read the written meter as the bar's meter.
**Fix:** `PartReader.pickup` reads an implicit first measure shorter than
its meter as the pickup's own meter (its length in the written
beat, e.g. 2/8 in 6/8) followed by the written meter
from the next bar. A full, non-implicit first measure is still reported
as changed. Where: `scripts/dorico-compare.ts`,
`packages/midi/tests/dorico-compare.test.ts`.
**What the run showed:** every note exact, so no quantization tolerance
has been needed yet (`TOLERANCE` stays). Dorico keeps time signatures,
key signatures, lyrics and a tempo, and reads each track's instrument from
its name or program ("Voice chords" becomes Voice 2, "Acoustic Bass"
becomes Acoustic Bass 1). It drops every section marker (MIDI marker
events) and keeps only 2 of a rit.'s 15 tempo steps.
**Tooling:** mac-bench's `dorico --midi` job drives the import; it needed
three fixes to read Dorico's import window (see mac-bench's FINDINGS).

### Vercel's security review read our test tooling as attack surface (2026-11-08, score)

**Symptom:** the Vercel Security Review check failed on PR #223 with three
Low findings, all in VM-only or test-only code: `scripts/score-dorico.ts`
defaulted to a fixed `/tmp/score-dorico` and wrote through whatever sat at
its file names (a planted symlink would be followed); the score suite's page
server copied `?verovio-url=` into the element, so a crafted link could make
its worker import any module; and its `?count=` was uncapped. **Cause:** we
treated a dev server and a manual script as trusted by being local, but a
shared `/tmp` and a listener on every interface are reachable by others.
**Fix:** `scripts/out-dir.ts` (`outDir`: a new `mkdtemp` folder by default, a
given one must be a real folder we own; `writeFresh`: remove what's there,
then an exclusive create), tested in `packages/score/tests/out-dir.test.ts`;
the page server binds `127.0.0.1`, takes only `theme`, `engine` (a name:
`missing` or `data`, mapped to fixed URLs) and `count` (1 to 4), and answers
400 to anything else (`score.pw.ts`, "the page server takes no module URL
and caps count"). **Rule:** a script's default output goes in a fresh
`mkdtemp` folder, as the other VM scripts already do; a test server binds
loopback and never turns a query parameter into code to load. Fallow scores
code only Playwright runs as untested, so its helpers stay small.

**Again on #225 (2026-11-09):** a Medium finding on library code this time:
`@barmark/score`'s hidden-degree strip was `replace(/<degree print-object="no">[\s\S]*?<\/degree>/g)`,
run on whatever XML `engraveXml` is given; many openers with no closer rescan the rest of the
input once each (200,000 openers ran past 120 s). Now one `indexOf` pass (`forVerovio`,
`packages/score/tests/for-verovio.test.ts`, 200,000 openers in milliseconds). **Rule:** a lazy
`[\s\S]*?` between two markers on caller-supplied text is quadratic when the closer can be
missing; scan with `indexOf`.

**Again on the site PR (2026-11-09):** a Low DoS finding: Try It's Score takes a chart from a
shared link, and a 3 KB chart (a thousand-syllable lyric row inside nested repeats played a
thousand times) stayed under the site's size and bar guards but made the MusicXML export scan
the bar's whole row once per onset (`lyric-staff.ts`, `lyrics.ts`'s `sungAt`); the same shape
hid in words per slot, beam groups per value and a bare line's marks per event, and a bar line
played thousands of times copied its list of passes each time. And the score worker kept
computing requests whose element had moved on, with no deadline, so one slow job blocked every
later score on the page. **Fix:** each lookup indexed once per bar (`sungAtOf`, maps by onset
and slot, binary search), tested by `packages/musicxml/tests/export-scale.test.ts` (eight times
one crowded bar of 2,000 and of 16,000 items, at most sixteen times the time; about seven now,
22 to 44 on the old code); the finding's chart went from about 40 s to 21 s, the rest being the
370 MB of MusicXML it really writes. So `engraveChart` now refuses, before exporting, a score
whose `scoreCost` (an estimate of the MusicXML's bytes, never under it: measures of every
declared part, tacet too, slots, pitches, syllables and the escaped length of every text, times
its plays) is over 50,000,000, and MusicXML over 50,000,000 characters after. A note count
alone was not enough (a second review): long escaped words on few notes, or many tacet parts,
cost as much, and a third review found more the estimate missed (a part's silent lines, text
lines). A size estimate chases the writer; bound the writer itself: `exportMusicXml` takes
`maxLength` and stops at the first measure past it (`tooLarge`), which `engraveChart` sets to
50,000,000, keeping `scoreCost` only as a cheap early refusal. The engine gives the worker one job at a time, drops superseded requests still
waiting, and cuts off (terminate, fresh worker loading the Verovio the first one did) a job
whose Verovio load runs past `LOAD_DEADLINE_MS` (60 s), or whose engraving, timed from the
worker's `Ready`, runs past `JOB_DEADLINE_MS` (20 s) or past `SUPERSEDED_GRACE_MS` (3 s) once
superseded; a crash fails only its own job. Tested with a fake worker and fake timers in
`packages/score/tests/engine.test.ts`. Timing a job from `postMessage` would have counted a
slow 7 MB download against it (a second review again). **Rule:** any code a shared link reaches is
attack surface: a per-item `find`/`filter` over a bar, row or play order is quadratic in what
an author can write, so index it once; output a short input can multiply (repeats) is
bounded where it is made, by a budget the writer charges as it writes; an estimate made beforehand
is only an early refusal;
and work for a page in a worker is cancellable and bounded, since `postMessage` can't take a
job back, with a download's budget kept apart from the work's.

**Again (2026-11-09, barmark): source × plays.** Two Low findings on barmark.dev's Try It, which
parses a shared `?q=` link on load. Its guards (50,000 characters, 10,000 played bars) bound each
factor, not their product. (1) Lyrics: `verses.ts` built fresh `{ at, syllable, note }` objects on
every play, so one chord under 3,000 syllables `x10000` made 30 million objects from 6 KB (7 s,
1.7 GB). (2) Pedal: `pedalWarnings`, run on every parse, walked every slot of every played bar
through `pedalStates`' matrix; one bar of 12,000 slots `x10000` took 36 s. The audit found the
same shape in `checkPushes` (`slotTimes` on every play), the notes' syllables and onsets, and in
`@barmark/render` (`singsOnNotes` read every syllable of every played bar). **Fix:** `perWritten`
(`shares.ts`) remembers what a written bar's slots give in a meter; `singing` reads each row's
cell once per what it holds as it begins, and a pass touches only the verses it sings;
`pedalWarnings` streams, each written bar's effect walked once from up and once from down;
render's lookup is a `WeakMap` on the shared syllables. Now 54 ms (lyrics) and 0.6 s (pedal),
heap flat. `packages/barmark/tests/chart/play-scale.test.ts` checks the sharing by identity and
the time ratio (ten times the written and the plays, under thirty times as long);
`render/tests/scale.test.ts` the layout. **Rule:** a played bar shares its written bar's data;
per-play cost is O(1) beyond what differs by pass. Look for the class: anything in the expansion
that maps over a bar's slots or syllables runs once per play.

**Then, the review of the fix (2026-11-09):** three more products reachable from `?q=`. (1) Verse
rows × plain replays: outside a repeat a bar sings every verse, so 1,560 rows under a section
replayed 5,000 times made 7.8 million verse references (1.3 s, 61 MB); the verses a written bar
sings when it plays again now count toward `expand`'s `work` budget (its first play's are bounded
by the source), so it stops with the existing error (0.1 s, 2 MB; real charts use at most 153 of
100,000). (2) Parts were cubic: each stream scanned its system for its own line at every line it
projected (`ownLine`), and the systems, the reference line's vote, the declared labels and the
singers' lines were each rebuilt or rescanned per part. 600 one-bar parts (19 KB) took 9 s; now
0.1 s, and 1,500 parts 0.9 s (`parts-scale.test.ts`). That figure was one bar per part only: a
second review found the same class one layer on. Lyric rows were gathered by copying their list
per row (1,383 parts under 1,383 verses, 18 s), and every part read every line although it may
play only its share of the 10,000 bars (3,227 parts resting through 2,000 systems, 19 s; 2,113
parts under 6,339 tutti lines, 27 s). Now each part reads at most its share of the work in lines,
and its projection stops building there (all three about 1 s at 50 KB). The same review found that a budget's
message and side effects must follow the output: the verse stop named bars a `->` had cut, and the
bar it stopped had already been checked and sung. A budget is checked before the work it guards,
with a question that has no effect (`Sing.verses`), and its message counts what is output. (3) Diagnostics: each silent pass of a
2,500-verse bar played 10,000 times warned separately, naming every verse: 7,500 warnings, 105
million characters, all rendered by the site. Now one warning per line with its passes as ranges
and long lists cut short. Also: a ratio test's small side must take milliseconds (the lyric
row's took 0.7 ms, so one pause could fail it), and checking the old code fails it must finish
(60,000 syllables × 6,000 plays ran past five minutes; 6,000 × 100 against ten times both fails
at 96×). **Rule:** the output is attack surface too: a diagnostic repeated per play, or one that
lists everything, multiplies like the data does.

**And a third review (2026-11-09):** the same class, one layer on again. Every part singing
(`a |{C4}:la|`, one line each) found each stream's voices by asking every voice for its stream,
which scanned the streams: streams × voices × streams, 59 s at 50 KB. A part's own line was looked
up again at every line of its system; each part walked every line of the chart (only its own and
the shared ones can play in it); the score order rebuilt every system's by-part map once per
part; a row under a replay heading was copied onto every line of the replayed system, rows × parts.
Fixing the three named shapes one at a time would have left the rest, so this round listed every
loop in `packages/barmark/src` that nests over parts, voices, lines, systems, rows or played bars,
with its bound at 50 KB and 10,000 bars, and gave each one past O(source + played bars) an index
built once (a `Map` by label, a `WeakMap` by array identity, a list shared per unit, a lookup
memoized as played). The audit found eight more, among them printing (a 10,000-bar line counted
its bars again per bar, 2.2 s) and the lyric rows' `covers` (one copy per row). One test,
`many parts times anything` in `parts-scale.test.ts`, builds each worst shape at 200 and 1,600
parts and fails past 20× (linear measures up to 9×; the old code 38× to 441×). **Rule:** after
two reviews of one class, stop fixing instances: list the nested loops and their bounds, then index
every one that multiplies two inputs. Suppressing what a stop explains must be just as exact: dropping
every "never sung" after a stop hid a real one (verse 3 under `x2`); the rows a stop cut off are
those never reached, or reached in a repeat with passes enough for their verse (`BarSource.passes`).

### Vite 8 bundled Verovio into the score's worker, so a CDN copy was a second download (2026-11-10, site)

- **The symptom.** With `verovio-url` and `verovio-integrity` pointing at
  jsDelivr, barmark.dev's built worker was still 8.5 MB: a reader pressing
  Score fetched the worker, with Verovio inside it, and then Verovio again
  from the CDN.
- **The cause.** Vite builds workers as `iife` by default, which cannot
  split, so the worker's fallback `import("verovio/wasm")` was inlined.
  The score README says Vite 8 needs no config, which is true for drawing a
  score, not for keeping Verovio out of the worker.
- **The fix.** `worker: { format: "es" }` in `site/vite.config.ts`: the
  worker is about 200 KB and Verovio a chunk of its own, fetched only when
  the CDN copy fails. `site/tests/build.test.ts` checks the sizes, and the
  browser suite checks the score loads from jsDelivr with no fallback
  warning. A site using `verovio-url` on Vite 8 needs the same setting;
  the score README should say so.

### `@barmark/midi` has a `src/version.ts` that RELEASING step 2 did not name (2026-11-10, midi 0.3.1)

- **The symptom.** The midi 0.3.1 release PR's `check` job failed on
  `exportMidi > the version is the package's`.
- **The cause.** `packages/midi/src/version.ts` holds `VERSION`, and a test
  compares it with `package.json`; step 2 named only musicxml's.
- **The fix.** Bump it with the package version; step 2 now names both.

### A 312-bar lead sheet is still one page at width 375 (2026-11-10, engraver)

- **The symptom.** The equivalence gate's long chart, written to cover page
  breaks, engraved as one page at both widths with 312 bars.
- **The cause.** Score's `LAYOUT` asks Verovio for `pageHeight: 60000`
  (Verovio's ceiling) with `adjustPageHeight`, so a page holds about 270
  systems: at 375 wide and two bars a system, some 540 bars of a one-staff
  lead sheet.
- **The fix.** `packages/engraver/tests/fixtures/long.chart.md` has 528
  bars (12 sections of 44), two pages at 375 and one at 1000. The cost is
  time: it is the gate's slowest width-375 engraving, so it is the chart
  that Q1's 500 ms rule measures.
- **The decision.** Kevin kept `-Oz` (2026-11-10): the 500 ms rule reads
  real charts only, not `long.chart.md` (the gate's ⚠ line follows), as
  written under Q1 in `docs/superpowers/specs/2026-11-10-engraver-package-design.md`.
