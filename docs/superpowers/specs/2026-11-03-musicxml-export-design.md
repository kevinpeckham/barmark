# MusicXML export: design

Status: draft for Kevin's review (2026-11-03). Kevin skipped the design
questions and asked for a design directly, so every decision below is
Claude's call unless it is marked as already decided. The calls list at
the end gathers them.

## Intent

A barmark chart should open in a notation program (MuseScore, Dorico,
Sibelius, Finale) and read there as the chart reads on barmark.dev: the
same bars, chords, repeats, sections and parts. MusicXML is the format
every one of those programs imports. Exporting to it shows that barmark
carries the music itself, not just its layout, and it gives a band a
route from a text chart to engraved parts.

Several parts (grammar 7.4) were the missing piece, and grammar 7.3
already says what a converter writes for a part: MusicXML's
`<part-name>`, with the label as `<part-abbreviation>`.

## Goals

- `exportMusicXml(text)` in a new package, `@barmark/musicxml`, returns
  MusicXML 4.0 (`score-partwise`) for a chart that parses without
  errors.
- `barmark export --musicxml <file> [--out file.musicxml]` in
  `@barmark/cli`, pinned to it exactly like the other libraries.
- The file validates against the MusicXML 4.0 XSD, and it opens in
  MuseScore 4 and Dorico without import warnings.
- Nothing musical is lost silently. Anything MusicXML can't say goes in
  as visible text, or is written out in full (see "Order").

## Non-goals

- Import from MusicXML, and MIDI in either direction. Those come later,
  in this package and in an `@barmark/midi`.
- Melody, voice leading, or any notes the chart doesn't write.
- Engraving decisions: page layout, system breaks, fonts. The notation
  program makes those.
- Transposing instruments. Everything is concert pitch, as barmark is.

## Anti-goals

- **An export that looks right and plays wrong.** Playback in the
  notation program must follow the chart's play order: repeats, endings,
  jumps and replays.
- **Silent loss.** A chord quality the converter can't name, words on a
  bar, or a lyric line must reach the file.
- **A second parser.** The converter reads `parseChart`'s output
  (`lines`, `events`, `bars`, `parts`, chord records). It never reads
  chart text itself.

## Constraints

- Same toolchain as the rest of the workspace: Bun, TypeScript strict,
  Biome, Fallow, test first, CHANGELOG, conventional commits.
- No runtime dependencies beyond `barmark`. XML is built as escaped
  strings, the way the renderer builds HTML.
- Converters never throw on user input. A chart with errors returns its
  diagnostics and no XML.
- `@barmark/render` never changes the music, and neither does this
  package: every musical fact comes from the parser.

## The API

```ts
type MusicXmlOptions = {
  /** Only this part, as `extractPart` gives it. */
  part?: string;
};
type MusicXmlResult =
  | { ok: true; xml: string; diagnostics: ChartDiagnostic[] } // warnings only
  | { ok: false; diagnostics: ChartDiagnostic[] };            // at least one error
function exportMusicXml(text: string, options?: MusicXmlOptions): MusicXmlResult;
```

The CLI prints the XML, or writes it with `--out`. It prints diagnostics
to stderr as `check` does, exits 1 on an error, and never writes `--out`
from a chart with errors, as `transpose` and `part` already behave.
`--part <label>` exports one part.

## The mapping

### The score

- `# Title` becomes `<work><work-title>`. A chart with no title uses the
  file name in the CLI, and no title from the library.
- `<identification><encoding>` names the software as
  `@barmark/musicxml <version>`.
- Parts:
  - A chart with no `part:` is one part, `P1`, with part-name "Chart".
  - A single-part chart's `part:` gives `<part-name>` and, if it has a
    label, `<part-abbreviation>` (grammar 7.3).
  - Several parts become one `<score-part>` each, in score order.
- Each part gets a treble clef. A part whose note sets sit mostly below
  middle C gets a bass clef instead.

### Bars and rhythm

- Each written bar is one `<measure>`, and so is each bar of a
  written-out replay (see "Order"). Measures are numbered in sequence,
  and the MusicXML 4.0 `text` attribute shows barmark's written number,
  so a replay shows the numbers its section was written with, as on
  barmark.dev.
