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
  (draft v0.1). [examples/](examples/) has a full chart.
- **[`barmark`](packages/barmark/)** on npm: the parser, the canonical
  printer and Harte-label conversion.
- **[`@barmark/render`](packages/render/)** renders a chart
  as a clean bar grid, as HTML or as a `<barmark-chart>` web component.

This repository is a Bun workspace. [RELEASING.md](RELEASING.md) describes
the checks and the release process, [FINDINGS.md](FINDINGS.md) what
surprised us along the way, and [BRIEF.md](BRIEF.md) why barmark exists.

## License

MIT, see [LICENSE](LICENSE).
