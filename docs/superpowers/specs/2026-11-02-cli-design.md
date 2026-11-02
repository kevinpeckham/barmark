# `@barmark/cli` and the Badverbs songs repository: design

Approved in conversation with Kevin, 2026-11-02. Two pieces, built in
order: the CLI (a third package in this workspace), then a public songs
repository that uses it in CI.

## Why

Barmark charts are files (`.chart.md`). Today the only way to check one is
to paste it into barmark.dev or write code against the library. A command
line tool lets a person keep charts in a git repository and have CI say,
on every push, whether each chart reads cleanly and is in standard form,
the way `cargo fmt --check` and a linter do for code.

Kevin's first use is his own songs. He has no songs repository yet; this
work creates one with his Badverbs charts, so the CLI has real charts to
check from day one and every Barmark release is tested against them.

## Decisions (Kevin's)

- **TypeScript, not Rust, for now.** Kevin prefers Rust (single fast
  binary, and he is learning it) but agreed: a Rust CLI would need a second
  parser while the grammar is a v0.1 draft changing daily. Revisit a Rust
  implementation once the grammar settles; the conformance fixtures would
  be its test suite.
- **Commands are real words:** `check`, `format`, `render`, `transpose`
  (not `fmt`).
- **The songs repository is public, under `kevinpeckham`,** with copyright
  explicit: the songs are all rights reserved.
- **Interbellum (by Karl Ward) stays out** until Karl agrees.
- The commands, their behavior and the CI workflow below, as played back
  to Kevin and accepted ("looks good; proceed").

## Goals

1. `@barmark/cli` on npm, installing a `barmark` command, and standalone
   binaries (no Node or Bun needed) attached to each GitHub release.
2. Four commands over the published libraries, adding no musical logic:
   anything about what a chart means comes from `barmark`; anything about
   how it looks comes from `@barmark/render`.
3. CI-friendly: stable exit codes, problems as `file:line` lines, GitHub
   annotations, JSON for tools.
4. A public songs repository whose CI runs `check --strict` and
   `format --check` over every chart with a pinned CLI version.

## Non-goals

- No network access, no config file, no watch mode, no audio or playback.
- No new parsing, printing or transposing logic in the CLI. If a command
  needs behavior the libraries lack, that is a library change first.
- No editor integration or language server (later, maybe).
- No Rust (see above).

## Anti-goals (a failure even if it works)

- The CLI and barmark.dev disagree about a chart. They must run the same
  library code; the CLI pins exact library versions and prints them.
- `format` changes what a chart means. It writes only `printChart`'s
  output, which already promises the same meaning.
- A song chart in the public repository can be read as open-licensed.

## The CLI

### Package

- `packages/cli`, published as `@barmark/cli`, a workspace member like
  `packages/render`. Depends on `barmark` and `@barmark/render` as
  `workspace:*`, which packs to exact versions (`0.7.0`, not `^0.7.0`), so
  `--version` always names what actually runs. (Render's own dependency on
  `barmark` stays `workspace:^`; with the CLI pinning `barmark` exactly,
  npm resolves one copy.) The cost, accepted: a library release reaches
  CLI users only through a CLI release; see "Releases" below.
  `verify-package cli` checks the packed tarball's pins are exact. ESM, Node 20 or later, TypeScript strict, Biome,
  `bun test`, its own README and CHANGELOG.
- `bin`: `{ "barmark": "./dist/cli.js" }` with a `#!/usr/bin/env node`
  line. Argument parsing with `node:util`'s `parseArgs`: no runtime
  dependencies beyond the two Barmark packages.
- Tagged and released on its own: `cli-vX.Y.Z`, starting at 0.1.0,
  through RELEASING.md like the other two. `scripts/verify-package.ts`,
  `scripts/verify-release.ts`, the CI `package` matrix, the release
  workflow and the Swamp `release-check` workflow learn the `cli` key.

### Inputs

- Every command takes file paths; `check` and `format` also take folders,
  meaning every `*.chart.md` file under them (recursively, sorted, skipping
  `node_modules` and dot-folders). `-` reads stdin.
- A path that doesn't exist or can't be read is a usage error.

### Commands

`barmark check <paths…> [--strict] [--format text|github|json]`

- Parses each chart (`parseChart`) and reports its diagnostics.
- `text` (default): `path:line: severity: message`, one per line, then a
  one-line summary (`4 files, 0 errors, 1 warning`).
- `github`: `::error file=…,line=…::message` / `::warning …` workflow
  commands, so problems show on the PR's lines.
- `json`: an array of `{ file, diagnostics: [{ line, severity, message }] }`.

`barmark format <paths…> [--write | --check]`

- The chart in canonical form (`printChart`).
- Default: prints it to stdout (one file only; several files without
  `--write` or `--check` is a usage error).
