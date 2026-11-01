# Brief: a `text` property on `<barmark-chart>`

For the agent working on `@barmark/render`. Kevin asked for this on
2026-11-01; it goes in the next `@barmark/render` release (a minor:
0.2.0, since it adds API). Read `CLAUDE.md` and `packages/render/README.md`
first.

## Why

barmark.dev (`site/`) shows a live editor beside a rendered chart, and a
syntax guide with 40 rendered examples. It does not use the
`<barmark-chart>` element, because the element has no direct way to take
new text: it reads only a `src` URL or a child `<script
type="text/barmark">`. So the site calls `renderChart` and redraws with
`setHTMLUnsafe`, plus a hand-built shadow root for browsers without it
(`site/src/lib/chart.ts`, `showChart`). The site should be the showcase
for the component; with a `text` property it can be.

## What to build

- A `text` property on the element (`chart.text = "…"`), string or `null`.
  Setting it renders that text, batched with attribute changes exactly as
  today (`#schedule`, one render per task).
- **Precedence:** while `text` is a string it wins over a child script
  and `src` (no fetch happens). Setting it back to `null` returns to them,
  and to keeping a server-rendered chart's music when there are none.
  This is the recommendation; Kevin decides if he wants otherwise.
- A server-rendered chart (`renderChart` output, declarative shadow root)
  whose element is given `text` renders the new text into its existing
  shadow root.
- Never throws on any string (parsers never throw; problems are
  diagnostics in the chart). An empty string draws an empty chart.
- No attribute for it: chart text belongs in the property or the script
  child, not in markup.
- Rendering stays `attachShadow` plus `innerHTML`, which works in every
  browser the element supports today; do not move it to `setHTMLUnsafe`.

## Tests (test first, as always)

- Unit (`packages/render/tests/`, linkedom): setting `text` renders it;
  `text` beats a script child and `src` (no fetch); `null` falls back;
  several property and attribute changes in one task render once; a
  server-rendered chart takes new text; odd strings (`""`, `<script>`,
  `&`, 2,000 lines) never throw and are escaped.
- Browser (`packages/render/browser/`): typing into a textarea that sets
  `chart.text` on input updates the chart; an element created by script
  (`document.createElement`) with `text` set renders.

## Docs and release

- `packages/render/README.md`: the `text` property in "As a web component"
  and in the options table.
- `packages/render/CHANGELOG.md` under `[Unreleased]`, Added.
- Release `render` 0.2.0 by `RELEASING.md` (Kevin approves the publish),
  then bump the site (step 12).

## Afterwards (a separate site PR, not part of this work)

barmark.dev's `ChartRender.svelte` imports `@barmark/render/element` and
sets `text` on the element; `showChart`, the `setHTMLUnsafe` path and the
remount fix go away; the browser suite (`site/browser/site.pw.ts`) must
still pass, including the "without setHTMLUnsafe" and in-site navigation
tests. Watch for the element registering Edwin itself while UnoCSS
already does (`site/uno.config.ts`): register it once.
