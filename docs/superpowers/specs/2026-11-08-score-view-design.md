# Score view: design

Status: agreed with Kevin in conversation (2026-11-08); to be approved as
written. Decisions marked **Kevin** are his; the rest are **Claude's
call**, open to correction. No grammar change.

## Intent

A reader on a Stem Shovel song page sees a chart drawn as barmark's bar
grid. Some readers read staff notation more easily than a chord grid
(**Kevin**). They should be able to click once and see the same chart as a
traditional score, in place.

## The principle (Kevin)

The score draws what the chart's MusicXML contains, and nothing else. It
does not push the music one way or another:

- A chart imported from a score and drawn as a score again looks very
  close to the original, as close as the import kept the music.
- A plain chord chart authored in barmark draws as `@barmark/musicxml`'s
  export already is (chord symbols over slash notes, plus any melody and
  lyric lines as real notes), and should look like Dorico's rendering of
  that same exported file.

What follows from it (Claude, agreed by Kevin as "looks correct"):

- The score path is thin: `parseChart` → `exportMusicXml` → Verovio → SVG.
  No score-specific musical logic lives in the new package. A gap between
  a score and its re-drawing is a gap in the import or the export, fixed
  there, where the grid and every other consumer gain from it too.
- "Very close" means close in the music (notes, rhythms, chords, lyrics,
  parts, structure, key, meter, tempo), not a copy of the original's
  engraving (system and page breaks, stem directions, spacing), which
  barmark's chart doesn't keep.
- No written-out chord voicings: a chart says which chord and when, not
  which notes; on a page a guessed voicing would read as the arrangement.

## Goals

1. A new package, **`@barmark/score`**, with a web component
   (**`<barmark-score>`**) that shows a chart as the bar grid or as a full
   score, with a switch between them.
2. **Two components (Kevin):** `<barmark-chart>` (`@barmark/render`) stays
   as light as it is today, with no score code; `<barmark-score>` is the
   heavier one, understandably, because of Verovio.
3. **Full score (Kevin):** every part, each on its own staff (or staves),
   as the MusicXML export writes them. The grid keeps its one-part
   `show-part` view; the score ignores `show-part`.
4. **Static (Kevin):** no following of playback in the first version.
5. Stem Shovel's song page uses `<barmark-score>` so a reader can switch
   (Stem Shovel's own change, in its own repo, done by whoever works
   there; this design only needs the component to make it possible).

## Non-goals (first version)

Playback following or a cursor; written-out voicings; printing or PDF of
the score; editing; page-by-page layout; replacing Stem Shovel's existing
Verovio viewer for uploaded scores; any change to the grammar, the parser
or `<barmark-chart>`.

## Anti-goals

- The score showing music the chart doesn't hold (a voicing, a fill, a
  "tidied" rhythm), or hiding music it does.
- `<barmark-chart>` or `@barmark/render` growing heavier, or depending on
  Verovio in any way.
- A page that goes blank because the score failed: the grid always stays.
- Verovio's code copied into barmark's MIT packages.

## The component (Claude's calls)

- **Inputs:** the same as `<barmark-chart>`: chart text as the element's
  content, `src`, or the `text` property. All the grid's attributes pass through to the grid
  (`show-part`, `theme`, `numerals`, `bar-numbers`, `wrap`, …), so
  switching a page from `<barmark-chart>` to `<barmark-score>` changes
  nothing until the reader switches view.
- **The switch:** a small two-way "Grid / Score" control above the chart;
  `view="grid"` (default) or `view="score"` to open on the score; the
  attribute reflects the current view and the element fires a `viewchange`
  event. Not remembered between page loads. Keyboard reachable and labelled
  for screen readers, as `@barmark/render`'s accessibility section asks of
  the grid.