- `--write`: rewrites each file that changes, and lists them.
- `--check`: writes nothing; lists each file that would change.
- Lines with errors stay as written (the printer's own rule), so `format`
  never hides a problem; `check` still reports it.

`barmark render <file> [--out <file>] [--theme auto|light|dark]
[--numerals nashville|roman] [--no-bar-numbers] [--rehearsal-letters]
[--no-wrap] [--diagnostics] [--font-url <url>]`

- A complete HTML document (doctype, `<meta charset>`, viewport, `<title>`
  from the chart's title or the file name) whose body is
  `renderChart(text, options)`. Flags map one to one onto `renderChart`
  options.
- The file stands alone: Edwin is embedded as a data URL `@font-face`
  (about 160 KB once encoded), unless `--font-url` names one to link
  instead. Edwin's OFL travels with the package as it does in
  `@barmark/render`.
- To stdout, or to `--out`.

`barmark transpose <file> (--to <key> | --semitones <n>) [--out <file>]`

- `transposeChart`'s text to stdout or `--out`; its diagnostics to stderr
  in the `check` text format.

Global: `--help` (and `<command> --help`), `--version` printing
`@barmark/cli X.Y.Z (barmark A.B.C, @barmark/render D.E.F)`.

### Exit codes

| Code | Meaning |
|---|---|
| 0 | Done; nothing to report (warnings allowed unless `--strict`) |
| 1 | The charts have problems: an error (or, with `--strict`, a warning) from `check` or `transpose`; a file `format --check` would change |
| 2 | Usage: unknown command or flag, missing argument, unreadable path |

The CLI never throws a stack trace at a user: anything unexpected is
printed as one line and exits 2.

### Standalone binaries

- Built with `bun build --compile` for `linux-x64`, `linux-arm64`,
  `darwin-x64`, `darwin-arm64` and `windows-x64`, with Edwin embedded.
- The release workflow, for a `cli-v*` tag, builds them, smoke-tests the
  Linux x64 one (`--version`, and `check` on Peaceful Dreams), and attaches
  all five to the GitHub release as `barmark-<os>-<arch>[.exe]`.
- Unsigned. The README says how to clear macOS's quarantine flag
  (`xattr -d com.apple.quarantine`). Signing and Homebrew are later.

### Testing

- Unit tests call each command's function with arguments and captured
  stdout/stderr, and assert output and exit codes, using the song charts
  (fixtures) and small inline charts.
- One end-to-end test runs the built `dist/cli.js` with Node in a temp
  folder: `check`, `format --write`, then `format --check` exits 0.
- `verify-package cli` packs the package and runs `barmark --version` and
  `barmark check` from the packed tarball under Node.
- `render`'s output is checked with linkedom: a full document, the chart's
  shadow root, the font rule.

## The songs repository

- **`kevinpeckham/badverbs-songs`** (name is Claude's call; Kevin can
  rename), public.
- **Charts:** Eat All the Clocks, Letter Lands, Mop Heart and Peaceful
  Dreams, one `<slug>.chart.md` each, in `songs/`. They start as the text
  in barmark's conformance fixtures (as Stem Shovel stores them); the first
  commit adds them as they are, the second runs `barmark format --write`
  (today all four would change; all four already check clean). Letter
  Lands has no title line in Stem Shovel; the songs repository's copy gets
  `# Letter Lands` (Claude's call; the barmark fixture is untouched). Each
  chart gets a credit line under its title: "Words and music by Kevin Peckham.
  © Kevin Peckham, all rights reserved." Barmark reads it as text.
- **Copyright:** README says it first. `COPYRIGHT.md` lists each song and
  its writer, all rights reserved, with no licence granted; the workflow
  file is MIT, said in the same file. No `LICENSE` file, so nothing
  suggests the songs are open. Years are left out until Kevin gives them.
- **CI:** one workflow on push and pull request: set up Node, then
  `npx -y @barmark/cli@<exact version> check --strict --format github songs`
  and `npx -y @barmark/cli@<exact version> format --check songs`.
  Raising the pinned version is a deliberate commit, so a Barmark release
  that changes how a song reads shows up as a failing PR, not a surprise.
- **Created after `@barmark/cli` 0.1.0 is on npm.** Creating a public
  repository is outward-facing: Kevin confirms before it is created. The
  exe.dev GitHub proxy reaches only repositories attached to this VM's
  integration, so Kevin may need to create it (empty) and attach it
  before the first push.

## Releases

Kevin's decision: a CLI release is a standard step of every library
release. After `barmark` or `@barmark/render` publishes (and after the
site bump, RELEASING.md step 12), the same session:

1. Opens a release PR for `@barmark/cli` (a patch, unless the CLI itself
   changed) that moves it onto the new library versions, with a CHANGELOG
   line naming them; runs the release check; tags `cli-vX.Y.Z` after the
   merge; Kevin approves the publish as for the other packages.
2. Opens a PR in `badverbs-songs` raising its pinned CLI version. Its CI
   runs the new libraries over the real songs: green means no song reads
   differently; red shows exactly which song and line changed, before
   Kevin accepts the release.

RELEASING.md gets these steps after step 12 in the same PR that adds the
`cli` package. The `/release` skill follows RELEASING.md, so it picks them
up.

## Steps only Kevin can do (the plan schedules them)

- Publish the `@barmark/cli` 0.0.0 placeholder and set up its npm trusted
  publisher (RELEASING.md, "A new package's first release").
- Add `cli-v*` to the "release tags" ruleset, and the new
  `package (<node>, cli)` checks to the "main" ruleset's required checks.
- Confirm, then create (empty) and attach `badverbs-songs` to this VM's
  GitHub integration before the first push.

## Left to the builder

- Internal structure of `packages/cli` (one module per command is the
  obvious shape), help text wording, the summary line's wording.
- How folders are walked, within the rules above.
- Test layout.

## Calls Claude made (Kevin to check)

- The songs repository's name, `badverbs-songs`.
- Edwin embedded by default in `render`'s output (self-contained files over
  a 160 KB saving).
- Exit code 2 for usage errors, separate from 1 for chart problems.
- Unsigned binaries for 0.1.0.
- Credit-line wording in each chart.
- Exact pins for the CLI's library dependencies.
- `# Letter Lands` added in the songs repository's copy.
