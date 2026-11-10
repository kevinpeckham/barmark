# Releasing

This repository publishes seven npm packages from one Bun workspace, each
versioned and released on its own:

| Package | Directory | Release tag |
|---|---|---|
| `barmark` | `packages/barmark` | `barmark-vX.Y.Z` |
| `@barmark/render` | `packages/render` | `render-vX.Y.Z` |
| `@barmark/musicxml` | `packages/musicxml` | `musicxml-vX.Y.Z` |
| `@barmark/score` | `packages/score` | `score-vX.Y.Z` |
| `@barmark/sync` | `packages/sync` | `sync-vX.Y.Z` |
| `@barmark/midi` | `packages/midi` | `midi-vX.Y.Z` |
| `@barmark/cli` | `packages/cli` | `cli-vX.Y.Z` |

(`barmark` 0.0.x and 0.1.0 were tagged `vX.Y.Z`, before the workspace.)

A release is a version bump, a CHANGELOG section, a tag and a GitHub
release. The GitHub release triggers `.github/workflows/release.yml`,
which reads the package from the tag, re-runs every gate and packs that
package, waits for Kevin to approve the publish (the `npm` environment),
publishes it through npm trusted publishing with provenance, then installs
it back from npm and reads a real chart with it. For `@barmark/cli` it
then compiles the standalone binaries in a read-only job, runs the
Linux one, and a separate job with no checkout or install attaches all
five to the GitHub release with Edwin's licence. No npm token exists
anywhere.

## Repository rules

- **`main`** (ruleset "main"): changes arrive by pull request, CI's
  `check`, `browser`, `site` and `package (<node>, <package>)` jobs (Node
  20, 22 and 24 for each package) must pass, and force-pushes and deletion
  are blocked. `site-versions` is deliberately not required (step 12). Renaming a CI job or changing a matrix means updating the
  ruleset's required checks.
- **Release tags** (ruleset "release tags", `v*`, `barmark-v*` and
  `render-v*`): a tag can be created but never moved or deleted, so a
  version always names the code that was released.
- **The `npm` environment** holds the publish job: it needs Kevin's
  approval and runs only for release tags. Each package's npm trusted
  publisher names this environment, so no other job can publish.
- **Dependabot** (`.github/dependabot.yml`) proposes monthly, grouped
  updates to the pinned actions and dev dependencies, two weeks after a
  release at the earliest, and security updates as they come.

## Versions

Semantic versioning. While a package is 0.x:

- **minor** (0.1.0 → 0.2.0): a grammar change, a new feature, or any
  change to the exported API (for `@barmark/render` that includes its
  CSS custom properties, `::part()` names and element attributes)
- **patch** (0.1.0 → 0.1.1): fixes that change no documented behavior

The grammar draft's version (`docs/grammar-v0.1-draft.md`) is separate
from the package versions. `barmark` says which grammar it implements in
its CHANGELOG.

`@barmark/render` depends on `barmark` as `workspace:^`; packing turns
that into `^` the local `barmark` version. So when the renderer needs
something new in `barmark`, **release `barmark` first**: the render
release check fails while the `barmark` version it would name is not on
npm.

**A `barmark` minor release needs a release of every package that
depends on `barmark` with a caret** (`@barmark/render`,
`@barmark/musicxml`, `@barmark/score`, `@barmark/sync` and `@barmark/midi`), even with no
change of their own. In 0.x a caret range stops at the next minor
(`^0.7.0` allows 0.7.x, not 0.8.0), so a page or the CLI that installs
the new `barmark` beside an old dependant gets two copies, and the
dependant reads charts with the old rules. Release each as a patch
("Requires `barmark` X.Y.0") right after the `barmark` release, then bump
the site to the new `barmark` and renderer.

**Likewise, a `@barmark/sync` minor release needs a `@barmark/midi`
patch** ("Requires `@barmark/sync` X.Y.0"), since `@barmark/midi`
depends on it with a caret, and only then the CLI (step 13). Otherwise
the CLI's binaries bundle the new `sync` while an npm install of the
same CLI gets the old one through `@barmark/midi`'s range.
`verify:release cli` checks this: each bundled library's dependency
ranges, as packed at its tag, must admit the versions the binaries
bundle beside it.

**`@barmark/score`** depends on `barmark`, `@barmark/render` and
`@barmark/musicxml` with carets, so it follows their releases the way
`@barmark/midi` follows `@barmark/sync`: a release of any of them may need
a `@barmark/score` patch ("Requires `@barmark/render` X.Y.0") that raises
its dependency, and then by a CLI release (step 13): the CLI pins
`@barmark/score` exactly and its binaries bundle it, with Verovio, for
`render --score`. A Verovio upgrade is a `@barmark/score` release (its
range) followed by a CLI release that raises the CLI's exact `verovio`
pin to match, so the binaries and an npm install engrave with the same
Verovio (`verify:release cli` checks the pin is inside `@barmark/score`'s
range at its tag). `@barmark/score` pins Verovio exactly, so a Verovio bump of any
size, a patch included, is a `@barmark/score` release that also updates
`packages/score/src/verovio.ts` (the version, the module's bytes and its
sha384) and the digest in the score README; `tests/download.test.ts`
fails until all three match the installed file.

