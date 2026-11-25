# Engraver Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `@barmark/score` loads `@barmark/engraver`, the lighter Verovio, as its own copy, and falls back to stock Verovio when that fails.

**Architecture:** The worker's loader (`verovioLoader` in `packages/score/src/worker.ts`) already has one fallback, from a `verovio-url` to the package's own copy. The package's own copy becomes a chain of two: the lighter build, then stock, with a deadline on the first. Everything else (the engine, the element, the `verovio-url` path) is unchanged.

**Tech Stack:** Bun workspace, TypeScript 7, `bun test`, Playwright (Chromium, and Firefox and WebKit for the loading tests), Verovio 6.4.1, `@barmark/engraver` 0.1.x.

**Spec:** `docs/superpowers/specs/2026-11-10-engraver-package-design.md`, "Phase 2" and "Phase 2, amended 2026-11-25". Executors read both sections and "Loading".

## Global Constraints

- The warning's text, exactly: `<barmark-score>: the lighter Verovio was not used (<reason>); loading stock Verovio instead`. One warning per fallback.
- `LITE_DEADLINE_MS = 20_000`, exported from `packages/score/src/engine.ts` beside `LOAD_DEADLINE_MS`.
- A failure of the lighter build is: its import rejects; its `.wasm` cannot be fetched or compiled; its Verovio is not the toolkit's (`sameVerovio`); or it has not instantiated within `LITE_DEADLINE_MS`. A wrong MIME type for the `.wasm` is not a failure (the glue falls back to an ArrayBuffer and warns).
- After stock, a failure is the failure. There is no third copy.
- `Loaded.from` stays `{}` for the package's own copy, lighter or stock.
- The CLI keeps stock Verovio (`packages/cli` is not touched except its pins at release).
- `@barmark/engraver` becomes an exact dependency of score (`workspace:*`, published as the exact version). `verovio` stays a dependency.
- Phase 2 never ships while the lighter build lags stock (`info.ts`, question 9 of the spec).
- Never commit `packages/engraver/dist/`.
- Test first; `bun run check` and `bun run fallow` clean; a `CHANGELOG.md` entry under `[Unreleased]` in each changed package; conventional commits with no AI trailer.
- Firefox and WebKit run in CI. On the VM they may not launch (no `sudo` for their system libraries): the suite must pass with Chromium alone when `SCORE_BROWSERS` is unset.

## Review Focus

1. **The lighter build succeeds after its deadline has fired.** Stock is already loading. Expected: the late toolkit is dropped, one toolkit is returned, and the timer and the late promise leak nothing (Task 1, "a lighter build that arrives late is ignored").
2. **A `verovio-url` fails, then the lighter build fails.** Expected: stock loads, and two warnings in order, the URL's then the lighter build's (Task 1).
3. **Both of the package's copies fail.** Expected: the rejection is stock's error, and its message also carries the lighter build's reason, so a reader sees both (Task 1).
4. **The `.wasm` arrives with `text/plain`.** Expected: the lighter build is used, with the glue's own console warning and none of ours (Task 3, "a .wasm served as text/plain still loads the lighter build").
5. **A replacement worker after an engraving deadline.** Expected: it runs the chain again from the lighter build, since `from` is `{}`; the page sees one score and no error (Task 3, "a replacement worker loads the lighter build again").

---

### Task 1: The package's own copy is the lighter build, then stock

**Files:**
- Modify: `packages/score/src/worker.ts` (`LoaderDeps`, `verovioLoader`)
- Modify: `packages/score/src/engine.ts` (export `LITE_DEADLINE_MS`)
- Test: `packages/score/tests/worker.test.ts`

**Interfaces:**
- Consumes: `sameVerovio` (`wasm.ts`), `Report`, `Loaded<T>`, `VerovioSource` as they are.
- Produces, in `LoaderDeps<M, T>`:
  - `own(): Promise<M>`: now documented as the lighter build, `@barmark/engraver`
  - `stock(): Promise<M>`: stock Verovio, `verovio/wasm`
  - `after(ms: number): Promise<void>`: resolves after `ms`; a test passes a fake clock
  - `liteDeadlineMs: number`
