<!-- BEGIN swamp managed section - DO NOT EDIT -->
# Project

This repository is managed with [swamp](https://github.com/swamp-club/swamp).

## Rules

1. **Search before you build.** When automating AWS, APIs, or any external service: (a) search community extensions with `swamp extension search <query>` — prefer `@swamp/*` official extensions first, (b) search local/installed types with `swamp behavior type search <query>`, (c) if a community extension exists, install it with `swamp extension pull <package>` instead of building from scratch, (d) extend an existing type if it covers the domain but lacks the method you need, (e) only create a custom extension behavior in `extensions/models/` as a last resort. Use the `swamp` skill for guidance. The `command/shell` behavior is ONLY for ad-hoc one-off shell commands, NEVER for wrapping CLI tools or building integrations.
2. **Extend, don't be clever.** When a behavior covers the domain but lacks the method you need, extend it with `export const extension` — don't bypass it with shell scripts, CLI tools, or multi-step hacks. One method, one purpose. Use `swamp behavior type describe <type> --json` to check available methods.
3. **Use the data model.** Once data exists in a behavior (via `lookup`, `start`, `sync`, etc.), reference it with CEL expressions. Don't re-fetch data that's already available.
4. **CEL expressions everywhere.** Wire behaviors together with CEL expressions. Always prefer `data.latest("<name>", "<dataName>").attributes.<field>` over the deprecated `model.<name>.resource.<spec>.<instance>.attributes.<field>` pattern.
5. **Verify before destructive operations.** Always `swamp behavior get <name> --json` and verify resource IDs before running delete/stop/destroy methods.
6. **Prefer fan-out methods over loops.** When operating on multiple targets, use a single method that handles all targets internally (factory pattern) rather than looping N separate `swamp behavior run` calls against the same behavior. Multiple parallel calls against the same behavior contend on the per-behavior lock, causing timeouts. A single fan-out method acquires the lock once and produces all outputs in one execution. Check `swamp behavior type describe` for methods that accept filters or produce multiple outputs.
7. **Extension npm deps are bundled; pin them.** Swamp's bundler inlines all npm packages (except zod) into extension bundles at bundle time. When the extension has a `deno.json`, the `deno.lock` beside it decides which versions are bundled; otherwise the registry's current release does. Always pin explicit versions in `npm:` and `jsr:` import specifiers (e.g., `npm:lodash-es@4.17.21`) — `swamp extension push` warns on unpinned and range specifiers.
8. **Reports for reusable data pipelines.** When the task involves building a repeatable pipeline to transform, aggregate, or analyze behavior output (security reports, cost analysis, compliance checks, summaries), create a report extension. Use the `swamp` skill for guidance.
9. **"Workflow" means a swamp workflow.** In this repository the word "workflow" (and "create/run/execute/validate/debug workflow", "automate", "orchestrate", "automated/nightly job") refers to a swamp workflow — a declarative YAML DAG of behavior-method steps authored via `swamp workflow create`. Load and follow the `swamp` skill for these requests. Do NOT interpret these as a request to build an agent task list, spin up worktrees, or schedule a cron/remote agent. Only use those orchestration mechanisms when the user explicitly names one (e.g. "task list", "subagent", "worktree", "cron", "remote agent") or explicitly asks you to do the work yourself step by step rather than author a swamp workflow.
10. **Use swamp, don't bypass it.** Always work through swamp commands — don't go around them with raw shell tools. Use `swamp data query` to find data, not `grep`/`find` on `.swamp/` files. Use behavior methods to interact with resources, not `curl`/`aws`/`gcloud`/`kubectl` when a behavior type already wraps that API — check with `swamp behavior type search`. Use `swamp help` for CLI discovery, not guesswork. Composing with swamp output is fine (e.g. piping `--json` through `jq`) — the anti-pattern is bypassing swamp entirely.
11. **Inspect reports after failures.** When a behavior method or workflow run fails, inspect its generated reports before retrying or changing definitions. Reports run even on failure and capture structured diagnostics — error messages, execution status, arguments, and data output pointers. Use `swamp report get @swamp/method-summary --model <model> --json` for method failures or `swamp report get @swamp/workflow-summary --workflow <workflow> --json` for workflow failures. Run `swamp help report get` to confirm current retrieval syntax.

## Skills

**IMPORTANT:** Always load swamp skills, even when in plan mode. The skills provide
essential context for working with this repository.

- `swamp` - Swamp CLI — behaviors, workflows, data, vaults, extensions, publishing, repos, reports, issues, and troubleshooting
- `swamp-getting-started` - Interactive onboarding for new swamp users

## Getting Started

If you were asked to read a task brief under `tasks/` (a file whose first
line is `<!-- swamp start brief v1 -->`), read that brief, then invoke the
`swamp-getting-started` skill and follow it from its brief entry point.

If the user is new to swamp or asks to get started, or a swamp command you
run shows this repository has no behaviors yet, invoke the
`swamp-getting-started` skill. It checks for existing behaviors itself and walks
new users through an interactive onboarding tutorial.

Otherwise, use the `swamp` skill to work with swamp behaviors.

## Commands

Use `swamp --help` to see available commands. For a machine-readable JSON
schema of the CLI (commands, options, arguments) intended for agent
consumption, run `swamp help [<command>...]` — e.g. `swamp help` returns
the full tree, and `swamp help behavior run` scopes to a subtree.

Behaviors (formerly models) are managed with `swamp behavior` — e.g.
`swamp behavior run <name> <method>` (or
`swamp behavior run @<type> <method> <name>` to run against a type
directly). Every `swamp model …` spelling remains supported.
<!-- END swamp managed section -->

# CLAUDE.md — barmark

barmark is a plain-text notation for chord charts and its reference
TypeScript library. The grammar draft, `docs/grammar-v0.1-draft.md`, is
the binding authority: code follows it, and a grammar change updates the
draft (and its decisions log) in the same commit. Kevin decides grammar
questions; surface them, with a recommendation.

## Layout

A Bun workspace. Root holds the shared config (Biome, `tsconfig.json`,
Fallow, CI, Swamp), the grammar, `examples/`, the scripts and FINDINGS.md.

- `packages/barmark/`: the `barmark` npm package
  - `src/chords/`: chord symbols, note sets, intervals, Harte labels
  - `src/chart/`: the chart reader (`document.ts`, `barLine.ts`,
    `directives.ts`), play-order expansion (`expand.ts`), `parseChart`
    (`parse.ts`) and the canonical printer (`print.ts`)
  - `tests/`: `bun test`; `tests/chart/fixtures.ts` reads the spec's own
    example and has the round-trip `meaning` yardstick
  - its own `CHANGELOG.md` and `README.md`
- `packages/render/`: `@barmark/render`, the bar-grid renderer and the
  `<barmark-chart>` web component
  - `src/model.ts` decides what to draw (`layoutChart`); `chord.ts` and
    `speech.ts` typeset and speak chords; `html.ts` and `styles.ts` draw;
    `element.ts` is the web component; `fonts/` holds Edwin, unmodified
  - `tests/`: `bun test` (linkedom for markup); `browser/`: Playwright
    suite (`bun run test:browser`) with its own page server
- `packages/musicxml/`: `@barmark/musicxml`, MusicXML 4.0 export
  (`exportMusicXml`) and import (`importMusicXml`, `readMxl`); its tests
  validate against the vendored XSD with `xmllint` (`libxml2-utils`),
  which `bun test` therefore needs
  - `src/import/`: the import, one module per stage: read the XML
    (`tree.ts`) and the score (`read.ts`), chord symbols (`chords.ts`),
    the slot grid (`grid.ts`), each part's lines (`parts.ts`), lyrics,
    marks and structure, then the chart (`write.ts`); `mxl.ts` unpacks
    `.mxl`
  - `tests/fixtures/import/`: MuseScore files we wrote (`.mscx`), the
    `.musicxml`/`.mxl` MuseScore made of them and each expected
    `.chart.md`; `bun scripts/musescore-fixtures.ts` regenerates them on
    the VM only (`~/.local/bin/mscore`), never in CI
- `packages/score/`: `@barmark/score`, `<barmark-score>` (the bar grid or a
  full score engraved by Verovio in a Web Worker) and `renderScoreHtml`
  for the server; the heavier sibling of `@barmark/render`'s
  `<barmark-chart>`, which never loads Verovio. Depends on `barmark`,
  `@barmark/render` and `@barmark/musicxml`; Verovio is LGPL-3.0, loaded
  unchanged from npm
  - `src/`: the engraving core, chart to SVG (`engrave.ts`), safe themed
    markup (`markup.ts`), the shared module Worker and its engine
    (`engine.ts`, `worker.ts`), the shadow-root shell and the Grid / Score
    switch (`shell.ts`, `switch.ts`), the server entry that never reaches
    Verovio (`server.ts`) and the element (`element.ts`)
  - `tests/`: `bun test` with real Verovio; linkedom for the element and
    the server markup, the MusicXML round trip (`round-trip.test.ts`,
    helpers in `tests/helpers/`)
  - `browser/`: Playwright suite (`bun run test:browser`, port 5261) with
    its own page server and a bundled worker
- `packages/sync/`: `@barmark/sync`, syncing a chart with a recording; the
  timing map (`chartHash`, `checkTimingMap`, `barAt`, `secondsAtBar`) is
  also the `@barmark/sync/timing` subpath, so a map-only reader gets no
  builder code
  - `src/build/`: the builder, `chartFromDetections`, one module per
    stage: read and bound the input (`input.ts`, `spell.ts`), settle
    overlapping runs and cut them at key changes (`runs.ts`), vote a
    symbol per slot (`vote.ts`), titles, sections, changes and tempo
    (`marks.ts`), write the chart (`write.ts`), then its timing map and
    confidence record (`timing.ts`, `confidence.ts`)
  - `src/timing/`: `types.ts`, `hash.ts` (FNV-1a 64 of the printed chart),
    `check.ts` (hand-written validation), `lookup.ts`
  - `tests/`: `bun test`; `tests/fixtures/` holds real ChordMini output on
    two songs (numbers and labels only), which `bun
    scripts/detection-fixtures.ts` regenerates on the VM only, never in CI
- `packages/midi/`: `@barmark/midi`, MIDI export (and later import) of a
  chart's play order; the performance core (chart to timed notes) is the
  `@barmark/midi/perform` subpath, which imports nothing from `smf/`,
  `export/` or `import/`
  - `src/perform/`: `perform(parse)` in exact quarters (`quarters.ts`),
    walking `parse.events` (`perform.ts`): tracks and programs
    (`tracks.ts`), what a slot sounds (`voicing.ts`, `line.ts`), accents,
    hits and pushes (`figures.ts`), the pedal (`pedal.ts`), swing
    (`swing.ts`), the tempo map (`tempo.ts`), keys (`keys.ts`), markers,
    words and lyrics (`marks.ts`, `lyrics.ts`)
  - `src/export/`: `exportMidi`: ticks and the division (`ticks.ts`),
    channels, skipping channel 10 (`channels.ts`), the tracks written
    (`index.ts`)
  - `src/smf/`: the hand-written Standard MIDI File writer (`write.ts`,
    `vlq.ts`, `types.ts`): no runtime MIDI library
  - `tests/`: `bun test`; every file is read back with `midi-file`
    (a devDependency, pinned exactly), an independent parser, and
    `helpers/player.ts` hears it beat by beat against the chart;
    `export-scale.test.ts` checks a 1,000-bar export takes linear time.
    `bun scripts/midi-fixtures.ts --check-export` puts three charts'
    exports through MuseScore on the VM only, never in CI;
    `bun scripts/dorico-midi.ts [--keep] [name…]` puts charts' exports
    through Dorico's MIDI import (mac-bench `dorico --midi`, beside this
    repo) and compares Dorico's MusicXML with what the file plays
    (`scripts/dorico-compare.ts`, tested in `tests/dorico-compare.test.ts`),
    VM only, never in CI
