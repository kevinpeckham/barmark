# barmark.dev

The home page (a live editor beside the rendered chart) and the syntax
guide. SvelteKit, prerendered, styled with UnoCSS only (no CSS files,
`<style>` blocks or `style` attributes), after Stem Shovel's look.

This folder is **not** a member of the repository's Bun workspace: it
installs `barmark`, `@barmark/render` and `@barmark/score` from npm at
exact versions, so
the site, and the guide's tests, run exactly what readers install. After
a package release, bump them here (RELEASING.md, step 12).

```
bun install
bun run dev            # http://localhost:5173
bun run build          # prerenders into .vercel/output
bun run check          # svelte-check (TypeScript 6: see FINDINGS.md)
bun test               # copy, example charts, guide rows against the parser, built pages
bun run test:browser   # Playwright: live editing, the guide, no JavaScript, phone widths
```

- `src/lib/guide/rows.ts`: the guide, one row per construct. Every
  example is parsed in `tests/guide.test.ts`; a row the parser disagrees
  with fails the build.
- `src/lib/examples.ts` and `src/lib/examples/*.chart.md`: the home
  page's charts, which Previous and Next flip through (Amazing Grace first,
  the one prerendered). Each is the same text as the repository's
  `examples/` copy, parses clean and prints unchanged
  (`tests/examples.test.ts`). They are drawn by `<barmark-score>` (Grid /
  Score switch; Verovio loads only on Score; a flip keeps the view and the
  chord spelling) with a Key menu (`src/lib/key.ts`, as Stem Shovel's, not
  remembered; a flip starts the new chart in its own key).
- Scores load `@barmark/engraver`, the smaller modified build of Verovio,
  from jsDelivr with both its digests (`src/lib/chart.ts`, the score
  package's `ENGRAVER_*` values); if either file fails, the element falls
  back to the stock Verovio bundled in its worker chunk.
- `static/licenses/`: Verovio's LGPL-3.0 and GPL-3.0 texts, copied from
  `packages/cli/licenses/`; the footer credits the modified build, links
  its NOTICE and release, these texts and this folder's source, since the
  score's worker bundles stock Verovio as the fallback.
- `src/lib/guide/score.ts`: the guide's "In the score" rows; each example
  is exported and engraved with Verovio in `tests/score-notes.test.ts`.
- `uno.config.ts`: theme, shortcuts and fonts. Edwin comes from
  `@barmark/render` through `presetWebFonts`; `scripts/fonts.ts` copies
  the file into `static/fonts/` before `dev` and `build`.

Deployed on Vercel (the Lightning Jar team) with this folder as the
project's root directory.