- `verovioLoader`'s returned function keeps its signature.

- [ ] **Step 1: Write the failing tests** in `worker.test.ts`. Extend `fakes` to `fakes(bodies, own, version, { ownVersion?: string; ownHangs?: boolean; stockFails?: Error })`:
  - `stock` logs `import stock` and returns `{ from: "stock" }`, or throws `stockFails`;
  - with `ownHangs`, `own`'s `instantiate` waits on a promise that `releaseOwn()` resolves;
  - `after(ms)` returns a promise that `clock.pass(ms)` resolves once that many milliseconds have been passed; `liteDeadlineMs` is `20_000`;
  - `versionOf` answers `ownVersion ?? "6.4.1"` for `"toolkit own"` and `"6.4.1"` for `"toolkit stock"`;
  - it returns `clock` and `releaseOwn` beside `load`, `log`, `warnings` and `wasms`.

```ts
test("the package's own is the lighter build: stock is never imported", async () => {
	const { load, log } = fakes({});
	expect(await load({}, () => {})).toEqual({ toolkit: "toolkit own", from: {} });
	expect(log).toEqual(["import own", "instantiate"]);
});

test("a lighter build that fails to import falls back to stock, with one warning", async () => {
	const { load, log, warnings } = fakes({}, new Error("404 verovio-module.wasm"));
	expect(await load({}, () => {})).toEqual({ toolkit: "toolkit stock", from: {} });
	expect(log).toEqual(["import own", "import stock", "instantiate"]);
	expect(warnings).toEqual([
		"<barmark-score>: the lighter Verovio was not used (Error: 404 verovio-module.wasm); loading stock Verovio instead",
	]);
});

test("a lighter build whose Verovio is not the toolkit's falls back to stock", async () => {
	// `versionOf` answers 6.3.0 for "toolkit own" in this fake.
	const { load, warnings } = fakes({}, null, "6.4.1", { ownVersion: "6.3.0" });
	expect((await load({}, () => {})).toolkit).toBe("toolkit stock");
	expect(warnings[0]).toContain("6.3.0");
});

test("a lighter build that has not instantiated by its deadline falls back to stock", async () => {
	const { load, log, clock } = fakes({}, null, "6.4.1", { ownHangs: true });
	const loading = load({}, () => {});
	clock.pass(20_000);
	expect((await loading).toolkit).toBe("toolkit stock");
	expect(log).toContain("import stock");
});

test("a lighter build that arrives late is ignored: one toolkit, stock's", async () => {
	const { load, clock, releaseOwn } = fakes({}, null, "6.4.1", { ownHangs: true });
	const loading = load({}, () => {});
	clock.pass(20_000);
	const loaded = await loading;
	releaseOwn();
	await Promise.resolve();
	expect(loaded.toolkit).toBe("toolkit stock");
});

test("both of the package's copies failing is stock's failure, naming the lighter build's reason too", async () => {
	const { load } = fakes({}, new Error("no wasm"), "6.4.1", { stockFails: new Error("stock is gone") });
	await expect(load({}, () => {})).rejects.toThrow(/stock is gone.*no wasm|no wasm.*stock is gone/s);
});

test("a url that fails, then a lighter build that fails: stock, and two warnings in order", async () => {
	const { load, warnings } = fakes({}, new Error("no wasm"));
	const r = await load({ verovioUrl: "https://cdn.test/v.mjs", verovioIntegrity: "ok-x" }, () => {});
	expect(r).toEqual({ toolkit: "toolkit stock", from: {} });
	expect(warnings.map((w) => w.includes("https://cdn.test/v.mjs"))).toEqual([true, false]);
	expect(warnings[1]).toContain("the lighter Verovio was not used");
});
```

