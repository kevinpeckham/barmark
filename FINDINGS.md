# Findings

Gotchas and insights from building barmark: what a tool, a pattern or our
own process did that was not obvious, and what to do about it. Add an
entry whenever one surfaces (CLAUDE.md, "Working agreement"). Newest at
the top of each section; say where the lesson came from so the code can
be found. Conventions belong in CLAUDE.md, RELEASING.md or the grammar,
not here.

## Testing

### A round-trip yardstick must not use the function it is checking (2026-10-31, printer)

The printer's round-trip test compared bars before and after printing as
`reduceSlots(slots)` on both sides, so when `reduceSlots` itself was wrong
(`| D_E_F / |` printed as `| D_E_F |`, turning quarter-note triplets on
beats 1–2 into half-note triplets) the test called the two charts equal.
The final review caught it. The fix was an independent oracle: a timeline
of when each attack lands, as exact fractions of the bar
(`tests/chart/fixtures.ts`, `timeline`). When a test asserts "same
meaning", compute the meaning without the code under test.

### Character fuzz rarely builds the inputs that matter; add grammar-driven fuzz (2026-10-31, printer)

2,000 random strings from the grammar's alphabet never assembled a valid
cell with a hold after a group, so the bug above survived them. 2,000
random charts built from grammar pieces (slots, groups, `%`, `[3/4]`,
`time:` lines, headings, repeats) found it in 45 ms
(`tests/chart/printChart.test.ts`, "grammar-driven fuzz"). Keep both: the
character fuzz proves the parser never throws, and the grammar fuzz
exercises meaning.

### Read the spec's examples into the tests (2026-10-31, chart parser and printer)

`tests/chart/fixtures.ts` reads the "At a glance" chart out of
`docs/grammar-v0.1-draft.md` instead of copying it, so the tests track
the spec. It paid off twice. A plan arithmetic slip (the verse is 12 bars,
not 8) showed up at once. And the printer's literal "one blank line
before each `##`" made neither the spec's example nor Peaceful Dreams
canonical, because both write a run of replay headings together, which
showed the rule needed refining.

## Performance and robustness

### An unanchored `\s*x\s*…$` regex is quadratic on long whitespace (2026-10-31, chart parser)

`/\s*x\s*(\d+|\.\.\.|…)\s*$/` found repeat tails, and on a line of 100 KB
of spaces with no `x` it took 9 s (200 KB, 34 s): the engine retries
every start position and backtracks across the whole run each time. The
fix scans from the right with `lastIndexOf` and tests only the remainder
with an anchored pattern (`repeatTail` in `src/chart/barLine.ts`). Watch
for `\s*` or `.*` at the start of an unanchored pattern that ends in `$`.

### Cap the work, not just the output (2026-10-31, chart parser)

Expansion stopped at 10,000 bars, but a repeat whose body emits no bars
(a fermata-only bar, a bar line with no cells) never reached the cap:
`## A x 99999` holding `| ... | x 99999` looped about 10^10 times. The
automated security review found it. `expand` now counts every pass and
every cell against `MAX_WORK` as well as bars against `MAX_EXPANDED_BARS`.
Any loop driven by user-supplied counts needs a budget on iterations.

### A plain object used as a lookup table answers for `constructor` (2026-10-31, chord module)

`INTENDED[shorthand]` read a Harte shorthand from user input, so
`C:constructor`, `C:toString` and `C:__proto__` found
`Object.prototype` members and then threw instead of returning null.
`Object.hasOwn` guards it (`intendedShape` in `src/chords/harte.ts`).
Random fuzzing never produces those words, so test them by name.

## Design

### Dropping a broken line can change what its neighbours mean (2026-10-31, chart parser)

A bar line with an error was simply left out of the document, so a
section whose only bar line failed had no bars and became a *replay* of
an earlier section with the same name, playing those bars with no
warning. Broken lines now stay in the document as `{ kind: "invalid" }`
lines (`src/chart/types.ts`), which count as written content and are
printed back as written. When error recovery removes something, check
whether its absence is itself meaningful.

### An `index.ts` that re-exports can hide an import cycle (2026-10-31, printer)

