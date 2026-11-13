# Guitar chord diagrams: design

Status: approved by Kevin (2026-11-10). Asked for by Kevin on 2026-11-10:
the renderer should have an option that shows chord diagrams for guitar,
and the planned ChordPro export (`@barmark/lyricsheet`, branch
`docs/chord-lyric-interchange`) should be able to use the same shapes.
Calls marked **Decided by Kevin (2026-11-10)** are his; section 10
lists them. Calls marked **(design call)** are Claude's, each with its
reason, and open to correction.

No grammar change. A diagram is a view, like numerals: it never changes
the music, the bar numbers or the chart's text (render's rule:
"`@barmark/render` never changes the music").

## 1. Intent

A guitarist reading a barmark chart wants to see how to play each chord.
With `chord-diagrams="guitar"`, the chart shows a strip of fret diagrams,
one per chord it uses, in standard tuning. The shapes come from one
library, so the HTML grid, the CLI, the score element's grid, barmark.dev
and a ChordPro export all show the same fingering for the same chord.

## 2. What we measured

Throwaway spike (scratchpad only, not in the repo), using barmark's own
`parseChord`, against ChordPro's tables at commit `4b25408`
(`lib/ChordPro/res/config/`). Pitch content is checked mechanically: each
shape's absolute frets (`fret + base − 1`) over E2 A2 D3 G3 B3 E4 give the
sounding notes, compared with the pitch classes and bass barmark reads
from the name.

**2.1 ChordPro's `guitar.json`.** 1,155 names: 667 with their own shape
(one is `NC`), 488 aliases (`copy`). `N.C.`/`NC` are left out below,
leaving 1,153.

| Measure | Count |
|---|---|
| Names barmark reads | 949 of 1,153 (82%) |
| Unread | 204: 12 suffixes × 17 root spellings: `0`, `⁰`, `mb5`, `h`, `4`, `69`, `911`, `9/11`, `sus9`, `(sus9)`, `(maj7)`, `7+` |
| Shape sounds exactly the name's pitch classes | 746 (79% of read) |
| Shape leaves tones out, nothing wrong | 192 (20%): the fifth 105, ninth and fifth 50, ninth 16, third and fifth 16, other 5 |
| Shape sounds a note **not in its name** | 11 (1.2%): `Bb7`/`A#7` is a C7 (`x 3 5 3 5 3`), `A13`, `Ab6`, `Ab/Eb`, `Db/D`, `Gmaj7/A`, `D#m/C#`, `D#m7/C#` and their aliases |
| Lowest note isn't the name's bass | 53: mostly deliberate inversions (`Caug` `x x 2 1 1 0`, `D6` `x 0 0 2 0 2`), some wrong slash chords (`Gbm/Bb` sounds A in the bass) |
| Own shapes with a muted string inside the voicing | 111 of 666 (17%) |

The other tables: `ukulele.json` 111 shapes (G4 C4 E4 A4),
`mandolin-ly.json` 306 (G3 D4 A4 E5), `keyboard.json` only `NC`, and
`jazzy-chords.json` 357 aliases with display names and no shapes.

**2.2 What the table covers of barmark's vocabulary.** Appendix A's forms
(A.3 combinations, A.4's altered chords, power chords, inversions and
common slash chords): 54 forms × 12 roots = 648 chords. A chord counts
as covered when some ChordPro name reads as the same pitch classes and
bass.

| Family | Covered | Forms missing everywhere |
|---|---|---|
| triads (`C` `m` `dim` `aug` `sus2` `sus4`) | 72 / 72 | — |
| slash (`/3` `/5` `m/b3` `m/5` `/b7` `7/3` `m7/b7` `/2`) | 72 / 84 | `m/5` (`Cm/G`) |
| sixths | 36 / 48 | `m6/9` |
| sevenths | 96 / 120 | `augmaj7`, `7sus2` |
| extensions | 120 / 168 | `m13`, `13sus4`, `mmaj9`, `(11)` |
| alterations | 72 / 132 | `7alt`, `9(#11)`, `13(b9)`, `7(b9,#11)`, `maj7(#11)` |
| power chords | 12 / 24 | `5(7)` |
| **total** | **480 / 648 (74%)** | |

