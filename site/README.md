# barmark.dev

The home page (a live editor beside the rendered chart) and the syntax
guide. SvelteKit, prerendered, styled with UnoCSS only (no CSS files,
`<style>` blocks or `style` attributes), after Stem Shovel's look.

This folder is **not** a member of the repository's Bun workspace: it
installs `barmark` and `@barmark/render` from npm at exact versions, so
the site, and the guide's tests, run exactly what readers install. After
a package release, bump them here (RELEASING.md, step 12).

```
bun install
bun run dev            # http://localhost:5173
bun run build          # prerenders into .vercel/output
bun run check          # svelte-check (TypeScript 6: see FINDINGS.md)
bun test               # copy, demo chart, guide rows against the parser, built pages
bun run test:browser   # Playwright: live editing, the guide, no JavaScript, phone widths
```

- `src/lib/guide/rows.ts`: the guide, one row per construct. Every
  example is parsed in `tests/guide.test.ts`; a row the parser disagrees
  with fails the build.
- `src/lib/demo.chart.md`: the home page's chart.
- `uno.config.ts`: theme, shortcuts and fonts. Edwin comes from
  `@barmark/render` through `presetWebFonts`; `scripts/fonts.ts` copies
  the file into `static/fonts/` before `dev` and `build`.

Deployed on Vercel (the Lightning Jar team) with this folder as the
project's root directory.