`print.ts` imported `parseChart` from `./index.js`, which re-exports
`print.ts`, so the two modules imported each other. It worked only
because no top-level code ran first. `parseChart` moved to its own module
(`src/chart/parse.ts`). Import from the defining module, never from the
package index, inside the package.

## Tooling

### A stacked PR merged after its base lands on the base branch, not main (2026-11-01, #33/#34)

- **The symptom.** #34 (numerals) was opened against #33's branch
  `feat/transpose`. Both showed "merged", but `main` had only #33.
- **The cause.** GitHub retargets a stacked PR to `main` only when its
  base branch is deleted. #33 merged without deleting `feat/transpose`,
  so #34 stayed based on it and merged into that branch.
- **The fix.** The release PR (#35) carried #34's commit to `main`. When
  stacking, either delete the base branch when merging the first PR, or
  check that the second PR shows `main` as its base before merging it.

### `bun test` can't resolve the site's `#lib/…` imports at runtime (2026-11-02, /try)

- **The symptom.** `site/src/lib/try/read.ts` imported `matches` from
  `#lib/guide/query.js`, and `bun test` failed with "Cannot find module
  '#lib/guide/query.js'". Its earlier `import type` from the same path
  had worked.
- **The cause.** `package.json` maps `#lib/*` to `./src/lib/*`, so the
  `.js` specifier names a file that doesn't exist. Vite and svelte-check
  map `.js` to `.ts`; Bun's runtime doesn't. A type-only import is erased
  before it runs, which hid the problem.
- **The fix.** Modules under `src/lib/` that tests run import each other
  relatively, with `.ts` (as `guide/query.ts` does). `#lib/…` stays for
  `.svelte` files and routes.

### Playwright's `fill()` is itself slow on tens of thousands of characters (2026-11-02, /try)

- **The symptom.** A test pasting 60,000 characters into `/try` timed
  out inside `locator.fill`. That looked like a frozen page, but the
  page wasn't the slow part.
- **The fix.** Set the value in the page and send an `input` event
  (`locator.evaluate`), as the home page's long-text test already did.
  Before trusting a slow-input test, check that it fails against the
  code without the fix (here: with the length limit disabled).

### svelte-check cannot run on TypeScript 7 (2026-10-31, site scaffold)

With `typescript` 7.0.2 (the native compiler the root uses), `svelte-kit
sync` fails with "Cannot read properties of undefined (reading
'readFile')": TypeScript 7's JavaScript API has no `ts.sys`, which Kit's
tsconfig handling reads. `site/` pins `typescript` 6.0.3 for
`svelte-check` alone; the root stays on 7. Retry 7 when Kit or
svelte-check announce support.

### Biome reads only the script of a `.svelte` file (2026-10-31, site scaffold)

Biome 2.6 formats and lints the `<script>` block of a Svelte component but
not its markup, so a prop used only in the template (`children` in
`+layout.svelte`) is "unused". `biome.json` has Biome's documented Svelte
override (unused variables and imports, `useConst`, `useImportType` off for
`**/*.svelte`); `svelte-check` covers the markup.

### npm can take minutes to serve a version it has accepted (2026-10-31, 0.1.0 release)

