# Credits: composer, lyricist, arranger, copyright — design

Status: draft for Kevin's review (2026-11-04). Kevin chose the four
fields; the rest are Claude's calls, gathered at the end.

## Intent

A chart knows its music but not who wrote it. Today that goes in a text
line, as in every song in `kevinpeckham/songs`:

```
# Peaceful Dreams
Words and music by Kevin Peckham. © Kevin Peckham, all rights reserved.
```

Text has no meaning, so nothing can use it: barmark.dev can't set it as
a score's credits, and the MusicXML export can't pass it on. Four
**credit lines** give it meaning:

```
# Peaceful Dreams
composer: Kevin Peckham
lyricist: Kevin Peckham
copyright: © Kevin Peckham, all rights reserved.
```

## What the Dorico tests showed (2026-11-04)

- Dorico's own export writes composer, lyricist and arranger as
  `<identification><creator type="…">` and the copyright as `<rights>`
  (several lines kept), plus page text (`<credit>`) for the title,
  composer and copyright.
- Dorico **imports none of it** into Project Info, only the title: not
  from our test file (`<creator>`, `<rights>`, `<work-number>`,
  `<miscellaneous-field>`), not with `<credit>` page text added, and not
  from its own exported file. So no export fills Dorico's Project Info;
  that is filled in by hand after import.
- Composition year, work number and "Other information" are not exported
  by Dorico at all, and MusicXML has no standard element for a year or
  notes. They stay out (see Non-goals).

The credits are still worth having: barmark.dev shows them, MusicXML
carries them to programs that read `<creator>` and `<rights>`, and they
sit in the chart file beside the music.

## Goals

- Four optional credit lines, `composer:`, `lyricist:`, `arranger:` and
  `copyright:`, in the grammar (new section 7.5), parsed, printed in
  canonical form, and in machine output.
- barmark.dev's renderer shows them as a score's credits.
- The MusicXML export writes them as `<creator>` and `<rights>`.
- No chart that reads today changes meaning, except that a text line
  starting with one of the four names becomes a credit (no chart in
  `examples/` or `kevinpeckham/songs` has one).

## Non-goals

- Composition year, work number, opus, flow number and "other
  information": nothing reads them (Dorico included), and MusicXML has
  no standard place for a year or notes. A text line still holds notes.
  They can follow when a tool needs them.
- Filling Dorico's Project Info: Dorico doesn't import it.
- Parsing names (first and last, several people out of "A and B"), dates
  or the © sign. A credit is text.

## Anti-goals

- **Breaking a chart that reads today.** A copyright line at the foot of
  a chart is natural, so a credit is allowed anywhere, not only before
  the first bar (unlike `part:`).
- **A credit that changes the music.** Credits never affect bars,
  directives, parts, numbering or play order.

## The grammar (new 7.5 Credits)

```
# Peaceful Dreams
composer: Kevin Peckham
lyricist: Kevin Peckham
arranger: Jane Doe
copyright: © 2026 Kevin Peckham
copyright: All rights reserved.
```

- **Names.** `composer:`, `lyricist:`, `arranger:`, `copyright:`, in any
  case. A closed set with no aliases.
- **A line of its own,** like `part:`: the value runs to the end of the
  line, so it may hold commas (`composer: Lennon, McCartney`). Runs of
  spaces print as one. Another directive on the line is not read as one:
  `composer: A, key: G` credits "A, key: G". That case gets a warning
  suggesting two lines.
