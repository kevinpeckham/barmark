# CLAUDE.md — barmark

barmark is a plain-text notation for chord charts and its reference
TypeScript library. The grammar draft, `docs/grammar-v0.1-draft.md`, is
the binding authority: code follows it, and a grammar change updates the
draft (and its decisions log) in the same commit. Kevin decides grammar
questions; surface them, with a recommendation.

## Layout

- `src/chords/`: chord symbols, note sets, intervals, Harte labels
- `src/chart/`: the chart reader (`document.ts`, `barLine.ts`,
  `directives.ts`), play-order expansion (`expand.ts`), `parseChart`
  (`parse.ts`) and the canonical printer (`print.ts`)
- `tests/`: `bun test`; `tests/chart/fixtures.ts` reads the spec's own
  example and has the round-trip `meaning` yardstick
- `examples/`: real charts (Peaceful Dreams must parse cleanly and print
  unchanged)
- `docs/superpowers/plans/`: the implementation plans
- `scripts/verify-package.ts`, `scripts/verify-release.ts`: release checks
  shared by CI and Swamp

## Commands

```
bun test                 # tests
bun run check            # Biome (tabs) and tsc
bun run verify:package   # build, npm pack contents, Node import
bun run verify:release   # version, CHANGELOG, tag, clean main
swamp workflow run release-check   # all of the above, recorded as data
```

## Working agreement

- Test first: a failing test before every fix or feature, and a test that
  fails for the reason you expect.
- Parsers never throw on user input; every problem is a diagnostic with a
  line number.
- Add a `CHANGELOG.md` entry under `[Unreleased]` for every user-visible
  change.
- Add a `FINDINGS.md` entry whenever a tool, a pattern or our own process
  surprises us: the symptom, the cause, the fix and where it lives.
- Commit messages are conventional commits with **no** `Co-Authored-By`
  or other AI attribution trailer.
- Releases follow `RELEASING.md` (the `/release` skill walks it).
