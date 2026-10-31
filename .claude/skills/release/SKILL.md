---
name: release
description: Cut a release of barmark or @barmark/render - gates via Swamp, bump version, CHANGELOG, commit, tag, push, GitHub release (which publishes to npm)
argument-hint: [package version, e.g. barmark 0.2.0 or render 0.1.0]
---

# Release $ARGUMENTS

Follow `RELEASING.md` step by step; it is the source of truth. The
package is `barmark` (`packages/barmark`) or `render`
(`packages/render`, published as `@barmark/render`); its tag is
`<pkg>-vX.Y.Z`. If the package or version is missing, read the package's
`package.json` and ask (0.x: a minor for grammar or API changes, a patch
for fixes).

Points that are easy to miss:

- When `@barmark/render` needs unreleased `barmark` changes, release
  `barmark` first: the render release check fails until the `barmark`
  version it depends on is on npm.
- Run `bunx varlock run -- swamp workflow run release-check --input
  pkg=<pkg>` after the version-bump commit. If varlock cannot load (no
  `.env.local`), ask Kevin for it, or run the checks the workflow wraps.
- The commit is `<pkg>-vX.Y.Z: <summary>` with no `Co-Authored-By`
  trailer.
- `main` takes changes only through pull requests with green CI, and
  release tags can never be moved: a failed release becomes the next
  patch. After `gh release create`, Kevin approves the publish in the
  `npm` environment; tell him when it is waiting.
- `gh release create` starts the publish. Ask Kevin before running it
  unless he has already asked for the release.
- After publishing, confirm with `gh run watch` and `npm view <npm name>
  version`, then report the npm and GitHub release links.
- Update `FINDINGS.md` if anything in the release surprised you, and the
  Claude memory only if a convention changed.
