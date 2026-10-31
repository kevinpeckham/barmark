---
name: release
description: Cut a barmark release - gates via Swamp, bump version, CHANGELOG, commit, tag, push, GitHub release (which publishes to npm)
argument-hint: [version e.g. 0.2.0]
---

# Release barmark $ARGUMENTS

Follow `RELEASING.md` step by step; it is the source of truth. If no
version is given, read `package.json` and ask which it should be (0.x: a
minor for grammar or API changes, a patch for fixes).

Points that are easy to miss:

- Run `bunx varlock run -- swamp workflow run release-check` after the
  version-bump commit. If varlock cannot load (no `.env.local`), ask Kevin
  for it, or run the five checks the workflow wraps.
- The commit is `vX.Y.Z: <summary>` with no `Co-Authored-By` trailer.
- `gh release create` publishes to npm. Ask Kevin before running it
  unless he has already asked for the release.
- After publishing, confirm with `gh run watch` and `npm view barmark
  version`, then report the npm and GitHub release links.
- Update `FINDINGS.md` if anything in the release surprised you, and the
  Claude memory only if a convention changed.