- **Anywhere.** A credit names the whole chart wherever it's written:
  before the bars, between sections or at the foot. It takes no time and
  doesn't end a system's run of lines any more than text does.
  (Recommendation; `part:` is before-the-bars-only because parts shape
  systems, and credits don't.)
- **Repeatable.** Each line is one entry, kept in written order: two
  `composer:` lines are two composers, and two `copyright:` lines are a
  copyright notice of two lines. This is how MusicXML keeps them (one
  `<creator>` or `<rights>` each), and it answers a multi-line copyright
  like the one in Kevin's Dorico test without a line-break escape.
- **Errors and warnings.**
  - Error: no value (`composer:`). The line stays as text.
  - Warning, with the right name suggested, on a text line that starts
    with a near miss and a colon: `author:` and `writer:` (composer),
    `music:` (composer), `words:` and `lyrics:` (lyricist), `arr:` and
    `arranged:` (arranger), `rights:` and `©:` (copyright).
- Credits are not directives: they don't share a line with `key:` and
  the others, and the directives' table and near-miss list don't change.

Section 1's table gains a row: `composer:` `lyricist:` `arranger:`
`copyright:` (any case) — a **credit** line (7.5) — e.g. `composer: Kevin
Peckham`.

## Canonical form (section 8)

- The name lowercased, one space after the colon, the value as written
  with runs of spaces collapsed and the ends trimmed.
- Where it was written: credits don't move. (The printer doesn't sort a
  header; `part:` and directives don't move either.)

## Machine output (A.7)

`credits` on the parse:

```ts
type Credits = {
  composer: string[];
  lyricist: string[];
  arranger: string[];
  copyright: string[];
};
```

Each list is in written order and empty when none is written. A `Line`
of kind `"credit"` (`{ kind: "credit"; line; role; text }`) keeps the line
for the printer. `extractPart` keeps credits (they belong to the chart),
and so do transposition and the CLI's `part` and `format`.

## The renderer (`@barmark/render`)

In the header, under the title, as a score sets credits (the renderer's
own decision, shown for review on the dev site before release):

- Composer and lyricist the same people: "Words and music by Kevin
  Peckham". Otherwise "Music by …" and "Words by …", each only when
  written.
- "Arranged by …" when written.
- Several names joined as "A and B", or "A, B and C".
- The copyright lines, small, at the foot of the chart, one per line.
- Screen readers hear the same text; no `aria-hidden` here.

A chart's other header lines (directives) are unchanged.

## MusicXML (`@barmark/musicxml`)

- `<identification>` gains `<creator type="composer">`, `"lyricist"`,
  `"arranger"` (one per entry, in that order) and `<rights>` (one per
  copyright line), before `<encoding>`, as the schema orders them.
- Whether to also write `<credit>` page text (`credit-type` composer,
  lyricist, arranger, rights) is the builder's call after an import
  check: Dorico ignored it, and MuseScore may print it twice if it also
  sets credits from `<creator>`. The rule is the one Dorico's export
  follows unless a program shows that wrong.

## Testing

- Parser: each credit, repeated credits, a credit after bars, in a
  system's run, an empty value (error), near misses (warnings), any case,
  commas in a value, `composer: A, key: G` (warning).
- Printer: canonical form, round trip, `printChart` stable; the
  `examples/` round-trip test covers the examples once one carries
  credits (Peaceful Dreams gains `composer:`, `lyricist:` and
  `copyright:`).
- Machine output: `credits` in A.7's tests; `extractPart` keeps them.
- Renderer: header text for the cases above (same people, different,
  several names, arranger only), the copyright foot, and the browser
  suite's accessibility check.
- MusicXML: `<creator>` and `<rights>` in order, schema-valid, and the
  corpus test. A manual MuseScore import of Peaceful Dreams, to settle
  `<credit>`.

## Release

A grammar change, so a minor for each package that changes: `barmark`
0.15.0, `@barmark/render` 0.13.0, `@barmark/musicxml` 0.2.0, then
`@barmark/cli` 0.3.0, barmark.dev (the guide gains 7.5) and the songs
bump. Moving the songs' text lines to credits is a separate pull request
in `kevinpeckham/songs`, Kevin's to accept.

## Calls Claude made (for Kevin to check)

1. **Credits anywhere,** not only before the first bar, so a copyright
   at the foot of a chart reads, and no text line becomes an error.
2. **Repeatable,** one entry per line, which also gives a multi-line
   copyright without an escape.
3. **A line of its own,** the value to the end of the line, as `part:`.
4. **No aliases;** near misses warn (`author:`, `music:`, `words:`,
   `lyrics:`, `arr:`, `arranged:`, `rights:`, `©:`).
5. **Text, not parsed:** no splitting of names, no © added.
6. **Renderer credits as a score sets them** ("Words and music by …",
   "Arranged by …", copyright at the foot).
7. **Year, work number, opus, flow number and other information left
   out** until something reads them.
