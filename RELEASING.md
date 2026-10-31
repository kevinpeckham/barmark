# Releasing barmark

A release is a version bump, a CHANGELOG section, a tag and a GitHub
release. The GitHub release triggers `.github/workflows/release.yml`,
which re-runs every gate and packs the tarball, waits for Kevin to
approve the publish (the `npm` environment), publishes it through npm
trusted publishing with provenance, then installs it back from npm and
reads a real chart with it. No npm token exists anywhere.

## Repository rules

- **`main`** (ruleset "main"): changes arrive by pull request, CI's
  `check` and `package (20)`, `package (22)` and `package (24)` jobs must
  pass, and force-pushes and deletion are blocked. Renaming a CI job or
  changing the Node matrix means updating the ruleset's required checks.
- **Release tags** (ruleset "release tags", `v*`): a tag can be created
  but never moved or deleted, so a version always names the code that was
  released.
- **The `npm` environment** holds the publish job: it needs Kevin's
  approval and runs only for `v*` tags. npm's trusted publisher for
  barmark names this environment, so no other job can publish.
- **Dependabot** (`.github/dependabot.yml`) proposes monthly, grouped
  updates to the pinned actions and dev dependencies, two weeks after a
  release at the earliest, and security updates as they come.

## Versions

Semantic versioning. While barmark is 0.x:

- **minor** (0.1.0 → 0.2.0): a grammar change, a new feature, or any
  change to the exported API
- **patch** (0.1.0 → 0.1.1): fixes that change no documented behavior

The grammar draft's version (`docs/grammar-v0.1-draft.md`) is separate
from the package version. The package says which grammar it implements
in the CHANGELOG.

## Checks

The same scripts run in three places:

| Check | Command | Local (Swamp) | CI (every push and PR) | Release workflow |
|---|---|---|---|---|
| Lint and typecheck | `bun run check` | ✓ | ✓ | ✓ |
| Tests | `bun test` | ✓ | ✓ | ✓ |
| Dead code, duplication, complexity | `bun run fallow` | ✓ | ✓ | ✓ |
| Package contents, Node import | `bun run verify:package` | ✓ | ✓ (Node 20, 22, 24) | ✓ |
| Version, CHANGELOG, tag, clean `main` | `bun run verify:release` | ✓ | | ✓ (tag = version) |

Locally, `bunx varlock run -- swamp workflow run release-check` runs all five through the
`barmark` Swamp behavior, keeps each run's results as data, and fails on
any problem. The scripts also run on their own; Swamp adds the record and
the single pass/fail. Varlock loads Swamp's credential from barmark's
1Password environment; `.env.local` (gitignored) holds `OP_ENV_ID` and
`OP_TOKEN`.

## Steps

1. **Start a release branch** from an up-to-date `main` with CI green:
   `git switch -c release/vX.Y.Z`.
2. **Bump the version** in `package.json`.
3. **CHANGELOG.md:** move the `[Unreleased]` entries into a new
   `## [x.y.z] - YYYY-MM-DD` section, leave `[Unreleased]` empty, and
   update the compare links at the bottom. Use `### Added`, `### Changed`,
   `### Fixed`, `### Removed` and `### Technical`, with the lead phrase of
   each entry in bold. Write them from
   `git log $(git describe --tags --abbrev=0)..HEAD --oneline`.
4. **README.md and docs:** update anything the release changes.
5. **Commit** the bump: `git commit -m "vX.Y.Z: <one-line summary>"`,
   then push the branch and open a pull request
   (`gh pr create -R kevinpeckham/barmark --fill`).
6. **Merge** once CI is green, then `git switch main && git pull`.
7. **Gate:** `bunx varlock run -- swamp workflow run release-check` on
   `main` (or the five commands above). Fix anything it reports, through
   another pull request, before going on.
8. **Tag and push the tag:**
   ```
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin vX.Y.Z
   ```
9. **Release:** `gh release create vX.Y.Z --title vX.Y.Z --notes-file <notes>`,
   with the version's CHANGELOG section as the notes. This starts the
   release workflow.
10. **Approve** the publish when GitHub asks (the run's "Review
    deployments" button, or `gh run view`), after the verify job passes.
11. **Confirm:** the workflow's `confirm` job installs the new version
    from npm and reads Peaceful Dreams with it; when it passes, check the
    package's provenance on npmjs.com.

Release tags cannot be moved, so if the workflow fails before publishing,
fix the problem through a pull request and release it as the next patch
version; the failed version is simply never published. A failure in
`confirm` after publishing means the package on npm is broken: release
the fix as the next patch as soon as possible.