The real charts (`examples/` and the four in `~/projects/songs`): 33
distinct chords, 27 covered; the 6 missing are all `5(7)` (`G5(7)`,
`E5(7)`…). Their 5 note sets are single melody notes on voice lines.

**2.3 A shape-finder.** Given pitch classes (required and optional) and
a bass, it enumerates standard-tuning fingerings: every 4-fret window up
to fret 15, open strings allowed; at most a 3-fret span between fretted
notes; at most 4 fingers, a barre at the lowest fret counting as one;
the bass is the lowest sounding note (an open string can sound below a
fretted lower string); no muted string inside the
voicing; at least 3 strings (2 for a power chord). The fifth (and the
9th and 11th under a 13th) may be left out. A cost ranks them: position,
strings sounding, span, tones left out, the root on top. The weights
were tuned on ChordPro's shapes (a 243-point grid), so the agreement
below is optimistic.

| Measure | Result |
|---|---|
| Vocabulary (648) and corpus (33) with at least one shape | all |
| ChordPro's 658 correctly spelled own shapes inside the finder's limits | 454 (69%); the rest: 110 interior mute, 45 leave out a tone the finder requires, 26 need 5 fingers, 23 bass not lowest |
| Finder's first choice equals ChordPro's | 186 (28%; 41% of the 454) |
| ChordPro's in the finder's top 3 / top 10 | 314 (48%) / 423 (64%; 93% of the 454) |
| Speed (unoptimised, every window) | 4.4 ms per chord |
| Size | 2.7 KB minified, 1.4 KB gzipped |

Its first choices are valid but often not the familiar shape: `Bm` comes
out `x 2 0 4 0 2` before `x 2 4 4 3 2`, `C5` as `x x x x 1 3`. A finder
alone can't choose the shape a guitarist expects; a table must.

**2.4 Exact voicings** (grammar 4.1, 4.2), each written note on its own
string, strings ascending, interior mutes allowed:

| Voicing | Playable shapes | First |
|---|---|---|
| `Cmaj7{E3 G3 B3 C4}` (the grammar's example) | **none** within a 3-fret span | — |
| `Dm7{F3 C4 E4}` | 10 | `x x 3 x 1 0` |
| `G13{F2 B2 E3}` | 1 | `1 2 2 x x x` |
| `{C3 G3 E4}` | 10 | `x 3 x 0 x 0` |
| `{B2 F#3 D4}` | 3 | `x 2 4 x 3 x` |
| `{E1}` | none: below the guitar | — |

**2.5 Size.** Today `@barmark/render/element` is 122 KB minified, 43 KB
gzipped (barmark included). ChordPro's 667 own shapes in a compact
encoding are 2.9 KB gzipped (4.9 KB with the aliases).

## 3. Where shapes come from (Decided by Kevin (2026-11-10): option c)

| | (a) ChordPro's tables | (b) our table + finder | (c) our table + finder, ChordPro as a VM-only check |
|---|---|---|---|
| Vocabulary covered | 74% (finder needed anyway) | all | all |
| Known errors shipped | 11 wrong, 53 inversions to vet | none we know | none; the check finds disagreements |
| Familiar shapes | yes, ChordPro's taste | ours, unchecked | ours, compared with ChordPro's |
| Licence in our packages | Artistic 2.0 data inside MIT packages | MIT only | MIT only |

**(a)'s conditions, as the licence states them.** ChordPro (© The ChordPro
Team; licence text © The Perl Foundation) is under the Artistic License
2.0, data included.

- §2: verbatim copies may be distributed if all copyright notices and
  disclaimers are duplicated.
- §4: a Modified Version (fixing the 11 wrong shapes, re-encoding or
  dropping the 204 unread aliases would make one) may be distributed if
  we "clearly document how it differs from the Standard Version" and do
  at least one of: (a) offer the changes to the Copyright Holder under
  the Artistic 2.0; (b) not prevent installing the Standard Version, and
  use a different name; (c) let recipients redistribute the modified
  source under the Artistic 2.0 or a similar licence that keeps the
  source free.
