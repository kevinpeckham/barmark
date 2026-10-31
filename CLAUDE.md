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
- `examples/`: real charts (Peaceful Dreams must parse cleanly and print
  unchanged)
- `site/`: barmark.dev (SvelteKit, UnoCSS, prerendered). **Not a workspace
  member**: it installs `barmark` and `@barmark/render` from npm at exact
  versions, so it runs what readers install. Its own `bun.lock`,
  `svelte-check` (TypeScript 6: see FINDINGS) and tests; the root
  `bun test` skips it (`bunfig.toml`), Fallow ignores it
- `docs/superpowers/`: designs (`specs/`) and implementation plans (`plans/`)
- `scripts/verify-package.ts`, `scripts/verify-release.ts`: release checks
  shared by CI and Swamp; both take the package (`barmark` or `render`)

## Commands

```
bun test                         # tests, every package
bun run check                    # Biome (tabs) and tsc
bun run fallow                   # dead code, duplication, complexity beyond the baseline
bun run test:browser             # the renderer in Chromium (builds first)
bun run verify:package <pkg>     # build, npm pack contents, Node import
bun run verify:release <pkg>     # version, CHANGELOG, tag, clean main
bunx varlock run -- swamp workflow run release-check [--input pkg=render]
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
  package is tagged on its own: `barmark-vX.Y.Z`, `render-vX.Y.Z`.
- `@barmark/render` never changes the music: anything musical (what `%`
  copies, bar numbers, what a replay plays) comes from the parser.