- `<divisions>` is the least common multiple that makes every slot's
  duration a whole number: the meter, the slots, the groups and the
  pushes.
- `key:` becomes `<key><fifths>`, with `<mode>` for minor and the
  church modes.
- `time:` becomes `<time>`. A one-bar `[n/d]` becomes a `<time>` on
  that bar, and the running meter is restored on the next bar.

### Slots

| barmark | MusicXML |
|---|---|
| a chord symbol | a `<harmony>` plus a slash note (below) |
| `/` (hold) | a slash note, no harmony |
| `%` | the bar it copies, written out, as the parser resolved it |
| `N.C.` | `<harmony><kind>none</kind>` with text "N.C.", plus a slash note |
| `--` (silence) | a `<rest>` |
| `?` | a slash note, with "?" as words above it |
| a note set `{C E G}` | the notes, as a chord (`<chord/>` on all but the first), with no harmony |
| a voicing `Cmaj7{E3 G3 B3}` | the harmony, plus the voicing's notes as a chord |
| a group `D_E_F` | its members as a tuplet (`<time-modification>`) when its share isn't a power of two |
| a tacet bar | `<rest measure="yes"/>` |

- **Slash notes.** A slash note is a B4 note with `<notehead>slash</notehead>`
  and no stem. Each part's measures sit under
  `<measure-style><slash type="start"/>`, so programs show slash
  notation. A note set or voicing in a bar turns slash style off for
  that bar.
- **Note sets without octaves** take the octave from 4, rising, as the
  renderer's notes view reads them.
- **Harmony.** `<root-step>` and `<root-alter>` come from the chord
  record's root, and `<bass>` from its bass when that isn't the root.
  - The `<kind>` is the MusicXML kind whose intervals the chord contains
    with the fewest left over. The difference goes in `<degree>`
    elements (add, alter, subtract), so the harmony spells exactly the
    chord record's intervals.
  - `kind`'s `text` attribute is barmark's canonical quality (e.g.
    `m7(b5)`), so the program shows the chart's own spelling.
  - The kind table, the 33 MusicXML kinds and their intervals, is data
    beside the code, with a test that every chord in the grammar's
    Appendix A.4 round-trips: kind plus degrees equals the record's
    intervals.
- **Accents and hits.** An accent `>` becomes `<accent/>`; a hit `^`
  becomes `<accent/>` and `<staccato/>`, on the slot's note.
- **Pushes.** `<` and `<<` are written as played. The slot's harmony
  and note start an eighth (a sixteenth) early, tied across from the
  slot before it, even across a bar line, as a band reads a push.
- **Words on a bar** become `<direction><words>` before the slot they
  precede.

### Order: written, with repeat marks where they're faithful

MusicXML keeps a score in written order and plays its repeat marks, so
the export follows the chart as written wherever MusicXML's marks say
the same thing, and writes bars out where they don't:

- `|: … :|`, `x N` and `x ...` become repeat bar lines (`<repeat
  direction="backward" times="N"/>`). `x ...` adds the words "repeat as
  needed".
- An ending `|1`, `|2`, `|1-3` becomes `<ending number="1,2,3">`, with
  start, stop or discontinue.
- `Segno`, `Coda`, `To Coda`, `Fine`, `D.C.` and `D.S.` (grammar 5.2)
  become `<segno/>`, `<coda/>` and their words, with `<sound segno=…
  dalsegno=… tocoda=… fine="yes">`, so playback follows the jump.
- A rehearsal mark `@B` becomes `<rehearsal>B</rehearsal>`.
- Each section heading becomes words above its first bar, set in bold.
- A section repeat `## Chorus x2` becomes repeat bar lines around the
  section.
- A **replay** (a heading with no bars) is written out in full: MusicXML
  has no way to refer back to a section. It gets its heading, and any
  lyric lines of its own.
- An **elision** `->` drops its bar from the written-out replay. On
  `## Chorus x2 ->`, which cuts only the last pass, the export uses a
  first and second ending.