## Checks

The same scripts run in three places; `<pkg>` is `barmark`, `render`, `musicxml`, `score`, `sync`, `midi` or `cli`:

| Check | Command | Local (Swamp) | CI (every push and PR) | Release workflow |
|---|---|---|---|---|
| Lint and typecheck | `bun run check` | ✓ | ✓ | ✓ |
| Tests | `bun test` | ✓ | ✓ | ✓ |
| Dead code, duplication, complexity | `bun run fallow` | ✓ | ✓ | ✓ |
| The renderer in Chromium | `bun run test:browser` | | ✓ | ✓ |
| Package contents, Node import | `bun run verify:package <pkg>` | ✓ | ✓ (Node 20, 22, 24) | ✓ |
| Version, CHANGELOG, tag, dependencies on npm, clean `main` | `bun run verify:release <pkg>` | ✓ | | ✓ (tag = version) |

Locally, `bunx varlock run -- swamp workflow run release-check --input
pkg=<pkg>` runs all but the browser tests through the `barmark` Swamp
behavior, keeps each run's results as data, and fails on any problem
(`pkg` defaults to `barmark`). The scripts also run on their own; Swamp
adds the record and the single pass/fail. Varlock loads Swamp's
credential from barmark's 1Password environment; `.env.local`
(gitignored) holds `OP_ENV_ID` and `OP_TOKEN`.

`verify:package` packs with `bun pm pack` (as the release workflow does),
which turns `workspace:` ranges into versions, and fails if one is left.
The libraries pack as caret ranges (`^0.7.0`); `@barmark/cli` pins both
libraries exactly (`0.7.0`), so `barmark --version` names what actually
runs, and `verify:package cli` fails on anything else.

## Steps

`<pkg>` is the package's key (`barmark`, `render`, `musicxml`, `score`, `sync`, `midi` or `cli`) and the tag is
`<pkg>-vX.Y.Z`.

1. **Start a release branch** from an up-to-date `main` with CI green:
   `git switch -c release/<pkg>-vX.Y.Z`.
2. **Bump the version** in `packages/<pkg>/package.json` **and** in that
   package's entry in `bun.lock` (`"packages/<pkg>": { ..., "version": ... }`).
   Bun does not update a workspace package's version in the lockfile, and
   `bun pm pack` reads it from there when it turns `workspace:^` into a
   range; `verify:package` fails if the two disagree. For
   `@barmark/musicxml` and `@barmark/midi`, also `packages/<pkg>/src/version.ts`:
   the export names it in each file (musicxml in its `<encoding>`), and a
   test checks it.
3. **The package's CHANGELOG.md:** move the `[Unreleased]` entries into a
   new `## [x.y.z] - YYYY-MM-DD` section, leave `[Unreleased]` empty, and
   update the compare links at the bottom. Use `### Added`, `### Changed`,
   `### Fixed`, `### Removed` and `### Technical`, with the lead phrase of
   each entry in bold. Write them from
   `git log <previous tag>..HEAD --oneline -- packages/<pkg>`.
4. **README and docs:** update anything the release changes.
5. **Commit** the bump: `git commit -m "<pkg>-vX.Y.Z: <one-line summary>"`,
   then push the branch and open a pull request
   (`gh pr create -R kevinpeckham/barmark --fill`).
6. **Merge** once CI is green, then `git switch main && git pull &&
   bun install` (a checkout's packages fall behind when a workspace
   package is added; FINDINGS 2026-11-08).
7. **Gate:** `bunx varlock run -- swamp workflow run release-check --input
   pkg=<pkg>` on `main` (or the commands above). Fix anything it reports,
   through another pull request, before going on.
8. **Tag and push the tag:**
   ```
   git tag -a <pkg>-vX.Y.Z -m "<pkg>-vX.Y.Z"
   git push origin <pkg>-vX.Y.Z
   ```
9. **Release:** `gh release create <pkg>-vX.Y.Z --title "<npm name> X.Y.Z"
   --notes-file <notes>`, with the version's CHANGELOG section as the
   notes. This starts the release workflow. Releasing several packages,
   create one release at a time: release runs share a concurrency group
   that keeps one running and one pending, and a newer pending run
   cancels the older one, so start the next only when the previous run
   is running or done (FINDINGS 2026-11-09).
