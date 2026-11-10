#!/usr/bin/env bash
# source.sh <outdir>: the Corresponding Source for an engraver release.
# Writes <outdir>/verovio-6.4.1-source.tar.gz, a git archive of the pinned
# Verovio commit from build.sh's cached clone (after the same commit check),
# and <outdir>/engraver-build-X.Y.Z.tar.gz, this build/ directory as
# committed (it refuses uncommitted changes, so the bundle is what was built).
#
# Cache root: $BARMARK_ENGRAVER_CACHE (default ~/.cache/barmark-engraver).
set -euo pipefail

if [ $# -ne 1 ]; then
	echo "usage: bash source.sh <outdir>" >&2
	exit 2
fi
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PKG=$(dirname "$HERE")
# build/ as committed: refuse uncommitted changes before writing anything.
if [ -n "$(git -C "$HERE" status --porcelain -- .)" ]; then
	echo "source.sh: $HERE has uncommitted changes" >&2
	exit 1
fi
# shellcheck source=versions.env
source "$HERE/versions.env"
CACHE=${BARMARK_ENGRAVER_CACHE:-$HOME/.cache/barmark-engraver}
REPO="$CACHE/src/verovio"
VERSION=$(bun -e "console.log((await Bun.file(process.argv[1]).json()).version)" "$PKG/package.json")
VEROVIO=${VEROVIO_TAG#version-}

# 1. Verovio at the pinned tag, which must be the pinned commit.
if [ ! -d "$REPO/.git" ]; then
	echo "source.sh: no Verovio clone at $REPO; run bun run compile first" >&2
	exit 1
fi
COMMIT=$(git -C "$REPO" rev-parse "$VEROVIO_TAG^{commit}")
if [ "$COMMIT" != "$VEROVIO_COMMIT" ]; then
	echo "source.sh: $VEROVIO_TAG is $COMMIT, not $VEROVIO_COMMIT" >&2
	exit 1
fi
# Every check has passed: only now is <outdir> written.
mkdir -p "$1"
OUT=$(realpath "$1")
git -C "$REPO" archive --format=tar.gz --prefix="verovio-$VEROVIO/" \
	-o "$OUT/verovio-$VEROVIO-source.tar.gz" "$VEROVIO_COMMIT"

# 2. build/ as committed (checked first, above).
# From the top level: git archive run in a subdirectory archives only its paths.
# A tree, unlike a commit, is stamped with the current time; use HEAD's instead.
TOP=$(git -C "$HERE" rev-parse --show-toplevel)
git -C "$TOP" archive --format=tar.gz --mtime="$(git -C "$TOP" log -1 --format=%cI HEAD)" --prefix="engraver-build-$VERSION/" \
	-o "$OUT/engraver-build-$VERSION.tar.gz" HEAD:packages/engraver/build
echo "source.sh: $OUT/verovio-$VEROVIO-source.tar.gz and $OUT/engraver-build-$VERSION.tar.gz"
