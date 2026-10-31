# Releasing

This repository publishes two npm packages from one Bun workspace, each
versioned and released on its own:

| Package | Directory | Release tag |
|---|---|---|
| `barmark` | `packages/barmark` | `barmark-vX.Y.Z` |
| `@barmark/render` | `packages/render` | `render-vX.Y.Z` |

(`barmark` 0.0.x and 0.1.0 were tagged `vX.Y.Z`, before the workspace.)

A release is a version bump, a CHANGELOG section, a tag and a GitHub
release. The GitHub release triggers `.github/workflows/release.yml`,
which reads the package from the tag, re-runs every gate and packs that
package, waits for Kevin to approve the publish (the `npm` environment),
publishes it through npm trusted publishing with provenance, then installs
it back from npm and reads a real chart with it. No npm token exists
anywhere.

## Repository rules

- **`main`** (ruleset "main"): changes arrive by pull request, CI's
  `check`, `browser` and `package (<node>, <package>)` jobs (Node 20, 22
  and 24 for each package) must pass, and force-pushes and deletion are
  blocked. Renaming a CI job or changing a matrix means updating the
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

## Checks

The same scripts run in three places; `<pkg>` is `barmark` or `render`:

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

## Steps

`<pkg>` is the package's key (`barmark` or `render`) and the tag is
`<pkg>-vX.Y.Z`.

1. **Start a release branch** from an up-to-date `main` with CI green:
   `git switch -c release/<pkg>-vX.Y.Z`.
2. **Bump the version** in `packages/<pkg>/package.json` **and** in that
   package's entry in `bun.lock` (`"packages/<pkg>": { ..., "version": ... }`).
   Bun does not update a workspace package's version in the lockfile, and
   `bun pm pack` reads it from there when it turns `workspace:^` into a
   range; `verify:package` fails if the two disagree.
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
6. **Merge** once CI is green, then `git switch main && git pull`.
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
   notes. This starts the release workflow.
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

Release tags cannot be moved, so if the workflow fails before publishing,
fix the problem through a pull request and release it as the next patch
version; the failed version is simply never published. A failure in
`confirm` after publishing means the package on npm is broken: release
the fix as the next patch as soon as possible.

## A new package's first release

npm's trusted publisher can only be configured for a package that
already exists, so a new package (as `@barmark/render` was) needs one
manual step before its first release:

1. **Kevin, on his own machine,** publishes a placeholder 0.0.0 under the
   name (a `package.json` with the name, version `0.0.0` and a one-line
   README saying the first release is coming), with `npm publish --access
   public`.
2. **On npmjs.com,** the package's settings → Trusted Publisher: GitHub
   Actions, repository `kevinpeckham/barmark`, workflow `release.yml`,
   environment `npm`. Then set publishing access to require two-factor
   authentication and disallow tokens.
3. Release normally from here on.