The release workflow logged `+ barmark@0.1.0` and its provenance, yet
`npm view barmark version` said 0.0.3 for about three minutes, and the
`latest` tag lagged the version itself. Anything that checks a publish
must wait and retry: the release workflow's `confirm` job polls `npm view
barmark@<version> --prefer-online` for up to ten minutes before
installing.

### Fallow's first run: three exports nobody imported, and a baseline for the parser's complexity (2026-10-31, Fallow)

`normalizeSymbol`, `QUALITIES` and the test fixture `timeline` were
exported but used only inside their own modules; they lost `export`. The
two verify scripts had grown the same six-line header, now
`scripts/lib.ts`. Seventeen functions sit above Fallow's complexity
thresholds, mostly the parser's line readers and `enumerateSuffixes`
(cognitive 38); rather than refactor working, well-tested code to land
the gate, `.fallow-health-baseline.json` accepts them as they stand and
fails on anything new or worse (checked by adding a cognitive-35
function: exit 1). Fallow's config is JSONC, so Biome needs
`json.parser.allowComments` for `.fallowrc.json`.

### Biome formats files that belong to other tools (2026-10-31, release process)

The first Swamp `release-check` run failed its own lint gate: Biome
reformatted Swamp's generated YAML, its Deno extension and the gitignored
`.claude/settings.local.json`. `biome.json` now reads `.gitignore`
(`vcs.useIgnoreFile`) and excludes `extensions/`, `models/`,
`workflows/` and `.swamp.yaml`, which Swamp owns. When a tool generates
files into the repo, exclude them from the formatter in the same commit.

### Swamp needs a signed-in account before `swamp repo init` (2026-10-31, release process)

`swamp repo init` stopped with "Run `swamp auth login`" because the VM's
Swamp session had expired. Sign-in is interactive, and `! swamp auth
login` in Claude Code fails ("Username and password are required")
because `!` gives the command no terminal to prompt on. The fix is an API
token: `SWAMP_API_KEY` (and `SWAMP_SIGNIN_TOKEN`) in barmark's 1Password
environment, loaded by varlock (`.env.schema`), with Swamp run as
`bunx varlock run -- swamp …`, as replicator does. Running Swamp in
GitHub Actions would need
`SWAMP_API_KEY` and `SWAMP_SIGNIN_TOKEN` as repository secrets, which is
why CI runs the same checks as plain `bun run` scripts, and Swamp wraps
those scripts locally as the release check.

### npm trusted publishing needs npm 11.5 or later (2026-10-31, release workflow)

Node 22 ships npm 10.9, which signs provenance but then publishes
unauthenticated: the first release run failed with a 404. The workflow
installs an exactly pinned npm (`npm install -g npm@12.2.1`) before
publishing. Pin anything installed in a job that holds the OIDC identity,
exactly as the actions are pinned to SHAs.

### Identical charts screenshot differently on two pages (2026-10-31, renderer browser suite)

The hostile-CSS test compares the chart's screenshot on a plain page and
on a page with hostile CSS. The charts were identical, yet 864 pixels
differed. Two causes, neither in the chart. Text anti-aliasing varies with
where an element sits on the page, and the hostile page's margins put the
chart 64 pixels further along. And the chart was 1007.3 pixels tall, so
its last pixel row was mostly page background, black on one page and
white on the other. The plain page now places the chart at the hostile
page's exact position, and both screenshots are clipped to whole pixels
(`packages/render/browser/`). To check that the test still catches leaks,
removing `:host{all:initial}` made it fail, after the hostile page gained
inherited properties the chart doesn't set itself (letter-spacing,
text-transform, font-style).

### A specificity race between bar lines (2026-10-31, renderer styles)

The repeat bar line (`.bm-bar[data-repeat-start]`, a double border) lost
to the rule that gives a row's first bar its left border
(`.bm-row>div.bm-bar:first-of-type`), so `‖:` never showed. Unit tests
saw the attribute in the markup; only a screenshot showed the line
missing. Both rules now share the same selector shape, and the repeat
rule comes later.

### npm pack would publish `workspace:*` as written (2026-10-31, workspace releases)

`@barmark/render` depends on `barmark` through the workspace
(`"barmark": "workspace:^"`). `npm pack` copies that range into the
tarball unchanged, and npm cannot install it. `bun pm pack` rewrites it to
`^` the local version, so the release workflow and `verify:package` pack
with Bun, and `verify:package` fails if any `workspace:` range survives.
The rewrite uses the version in the checkout, so `verify:release render`
also checks that version of `barmark` is already on npm: release `barmark`
first when the renderer needs something new in it.

### A package that builds only because the other one already had (2026-10-31, workspace CI)

`verify:package render` passed on the dev VM and failed on a clean
checkout: render's build resolves `barmark` through `node_modules` to
`packages/barmark/dist`, which only existed because something had built it
earlier. CI's package job would have been red for render on the first PR.
The final review caught it by running the checks in a fresh worktree.
`verify-package` now builds the whole workspace (in dependency order)
first, and the release workflow builds before packing. Before calling a
CI change done, run its steps in a fresh `git worktree` after `bun
install --frozen-lockfile`.

### `bun pm pack` takes a workspace dependency's version from bun.lock (2026-10-31, render 0.1.0 release)

Preparing `@barmark/render` 0.1.0, its packed `package.json` depended on
`barmark@^0.1.0`, although `barmark` was already 0.2.0 and the renderer
needs 0.2.0's `form` and `parts`. `bun pm pack` turns `workspace:^` into
a range using the version recorded in `bun.lock`, and neither `bun install`
nor `bun install --lockfile-only` updates a workspace package's version
there; `--frozen-lockfile` doesn't notice either. The `barmark` 0.2.0
release had left it at 0.1.0. RELEASING.md now bumps the version in
`bun.lock` too, and `verify:package` fails when a packed workspace range
is not `^` the package's own version.

### Even flex slots wrap a triplet that had room (2026-11-01, render layout)

Left-aligning chords in even shares of a bar (`flex:1 1 0` on each slot)
broke a triplet group onto two lines below about 670px, with plenty of
room left. A zero flex basis lets a slot shrink to its minimum content
width, and once the chart switches to its wrapping layout a group's
minimum is a single chord. `min-width:max-content` keeps slots whole on
a wide screen, but it also stopped a busy bar wrapping on a phone at
large text. The wide layout now keeps slots whole and the wrapping
layout gives them `flex:1 1 auto`, so they shrink only when they do not
fit. Browser tests cover both widths and the phone (`packages/render/browser/render.pw.ts`).

### A grid's auto column grows for items that span it (2026-11-01, render layout)

Indenting lyrics to the first bar line with a margin left the bar-number
column 4px wider in one section than the rest: items spanning every
column (lyrics, notes, mid-chart changes) with a margin feed their size
into the `auto` tracks they span. The bar-number column is now a fixed
width (`GUTTER` in `packages/render/src/styles.ts`), so every section's
first bar line lines up.

### `italic: true` in UnoCSS web fonts loads only the italic (2026-11-01, site chart look)

Adding Noto Serif's italic to barmark.dev with `{ name: "Noto Serif",
weights: ["400"], italic: true }` made every lyric italic too: the preset
then requests only the italic faces, and a browser with no upright face
draws upright text in the italic. Two entries, one upright and one
italic, give both faces (`site/uno.config.ts`). The site's browser suite
now checks an upright Noto Serif exists as well as the italic.

### UnoCSS gives up on web fonts after 2 seconds (2026-11-01, CI site job)

`main`'s CI went red on the merge of the barmark 0.4.0 release PR, in
the `site` job: the build stopped with "[unocss] Fetch web fonts
timeout" while fetching Noto from fonts.bunny.net. A rerun passed.
`presetWebFonts` fails the build when the font CSS takes longer than
2 s (`timeouts.failure`, default 2000), and a CI runner sometimes
takes longer. `site/uno.config.ts` now allows 30 s and warns at 5 s.
Stem Shovel sidesteps the same problem with the `"none"` provider
under tests.
### A misspelt custom property removes the whole border (2026-11-01, renderer)

The dashed line over bars inside a rit. didn't appear, and no test
failed. The rule used `var(--bm-directive)`, which doesn't exist; the
directive colour is `var(--barmark-directive,var(--bm-muted))`. A
`var()` with no value and no fallback makes the whole declaration
invalid at computed-value time, so `border-top` became `none` rather
than falling back to a default colour. The linkedom tests check
markup, not computed style, so only a browser can catch it: the
Playwright test "bars inside a rit. carry a dashed line in the
directive colour" now does.

### A prerendered control used before the page's script runs is lost (2026-11-01, site CI)

PR #32's `site` job failed in "sorting moves rows and keeps every
example rendered": the test chose a sort and the URL never gained
`sort=name`. It passed locally. The guide is prerendered, so its search
box and sort select exist and accept input before SvelteKit hydrates;
a change made in that window never reaches the page's state, and
hydration doesn't replay it. More guide rows made hydration slower on
the CI runner, which opened the window. Delaying the site's scripts by
3 s reproduces it. The guide's interaction tests now repeat the action
until the URL follows (`untilUrl` in `site/browser/site.pw.ts`).
