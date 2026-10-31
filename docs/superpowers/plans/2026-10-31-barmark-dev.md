# barmark.dev (stage 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** barmark.dev's home page (live editor and render) and syntax guide (searchable table), prerendered SvelteKit in `site/`, ready to deploy to Vercel.

**Architecture:** `site/` is a standalone SvelteKit app inside the barmark repository but **not a workspace member**, so it installs `barmark` and `@barmark/render` from npm at exact versions and runs exactly what readers install (verified: Bun installs a non-member folder as its own project with its own `bun.lock`). Every page is prerendered; charts arrive as declarative-shadow-DOM HTML and re-render on the client with `setHTMLUnsafe`. Styling is UnoCSS utilities and shortcuts only, from a config that mirrors Stem Shovel's.

**Tech Stack:** Svelte 5.57.3 (runes), SvelteKit 3.1.1, `@sveltejs/adapter-vercel` 7.0.2, Vite 8.3.5 (plain, not Vite+), UnoCSS 66.12.0 (`presetWind4`, `presetIcons` + `@iconify-json/ph`, `presetWebFonts` bunny, `@unocss/extractor-svelte`, `transformerVariantGroup`, `transformerDirectives`), `svelte-check`, `bun test`, Playwright 1.64.1.

**Spec:** `docs/superpowers/specs/2026-10-31-barmark-dev-design.md`

## Global Constraints

