# Score view Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `@barmark/score`: `<barmark-score>` shows a chart as barmark's bar grid or as a full score engraved by Verovio from `exportMusicXml`, with a Grid / Score switch, and `renderScoreHtml` draws it on the server.

**Architecture:** A new workspace package. A pure engraving core (`engrave.ts`: chart text → MusicXML → Verovio → one SVG) is shared by a Web Worker (browser) and the tests (Bun, real Verovio). The element wraps `@barmark/render`'s grid markup and adds the switch and a score pane; Verovio is reached only through a dynamic import of the engine client, on the first switch. The server function imports `@barmark/render` and never Verovio.

**Tech Stack:** Bun workspace, TypeScript strict, Biome, `bun test` + linkedom, Playwright (as `packages/render/browser/`), `verovio` (LGPL-3.0-only) as an npm dependency.

**Spec:** `docs/superpowers/specs/2026-11-08-score-view-design.md`

## Global Constraints

- Package `@barmark/score`, directory `packages/score`, tag prefix `score-v`, version `0.1.0`, licence MIT (its own `LICENSE`); it depends on `verovio` `^6.4.1` (checked: 6.4.1 runs under Bun; its SVG draws in `currentColor`), `barmark`, `@barmark/render`, `@barmark/musicxml` (`workspace:^`).
- Verovio's code is never copied or modified; README and package say it uses Verovio under LGPL-3.0 with a link.
- `@barmark/render` and `<barmark-chart>` do not change. No grammar or parser change.
- The score path adds no music: `parseChart` → `exportMusicXml(text)` (no `part` option: the full score) → Verovio. Never write out voicings or alter the exported XML's music.
- `renderScoreHtml` and the module it lives in import nothing from `verovio` (directly or transitively).
- Verovio loads only on the first switch to the score, in a Web Worker; one worker per page however many elements.
- The grid always stays when the score can't be drawn; never a blank element.
- Verovio layout as Stem Shovel's `engraveNotation.ts`: scale 40, `pageWidth = round(max(320, width) * 100 / scale)`, `pageHeight 60000`, `adjustPageHeight`, `breaks: "auto"`, `svgViewBox`, `footer: "none"`, `header: "auto"`, `justifyVertically: false`; all pages concatenated into one continuous column.
- Element attributes: everything `<barmark-chart>` observes (`src`, `theme`, `bar-numbers`, `rehearsal-letters`, `numerals`, `wrap`, `show-part`) plus `view` (`grid` default | `score`) and `verovio-url`. Event `viewchange` (`detail: { view }`). Properties `text` and `view`.
- Conventional commits, no AI trailer; CHANGELOG `[Unreleased]` per user-visible change; FINDINGS for surprises; `bun test`, `bun run check`, `bun run fallow` green at every commit.

## Review Focus

1. A chart that can't export (errors, no bars, an unknown `show-part` is irrelevant to the score): the grid shows, the switch shows the reason, no exception escapes. → Task 1 test `refuses a chart that does not export`, Task 5 test `score of a broken chart keeps the grid`.
2. Chart text holding markup: `</script>`, `<svg onload=…>`, `&` in titles, lyrics, words — nothing reaches the page as markup, server or client. → Task 2 test `markup in chart text never becomes markup`, Task 4 test `carries chart text holding </script> intact`.
3. Rapid changes: switching back and forth, `text` set while an engraving runs, resize storms: the newest request wins, no stale score is shown, the worker is not flooded. → Task 3 test `only the newest request resolves into view`, Task 5 test `text changed while engraving shows the new score`.
4. Several `<barmark-score>` on one page: one worker, each element gets its own result. → Task 3 test `one worker serves every element`, Task 6 Playwright `two scores, one engine request`.
5. Dark theme and `auto` following the system: the score's ink and paper follow the grid's palette. → Task 2 test `score takes the theme palette`, Task 6 Playwright `dark score is light on dark`.