- `packages/listen/`: `@barmark/listen`, a recording to a chart and a
  chart to a recording: the port of Stem Shovel's audio alignment
  (`~/projects/stem-shovel`, read only, never written). v1 is a port: the
  app's arithmetic in the app's order, each threshold an option
  (`options.ts`, the app's SCREAMING_CASE names and defaults), and every
  difference from the app a row of the design's §11.3. Every call returns
  `Ok | Refused` and never throws. Depends on `barmark` and
  `@barmark/sync` only
  - `src/features/`: the `./features` entry (`recordingFeatures`,
    `chromaFeatures`, `onsetFeatures`, `joinFeatures`, `readFeatures`),
    which imports nothing from `barmark` or `@barmark/sync`: `fft.ts`,
    `onset.ts`, `chroma.ts`, `sound.ts`, `features.ts`
  - `src/comb/`: the onset comb (`comb.ts`), the trusted span
    (`span.ts`), the slide, the re-phase and the v3 end repair
  - `src/grid/`: `findGrid`: the lattice, beat chords, the three
    witnesses, the vote and bar one's placement with its pickup
  - `src/align/`: `alignChart`: the chart's bars as pads (`bars.ts`), the
    streamed render, the DTW, the path and its re-phase, the fit, the
    placements and the aligned timing map
  - `src/pipeline.ts`: `chartFromRecording`; `src/stages.ts`: the
    `./stages` entry, each stage for the bench (may change shape in a
    minor before 1.0)
  - `tests/`: `bun test`, synthetic songs rendered in the tests
    (`tests/helpers/`), no audio checked in; the scale tests time
    relatively, as `@barmark/midi`'s do
- `packages/cli/`: `@barmark/cli`, the `barmark` command (`check`,
  `format`, `part`, `render` (`--score`: the full score, Verovio
  in-process, `src/score.ts`), `transpose`, `export`, `import`; MusicXML
  and MIDI), a thin layer over the libraries, pinned to them exactly
  (`verovio` too); `licenses/` holds Verovio's LGPL and GPL, which the
  release attaches beside the binaries
  - each command is `(args, io) => Promise<number>` with injected I/O
    (`src/io.ts`); `cli.ts` is the Node bin, `binary.ts` the standalone
    binary (`bun scripts/compile.ts <target> <out>`, font, Verovio and
    versions embedded)
  - `tests/`: commands in-process, plus the built bin under Node and a
    compiled binary
- `packages/engraver/`: `@barmark/engraver`, a modified, smaller build of
  Verovio 6.4.1 for `@barmark/score` (LGPL-3.0-only; `NOTICE.md`,
  `THIRD-PARTY.md`, `COPYING*`, `OFL.txt`). **Never commit `dist/`**: the
  `.mjs` and `.wasm` are compiled by emsdk on the VM, in CI and in the
  release workflow, and must match `src/info.ts` byte for byte
  - `build/`: `build.sh` (clone at the pin, emsdk, compile, link, banner,
    path scan), `versions.env` (the pins), `data.txt` (the `data/` kept),
    `compile.ts` (`bun run compile [--update]`), `dist.ts` (`bun run
    build`: the TS side, and a stale-dist check), `facts.ts` (sizes,
    digests, `info.ts`), `paths.ts` (the leaked-path scan), `source.sh`
    (the Corresponding Source for a release)
  - `src/info.ts`: the anchor, the build's sizes and digests, written by
    `compile --update`; `src/index.d.mts`: the module's types
  - `tests/`: committed-state tests (no compiled build needed), the
    licence files pinned, and `fixtures/long.chart.md`
- `scripts/engraver-equivalence.ts [--lite <dir>] [--json]`: the engraver
  equivalence gate, stock `verovio/wasm` against the build over
  `scripts/engraver-corpus.ts`, byte-identical SVG; it runs
  `scripts/engraver-engrave.mjs` (Node 22, score's built `engraveXml`) once
  per engraver. Needs the root `bun run build` and a compiled dist
- `scripts/score-dorico.ts [outdir]`: `@barmark/score`'s Verovio engraving
  of the examples and the lead sheet beside the PDF Dorico engraves of the
  same exported MusicXML (mac-bench `dorico`, beside this repo), as one
  `index.html` (`scripts/score-dorico-page.ts`, tested in
  `packages/score/tests/score-dorico-page.test.ts`); advice for a person,
  not a gate; VM only, never in CI
- `examples/`: real charts, each parsing cleanly and printing unchanged
  (Peaceful Dreams; Morning Song, the several-parts example the tests read)
- `site/`: barmark.dev (SvelteKit, UnoCSS, prerendered). **Not a workspace
  member**: it installs `barmark` and `@barmark/render` from npm at exact
  versions, so it runs what readers install. Its own `bun.lock`,
  `svelte-check` (TypeScript 6: see FINDINGS) and tests; the root
  `bun test` skips it (`bunfig.toml`), Fallow ignores it
- `docs/superpowers/`: designs (`specs/`) and implementation plans (`plans/`)
- `scripts/verify-package.ts`, `scripts/verify-release.ts`: release checks
  shared by CI and Swamp; both take the package (`barmark`, `render`, `musicxml`, `score`, `sync`, `midi`, `listen`, `cli` or `engraver`)

## Commands

```
bun test                         # tests, every package
bun run check                    # Biome (tabs) and tsc
bun run fallow                   # dead code, duplication, complexity beyond the baseline
bun run test:browser             # the renderer in Chromium (builds first)
bun run verify:package <pkg>     # build, npm pack contents, Node import
bun run verify:release <pkg>     # version, CHANGELOG, tag, clean main
bunx varlock run -- swamp workflow run release-check [--input pkg=render]
cd packages/engraver && bun run compile [--update]   # emsdk build of Verovio; --update re-anchors info.ts
bun scripts/engraver-equivalence.ts   # stock vs the build, byte-identical SVG
cd site && bun run dev|build|check|test|test:browser   # barmark.dev
```

## Working agreement

- Test first: a failing test before every fix or feature, and a test that
  fails for the reason you expect.
- Keep `bun run fallow` clean. Refactor a function that crosses Fallow's
  complexity thresholds rather than growing the baseline; regenerate
  `.fallow-health-baseline.json` (`bunx fallow health --save-baseline
  .fallow-health-baseline.json`) only after paying complexity down, and
  say so in the commit.
- Parsers never throw on user input; every problem is a diagnostic with a
  line number.
- Add an entry under `[Unreleased]` in the changed package's
  `CHANGELOG.md` for every user-visible change.
- Add a `FINDINGS.md` entry whenever a tool, a pattern or our own process
  surprises us: the symptom, the cause, the fix and where it lives.
- Commit messages are conventional commits with **no** `Co-Authored-By`
  or other AI attribution trailer.
- Releases follow `RELEASING.md` (the `/release` skill walks it). Each
  package is tagged on its own: `barmark-vX.Y.Z`, `render-vX.Y.Z`,
  `musicxml-vX.Y.Z`, `score-vX.Y.Z`, `sync-vX.Y.Z`, `midi-vX.Y.Z`, `listen-vX.Y.Z`, `cli-vX.Y.Z`, `engraver-vX.Y.Z`. A library release is followed by a CLI release and a
  bump in `kevinpeckham/songs` (RELEASING.md steps 13–14), a `sync`,
  `midi` or `score` release included (the CLI bundles `sync` through
  `midi`, and `score` with Verovio). After
  a `sync` minor, a `midi` patch ("Requires `@barmark/sync` X.Y.0") comes
  first, then the CLI, as a `barmark` minor's caret dependants do.
  `score` depends on `barmark`, `@barmark/render` and `@barmark/musicxml`
  with carets, so a release of any of them may need a `score` patch
  raising that dependency, as `midi` follows `sync`, and then the CLI.
  `listen` is not bundled by the CLI: a listen release needs no CLI
  release, and after a `sync` or `barmark` minor, a `listen` patch
  raises the dependency.
  An engraver version bump runs `bun run compile --update` and commits
  `info.ts`. A Verovio upgrade is one joint PR (`versions.env`, `info.ts`,
  score's `verovio` pin, stock constants and `ENGRAVER_*` literals), then
  releases engraver, score, the CLI and the site in that order.
- `@barmark/render` never changes the music: anything musical (what `%`
  copies, bar numbers, what a replay plays) comes from the parser.
