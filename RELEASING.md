# Releasing barmark

A release is a version bump, a CHANGELOG section, a tag and a GitHub
release. Publishing to npm is automatic: the GitHub release triggers
`.github/workflows/release.yml`, which re-runs every gate, packs the
tarball, and publishes it through npm trusted publishing with provenance.
No npm token exists anywhere.

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

1. **Start from a clean, up-to-date `main`**, with CI green on GitHub.
2. **Bump the version** in `package.json`.
3. **CHANGELOG.md:** move the `[Unreleased]` entries into a new
   `## [x.y.z] - YYYY-MM-DD` section, leave `[Unreleased]` empty, and
   update the compare links at the bottom. Use `### Added`, `### Changed`,
   `### Fixed`, `### Removed` and `### Technical`, with the lead phrase of
   each entry in bold. Write them from
   `git log $(git describe --tags --abbrev=0)..HEAD --oneline`.
4. **README.md and docs:** update anything the release changes.
5. **Commit** the bump: `git commit -m "vX.Y.Z: <one-line summary>"`.
6. **Gate:** `bunx varlock run -- swamp workflow run release-check` (or the five commands
   above). Fix anything it reports before going on.
7. **Tag and push:**
   ```
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin main vX.Y.Z
   ```
8. **Publish:** `gh release create vX.Y.Z --title vX.Y.Z --notes-file <notes>`,
   with the version's CHANGELOG section as the notes. This starts the
   release workflow.
9. **Confirm:** watch the run (`gh run watch`), then check
   `npm view barmark version` and the package's provenance on npmjs.com.

If the release workflow fails before publishing, fix the problem, move
the tag (`git tag -fa vX.Y.Z` and `git push -f origin vX.Y.Z`) only if
nothing was published, and re-run the workflow. A version that reached
npm is never reused: release the fix as the next patch.