---

### Task 1: The package and the engraving core

**Files:**
- Create: `packages/score/{package.json,tsconfig.build.json,LICENSE,README.md,CHANGELOG.md}`, `packages/score/src/engrave.ts`, `packages/score/src/index.ts`
- Test: `packages/score/tests/engrave.test.ts`

**Interfaces:**
- Produces: `type EngraveOptions = { width: number; scale?: number }`; `type Engraved = { ok: true; svg: string; pages: number; xml: string } | { ok: false; reason: string; diagnostics: ChartDiagnostic[] }`; `engraveChart(vrv: VerovioToolkit, text: string, options: EngraveOptions): Engraved`; `engraveXml(vrv, xml: string, options): { svg: string; pages: number }` (throws on unreadable XML); `LAYOUT` (the Verovio options above, minus `pageWidth`). `index.ts` re-exports these types and functions only (no element, no worker).

- [ ] **Step 1: Failing tests** (Bun, real Verovio: `import createVerovioModule from "verovio/wasm"; new VerovioToolkit(await createVerovioModule())`, one toolkit for the file):
  - `engraves every example chart`: for each `examples/*.chart.md`, `ok` is true, `svg` starts with `<svg`, `pages >= 1`.
  - `one staff group per exported staff`: Morning Song's first system has as many `class="staff"` groups as the export's first `<measure>` has staves across parts (count `<part ` and each part's `<staves>`, default 1).
  - `as many measures as the export`: `class="measure"` count over all pages equals the export's `<measure ` count in its first part.
  - `refuses a chart that does not export`: `"| C |\n| Xq9 |"`-style chart with an error → `ok:false`, `reason` names the first error's line, `diagnostics` non-empty; empty text → `ok:false`.
  - `narrow widths clamp to 320`: width 100 gives the same `pageWidth` as 320 (read back with `vrv.getOptions()`).
- [ ] **Step 2:** `bun test packages/score` → FAIL (module not found).
- [ ] **Step 3:** Write the package: `package.json` like `@barmark/render`'s (exports `.` and `./element` and `./server` — the latter two filled by Tasks 4–5; `files: ["dist","CHANGELOG.md"]`, `build`, `prepack`), `engrave.ts` as the interfaces say; pages joined into one SVG column (wrap each page's `<svg>` in a `<div class="bm-score-page">`; `svg` is the joined HTML string).
- [ ] **Step 4:** `bun test packages/score` → PASS; `bun run check`; `bun run fallow`.
- [ ] **Step 5:** Commit `feat(score): the package and its engraving core`.

### Task 2: Safe, themed score markup

**Files:**
- Create: `packages/score/src/markup.ts`
- Test: `packages/score/tests/markup.test.ts`