Update the three existing tests whose meaning changes: "a digest mismatch falls back to the package's own" (log gains nothing: own is still the first import), "a fallback that fails too is the failure" (it now expects `import stock` in the log and stock's error), and "the package's own copy gets no wasm source".

- [ ] **Step 2: Run them to see them fail**

Run: `bun test packages/score/tests/worker.test.ts`
Expected: FAIL, the new tests on `stock` missing from `LoaderDeps` or on `toolkit own` where `toolkit stock` is expected.

- [ ] **Step 3: Implement.** In `verovioLoader`, `own(report)` becomes: report `UNMEASURED`; race `checked(await deps.instantiate(await deps.own(), undefined, report))` against `deps.after(deps.liteDeadlineMs)`; on the lighter build winning, return it; otherwise `deps.warn(...)` with the reason (the caught error, or `no answer in 20 s`) and return `deps.instantiate(await deps.stock(), undefined, report)`. A stock failure after a lighter failure rethrows with both reasons in its message. The losing promise gets a no-op `catch` so a late rejection is not unhandled. Add `export const LITE_DEADLINE_MS = 20_000` to `engine.ts` with a comment giving the arithmetic (20 s, leaving stock 40 of the 60).

- [ ] **Step 4: Run to see them pass**

Run: `bun test packages/score/tests/worker.test.ts`
Expected: PASS, every test in the file.

- [ ] **Step 5: Commit**

```bash
git add packages/score/src/worker.ts packages/score/src/engine.ts packages/score/tests/worker.test.ts
git commit -m "feat(score): the package's own Verovio is the lighter build, with stock behind it"
```

### Task 2: Wire the real modules, and say so in the package

**Files:**
- Modify: `packages/score/src/worker.ts` (the `toolkit` constant's deps)
- Modify: `packages/score/package.json` (`dependencies`, `description`), `bun.lock`
- Modify: `packages/score/README.md`, `packages/score/CHANGELOG.md`
- Modify: `packages/score/tests/engraver.test.ts`, `packages/score/tests/out-dir.test.ts` if they pin the dependency list
- Modify: `scripts/verify-package.ts` only if its score expectations name the dependencies

**Interfaces:**
- Consumes: Task 1's `LoaderDeps` (`own`, `stock`, `after`, `liteDeadlineMs`).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Write the failing test** in `packages/score/tests/engraver.test.ts`:

```ts
test("score depends on the lighter build exactly, and still on stock Verovio", async () => {
	const pkg = await Bun.file(new URL("../package.json", import.meta.url)).json();
	expect(pkg.dependencies["@barmark/engraver"]).toBe("workspace:*");
	expect(pkg.dependencies.verovio).toMatch(/^\d+\.\d+\.\d+$/);
	expect(pkg.devDependencies?.["@barmark/engraver"]).toBeUndefined();
	expect(pkg.description).toContain("@barmark/engraver");
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `bun test packages/score/tests/engraver.test.ts`
Expected: FAIL, `@barmark/engraver` is under `devDependencies`.

- [ ] **Step 3: Implement.**
  - `worker.ts`: `own: () => import("@barmark/engraver")`, `stock: () => import("verovio/wasm")`, `after: (ms) => new Promise((r) => setTimeout(r, ms))`, `liteDeadlineMs: LITE_DEADLINE_MS`.
  - `package.json`: move `@barmark/engraver` to `dependencies` as `workspace:*`; description: `Show a barmark chord chart as a full engraved score: MusicXML from @barmark/musicxml, engraved by Verovio (LGPL-3.0): @barmark/engraver, a modified smaller build, with stock Verovio behind it.` Then `bun install`.
  - `README.md`: rewrite "The lighter build" to say it is the default; add a "Bundlers" section (Vite, Rollup, webpack 5 emit the `.wasm`; esbuild without `--splitting` inlines both and runs stock after one 404, with the copy step for the lighter build: copy `node_modules/@barmark/engraver/dist/verovio-module.wasm` beside the worker bundle); keep the `verovio-url` documentation; update the licence paragraph near line 353 (a modified Verovio is now loaded by default: name `@barmark/engraver`'s `NOTICE.md` and Corresponding Source).
  - `CHANGELOG.md`, `[Unreleased]`: Changed (the default engraver; the fallback and its warning; the dependency), with the bundler note.

- [ ] **Step 4: Run to see it pass, and the gates**

Run: `bun test packages/score && bun run check && bun run fallow && bun run verify:package score`
Expected: PASS; `verify:package` imports score under Node without loading either Verovio.

- [ ] **Step 5: Commit**

```bash
git add packages/score bun.lock scripts
git commit -m "feat(score): depend on @barmark/engraver; the README's bundler notes"
```

### Task 3: The loading cases in a real browser

**Files:**
- Modify: `packages/score/browser/server.ts`
- Modify: `packages/score/browser/score.pw.ts`

**Interfaces:**
- Consumes: the built `dist/worker.js`, which now imports `@barmark/engraver`.
- Produces, for Task 4: every loading test's title starts with `@loading `, so a project can select them with `grep`.
- The server gains scenario prefixes. A page at `/<scenario>/score` loads `/<scenario>/score/element.js`, so its worker is `/<scenario>/score/worker.js` and the lighter build asks for `/<scenario>/score/verovio-module.wasm`. Scenarios, a closed list: `ok` (the `.wasm` served as `application/wasm`), `nowasm` (404), `hang` (the request never answers), `badwasm` (the flipped-byte file), `plain` (the `.wasm` as `text/plain`). The existing un-prefixed routes stay and serve the `ok` behaviour.

- [ ] **Step 1: Write the failing tests** in `score.pw.ts` (each waits for the score's `svg g.measure` and reads `page.on("console")` warnings):

```ts
test("@loading the package's own copy is the lighter build", async ({ page }) => {
	// asks for /ok/score/verovio-module.wasm, engraves, and warns about nothing
});
test("@loading a missing .wasm falls back to stock, with the warning", async ({ page }) => {
	// /nowasm/: one warning containing "the lighter Verovio was not used"; the score draws
});
test("@loading a corrupt .wasm falls back to stock", async ({ page }) => {});
test("@loading a .wasm that never arrives falls back at the lighter build's deadline", async ({ page }) => {
	// the page sets a short deadline through the test hook below; the score draws from stock
});
test("@loading a .wasm served as text/plain still loads the lighter build", async ({ page }) => {
	// no warning of ours; the browser's own MIME warning is allowed
});
test("@loading a replacement worker loads the lighter build again", async ({ page }) => {
	// two requests for /ok/score/verovio-module.wasm after a forced engraving deadline
});
```

Rename the six existing lighter-build and integrity tests (lines 383 to 483 today) to start with `@loading ` too.

- [ ] **Step 2: Run to see them fail**

Run: `bun run build && bunx playwright test -c packages/score/browser -g "@loading"`
Expected: FAIL, the new pages answer 404.

- [ ] **Step 3: Implement** the scenario prefixes in `server.ts` (one handler keyed by the closed list; `hang` returns a promise that never settles; the worker bundle is served under every prefix). The hang test needs a short deadline: the scenario's worker bundle is built with `LITE_DEADLINE_MS` replaced through `Bun.build`'s `define`, 1,500 ms, for the `hang` prefix only. Do not add a runtime option for it.

- [ ] **Step 4: Run to see them pass**

Run: `bunx playwright test -c packages/score/browser`
Expected: PASS, the whole suite in Chromium.

- [ ] **Step 5: Commit**

```bash
git add packages/score/browser
git commit -m "test(score): the lighter build's loading cases in a browser, as the package's own copy"
```

### Task 4: Firefox and WebKit for the loading tests, in CI

**Files:**
- Modify: `packages/score/browser/playwright.config.ts`
- Modify: `.github/workflows/ci.yml` (the `browser` job)

**Interfaces:**
- Consumes: Task 3's `@loading ` titles.
- Produces: nothing for later tasks.

- [ ] **Step 1: The check that fails first.** With `SCORE_BROWSERS=all` the suite must list three projects:

Run: `SCORE_BROWSERS=all bunx playwright test -c packages/score/browser --list | grep -c "\[firefox\]\|\[webkit\]"`
Expected: `0` (fails the requirement: it must be 24, twelve loading tests in each).

- [ ] **Step 2: Implement.** `playwright.config.ts` gets `projects`: `chromium` (every test, `devices["Desktop Chrome"]`), and, only when `process.env.SCORE_BROWSERS === "all"`, `firefox` and `webkit` (`devices["Desktop Firefox"]`, `devices["Desktop Safari"]`) with `grep: /@loading /`. In `ci.yml`'s `browser` job: `bunx playwright install --with-deps chromium firefox webkit`, and `SCORE_BROWSERS: all` in the `bun run test:browser` step's `env`. Raise the job's `timeout-minutes` from 15 to 20.

- [ ] **Step 3: Run to see it pass**

Run: `SCORE_BROWSERS=all bunx playwright test -c packages/score/browser --list | grep -c "\[firefox\]\|\[webkit\]"`
Expected: `24`. Then `bunx playwright test -c packages/score/browser` (Chromium, unset): PASS. Firefox and WebKit themselves run in the pull request's CI: read that job's log and confirm 24 passed there.

- [ ] **Step 4: Commit**

```bash
git add packages/score/browser/playwright.config.ts .github/workflows/ci.yml
git commit -m "ci: score's loading tests in Firefox and WebKit"
```

### Task 5: Two bundlers, checked

**Files:**
- Create: `scripts/score-bundlers.ts`
- Create: `packages/score/tests/fixtures/bundlers/` (`index.html`, `main.js`: a page with one `<barmark-score view="score">`)
- Modify: `package.json` (root `devDependencies`: `vite` and `esbuild`, exact, each at least seven days old), `.github/workflows/ci.yml` (run it in the `browser` job), `CLAUDE.md` (the commands list)

**Interfaces:**
- Consumes: the built packages.
- Produces: `bun scripts/score-bundlers.ts` exits 0 and prints one line per bundler.

- [ ] **Step 1: Write the script's failing expectation first.** The script builds the fixture twice into a `mkdtemp` directory, serves each on loopback, opens it in Chromium and asserts:
  - **Vite:** a `.wasm` file is in the output; the score draws; no warning containing "the lighter Verovio was not used".
  - **esbuild** (`--bundle --format=esm '--external:node:*'`, no `--splitting`): no `.wasm` in the output; the score draws; exactly one such warning.

Run: `bun scripts/score-bundlers.ts`
Expected before Tasks 1 to 2 are merged into the branch: FAIL on esbuild ("the score did not draw"). On this branch after Task 2: PASS. Run it once against `main`'s build to see the failure, and paste that output into the task report.

- [ ] **Step 2: Implement** the script and the fixture; add the two devDependencies with `bun add -d --exact`.

- [ ] **Step 3: Run to see it pass**

Run: `bun run build && bun scripts/score-bundlers.ts`
Expected: `vite: lighter build, .wasm emitted` and `esbuild: stock after one fallback`, exit 0.

- [ ] **Step 4: Commit**

```bash
git add scripts/score-bundlers.ts packages/score/tests/fixtures/bundlers package.json bun.lock .github/workflows/ci.yml CLAUDE.md
git commit -m "test(score): a Vite build and a plain esbuild bundle both engrave"
```

### Task 6: Releases and the site (after the pull request merges, with Kevin's go-ahead)

Not code for an implementer: the controller does these, following `RELEASING.md`.

- [ ] **Engraver 0.1.2** first: a README section on bundlers (the same facts as score's), nothing else. It is the engraver release that goes through the required `engraver` checks, which condition 1 asks for.
- [ ] **Confirm the five conditions** on the day, and write the result into the spec's amended section: the weekly rebuild green; Firefox and WebKit green in CI; barmark.dev's two weeks (and what evidence there is); `scripts/score-bundlers.ts` green; Kevin's go-ahead.
- [ ] **Score 0.9.0** (a minor: the default engraver changes), then the **CLI patch** ("Uses `@barmark/score` 0.9.0"; still stock Verovio), then the `kevinpeckham/songs` pin.
- [ ] **barmark.dev:** raise the pins; remove the three `verovio-*` attributes from `site/src/lib/chart.ts` so the site serves the lighter build from its own origin; a site browser test that the home page's score asks for a `.wasm` on `www.barmark.dev`'s own origin and warns about nothing; the FAQ and Get Started lines that name jsDelivr.