- A **fermata cell** `...` becomes a `<fermata>` on the bar line before
  it.

A test plays the exported MusicXML: it follows repeats, endings and the
jump, and the bar sequence must equal `parseChart(text).bars` (written
numbers and slots). An open repeat `x ...` counts as one pass, as the
parser's `bars` does. That test is what keeps the anti-goal "looks right,
plays wrong" in check.

### Directives and text

- `tempo:` becomes `<direction><metronome>` with `<sound tempo>`.
  `rit.` and `accel.` become their words, and a target tempo becomes
  `<sound tempo>` at the end.
- `feel:` swing and shuffle become `<sound><swing>` (MusicXML 4.0),
  using the swing percent when one is written; straight becomes
  `<straight/>`.
- A mid-chart `key:` or `time:` becomes `<attributes>` on the next bar.
- Lyric lines and `###` note lines become `<direction><words>` below
  the first bar after them, so nothing written is lost. They are not
  placed as `<lyric>` syllables, because barmark doesn't place them by
  beat yet (BRIEF roadmap item 5).

### Several parts

- Each part's `<part>` has every bar of the timeline: its own bars, the
  tutti bars as that part resolved them, and its tacet bars as
  measure rests. This is what `extractPart` gives, so the converter
  exports each part from `extractPart`'s parse and never pieces parts
  together itself.
- Repeats and endings, being barlines, are written in every part. The
  score's other marks (headings, rehearsal marks, tempo, feel, jumps, a
  repeat's words, and the text before the first heading, the chart's
  description: amended 2026-11-08) are directions written in the top
  part only, so a score
  shows them once: Dorico ignores MusicXML 4.0's `system` attribute and
  shows a direction written in every part over every staff. They still
  carry `system="only-top"` for the programs that read it. A part
  exported alone (`part`) is its own top part and keeps them all; a part
  extracted from the score inside a notation program does not (amended
  2026-11-05, Kevin's choice after the Dorico check).

## Testing

- **Unit tests** for each mapping row, on small charts.
- **Schema.** Every exported file in the suite validates against the
  MusicXML 4.0 XSD, vendored in the package's tests, checked with
  `xmllint` (CI installs `libxml2-utils`).
- **Playback.** The test above: the export's played order equals the
  parser's.
- **Real charts.** `examples/` and the grammar's own examples export
  cleanly, including Peaceful Dreams and Morning Song.
- **Notation programs.** Before the first release, a manual check:
  import Peaceful Dreams and Morning Song into MuseScore 4 and Dorico,
  with screenshots in the PR. Automating MuseScore import in CI is the
  builder's call if it is cheap.

## Release

- `@barmark/musicxml` 0.1.0 is a new package. It needs RELEASING.md's
  "A new package's first release": npm's trusted publisher is set up
  after a manual first publish, which **Kevin** does.
- Then `@barmark/cli` 0.2.0, with the `export` command.
- On barmark.dev, a line in Get Started and the CLI section. A download
  button on Try It is a later idea, not part of this.

## Left to the builder

- Whether the kind table lives as TypeScript or JSON.
- How `<divisions>` is computed, as long as every duration is a whole
  number.
- How slash notation is spelled, as long as MuseScore and Dorico show
  slashes.
- The internal module split (score, measure, harmony, playback-order
  writer).

## Calls Claude made (for Kevin to check)

1. A new package, `@barmark/musicxml`, not part of `barmark`. This keeps
   the core small. Import goes in the same package later.
2. Export only for now. Import and MIDI come later.
3. Chords become `<harmony>` over slash notes, not over notes Claude
   invents. Note sets and voicings become real notes, because the chart
   wrote them.
4. Written order with repeat marks where MusicXML says the same thing.
   Replays and elisions are written out in full.
5. Pushes are written as played (an early, tied slot), not as an
   articulation.
6. A chart with errors exports nothing and reports its diagnostics, as
   `transpose` does.
7. Lyric lines and note lines become words directions, not `<lyric>`.
8. A treble clef by default, and a bass clef only for parts whose note
   sets sit low.
9. The release needs Kevin for the new package's first manual npm
   publish.