**Interfaces:**
- Consumes: `Engraved` (Task 1); `PALETTES` / `stylesheet` from `@barmark/render` (import what is exported; if `PALETTES` is not exported from the package root, use the grid's CSS custom properties instead and say so in the commit — do not change `@barmark/render`).
- Produces: `cleanSvg(svg: string): string` (drops `<script>`, `<foreignObject>`, every `on*` attribute, `href`/`xlink:href` not starting with `#`); `scoreStyles: string` (CSS for `.bm-score`: `color` and `background` from the theme as the grid's `data-theme` does, `auto` following `prefers-color-scheme`; pages full width, height auto); `scorePane(svg: string, theme: "auto" | "light" | "dark"): string`.

- [ ] **Step 1: Failing tests:**
  - `markup in chart text never becomes markup`: engrave a chart titled `<svg onload=alert(1)>` with a lyric `</text><script>x()</script>` and a words line `<a href="javascript:x">`; after `cleanSvg`, parsed with linkedom, the result has no `script`, `foreignObject`, no attribute starting `on`, no `href` that doesn't start with `#`, and the title text appears as text.
  - `score takes the theme palette`: `scorePane(svg, "dark")` sets `data-theme="dark"`; `scoreStyles` gives dark ink/paper equal to the grid's dark palette values and uses no fixed `#000`/`black` fill for notation (Verovio draws in `currentColor`).
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** run → PASS, check, fallow. **Step 5:** commit `feat(score): safe score markup that follows the theme`.

### Task 3: The worker and its client

**Files:**
- Create: `packages/score/src/worker.ts`, `packages/score/src/engine.ts`
- Test: `packages/score/tests/engine.test.ts`

**Interfaces:**
- Consumes: `engraveChart` (Task 1).
- Produces:
  - worker protocol: request `{ id: number; text: string; width: number; verovioUrl?: string }`, reply `{ id; ok: true; svg; pages } | { id; ok: false; reason }`; the worker loads Verovio once (from `verovioUrl` when given, else the package's own `verovio/wasm` resolved with `new URL(..., import.meta.url)`), reuses one toolkit, never throws.
  - `createEngine(makeWorker: () => WorkerLike): Engine` and `type Engine = { engrave(key: object, text: string, width: number, verovioUrl?: string): Promise<EngraveReply | null> }` — per `key` (the element), only the newest request resolves with a reply; an older one resolves `null`. A worker `error` rejects every pending request with "The score engine failed" and the next call starts a fresh worker.
  - `engine(): Engine` — the page's single shared engine (module-level, lazily created with the real `Worker`).

- [ ] **Step 1: Failing tests** (a fake `WorkerLike` that records posts and replies on demand):
  - `only the newest request resolves into view`: three `engrave(sameKey, …)` calls, replies arrive in order 1, 3, 2 → the first two promises resolve `null`, the third the reply.
  - `one worker serves every element`: two keys, one worker created; each gets its own reply.
  - `a crashed worker fails pending requests and restarts`: `error` event → pending reject with "The score engine failed"; the next call creates a second worker.
  - `the worker replies, never throws` (the worker's handler extracted as `handle(request, ready): Promise<Reply>` and tested with a real toolkit: a good chart → `ok:true`; a broken one → `ok:false` with the reason).
- [ ] **Step 2–5:** run → FAIL; implement; PASS + check + fallow; commit `feat(score): a shared Verovio worker where the newest request wins`.

### Task 4: Drawn on the server

**Files:**
- Create: `packages/score/src/server.ts`, `packages/score/src/switch.ts`
- Test: `packages/score/tests/server.test.ts`

**Interfaces:**
- Consumes: `@barmark/render`'s `renderChart`-style output pieces (`shadowContent` is not exported from the package root: build the grid with the exported `renderChartUnwrapped(text, options)` plus `stylesheet`, or with `renderChart` and lift its shadow content; pick one, without changing `@barmark/render`).
- Produces: `type ScoreOptions = RenderOptions & { view?: "grid" | "score" }`; `renderScoreHtml(text: string, options?: ScoreOptions): string` →
  `<barmark-score …attributes as renderChart's, plus view…><template shadowrootmode="open"><style>…grid + switch + score styles…</style>{switchHtml}<div class="bm-grid">{grid}</div><div class="bm-score" hidden></div></template><script type="text/barmark">{text, with every "</" written "<\/"}</script></barmark-score>`; `switchHtml(view): string` — a `role="radiogroup"` labelled "View" with two `role="radio"` buttons "Grid" and "Score", `aria-checked` on the current one. Exported from `./server` (and the root index).

- [ ] **Step 1: Failing tests:**
  - `draws the grid and the switch with no script needed`: linkedom parse; the template holds `.bm-grid` with the same chart markup `renderChartUnwrapped` gives, and the switch with Grid checked.
  - `carries chart text holding </script> intact`: text with `</script>` and `<!--` → the script element's text, with `<\/` turned back to `</`, equals the input.
  - `passes the grid options through as attributes`: `{theme:"dark", numerals:"roman", part:"Gtr", barNumbers:false, view:"score"}` → the same attributes `renderChart` writes, plus `view="score"`.
  - `never imports Verovio`: `Bun.build` of `src/server.ts` (target bun, external nothing from barmark workspace) produces output with no `verovio` string; or walk the import graph with `Bun.Transpiler.scanImports` recursively from `server.ts`.
- [ ] **Step 2–5:** FAIL; implement; PASS + check + fallow; commit `feat(score): renderScoreHtml draws the grid and the switch on the server`.

### Task 5: `<barmark-score>`

**Files:**
- Create: `packages/score/src/element.ts`
- Test: `packages/score/tests/element.test.ts` (linkedom with a fake engine injected through a module-level `setEngineForTests(engine)` or an `engineFactory` static — test-only seam kept out of the public types, as `@barmark/render`'s element tests do)

**Interfaces:**
- Consumes: `switchHtml`, grid building (Task 4), `scorePane`, `cleanSvg`, `scoreStyles` (Task 2), `engine()` (Task 3) through `await import("./engine.js")` on the first switch only.
- Produces: the custom element `barmark-score` (registered once on import, like `barmark-chart`): observed attributes as Global Constraints; `text`, `view` properties; `viewchange` event. Hydration: a server-drawn shadow root is reused (the grid is not redrawn on upgrade when its source is the script child and options are unchanged). Chart source rules as `<barmark-chart>` (`chartSource`, `inlineChartText` from `@barmark/render/element`).
- Behaviour: switching to score shows "Loading score…" in `.bm-score`, engraves at the element's content width, then shows `scorePane(cleanSvg(svg), theme)`; while the score shows, a new chart text or theme re-engraves (newest wins); a `ResizeObserver` re-engraves when the width changes by more than 8 px, debounced 150 ms; on failure the grid shows and the switch carries a note "The score couldn't be drawn" (the reason in `console.warn`), with the Score radio disabled until the chart changes.

- [ ] **Step 1: Failing tests:**
  - `opens on the grid and loads no engine`: the engine factory is never called until `view = "score"`.
  - `view attribute opens on the score and fires viewchange on a switch`.
  - `score of a broken chart keeps the grid`: engine replies `ok:false` → grid visible, note present, `view` back to `grid`.
  - `text changed while engraving shows the new score`: two replies out of order → the pane holds the newer SVG.
  - `upgrading server markup does not redraw the grid`: the `.bm-grid` node is the same object after upgrade.
  - `keyboard: arrow keys move between Grid and Score` (radio pattern; Space/Enter select).
- [ ] **Step 2–5:** FAIL; implement; PASS + check + fallow; commit `feat(score): the barmark-score element`.

### Task 6: In a real browser

**Files:**
- Create: `packages/score/browser/{playwright.config.ts,server.ts,score.pw.ts}`
- Modify: root `package.json` `test:browser` to run both suites (`playwright test -c packages/render/browser && playwright test -c packages/score/browser`), port 5261.

- [ ] **Step 1: Failing Playwright tests** (pages serve the built package through an import map, as render's server does, plus the `verovio` files):
  - `no engine request until the first switch` (no request URL containing `verovio` before clicking Score; one after).
  - `two scores, one engine request` (two elements, both switched; the wasm/module fetched once).
  - `a server-drawn grid shows with JavaScript disabled`.
  - `dark score is light on dark` (computed `color` of `.bm-score` equals the grid's dark ink).
  - `a bad verovio-url keeps the grid with a note`.
  - `resizing reflows the score` (narrower viewport → taller score SVG column).
- [ ] **Step 2–5:** FAIL; implement whatever the browser shows missing; `bun run test:browser` PASS; commit `test(score): the element in Chromium`.

### Task 7: Round trip from the MuseScore fixtures

**Files:**
- Create: `packages/score/tests/round-trip.test.ts`, `packages/score/src/compare.ts` (pure)
- Modify: `FINDINGS.md` (one entry listing what differs, each traced to import or export)

**Interfaces:**
- Produces: `musicOf(vrv, xml): { measures: number; staves: number; notes: number; rests: number; harms: number; verses: number }` read from Verovio's MEI (`vrv.getMEI()` after `loadData`): counts of `<measure`, distinct `staff n`, `<note`, `<rest`/`<mRest`, `<harm`, distinct `verse n`.

- [ ] **Step 1: Failing test** `each fixture re-draws with the same music`: for every `packages/musicxml/tests/fixtures/import/*.musicxml`, `musicOf(original)` vs `musicOf(exportMusicXml(importMusicXml(original).chart).xml)`. The test asserts measures and staves are equal for every fixture, and pins the other counts' differences in a `KNOWN` table (fixture → field → [original, redrawn]) so a change in either direction fails until the table and FINDINGS are updated.
- [ ] **Step 2–5:** FAIL; implement `musicOf` and fill `KNOWN` from the first run, writing each entry's cause into FINDINGS; PASS + check + fallow; commit `test(score): the import fixtures re-draw with the same music`.

### Task 8: Beside Dorico (VM only)

**Files:**
- Create: `scripts/score-dorico.ts`, `scripts/score-dorico-page.ts` (pure: `sideBySide(entries: { name: string; svg: string; pdf: string }[]): string`)
- Test: `packages/score/tests/score-dorico-page.test.ts`

- [ ] **Step 1: Failing test** `sideBySide`: one row per entry, names escaped, the SVG passed through `cleanSvg`, the PDF in an `<embed>`/`<iframe>` by relative path.
- [ ] **Step 2–5:** FAIL; implement; the script exports the three examples plus Amazing Grace's lead sheet, runs `~/projects/mac-bench/bin/mac-bench dorico <xml…> --out <dir>` (cwd `~/projects/mac-bench`, `env: macBenchEnv(process.env)` from `scripts/dorico-env.ts`), engraves with Verovio and writes `<dir>/index.html`; VM only, never in CI; run it once and note what differs in the music (not house style) in FINDINGS; commit `feat(scripts): score-dorico, Verovio's score beside Dorico's`.

### Task 9: Release plumbing and docs

**Files:**
- Modify: `scripts/lib.ts` (`PACKAGES.score`: dir, `@barmark/score`, `score-v`, `scripts/smoke-score.mjs`), `scripts/verify-package.ts` (`CONTENTS.score`: `dist/index.js`, `dist/index.d.ts`, `dist/element.js`, `dist/server.js`, `dist/worker.js`; allowed `^dist\/.+\.(js|d\.ts)$`), build order (score after render and musicxml)
- Create: `scripts/smoke-score.mjs` (Node: import `@barmark/score/server`, `renderScoreHtml` of a two-bar chart contains `<barmark-score`; import the root and engrave with Verovio under Node)
- Modify: `CLAUDE.md` (layout entry for `packages/score/`, the release-tag list), `RELEASING.md` (score in the package list; it follows render and musicxml releases like the CLI does not — score is not bundled by the CLI), root `README.md` package list, `packages/score/README.md` (use, the two components, `verovio-url`, Verovio LGPL note with link, server use)
- Test: existing `release-ranges`/verify tests updated for the new package.

- [ ] **Step 1:** failing: `bun run verify:package score` (unknown package). **Step 2:** add; `bun run verify:package score` → PASS (Node import works). **Step 3:** docs. **Step 4:** `bun test`, `bun run check`, `bun run fallow`, `bun run test:browser` all green. **Step 5:** commit `build(score): release plumbing, smoke test and docs`.

Releasing 0.1.0 needs Kevin's npm placeholder and trusted publisher for `@barmark/score` first (memory: npm-and-github-ownership); the plan ends at a merged PR. Stem Shovel's switch to `<barmark-score>` is its own work in its repo.
