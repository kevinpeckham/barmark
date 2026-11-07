# barmark

Markdown-inspired plain-text notation for chord charts: the bar grid
musicians already write (`| D | A |`), specified precisely enough for
machines.

```
# Example Song
key: D, time: 4/4, tempo: 145

## Verse
|: D | A | Bm | G :|
| Em | / | A | A7 |
```

- **The grammar:** [docs/grammar-v0.1-draft.md](docs/grammar-v0.1-draft.md)
  (draft v0.1). [examples/](examples/) has full charts, among them a
  lead sheet with a voice part and two verses (`shenandoah.chart.md`).
- **[`barmark`](packages/barmark/)** on npm: the parser, the canonical
  printer and Harte-label conversion.
- **[`@barmark/render`](packages/render/)** renders a chart
  as a clean bar grid, as HTML or as a `<barmark-chart>` web component.
- **[`@barmark/musicxml`](packages/musicxml/)** exports a chart to MusicXML
  (chords, repeats, parts, melodies and lyrics) and imports a MusicXML or
  `.mxl` file back into a chart, so charts move to and from MuseScore,
  Dorico, Sibelius and Finale.
- **[`@barmark/sync`](packages/sync/)** syncs a chart with a recording:
  it builds a chart from a chord detector's output (bar grid, chord runs,
  key, meter, sections) and a timing map that says when each played bar
  starts, with a checker and the lookups a player needs.
- **[`@barmark/cli`](packages/cli/)**: the `barmark` command, to check,
  format, render and transpose `.chart.md` files, and to `import` a
  MusicXML file or `export --musicxml` a chart, in a terminal or in CI.
- **[barmark.dev](https://www.barmark.dev)** ([site/](site/)): try it live, and
  the syntax guide.

This repository is a Bun workspace. [RELEASING.md](RELEASING.md) describes
the checks and the release process, [FINDINGS.md](FINDINGS.md) what
surprised us along the way, and [BRIEF.md](BRIEF.md) why barmark exists.

## License

- **The grammar** (`docs/grammar-*.md`): © 2026 Kevin Peckham,
  [CC BY 4.0](docs/LICENSE). Copy it, adapt it or implement it, with
  credit: "Barmark grammar by Kevin Peckham, barmark.dev".
- **The Syntax Guide** (barmark.dev/syntax: its text and examples, in
  `site/src/lib/guide/`): CC BY 4.0, as the grammar is.
- **The song charts** (Peaceful Dreams and the conformance fixtures):
  © Kevin Peckham, all rights reserved, see [COPYRIGHT.md](COPYRIGHT.md).
- **Everything else** (the packages, the site's code, the scripts): MIT, see
  [LICENSE](LICENSE).