- §5–6: compiled forms (our bundles, the CLI's binaries) must say how to
  get the source.
- §7–8: aggregation and embedding in a larger work are allowed; §8 adds
  "provided the result does not expose a direct interface to the
  Package".
- §9: works that merely use the Package are not part of it.

Shipping (a) means: the table file under the Artistic 2.0 beside MIT code,
ChordPro's notices in each package and the CLI's release assets (as
Verovio's LGPL is today), a document of our changes, and a source
pointer in every bundle. This is not legal advice.

**Decided by Kevin (2026-11-10): (c),** our own table plus the finder,
under MIT; ChordPro's tables are only a VM-only check and are never
shipped. Reason: the finder is needed for a quarter of
our vocabulary whatever we choose; ChordPro's table has errors that a
mechanical check catches anyway; and the finder alone picks the familiar
shape only 28% of the time, so a hand-written table is needed for the
chords people play most. (c) keeps every package MIT and still gets
ChordPro's judgement, as a report for a person, never as shipped data.
Our table is written from the instrument and checked by machine (section
8); it is never copied from ChordPro's files.

**The table (design call).** One TypeScript module in the new package,
written by hand:

- **Open shapes** for the forms guitarists play in first position (`C`,
  `A`, `G`, `E`, `D` families and their `m`, `7`, `maj7`, `m7`, `sus`,
  `6`, `(9)`, `/3` forms): roughly 120 rows, `"x32010"` strings.
- **Movable templates** per form, rooted on the 6th and the 5th string
  (the E- and A-shape barres and their 7th-chord cousins): two or three
  for each of the 54 forms, about 130 rows, transposed to any root.
- Lookup: the open shape if one exists for that root, else the lowest
  template, else the finder's first choice; a moved shape that would
  start above the seventh fret is not used; the finder answers. A table
  shape is used only when it sounds the chord: a row may leave out a fifth
  that another chord with the same notes needs.

Each row is a test: it must sound its name (section 8).

## 4. What gets a diagram

**4.1 Chord names (design call).** The shape for the canonical chord
(the same symbol, however it was written, gets the same diagram). Rules
the finder and table both follow:

- The bass is the lowest sounding note; a slash bass included.
- The fifth may be left out of a chord of four or more tones; the 9th
  and 11th may be left out of a 13th.
- `7alt`: a shell, root, third and ♭7, labelled with the full name;
  speech adds "altered tones not shown". Reason: the grammar leaves the
  altered fifth and ninth to the player; a diagram must not choose them.
- Power chords (`5`, `5(7)`): two or three strings, root lowest.

**4.2 Note sets and voicings: braces are exact (design call).** Reason:
the grammar says braces are the notes played, so a diagram must show
those notes or say it can't.

| Written | Diagram |
|---|---|
| note set with octaves `{C3 G3 E4}` | exactly those pitches, one string each, interior mutes allowed; if no fingering fits, a frame saying "not playable in standard tuning" |
| note set without octaves `{C E F# B}` | those pitch classes in written order, low to high, one string each, octaves free; the same message if none fits |
| one pitch (`{E}`, `{E1}`) | none: a single note isn't a chord shape |
| voicing `Cmaj7{E3 G3}` | the voicing's notes, exactly, labelled `Cmaj7` |
| voicing that doesn't fit (`Cmaj7{E3 G3 B3 C4}`) | the name's own shape, marked "written voicing doesn't fit standard tuning" in text and speech |
| voice-line note sets (grammar 7.7) | none: they are melody, not harmony |

A name with a voicing is a different entry from the bare name: the
strip may show both `Cmaj7` and `Cmaj7{E3 G3}`.

**4.3 Everything else.** `?`, `N.C.`, `--` and `/` add nothing. `%` adds
nothing new: the parser has already copied the bar's chords. A bar line
with an error is skipped (its chords are unknown).

## 5. What the reader sees

**5.1 A strip, at the top (Decided by Kevin (2026-11-10): top only for
now).** The diagrams sit in one
wrapping row after the header and before the first section. Reasons:

- Diagrams over the grid were weighed and rejected for now: a diagram is
  about 3.5em wide against a chord's 2em, so every bar would widen,
  wrapping would change and the even spacing that is render's point
  would go.
- At the top, a reader learns the shapes before playing, and on a screen
  the bottom of a long chart is out of view. Printed songbooks do both;
  bottom placement is deferred.

**5.2 Order and duplicates (design call).** First appearance in written
order, through the chart's events (replays and `%` add nothing new); one
diagram per distinct entry (canonical name plus voicing). Enharmonic
names (`F#` after a modulation, `Gb` before) are two entries with the
same shape, because the reader sees both names in the grid. A key change
never changes a shape. With `numerals`, the grid shows degrees and the
strip still shows letter names, because a shape is in a concrete key;
each diagram also shows the numeral under its name, from its first
appearance's key. Transposing (`transposeChart`, `barmark transpose`)
happens before rendering, so the shapes follow. With `part` (show-part),
only that part's chords; otherwise every part's chord lines.

**As built (2026-11-13).** Entries are read from the rows the grid draws,
not from the events, and from each part's harmony line only: the line the
parser names for that part in each system (grammar 7.6), so a part that
writes several lines gives its chords once. On a line that is sung, chord
names still count and only note sets are passed over (they are the
melody's notes, section 4.2). Which line is a part's harmony line, what a
`%` copies and which key is in force all come from the parser.

**5.3 The SVG (design call).**

- One `<svg>` per diagram, drawn in em units from `--barmark-size`, so
  it scales with text: six strings, five frets, dots for fretted notes,
  a bar for a barre, `×` and `○` above the nut, a thick nut in first
  position, otherwise the starting fret number at the left (`5fr`).
- Colours from the existing tokens only: strings and frets
  `--barmark-rule`, dots and nut `--barmark-ink`, open and muted marks
  and the fret number `--barmark-muted`; the name typeset by
  `typesetChord` in `--barmark-font`, as the grid sets it. No new custom
  property. `forced-colors` uses `currentColor`, as the grid's marks do.
- New `::part()` names: `diagrams` (the strip) and `diagram` (each one).
  A public-surface addition, so a minor release.
- Every string in the markup comes from canonical names or numbers we
  generate, and still goes through `escapeHtml`; no `id` attributes, so
  two charts on a page can't collide.

**As built (2026-11-13).**

- Two drawings at one scale. A shape in first position is a narrow image
  (`viewBox="36 0 60 75"`); a shape up the neck is a wider one (`viewBox="0
  0 96 75"`, class `bm-dg-fr`) with its fret number at the left, 13 units
  tall, clear of the strings and of a barre. Their CSS widths are in the
  viewBox ratio, so strings, dots and text are the same size in both, and
  a first-position diagram gives up no room to a label it does not have.
  The name stays centred under the strings. No `:has()`.
- `forced-colors` sets the three tokens the strip draws from (`--bm-rule`,
  `--bm-muted`, `--bm-ink`) to `CanvasText` on the strip, in one rule,
  not `currentColor` on each mark.
- The strip's rules (`DIAGRAMS_CSS`) are part of every chart's stylesheet,
  whether or not the strip is drawn: about 0.35 KB gzipped. Reason: score's
  shell shares one stylesheet across views, and `ROW_COLUMNS_CSS` is the
  precedent. A standing test removes them before comparing a chart with
  the option off to its output before this feature, byte for byte.
- The list is `<ul role="list">`; a diagram that can't be drawn is a
  frame the height of a drawing with the reason inside.

**5.4 Accessibility (design call).** The strip is a `<section
aria-label="Guitar chords">` holding a list; each diagram is `<svg
role="img" aria-label="…">` with a visible caption. The label is
`speakChord`'s name, then the strings low to high in words: "A minor:
muted, open, 2, 2, 1, open". Reason: "x" and "0" read aloud as letters
and digits; "muted" and "open" are what a teacher says. A diagram that
can't be drawn says why ("C major seven, written voicing: not playable in
standard tuning"). The grid's bar speech is unchanged.

**As built (2026-11-13).** The label says what the bar's speech says for
the same slot: with `numerals` on and a key in force it begins with the
degree ("six, F sharp minor: 2, 4, 4, 2, 2, 2"), and a name with a
written voicing the diagram shows is said with its notes ("C major seven
voiced E3 G3: …"), so two entries of one name are told apart. A voicing
the diagram replaced is not said as voiced: the label gives the name, the
strings, then "written voicing doesn't fit standard tuning". The numeral
shown under a name is `aria-hidden`, since the label carries it.

**5.5 Left-handed (design call: in the first release).** Option
`diagramHand: "left"`, attribute `diagram-hand="left"`: the grid of
strings mirrors (low E on the right); the name, fret number and the
spoken order (low to high) don't. Reason: about one person in ten
is left-handed, it is one transform on the string group, and adding it
later would be a second visible change to the same strip.

**5.6 Print and PDF.** Print uses the light palette, as the chart does
today; the strip gets `break-inside: avoid` per diagram, and stays at the
top of the first page. The CLI's HTML and a browser's print-to-PDF need
nothing more. A PDF drawer outside the browser gets the shapes as data
(section 6.1) and can draw them itself, as `typesetChord` serves it now.

## 6. Options and API

**6.1 A new package, `@barmark/fretboard` (Decided by Kevin
(2026-11-10)).** Reasons:

- `@barmark/lyricsheet` needs the shapes and must not depend on render;
  render needs them and must not grow by a table it doesn't use.
- The name is free on npm. The unscoped `fretboard` is an unrelated
  0.0.1 from 2022; the word also names scale-on-the-neck viewers, but the
  package's scope (tunings, shapes, later ukulele and maybe tab) is the
  fretboard. (`@barmark/frets` and `@barmark/fingerings` were free
  too.)
- Dependencies: `barmark` with a caret, as `@barmark/musicxml` has.

```ts
type Shape = { frets: number[]; base: number; barre?: { fret: number; from: number; to: number } };
// frets: absolute, low string first, -1 muted, 0 open; base: the first fret drawn
type Tuning = { name: "guitar"; strings: number[] };    // MIDI, low to high
shapeFor(slot: ChordRecord, voicing?: ChordRecord): ShapeResult;
// ShapeResult: { ok: true; shape; caveat: "shell" | "voicing-replaced" | null } | { ok: false; reason }
shapesFor(slot): Shape[];                               // ranked alternatives, for a future picker
soundsChord(shape, chord, tuning): boolean;             // the mechanical check of section 8
```

In 0.1 these take no tuning: only standard guitar exists, and the parameter comes with the first other tuning. `sounding` and `soundsChord` take one.

No SVG in this package: drawing belongs to render, beside the grid's
theme.

**6.2 Render.** `renderChart(text, { chordDiagrams: "guitar",
diagramHand: "left" })`, attributes `chord-diagrams="guitar"` and
`diagram-hand`. `layoutChart` gains `diagrams: DiagramEntry[]` (name
pieces, shape or reason, speech), so other drawers get the same data.
As built (2026-11-13): `DiagramEntry` is `{ chord, voicing, key, shape,
caveat }`, the parser's records and fretboard's shape; `shape` is null
when nothing fits, and `diagrams` is an empty list when the option is
off. Name pieces and speech are not stored: a drawer typesets `chord`
with `typesetChord`, as the grid does. The spoken label (`speakDiagram`)
is internal for now; export it when another drawer needs it.
`"ukulele"` and `"mandolin"` are later values of the same option.

**Render's weight (Decided by Kevin (2026-11-10)): a static import with
a +6.75 KB budget enforced by a test (amended twice on 2026-11-13).**
Render imports `@barmark/fretboard` statically. The finder (1.4 KB
gzipped in the spike), a table of about 250 rows (about 2 KB) and the
SVG drawer (about 1 KB) add roughly 4.5 KB gzipped to the element's
43 KB, about 10%. A size test fails the build above the budget. Reason: the
attribute then works everywhere (score's grid, the CLI, barmark.dev)
with no registration step. The alternative weighed and not taken:
injecting the instrument (`chordDiagrams: guitar` imported from
`@barmark/fretboard`, plus a side-effect import that registers it for
the element), so charts without diagrams pay nothing.

**Amended by Kevin (2026-11-13): the budget is +5.5 KB.** Built, the shapes cost render about 4.5 KB gzipped (`shapeFor` alone measured 4,546 bytes in the package), which leaves about 1 KB for the drawer; the size test enforces +5.5 KB.

**Amended again by Kevin (2026-11-13): the budget is +6.75 KB.** The whole feature, built and measured by the size test (the element entry, minified, gzipped, against the same build of commit 4ee2724), cost 6,539 bytes on 46,302 when Kevin ruled (6,558 after the last fix): the shapes and the choice of which chords get a diagram about 4.7 KB, the drawing and the strip's markup about 1 KB, the strip's styles about 0.4 KB, the attributes and the rest about 0.5 KB. A review found about 160 bytes of savings that remove no behaviour, so trimming could not reach +5.5 KB; the choice was this budget or the injection weighed above, and Kevin kept the static import. `packages/render/tests/size.test.ts` enforces +6,750 bytes.

**6.3 Tuning and capo: deferred (Decided by Kevin (2026-11-10)).** First
release: standard tuning only. A capo changes what the strip's names
mean (concert pitch, as charts are written, or the shape's name, as
guitarists think); when it comes, the strip shows shape names with the
concert name beside them. The grammar ruled the capo a note line, not
syntax. Alternate tunings need only a `Tuning` value and
the finder; the table is standard tuning, so other tunings would be
finder-only until they get tables.

**6.4 Score, CLI and site.**

- `@barmark/score`: add `chord-diagrams` and `diagram-hand` to its
  observed attributes and pass them to the grid. The score view (Verovio)
  ignores them; MusicXML's `<frame>` is a later, separate feature.
- CLI: `barmark render --diagrams guitar` (a value, so `ukulele` fits
  later) and `--left-handed`. They are grid flags: refused with
  `--score`, as `--numerals` is.
  As built (2026-11-13): `--left-handed` without `--diagrams` is a usage
  error (`--left-handed needs --diagrams`), so a flag that would do
  nothing is not accepted silently.
- barmark.dev: a "Guitar diagrams" switch in the playground, a line in
  the guide's renderer options, and Peaceful Dreams shown with diagrams
  on its example page. The site pins exact versions, so it follows the
  render release.

## 7. The ChordPro link

ChordPro's `{define: Am base-fret 1 frets x 0 2 2 1 0}` gives a song its
own shape for a name; it overrides the built-in for that song.
`exportLyricsheet(chart, { diagrams: "guitar" })` (CLI `export
--lyricsheet --diagrams guitar`) writes the defines in the song's header,
under the name spelled as lyricsheet 4.7 writes it (`Am7b5`, not
`Am7(b5)`), so `[Am7b5]` and its define match. Fret numbers become
relative to `base-fret`, as ChordPro reads them.

The target rule is: define only the chords whose shape differs from
ChordPro's built-in, or that ChordPro doesn't know. Under each option:

- **(a)** The table ships, so the export compares directly. Names
  ChordPro knows use its shape and need no define; only the 26% of our
  vocabulary it lacks, and any shape we corrected, get one.
- **(b)** The export can't know ChordPro's built-in, so it must define
  every chord or none.
- **(c)** The same as (b) at run time. Minimal defines would need a
  list of the names where our shape equals ChordPro's, generated by the
  VM check and committed: data derived from ChordPro's table, even if
  only names.

**So it constrains the choice a little. Decided by Kevin (2026-11-10):
with diagrams on, the export writes `{define}` for every chord it
writes.** Reasons: the output then
shows the strip's exact shapes in any ChordPro reader, whatever its
version or the reader's own instrument config; ChordPro's built-in table
changes between releases, so "differs from built-in" is a moving target;
and a define for a chord ChordPro already knows costs one line. Without
`diagrams`, the export writes no defines, as lyricsheet's design says
now. Note sets and N.C. stay annotations, so they never get defines.

Phase 2 (import) gains a bonus: a `{define}` is an exact voicing, so
`{define: Am … frets x 0 2 2 1 0}` can import as `Am{A2 E3 A3 C4 E4}`.

## 8. Testing

All in `bun test` unless marked VM.

- **Every shape sounds its chord.** For every table row, every finder
  first choice across the 648-chord vocabulary and the corpus, and every
  exact voicing fixture: `soundsChord` from frets and tuning, the bass
  lowest, only allowed omissions, and the limits (span, fingers, no
  interior mute for named chords). This catches the kind of error 2.1
  found in ChordPro's table (`Bb7` sounding C7).
- **Determinism.** The finder breaks ties by fret string, so the same
  chord always gets the same shape.
- **Snapshot SVGs** (golden strings): an open chord, a barre at fret 5, a
  muted bass, a slash chord, a shell `7alt`, an exact voicing with an
  interior mute, "not playable", left-handed.
- **Accessibility.** linkedom: the strip's label, each `role="img"` and
  its spoken label, no ids. Playwright (render's browser suite): contrast
  in light, dark and forced colours, wrapping at 320px, print media.
- **Escaping.** A chart whose names and words hold `<`, `&` and quotes
  renders the strip without markup injection.
- **Scale.** A 1,000-bar chart with 200 distinct chords renders the strip
  in linear time; the finder is memoised by pitch classes and bass, as
  `export-scale.test.ts` guards MIDI. (The unoptimised spike takes 4.4 ms
  a chord; pruning by window and the table hit rate must bring 200 new
  chords under 50 ms.)
- **Size.** The element bundle's gzipped size stays within +6.75 KB (amended 2026-11-13) of the
  last release.
- **ChordPro comparison (VM only, never in CI).** `bun
  scripts/chordpro-shapes.ts` downloads ChordPro's `guitar.json` at a
  pinned commit into a temp directory (never committed), and prints, per
  chord form: names read, where our shape agrees, where it differs (both
  shapes side by side), and ChordPro shapes that fail `soundsChord`.
  Advice for a person, like the Dorico and MuseScore checks.
- **Lyricsheet.** Golden `.cho` files with defines; each define read back
  gives the shape we drew; the VM reference check (lyricsheet 5.3) runs
  ChordPro over them and fails on any warning.

## 9. Scope and risks

**First release.**

- `@barmark/fretboard` 0.1.0: standard guitar tuning, table, finder,
  exact voicings, `soundsChord`. Placeholder and trusted publisher first
  (memory: new packages need Kevin's placeholder).
- `@barmark/render` minor: `chordDiagrams`, `diagramHand`, the strip,
  speech, print, `layoutChart`'s `diagrams`.
- `@barmark/score` patch, `@barmark/cli` minor (`--diagrams`,
  `--left-handed`), the site.
- `@barmark/lyricsheet`: defines with `diagrams`, in its first release
  if the timing fits, else its next minor.

**Later.** Ukulele and mandolin (tunings plus their own tables), finger
numbers, diagrams over the grid, choosing among `shapesFor` alternatives (by an option, not syntax),
MusicXML `<frame>` in the export, `{define}` import.

**Deferred by Kevin's decisions (2026-11-10).**

- Capo, and its naming: shape names with the concert name beside them,
  when it comes.
- Tuning: standard tuning only until then.
- Bottom placement of the strip.

**Risks.**

- **Taste.** The familiar shape is a convention; the finder alone
  matches ChordPro 28% of the time. The table and the VM comparison
  address it; real players' complaints will still come.
- **Octaves.** Guitar is written an octave above where it sounds; the
  grammar says octaves are sounding pitch. An author writing a guitar
  voicing at written pitch gets shapes an octave off, or "not playable"
  (`{E3}` for the low E string). Mitigation: the guide says it, and
  "not playable" explains itself.
- **Exact voicings often don't fit.** The grammar's own
  `Cmaj7{E3 G3 B3 C4}` doesn't, within a 3-fret span. Falling back to the
  name's shape with a visible note is honest but may surprise.
- **Size creep** in render, guarded by the size test.
- **Perception.** Common open shapes are the same in every chord book,
  ChordPro's included; ours are written from the instrument and checked
  by machine, and the comparison script never copies its data.

## 10. Decisions

Decided by Kevin (2026-11-10), each as recommended:

1. **Where shapes come from: option (c).** Our own table plus the
   finder, under MIT. ChordPro's tables are only a VM-only check and are
   never shipped (section 3).
2. **Package and weight: `@barmark/fretboard`,** imported statically by
   render, with the +6.75 KB budget (amended 2026-11-13) enforced by a test (section 6).
3. **ChordPro defines:** with diagrams on, the export writes `{define}`
   for every chord (section 7).
4. **Strip position:** the top only, for now (section 5.1).
5. **Capo:** deferred; when it comes, shape names with the concert name
   beside them (section 6.3).
6. **No syntax for picking a shape.** Authors who want a particular
   fingering write a voicing with octaves.
7. **The result's field is `caveat`** (Kevin, 2026-11-13), not `notes`: in a music library `notes` reads as musical notes.