- **Drawn on the server too (Claude's call, after the builder check):**
  Stem Shovel draws the grid on the server today (`renderChartHtml`, a
  declarative shadow root, no script needed). `@barmark/score` therefore
  also exports a server function, e.g. `renderScoreHtml(text, options)`,
  that writes `<barmark-score>` with the grid already drawn (through
  `@barmark/render`'s `renderChart`), the switch, and the chart text
  carried inside the element for the score to export later. It never
  imports Verovio. In the browser the element takes over that markup
  without redrawing the grid, so the grid shows before any JavaScript
  runs and never flashes.
- **When the chart changes** (a new `text`, `src` or attribute; Stem
  Shovel transposes by setting `text`): the grid redraws as
  `<barmark-chart>` does; if the score is showing it is engraved again
  (the newest request wins, older ones are dropped); if not, it is
  engraved on the next switch.
- **Loading:** Verovio (npm `verovio`, LGPL-3.0-only, 6.4.x at the time of
  writing, ~7 MB) loads only on the first switch to the score, in a Web
  Worker, so a reader who stays on the grid never downloads it and the page
  never freezes while it engraves. A short "Loading score…" state shows
  meanwhile. The builder decides how the worker and the wasm are located
  (bundled URL, or a `verovio-url` attribute for sites that host it), and
  says so in the README. One copy of Verovio per page however many
  `<barmark-score>` elements it holds; sharing an engine with a host's own
  Verovio (Stem Shovel's viewer for uploaded scores) is not a goal: a page
  that shows both may load it twice (Claude's call).
- **Layout:** one continuous page as wide as the element, reflowed on
  resize (Stem Shovel's `engraveNotation.ts` does exactly this: Verovio
  `breaks: auto`, `adjustPageHeight`, a page width from the element's
  width; it is the reference to start from, ~200 lines with its worker).
- **Light and dark:** the score follows `theme` (and the system setting the
  grid follows), drawing in the current text colour rather than fixed
  black on white.
- **Errors:** if Verovio fails to load, or rejects the MusicXML, or the
  chart has errors that stop export, the grid stays up and the switch shows
  a short note that the score couldn't be drawn (with the reason for a
  developer in the console). Never a blank element.
- **Safety:** the SVG is generated by Verovio from MusicXML we wrote, but
  chart text is user input (titles, lyrics, words): the builder makes sure
  nothing in the chart can inject markup or script into the page through
  the score (Stem Shovel sanitises Verovio's SVG for this reason).

## Licence (Claude's call; worth a look from whoever handles licensing)

`@barmark/score` depends on `verovio` as an ordinary npm dependency and
loads it unchanged at run time; Verovio's code is never copied or
modified in barmark. That is the usual way to use an LGPL library, and
keeps every barmark package MIT, `@barmark/score` included. Its README
and package say it uses Verovio under LGPL-3.0, with a link, and the site
credits it.

## How we know it works

- **Unit tests** (Node, real Verovio as Stem Shovel's tests do): the
  example charts and the MusicXML import fixtures each export and engrave
  without error; the score has one staff group per part; bar count matches
  the export's measures; theme colours apply; a broken chart keeps the
  grid and reports.
- **Browser tests** (Playwright, as `@barmark/render` has): the switch,
  lazy loading (no Verovio request until the first switch), resize,
  keyboard use, the error fallback.
- **Round trip:** the MuseScore fixtures in
  `packages/musicxml/tests/fixtures/import/` (original `.musicxml` → import
  → chart → score): the re-drawn score holds the same notes, rhythms,
  chords, lyrics and parts as the original (compared on the MusicXML, or on
  Verovio's own reading of each); differences are listed, and each one
  traced to the import or the export.
- **Gaps found are findings, not blockers (Claude's call):** each round-trip
  or Dorico difference becomes a FINDINGS entry or a backlog item, fixed
  in `@barmark/musicxml` (or the parser) in its own pull request and
  release. `@barmark/score` 0.1.0 does not wait for them, unless a gap
  makes the score show wrong music for a chart that the grid shows right,
  in which case it is fixed first.
- **Against Dorico (advice, not a release gate; Claude's call):** for a few charts, mac-bench makes Dorico's PDF of
  our exported MusicXML (its existing PDF job) and the builder puts it
  beside Verovio's SVG for a person to look at (a page in the scratch
  folder, not CI); what differs in the music, not in house style, is a
  finding.
- The usual gates: `bun test`, `bun run check`, Fallow, verify:package,
  release through RELEASING.md as a new package (Kevin's npm placeholder
  and trusted publisher first, as for every new package).

## What's left to the builder

The package layout and file names; how Verovio's worker and wasm are
shipped and found; the switch's exact look within the grid's styling
conventions; the Verovio options beyond those named; how the round-trip
comparison is done; the site page for the new package (the backlog's
package pages).
