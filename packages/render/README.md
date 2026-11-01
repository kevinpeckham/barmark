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

The element renders from its `src` URL, or from a child
`<script type="text/barmark">` (indentation is removed), and renders again
whenever either changes; it fetches a `src` once, and renders once
however many attributes change together. A chart rendered on the server
by `renderChart` keeps its music until it has a source of its own, and
still follows `theme` and `bar-numbers`.

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
| `diagnostics` | | `false` | list the chart's errors and warnings below it |
| `fontUrl` | | none | emit Edwin's `@font-face` rule before the chart |

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
`bar-number`, `rehearsal`. These, the custom properties and the
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
is drawn in full with its own bar numbers, and its own lyrics replace the
written section's. A line with an error shows as written, underlined,
with its message. `layoutChart(text)` returns all of this as data, if
you want to draw it yourself.

## License

MIT. Edwin is © MuseScore Limited, under the SIL Open Font License 1.1.
