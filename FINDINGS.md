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