10. **Approve** the publish when GitHub asks (the run's "Review
    deployments" button, or `gh run view`), after the verify job passes.
11. **Confirm:** the workflow's `confirm` job installs the new version
    from npm and reads Peaceful Dreams with it; when it passes, check the
    package's provenance on npmjs.com.
12. **Bump barmark.dev:** on a new branch, `cd site && bun add --exact
    <npm name>@X.Y.Z`, run `bun run check && bun test`, and open a pull
    request `chore(site): use <npm name> X.Y.Z` (`site/package.json` and
    `site/bun.lock`). Until it merges, CI's `site-versions` check is red
    on purpose; it is not required, so other pull requests still merge.
    After a `barmark` bump, check `site/bun.lock` holds one barmark:
    `grep '/barmark": \["barmark@' site/bun.lock` prints nothing, or
    delete the nested entries it finds and `bun install` again (FINDINGS).
13. **Release the CLI** (after a `barmark`, `@barmark/render`,
    `@barmark/musicxml`, `@barmark/score`, `@barmark/sync` or
    `@barmark/midi` release; the CLI bundles `@barmark/sync` through
    `@barmark/midi`, and Verovio through `@barmark/score`; after a `barmark`
    or `@barmark/sync` minor, release the caret dependants' patches first,
    as above: after a `sync` minor, a `@barmark/midi` patch "Requires
    `@barmark/sync` X.Y.0"):
    `@barmark/cli` pins the libraries exactly, so a library release
    reaches CLI users only through a CLI release. On a new branch, bump
    `packages/cli` (a patch, unless the CLI itself changed) with a
    CHANGELOG line "Uses barmark A.B.C, @barmark/render D.E.F,
    @barmark/musicxml G.H.I, @barmark/score M.N.O and @barmark/midi
    J.K.L" (naming the ones that changed), and
    release it with steps 1–11 (`pkg=cli`). Release the libraries first:
    the CLI's binaries bundle the libraries' code from the repository, so
    `verify:release cli` (and the release workflow) fail if
    `packages/barmark/src`, `packages/render/src`, `packages/render/fonts`,
    `packages/musicxml/src`, `packages/score/src`, `packages/sync/src` or
    `packages/midi/src` changed since their own tags, or if a library's dependency range at
    its tag does not admit the version bundled beside it (verify:release
    only). Its release workflow also
    attaches the binaries; check the release page lists all five,
    `Edwin-OFL.txt`, `Verovio-LGPL-3.0.txt` and `Verovio-GPL-3.0.txt`.
    End its release notes with a "Third-party software" paragraph: "The
    binaries bundle Verovio X.Y.Z (© Laurent Pugin and others,
    LGPL-3.0-only), unmodified; its licence is attached, and its source is
    at https://github.com/rism-digital/verovio/tree/version-X.Y.Z. To
    rebuild them with another Verovio, see the CLI README's License
    section." Then bump barmark.dev as in step 12: the site
    installs the CLI as a dev dependency (`bun add --dev --exact
    @barmark/cli@X.Y.Z`), because Get Started's commands are tested
    against it and its CI example shows that version.
14. **Bump `kevinpeckham/songs`:** a pull request there raising its
    pinned `@barmark/cli` version in `.github/workflows/check.yml`. Its CI
    runs the new libraries over Kevin's real songs: green means no song
    reads differently; red shows which song and line changed, before
    Kevin accepts the release.

Release tags cannot be moved, so if the workflow fails before publishing,
fix the problem through a pull request and release it as the next patch
version; the failed version is simply never published. A failure in
`confirm` after publishing means the package on npm is broken: release
the fix as the next patch as soon as possible.

## A new package's first release

npm's trusted publisher can only be configured for a package that
already exists, so a new package (as `@barmark/render` was) needs one
manual step before its first release (the same for `@barmark/cli`):

1. **Kevin, on his own machine,** publishes a placeholder 0.0.0 under the
   name (a `package.json` with the name, version `0.0.0` and a one-line
   README saying the first release is coming), with `npm publish --access
   public`. Run `npm whoami` first: logged out, npm answers the
   publish with a misleading 404 (FINDINGS.md).
2. **On npmjs.com,** the package's settings → Trusted Publisher: GitHub
   Actions, repository `kevinpeckham/barmark`, workflow `release.yml`,
   environment `npm`. Then set publishing access to require two-factor
   authentication and disallow tokens.
3. **Rulesets** (repository settings → Rules): add the new tag pattern
   (`cli-v*` for the CLI, `musicxml-v*` for `@barmark/musicxml`, `score-v*` for `@barmark/score`) to
   "release tags", and the new package job's checks (`package (20, cli)`,
   `package (22, cli)`, `package (24, cli)`; likewise `package (N,
   musicxml)`) to the "main" ruleset's required checks.
4. **The `npm` environment** (repository settings → Environments →
   npm → Deployment branches and tags): add a tag rule for the same
   pattern (`cli-v*`, `musicxml-v*`, `score-v*`). Without it the publish job is rejected at once,
   before any approval is asked for ("Tag … is not allowed to deploy to
   npm due to environment protection rules"), and nothing reaches npm;
   after adding it, rerun the failed jobs (`gh run rerun <id> --failed`).
5. Release normally from here on.
