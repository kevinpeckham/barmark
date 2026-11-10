# @barmark/render

Renders [barmark](https://github.com/kevinpeckham/barmark) chord charts as
a clean, evenly spaced bar grid that looks the same on any page, follows
light and dark mode, scales with the reader's text size, and reads to a
screen reader as music.

```
npm install @barmark/render
```

## As HTML (no browser JavaScript needed)

```js
import { renderChart } from "@barmark/render";

const html = renderChart(chartText, { fontUrl: "/fonts/Edwin-Roman.otf" });
```

`renderChart` returns a `<barmark-chart>` element holding a declarative
shadow root: put it in any page, server-rendered or static, and it shows
the chart with no script. The shadow root keeps the page's CSS out, so a
blog's resets and fonts cannot rearrange the bars. Browsers attach a
declarative shadow root only while parsing HTML: to insert the markup from
script, use `setHTMLUnsafe` (or the element below), not `innerHTML`.

`renderChartUnwrapped(text, options)` returns the same markup without the
shadow root (classes prefixed `bm-`), for pages that include `stylesheet`
themselves.

## As a web component

```html
<script type="module">import "@barmark/render/element";</script>

<barmark-chart src="/charts/peaceful-dreams.chart.md"></barmark-chart>

<barmark-chart theme="dark" rehearsal-letters>
	<script type="text/barmark">
		## Verse
		| D | A | Bm | G |
	</script>
</barmark-chart>
```

The element renders from its `text` property, its `src` URL, or a child
`<script type="text/barmark">` (indentation is removed), and renders again
whenever one changes; it fetches a `src` once, and renders once however
many properties and attributes change together. A chart rendered on the
server by `renderChart` keeps its music until it has a source of its own,
and still follows `theme`, `bar-numbers` and `wrap`; a change to
`numerals`, `rehearsal-letters` or `show-part` needs the chart's text, so
it waits for a source.

For a live editor, set `text`:

```js
const chart = document.querySelector("barmark-chart");
editor.addEventListener("input", () => { chart.text = editor.value; });
```

While `text` is a string it wins over `src` and the script child, and no
fetch happens; set it to `null` to go back to them. Any string is safe:
the chart escapes it, and problems show as diagnostics, never errors.
There is no `text` attribute: chart text belongs in the property or the
script child.

The element registers the font itself, from the `fonts/` folder beside its
own module. If your bundler moves that file, register it yourself before
the element loads, with `<style data-barmark-font>` holding
`fontFaceCss(yourUrl)`; the element then leaves it alone.

## Options and attributes

| `renderChart` option | Element attribute (property) | Default | |
|---|---|---|---|
| `theme` | `theme` (`theme`) | `"auto"` | `"auto"` follows the system; `"light"` or `"dark"` force one |
| `barNumbers` | `bar-numbers="off"` (`barNumbers`) | `true` | bar numbers at the start of each row |
| `rehearsalLetters` | `rehearsal-letters` (`rehearsalLetters`) | `false` | boxed A, B, C… on each section as played |
| `numerals` | `numerals` (`numerals`) | none | `"nashville"` (6m⁷) or `"roman"` (vi⁷): each chord as its degree in its bar's key |
| `wrap` | `wrap="off"` (`wrap`) | `true` | wrap a section's rows when it is wider than the chart's box; off, rows keep their columns and the chart overflows, for its page to scroll |
| `part` | `show-part` (`showPart`) | none | draw only the part with this label, as one player reads it: tutti bars, its own bars, and "tacet" where it rests. The attribute isn't `part`, which HTML keeps for `::part()` styling |
| `diagnostics` | | `false` | list the chart's errors and warnings below it |
| `fontUrl` | | none | emit Edwin's `@font-face` rule before the chart |
| (the `text` argument) | (`text`) | `null` | the chart to draw; wins over `src` and the script child |

### Numerals

With `numerals`, each chord shows as its degree in the key its bar is
played in, so a modulation renumbers from its next bar. Degrees count
from the key's tonic against the major scale, in every mode: in `key:
Am`, Am is 1m and C is ♭3. Nashville keeps the chord's quality and
superscript after the number (Bm7 in D is 6m⁷, D/F♯ is 1/3); Roman
shows minor and diminished in lower case (ii, vii°, ♭VII). Both raise a
power chord's 5 into the superscript (D5 in D is 1⁵ and I⁵, never 15).
A bar with no key, note sets, N.C., `?` and `--` look as they always
do, and a screen reader hears both: "bar 5: five, A seven". Numbered
chords carry `data-numeral`. It's a view: the music and bar numbers don't change.

### Spoken names

`speakChord(record, key?)` gives a chord the name a screen reader hears
in the chart, for other tools that want to say a chord aloud:

```ts
import { parseChord } from "barmark";
import { speakChord } from "@barmark/render";

const r = parseChord("Cø");
if (r.ok) speakChord(r.value); // "C minor seven flat five"
```

With a key, it speaks the degree too, as the numerals view does.

## Styling on purpose

Set these custom properties on the element or anything above it:

| Property | What it sets |
|---|---|
| `--barmark-font` | the chords' typeface |
| `--barmark-text-font` | lyrics and `###` note lines (default Georgia) |
| `--barmark-label-font` | the meta line, mid-chart changes, headings and diagnostics (default the system sans) |
| `--barmark-size` | the chord size everything scales from (default `1rem`) |
| `--barmark-ink` | chords and text |
| `--barmark-paper` | the background |
| `--barmark-muted` | holds, bar numbers, braces, meta lines |
| `--barmark-rule` | bar lines |
| `--barmark-accent` | errors |
| `--barmark-directive` | mid-chart changes (default the muted colour) |
| `--barmark-note` | `###` note lines (default the ink colour) |
| `--barmark-lyrics` | syllables under a voice line and in lyric rows (default the ink colour) |

```css
barmark-chart {
	--barmark-size: 0.9rem;
	--barmark-paper: transparent;
	--barmark-text-font: "Noto Serif", Georgia, serif;
}
barmark-chart::part(heading) {
	color: teal;
}
```

`::part()` names: `title`, `meta`, `heading`, `bar`, `chord`, `text`,
`bar-number`, `rehearsal`, `lyrics` (each verse's line of words, inside
its `bar`). These, the custom properties and the
attributes are the public surface: changing them is a breaking change.

## Light, dark and print

Both palettes meet WCAG AA contrast (4.5:1 for text). `theme="auto"`
follows `prefers-color-scheme`; a page with its own dark-mode switch sets
`theme` or the colour properties. Printing always uses the light palette,
and Windows High Contrast keeps bar lines and marks visible.

## Accessibility

- Everything is sized in em from `--barmark-size`, so text size and zoom
  scale the chart; a section too wide for its container wraps its rows
  instead of scrolling sideways.
- Every bar has a spoken name built from the parsed chart: "bar 9: A seven
  sus four, hold", "triplet: D, E, F sharp minor", "note E", "C over E".
  Sections are labelled by their headings, and repeats are spoken ("play
  2 times").

## The font

Edwin, MuseScore's text font for music, ships unmodified in
`@barmark/render/fonts/Edwin-Roman.otf` with its SIL Open Font License
(`fonts/OFL.txt`). It is registered under the family name "barmark
Edwin". Serve the file and pass its URL as `fontUrl`, or call
`fontFaceCss(url)` once per page; without it the chart uses Georgia or
another serif.

## What it draws

Bar numbers sit in a gutter at the left edge; section headings, lyrics,
note lines and mid-chart changes start at the first bar line. Chords start
at the left of their share of the bar. A change written mid-chart names
itself: `time: 3/4, tempo: 120` draws as "→ Time 3/4 · Tempo ♩ = 120".
At the default size chords are 16px and no label is under 12px.

Chords appear in their canonical form whatever the author typed (`Cø`
shows as Cm⁷(♭5)). `%` is drawn as the bar it copies; a replayed section
is drawn in full, and its own lyrics replace the written section's. Bar
numbers count the bars as written, each once, as a band counts them: a
repeat, an ending, a jump or a replay doesn't move them, so a replayed
section shows the numbers it was written with. A pickup is bar 0: its
row shows no number in the gutter (`barNumber` is `0` in the model) and
is spoken as "pickup", and the bars after it are 1, 2, and so on. A line with an error shows as written, underlined,
with its message. `layoutChart(text)` returns all of this as data, if
you want to draw it yourself, and `typesetChord(parts)` with `glyphs`
gives a chord's pieces as the page sets them (root and quality, the
raised extension, the bass after a slash, ♯ and ♭), and
`typesetNumeral(parts, key, style)` its Nashville or Roman numeral, so a
PDF or canvas drawer matches it. A section block's `bars` counts its
widest row's bars (0 when it has none), where `columns` also counts its
fermata, direction and rehearsal cells.

A chart of several parts (barmark's grammar 7.4) draws each system as
stacked rows, one per part in score order, with the part's label in the
gutter and one bar number on the top row. A part tacet in a system gets
an empty row that says "tacet" in its first bar, so every system keeps its
shape; a tutti line is one row. The header lists the parts' names, and
each part row is announced by name to a screen reader. On a screen too
narrow for a section, its rows wrap one by one, as any row does.

A voice line (barmark's grammar 4.3 and 7.7: the line a part sings on,
such as `Vox.Mel` under a lead sheet's bare `Vox` chord line) draws each
note as its pitch name (every note of a set, without octaves) and
under it, in italics, the syllable each verse sings there: verse 1 from
the syllables on the notes, then each `lyrics N:` row, numbered "1.",
"2." left of the first bar when there are several. A hyphen follows a
syllable whose word goes on, and a held syllable (`:/`) draws an extender
line. The notes are spaced by beat, each as wide as the widest note or
syllable. Verses come from the parser as played, placed under the written
bars: a repeat's verse 2 is drawn under the bars it is sung on, and a
replay draws its own words. A voice line with no words draws as any part
line does. A lyric row on no melody (the chart's words, or a singer who
writes no notes there) draws its words inside the bars it covers, a line
per verse spaced by beat, so on a narrow screen they wrap with their
bars; under a system they go in its last row. A screen reader hears the
words after each bar's notes: "bar 2: note G four, hold, …, verse 1
“maz-ing”, verse 2 “grace that”".

## License

MIT. Edwin is © MuseScore Limited, under the SIL Open Font License 1.1.