- Pin every dependency exactly; take the newest release of each when Task 1 runs (the versions above are the floor).
- `barmark` and `@barmark/render` come from npm at exact versions: today `0.2.0` and `0.1.0`.
- No `style` attributes, no `<style>` blocks, no `.css` files in `site/`. Styling is UnoCSS utilities, arbitrary-property utilities (`[--barmark-size:1rem]`) and shortcuts in `site/uno.config.ts`.
- Fonts go through `presetWebFonts` (Kevin; Stem Shovel's precedent): Noto Sans/Serif/Mono from the `bunny` provider, as Stem Shovel; Edwin as `chart: { name: "barmark Edwin", provider: edwin }`, where `edwin` is a custom `Provider` (`name: "none"` is not enough: it emits no `@font-face`) whose `getPreflight` returns `fontFaceCss("/fonts/Edwin-Roman.otf")` from `@barmark/render`. No raw preflights, no CSS elsewhere. A `fonts` script, run before `dev` and `build` (`predev`, `prebuild`), copies `Edwin-Roman.otf` and `OFL.txt` from `node_modules/@barmark/render/fonts/` to `site/static/fonts/` (gitignored), so the font always matches the installed renderer.
- Svelte components for buttons, windows, and the guide's table, search and chips.
- Every page prerenders (`export const prerender = true` in `src/routes/+layout.ts`) and is readable with JavaScript off.
- Copy, verbatim: headline "A markdown-inspired plain-text notation for chord charts that bands and machines can both read." Second sentence: "barmark was developed as part of Stem Shovel, an open-source platform for musician collaboration." ("Stem Shovel" links to the Stem Shovel site.)
- Links: GitHub `https://github.com/kevinpeckham/barmark`; npm `https://www.npmjs.com/package/barmark` (label `npm i barmark`); article "Why we built it" `https://www.lightningjar.com/blog/introducing-barmark`; Stem Shovel `https://www.stemshovel.com`; grammar `https://github.com/kevinpeckham/barmark/blob/main/docs/grammar-v0.1-draft.md`; canonical origin `https://barmark.dev`.
- The repository's tools, not Stem Shovel's: Biome (tabs), `bun test`, conventional commits with no AI attribution trailer.
- Never set `innerHTML` (or Svelte `{@html}` with a changing value) to `renderChart` output after load: the declarative shadow root would not attach. Use `setHTMLUnsafe`.

## Review Focus

1. **Odd editor input:** an empty source, a 2,000-line paste, `<script>` or `&` in the text: the render shows what is there (the renderer escapes it), nothing throws, typing stays responsive. (Task 3.)
2. **JavaScript off:** the home page shows the demo chart rendered, and the guide shows every row with its rendered example. (Tasks 4, 6, 7.)
3. **Filtering and sorting keep the rendered examples:** after filtering, clearing and re-sorting, every visible row's example still has its rendered chart (shadow roots survive because rows are hidden and moved, never re-created). (Task 6.)
4. **A phone (360 px):** neither page scrolls sideways; the guide's table becomes stacked cards below the `sm` breakpoint. (Tasks 4, 6, 7.)
5. **A shared guide link:** `/syntax?q=repeat&cat=repeats` opens filtered; an unknown `cat` is ignored; the same link with JavaScript off shows every row. (Tasks 5, 6, 7.)

---

### Task 1: Scaffold `site/` and fit it into the repository

**Files:**
- Create: `site/package.json`, `site/bun.lock`, `site/svelte.config.js`, `site/vite.config.ts`, `site/tsconfig.json`, `site/uno.config.ts`, `site/src/app.html`, `site/src/app.d.ts`, `site/src/routes/+layout.ts`, `site/src/routes/+layout.svelte`, `site/src/routes/+page.svelte` (placeholder), `site/.gitignore`
- Create: `bunfig.toml` (root)
- Modify: `biome.json`, `.fallowrc.json`, `CLAUDE.md` (Layout and Commands)
- Test: `site/tests/build.test.ts`

**Interfaces:**
- Produces: `site/` scripts `dev`, `build`, `preview`, `check` (`svelte-kit sync && svelte-check`), `test` (`bun test tests`), `test:browser`; UnoCSS shortcuts later tasks use: `home-page-x-padding`, `marketing-headline`, `button-accent-solid`, `button-outline`, `device-window` (window chrome: `bg-dark border-2 border-blue-200/10 rounded-lg overflow-hidden`), `window-label` (`text-xs uppercase tracking-wider opacity-60 px-3.5 py-2.5 border-b border-line`).

- [ ] **Step 1: Write the failing test** `site/tests/build.test.ts`: after `bun run build` (run in the test's `beforeAll` via `Bun.spawnSync(["bun","run","build"], {cwd: site})`), `.vercel/output/static/index.html` exists and contains `<html lang="en"`; and `site/package.json`'s `dependencies` are exactly `{ "barmark": "0.2.0", "@barmark/render": "0.1.0" }` (no `^`, no `workspace:`).
- [ ] **Step 2: Run it** (`cd site && bun test tests/build.test.ts`). Expected: FAIL (no `site/` app yet).
- [ ] **Step 3: Scaffold.** `package.json` (`"private": true`, `"type": "module"`, exact pins); `svelte.config.js` with `adapter-vercel` and `kit.alias` none beyond `$lib`; `vite.config.ts` with `UnoCSS()` before `sveltekit()`; `uno.config.ts` mirroring `~/projects/stem-shovel/uno.config.ts`: presets, fonts (Noto Sans 400/600/700, Noto Serif 400, Noto Mono), the palette (`oxford`, `dark`, `accent`, `accent-1`, `on-accent`, `ink`, `line`, `row`, `light`, `offWhite`) and only the shortcuts listed under Produces (copy Stem Shovel's definitions of the first three; `button-outline` is `inline-flex items-center gap-2 px-4 py-2 rounded-md border border-white/25 hover-(border-accent text-accent) focus-visible-(outline-2 outline-accent)`); `app.html` as Stem Shovel's (body classes `font-sans bg-dark bg-gradient-to-br from-blue-950/20 via-dark to-blue-950/40 text-ink max-w-screen overflow-x-hidden`, and the classes safelisted); `+layout.ts` `export const prerender = true;`; `+layout.svelte` imports `virtual:uno.css`. The Edwin preflight and the `fonts` copy script (Global Constraints); the build test also asserts `.vercel/output/static/fonts/Edwin-Roman.otf` and `fonts/OFL.txt` exist and that the built CSS contains `font-family:"barmark Edwin"` inside an `@font-face`. `bun install` in `site/` (its own `bun.lock`).
- [ ] **Step 4: Fit the repository.** Root `bunfig.toml` `[test] root = "./packages"` so the root `bun test` never collects `site/` tests (CI's root jobs don't install the site). `biome.json` `files.includes` adds `!site/.svelte-kit`, `!site/.vercel`; Biome formats and lints `site/**/*.{ts,js,svelte}` — if Biome 2.6 rejects Svelte markup, add `!site/**/*.svelte` and rely on `svelte-check` (record which in FINDINGS.md). `.fallowrc.json` `ignorePatterns` adds `site/**` (Fallow does not model SvelteKit routes; the site is checked by `svelte-check` and its tests). `svelte-check` must run: if TypeScript 7 (the root's) breaks it, pin `typescript` 6.x in `site/` and add a FINDINGS.md entry.
- [ ] **Step 5: Run** `cd site && bun run check && bun test tests/build.test.ts`; root `bun test`, `bun run check`, `bun run fallow`. Expected: all pass; root test count unchanged (586).
- [ ] **Step 6: Commit** `chore(site): scaffold barmark.dev (SvelteKit, UnoCSS, prerendered)`.

### Task 2: Site constants and the demo chart

**Files:**
- Create: `site/src/lib/site.ts`, `site/src/lib/demo.chart.md`
- Test: `site/tests/site.test.ts`

**Interfaces:**
- Produces: `LINKS: { github, npm, article, stemShovel, grammar, origin }` (the Global Constraints URLs); `HEADLINE: string`, `TAGLINE_BEFORE = "barmark was developed as part of "`, `TAGLINE_LINK = "Stem Shovel"`, `TAGLINE_AFTER = ", an open-source platform for musician collaboration."`; `demo.chart.md` imported elsewhere as `import demo from "$lib/demo.chart.md?raw"`.

- [ ] **Step 1: Write the failing tests:** `HEADLINE` equals the headline verbatim; `TAGLINE_BEFORE + TAGLINE_LINK + TAGLINE_AFTER` equals the second sentence verbatim; every `LINKS` value starts with `https://`; `parseChart(demo)` (demo read with `Bun.file`) has `diagnostics` `[]`, title `"Peaceful Dreams"`, and `sections.map(s => s.name)` equal to `["Intro","Verse","Chorus","Verse","Chorus","Outro"]`.
- [ ] **Step 2: Run** `bun test tests/site.test.ts`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement.** `demo.chart.md` is the sketch's chart: `examples/peaceful-dreams.chart.md` through the first Chorus, then `## Verse`, `## Chorus`, and its `## Outro` (2 lines).
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(site): links, copy and the demo chart`.

### Task 3: The chart pieces: `ChartRender`, `SourceEditor`, `Window`, `Button`

**Files:**
- Create: `site/src/lib/chart.ts`, `site/src/lib/components/ChartRender.svelte`, `SourceEditor.svelte`, `Window.svelte`, `Button.svelte`
- Test: `site/tests/chart.test.ts`

**Interfaces:**
- Consumes: `renderChart` from `@barmark/render`.
- Produces:
  - `chartHtml(text: string): string` in `chart.ts`: `renderChart(text, { theme: "dark" })`; never throws (wrap: on an exception return `renderChart("", …)` with nothing else).
  - `ChartRender.svelte` props `{ text: string; label?: string }`: prerenders `{@html initial}` where `initial = chartHtml(text)` is computed **once** from the first prop value; an `$effect` calls `host.setHTMLUnsafe(chartHtml(text))` when `text` changes after mount. Wrapper classes set `[--barmark-size:1rem]`.
  - `SourceEditor.svelte` props `{ value: string (bindable); label: string }`: a `<textarea>` with a visually hidden `<label>`, `spellcheck="false"`, `wrap="off"`, monospace classes.
  - `Window.svelte` props `{ title: string; children: Snippet }`: `device-window` with a `window-label` header.
  - `Button.svelte` props `{ href: string; variant?: "accent" | "outline"; external?: boolean; children: Snippet }`: an `<a>` (`button-accent-solid` or `button-outline`); external links get `rel="noopener"`.

- [ ] **Step 1: Write the failing tests** for `chartHtml` (pure, `bun test`): `chartHtml("")` starts with `<barmark-chart>` and does not throw; `chartHtml("# A & <b>\n| D |")` contains `A &amp; &lt;b&gt;` and no `<b>`; `chartHtml` of `demo` contains `data-theme="dark"`; a 2,000-line chart (`"| D | G |\n".repeat(2000)`) returns in under 500 ms.
- [ ] **Step 2: Run** `bun test tests/chart.test.ts`. Expected: FAIL (`chart.ts` missing).
- [ ] **Step 3: Implement** `chart.ts` and the four components as specified above.
- [ ] **Step 4: Run** the tests and `bun run check`. Expected: PASS, no svelte-check errors.
- [ ] **Step 5: Commit** `feat(site): chart render, source editor, window and button components`.

### Task 4: The home page

**Files:**
- Modify: `site/src/routes/+page.svelte`
- Create: `site/src/lib/components/SiteNav.svelte`, `SiteFooter.svelte`; modify `+layout.svelte` to use them
- Test: `site/tests/home.test.ts`

**Interfaces:**
- Consumes: Task 2's constants and `demo`; Task 3's components.
- Produces: `SiteNav` (wordmark "barmark" → `/`; Syntax → `/syntax`, GitHub, npm) and `SiteFooter` ("MIT · by Lightning Jar · part of Stem Shovel", the last two linked), used on every page.

- [ ] **Step 1: Write the failing test** (reads the built `.vercel/output/static/index.html` after `bun run build`, parsed with `linkedom`): the first `<h1>` text equals `HEADLINE`; the next paragraph's text equals the second sentence and its link `href` is `LINKS.stemShovel`; links exist to `/syntax`, `LINKS.github`, `LINKS.npm`, `LINKS.article`; a `<textarea>` contains the demo text; a `barmark-chart` element is present whose `<template shadowrootmode="open">` contains `Peaceful Dreams`; `<title>` is `barmark: plain-text chord charts` and `<link rel="canonical" href="https://barmark.dev/">` and `og:title`/`og:description` meta exist; no element has a `style` attribute outside `barmark-chart`.
- [ ] **Step 2: Run** `bun test tests/home.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the page in the sketch's order: nav, headline (`marketing-headline`), tagline, the four buttons ("Read the syntax" accent; GitHub; `npm i barmark` in mono; "Why we built it"), then the two `Window`s in `grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-4` ("Source · edit me" with `SourceEditor` bound to `text = $state(demo)`, and a "Reset" `button` restoring `demo`; "Rendered · @barmark/render" with `ChartRender {text}`), footer. Page content in `home-page-x-padding`.
- [ ] **Step 4: Run** the test and `bun run check`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(site): home page with the live editor`.

### Task 5: Guide data and its logic

**Files:**
- Create: `site/src/lib/guide/rows.ts`, `site/src/lib/guide/query.ts`
- Test: `site/tests/guide.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const CATEGORIES = ["bars", "chords", "notes", "repeats", "sections", "directives", "text"] as const;
  export type Category = (typeof CATEGORIES)[number];
  export type GuideRow = {
  	id: string;            // kebab-case, unique
  	syntax: string;        // what you type, shown in mono: "%", "x2", "[2/4]"
  	category: Category;
  	meaning: string;       // one plain sentence
  	example: string;       // a small chart
  	ref: string;           // grammar section, e.g. "§5"
  	expect?: { errors?: string[]; bars?: number; chord?: { symbol: string; canonical: string; harte: string } };
  };
  export const ROWS: GuideRow[];
  // query.ts
  export type GuideQuery = { q: string; cat: Category | null; sort: "name" | "category" };
  export function readQuery(params: URLSearchParams): GuideQuery;      // unknown cat → null; unknown sort → "category"
  export function writeQuery(query: GuideQuery): string;                // "" for the default query; omits defaults
  export function matches(row: GuideRow, query: GuideQuery): boolean;  // q matched case-insensitively against syntax, meaning and category; cat exact
  export function sorted(rows: GuideRow[], sort: GuideQuery["sort"]): GuideRow[]; // "category": CATEGORIES order then ROWS order; "name": syntax, locale compare
  ```
- Rows cover every construct in grammar §1–§7, written from the grammar: at least one row for each of `§1, §2, §2.1, §2.2, §2.3, §2.4, §3, §4, §4.1, §5, §6, §7, §7.1`, each slot symbol of §2.3, each repeat form of §5 (`x2`, `|: :|`, `x ...`), `->` elision, each directive (`key`, `time`, `tempo`, `feel`), `%`, lyrics lines and `###` notes, and two rows that show an error (e.g. `C2` rejected with its suggestion; an empty section that matches nothing).

- [ ] **Step 1: Write the failing tests:** ids unique; every `ref` in the required list has a row; for every row, `parseChart(example)`'s error messages are exactly matched by `expect.errors` (each expected string is a substring of one error; no errors when `errors` is absent); `expect.bars` equals `parseChart(example).bars.length`; `expect.chord` agrees with `parseChord(symbol)` (`canonical`, `harte`); `readQuery(new URLSearchParams("q=repeat&cat=repeats"))` is `{q:"repeat", cat:"repeats", sort:"category"}`; `readQuery("cat=nope")` has `cat: null`; `writeQuery(readQuery(p))` round-trips for that string and is `""` for the default; `matches` finds `x2` for `q="REPEAT"`; `sorted(ROWS,"category")[0].category === "bars"`.
- [ ] **Step 2: Run** `bun test tests/guide.test.ts`. Expected: FAIL.
- [ ] **Step 3: Write `rows.ts`** from `docs/grammar-v0.1-draft.md` (one plain sentence per meaning; examples small: one to three lines) and implement `query.ts`.
- [ ] **Step 4: Run.** Expected: PASS. A row whose test fails means the row is wrong about barmark: fix the row, never the expectation to fit a wrong sentence.
- [ ] **Step 5: Commit** `feat(site): syntax guide rows, checked against the parser`.

### Task 6: The syntax guide page

**Files:**
- Create: `site/src/routes/syntax/+page.svelte`, `site/src/lib/components/GuideTable.svelte`, `GuideSearch.svelte`, `CategoryChips.svelte`
- Test: `site/tests/syntax.test.ts`

**Interfaces:**
- Consumes: Task 5's `ROWS`, `CATEGORIES`, `readQuery`, `writeQuery`, `matches`, `sorted`; Task 3's `ChartRender`.
- Produces: `/syntax`, prerendered with every row visible.

- [ ] **Step 1: Write the failing test** on the built `syntax/index.html` (linkedom): one row per `ROWS` entry, in `sorted(ROWS,"category")` order, each with its syntax, meaning, a `barmark-chart` with a declarative shadow root, and no row `hidden`; a search input with a `<label>`; one chip per category plus "All"; a link to `LINKS.grammar`; `<title>` `Syntax · barmark`.
- [ ] **Step 2: Run** `bun test tests/syntax.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** The prerender has no query (all rows). On the client, `query = $state(readQuery(page.url.searchParams))`; rows render once in a keyed `{#each sorted(ROWS, query.sort) as row (row.id)}` and are filtered by toggling `hidden={!matches(row, query)}` — rows are never removed, so their charts' shadow roots survive (Review Focus 3); changing the query calls `replaceState` with `writeQuery`. Above `sm` it is a table (syntax · meaning · example · rendered); below `sm` each row is a stacked card. A count line "Showing N of M" and an empty state "Nothing matches “q”." Intro paragraph above, grammar link below.
- [ ] **Step 4: Run** the test and `bun run check`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(site): searchable syntax guide`.

### Task 7: Browser tests

**Files:**
- Create: `site/browser/playwright.config.ts` (webServer `bun run build && bun run preview --port 5270`), `site/browser/site.pw.ts`

- [ ] **Step 1: Write the tests:** typing `| Em |` at the end of the source shows `Em` in the render's shadow root within 1 s; clearing the textarea leaves an empty chart and no console errors; pasting `"<script>alert(1)</script>\n| D |"` shows the text and runs no script; "Reset" restores the demo; with `javaScriptEnabled: false` the home chart's shadow root contains `Peaceful Dreams` and `/syntax?q=repeat&cat=repeats` shows every row; with JavaScript, that URL shows only rows matching, and clearing the search restores all rows each with a non-empty shadow root; sorting by name then by category keeps every example rendered; at 360×800, `scrollWidth <= clientWidth` on `/` and `/syntax`; an axe-free sanity check: every input has an accessible name and every link has text.
- [ ] **Step 2: Run** `cd site && bun run test:browser`. Expected: the tests that exercise finished behaviour PASS; fix any that fail in the owning component (test first).
- [ ] **Step 3: Commit** `test(site): browser suite for the editor, guide, no-JS and phone widths`.

### Task 8: CI, release step, docs

**Files:**
- Modify: `.github/workflows/ci.yml`, `RELEASING.md`, `.claude/skills/release/SKILL.md`, `README.md` (root), `CLAUDE.md`
- Create: `site/scripts/check-versions.ts`, `site/README.md`
- Test: `site/tests/versions.test.ts`

**Interfaces:**
- Produces: `latestTag(tags: string[], prefix: string): string | null` and `behind(pins: Record<string,string>, tags: string[]): string[]` in `check-versions.ts` (pure; the script feeds them `git tag --list`).

- [ ] **Step 1: Write the failing test:** `latestTag(["barmark-v0.1.0","v0.1.0","barmark-v0.2.0","barmark-v0.10.0"], "barmark-v")` is `"barmark-v0.10.0"` (semver order, not string order); `behind({barmark:"0.2.0","@barmark/render":"0.1.0"}, ["barmark-v0.3.0","render-v0.1.0"])` is `["barmark 0.2.0 < 0.3.0"]`; empty when current.
- [ ] **Step 2: Run** it. Expected: FAIL.
- [ ] **Step 3: Implement**, then CI: a `site` job (`working-directory: site`; `bun install --frozen-lockfile`, `bun run check`, `bun test`, `bunx playwright install --with-deps chromium`, `bun run test:browser`) and a `site-versions` job (`fetch-depth: 0`, runs `bun site/scripts/check-versions.ts`). `site` becomes a required check (Kevin updates the ruleset, as before); `site-versions` is **not** required: it goes red on `main` between a package release and the site's bump PR, as the reminder, without blocking unrelated PRs *(ruling: the spec's "a test fails" kept as a failing, non-blocking check)*. RELEASING.md and the `/release` skill: after `confirm` passes, open `chore(site): use <pkg> X.Y.Z` bumping `site/package.json` and `site/bun.lock`. Root README and CLAUDE.md: the site, its commands, and that it is not a workspace member and why. `site/README.md`: dev, build, test, deploy.
- [ ] **Step 4: Run** all gates: root `bun run check`, `bun test`, `bun run fallow`; `site` `check`, `test`, `test:browser`. Expected: green.
- [ ] **Step 5: Commit** `ci(site): build, test and version check for barmark.dev`.

### Task 9: Deploy (Kevin's go-ahead at each step)

Not code. Stop and ask before each: create the Vercel project under the Lightning Jar team with root directory `site/`, framework SvelteKit, install `bun install --frozen-lockfile`, deploying `main` with previews for pull requests; add `barmark.dev` and redirect `www.barmark.dev` to it; Kevin points the domain's DNS at Vercel. Verify: `https://barmark.dev/` serves the headline, `/syntax` the guide, and the response is the prerendered HTML (`curl` shows the `<template shadowrootmode` chart).
