# barmark.dev — design

Status: draft for Kevin's review, 2026-10-31. Decisions are Kevin's unless
marked *(Claude's call)*.

## Intent

barmark.dev is the front door for barmark. Its reader is **a developer
building an open-source music app** who went looking for exactly what
barmark promises: a markdown-inspired plain-text notation for chord charts
that bands and machines can both read. They should leave knowing what
barmark is and having seen it work, with an obvious way to read the rules,
get the packages, and learn where it came from.

## Goals, non-goals, anti-goals

**Goals (launch, stage 1)**

- A home page that says what barmark is in one sentence and lets the
  reader edit a real chart and watch it render as they type.
- A friendly syntax guide that a newcomer can search and filter.
- Links to the GitHub repo, the npm packages, the Lightning Jar article and
  Stem Shovel.
- Built as SvelteKit, styled with UnoCSS utilities only, in Stem Shovel's
  look and conventions.

**After launch (stage 2, same design, separate plan)**

- **Interactive docs** in the spirit of <https://unocss.dev/interactive/>:
  one search box; type a chord symbol or a snippet and see at once how
  barmark reads it (canonical spelling, spoken name, Harte label, the
  render, any error with its message).
- **A tutorial**: a few short steps, each a small editable chart and a
  sentence (a first bar → repeats → sections and replays → lyrics).

Stage 1 should build the pieces these reuse (the editor, the live render,
the example data) so stage 2 is cheap.

**Non-goals**

- Accounts, saving charts, sharing links, comments. Nothing is stored.
- A full code editor (syntax highlighting, autocomplete) in stage 1.
- Replacing the grammar draft: `docs/grammar-v0.1-draft.md` stays the
  binding specification; the site's guide is the friendly way in.
- Pixel-final layout: Kevin will adjust the layout by hand after launch.
  Stage 1 needs to be close to the sketch, built so that adjusting it is
  easy.

**Anti-goals (would make it a failure even if it works)**

- The guide says something the parser doesn't do. An example whose
  meaning drifts from the parser must fail the build, not ship.
- Inline `style` attributes, `<style>` blocks or CSS files in the site's
  own code. Styling is UnoCSS utilities and shortcuts only, as in Stem
  Shovel.
- A home page that needs a live server or a slow client bundle before the
  chart shows: the page is readable with JavaScript off.

## The pages (stage 1)

### Home (`/`)

The approved sketch (brainstorm screen `site-home-v1`) is the reference.
Top to bottom:

1. **Top bar:** "barmark" wordmark on the left; Syntax, GitHub, npm on the
   right *(Claude's call: the nav repeats the main links)*.
2. **Headline (the page's first sentence), verbatim:** "A markdown-inspired
   plain-text notation for chord charts that bands and machines can both
   read."
3. **Second sentence:** "barmark was developed as part of Stem Shovel, an
   open-source platform for musician collaboration." "Stem Shovel" links to
   <https://www.stemshovel.com>.
4. **Buttons:** "Read the syntax" (the primary, accent button, to
   `/syntax`); GitHub (<https://github.com/kevinpeckham/barmark>); npm
   (<https://www.npmjs.com/package/barmark>, showing `npm i barmark`); and
   the article, "Why we built it" →
   <https://www.lightningjar.com/blog/introducing-barmark> (published;
   checked 2026-10-31).
5. **Two windows side by side:** on the left, the chart's barmark text,
   editable; on the right, the chart rendered by `@barmark/render`. Every
   edit re-renders immediately (on input, no button). On narrow screens the
   windows stack, source above render *(Claude's call)*.
6. **Footer:** MIT licence, by Lightning Jar, part of Stem Shovel
   *(Claude's call)*.

**Demo chart** *(Claude's call)*: the opening of Peaceful Dreams (title and
directives, Intro, Verse, Chorus, the Verse and Chorus replayed, Outro), as
in the sketch: real, short, and showing `%`, repeats and replays. It lives
in the site as a `.chart.md` file and must parse with no diagnostics (a
test).

**Render window behaviour**

- The first render is in the prerendered HTML (the `renderChart` output,
  declarative shadow DOM), so the chart shows with JavaScript off.
- After hydration, edits re-render. Note: a declarative shadow root is only
  attached by the HTML parser. Re-render through the `<barmark-chart>`
  element (an inline `<script type="text/barmark">` child or its `src`),
  `setHTMLUnsafe`, or `renderChartUnwrapped` plus the exported
  `stylesheet` in a shadow root the component owns. Which is the builder's
  call; `innerHTML` with `renderChart` output will not work.
- Errors in the edited text show inside the render (the renderer already
  draws an error line as written, underlined, with its message). The page
  never throws on bad input.
- The chart keeps the renderer's dark palette *(Claude's call)*; its
  colours can be tuned to the site with the `--barmark-*` custom
  properties, set through UnoCSS arbitrary-property utilities (e.g.
  `[--barmark-size:1rem]`), not inline styles.
- The Edwin font is served by the site (copied from
  `@barmark/render/fonts/`) and registered once.

**Source window:** a plain `<textarea>` in a monospace font, labelled for
screen readers, no wrapping, tab key inserts a tab or is left to the
browser *(builder's call)*. A "Reset" control restoring the demo chart
*(Claude's call)*.

### Syntax guide (`/syntax`)

A friendly guide in table form: **one row per thing you can write**.

- **Columns:** what you type (`%`, `x2`, `[2/4]`, `D7sus4`, `->`,
  `## Verse` …), what it means (one plain sentence), a small example, and
  that example rendered.
- **Search:** a box that filters rows as you type (matching the syntax,
  the meaning and the category).
- **Categories:** chips to narrow by category: bars, chords, repeats,
  sections, directives, lyrics and text *(Claude's call for the list)*.
- **Sort:** by name or by category.
- The filter and sort state is in the URL query (`?q=…&cat=…`) so a
  filtered view can be linked *(Claude's call)*.
- With JavaScript off, every row shows.
- A short intro above the table and a link to the full grammar draft on
  GitHub for the binding rules.

**Rows are data** (a TypeScript module or JSON in the site), written from
the grammar draft. Each row's example is checked in the test suite: it
parses, with diagnostics exactly as the row expects (most rows: none; rows
that show an error: that error), and where a row states a meaning that can
be checked (a chord's canonical spelling or Harte label, a repeat's count),
the test checks it against the parser. This is the guard against the guide
drifting from barmark.

## Look and conventions

Follow Stem Shovel (`~/projects/stem-shovel`):

- **UnoCSS** with `presetWind4` (with its reset), `presetIcons`
  (Phosphor, `i-ph-*`), `presetWebFonts` from bunny (Noto Sans, Noto Serif,
  Noto Mono), `@unocss/extractor-svelte`, `transformerVariantGroup` and
  `transformerDirectives`. Start from Stem Shovel's `uno.config.ts`: its
  palette (oxford, `dark`, accent `#ebf92f`, `on-accent`, `ink`, `line`,
  `row`) and the shortcuts the site uses (e.g. `button-accent-solid`,
  `marketing-headline`, `home-page-x-padding`, the `device-*` window
  chrome). Copy only what the site uses.
- **No direct CSS:** no `style` attributes, no `<style>` blocks, no `.css`
  files in the site. Everything is utilities or shortcuts in
  `uno.config.ts`.
- **Svelte components** for the buttons, the windows (source and render)
  and the guide's table, search and chips. Svelte 5 with runes.
- The page shell follows Stem Shovel's `app.html` (dark gradient ground,
  font classes on `body`, grid layout).

## How it is built

- **SvelteKit, latest:** Svelte 5.57.3 and SvelteKit 3.1.1 at the time of
  writing (2026-10-31), with `@sveltejs/adapter-vercel` 7.0.2 and UnoCSS
  66.12.0, on plain Vite 8 (8.3.5); pinned exactly, as the repository pins
  everything; take the latest when the build starts. **Plain Vite, not
  Stem Shovel's Vite+** (Kevin): Vite+ brings its own lint, format and test
  runners, which would duplicate the repository's Biome, `bun test` and
  Fallow; the site needs only Vite's dev server and build.
- **TypeScript:** the repository uses TypeScript 7 (the native compiler),
  which `svelte-check` may not support yet. If it doesn't, the site pins a
  TypeScript 6 for `svelte-check` alone and says why in FINDINGS.md.
- **In this repository, as a third workspace folder: `site/`**, a private
  package (never published).
- **The site runs the released packages** (Kevin): it depends on the exact
  published versions of `barmark` and `@barmark/render` from npm (today
  0.2.0 and 0.1.0), not the workspace copies, so the editor and the guide
  behave exactly like what a reader gets from `npm i barmark`, and the
  guide's examples are tested against that published code. Releasing a
  package gains a step: bump the site to the new version (a pull request
  of its own once the package is on npm); RELEASING.md and the `/release`
  skill say so. A test fails if the site's versions are behind the latest
  release tags *(Claude's call: a warning would be forgotten)*.
- **Prerendered:** every page is rendered at build (`prerender = true`), so
  there is no server at request time. The adapter is
  `@sveltejs/adapter-vercel` (Stem Shovel's precedent).
- **Tooling** *(Claude's call)*: the repository's own (Biome, `tsc` and
  `svelte-check`, `bun test`, Fallow, CI), not Stem Shovel's Vite+ /
  Oxlint stack: one repository, one toolchain. The site's checks join
  `bun run check` and `bun test`, and the site builds in CI.
- **Tests:** the guide data (every example, as above, against the
  published packages); the demo chart
  parses cleanly; the guide's filter and sort logic; a browser test that
  typing in the source window changes the render, that the home page and
  guide show their content with JavaScript off, and no horizontal scroll
  at phone width.
- **Accessibility:** the renderer already speaks each bar; the site adds
  labels for the source window and the search box, real buttons and
  links, visible focus, and WCAG AA contrast in the site's own colours.
- **SEO and sharing:** page titles and descriptions, canonical URLs on
  `https://barmark.dev`, Open Graph tags *(an OG image is the builder's
  call; a screenshot of the home page windows is enough)*.

## Deploying

- **Vercel, the Lightning Jar team**, a new project whose root directory is
  `site/`, deploying `main`; preview deployments for pull requests.
- **Domain:** `barmark.dev` (Kevin owns it) pointed at the Vercel project,
  with `www.barmark.dev` redirecting to it. Kevin does the domain and
  Vercel project steps (or approves them).
- Nothing on the site needs secrets or environment variables.

## Left to the builder

The component breakdown and names, the textarea's tab behaviour, how the
render window re-renders (within the constraint above), the exact guide
rows (written from the grammar, covering every construct in it), the
categories' exact names, the OG image, and the browser-test details.
