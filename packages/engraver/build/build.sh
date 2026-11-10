#!/usr/bin/env bash
# build.sh <outdir>: the modified Verovio build, from pinned inputs, into
# <outdir>/verovio-module.{mjs,wasm}. Clones Verovio at the pin, installs the
# pinned emsdk and CMake, compiles without the unused importers, links with
# only the data/ entries in data.txt, writes the banner and fails if either
# file holds an absolute build path.
#
# Cache root: $BARMARK_ENGRAVER_CACHE (default ~/.cache/barmark-engraver),
# holding emsdk/, venv/, src/verovio/ and build/ (wiped every run).
# Parallelism: $BARMARK_ENGRAVER_JOBS (default: nproc).
set -euo pipefail

if [ $# -ne 1 ]; then
	echo "usage: bash build.sh <outdir>" >&2
	exit 2
fi
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PKG=$(dirname "$HERE")
# shellcheck source=versions.env
source "$HERE/versions.env"
mkdir -p "$1"
OUT=$(realpath "$1")
CACHE=${BARMARK_ENGRAVER_CACHE:-$HOME/.cache/barmark-engraver}
mkdir -p "$CACHE/src"
CACHE=$(realpath "$CACHE")
JOBS=${BARMARK_ENGRAVER_JOBS:-$(nproc)}

# 1. emsdk at the pinned commit and version.
if [ ! -d "$CACHE/emsdk" ]; then
	git clone https://github.com/emscripten-core/emsdk "$CACHE/emsdk"
fi
git -C "$CACHE/emsdk" fetch --quiet
git -C "$CACHE/emsdk" checkout --quiet "$EMSDK_COMMIT"
(cd "$CACHE/emsdk" && ./emsdk install "$EMSDK_VERSION" && ./emsdk activate "$EMSDK_VERSION")
set +u
# shellcheck disable=SC1091
source "$CACHE/emsdk/emsdk_env.sh"
set -u
EMSDK=$(realpath "$CACHE/emsdk")

# 2. CMake at the pinned version, from PyPI, in a venv. A venv whose
# python no longer runs (a runner image that moved Python on, under a
# cache key that still matches) is made again.
if [ -d "$CACHE/venv" ] && ! "$CACHE/venv/bin/python" -V >/dev/null 2>&1; then
	rm -rf "$CACHE/venv"
fi
if [ ! -d "$CACHE/venv" ]; then
	python3 -m venv "$CACHE/venv"
	"$CACHE/venv/bin/pip" install "cmake==$CMAKE_VERSION"
fi
export PATH="$CACHE/venv/bin:$PATH"
CMAKE_LINE=$(cmake --version | sed -n 1p)
if [ "$CMAKE_LINE" != "cmake version $CMAKE_VERSION" ]; then
	echo "build.sh: cmake is not $CMAKE_VERSION: $CMAKE_LINE" >&2
	exit 1
fi

# 3. Verovio at the pinned tag, which must be the pinned commit.
if [ ! -d "$CACHE/src/verovio/.git" ]; then
	git clone --depth 1 --branch "$VEROVIO_TAG" https://github.com/rism-digital/verovio "$CACHE/src/verovio"
fi
git -C "$CACHE/src/verovio" fetch --depth 1 origin tag "$VEROVIO_TAG"
git -C "$CACHE/src/verovio" checkout --quiet --force "$VEROVIO_TAG"
git -C "$CACHE/src/verovio" clean -xfd --quiet
HEAD=$(git -C "$CACHE/src/verovio" rev-parse HEAD)
if [ "$HEAD" != "$VEROVIO_COMMIT" ]; then
	echo "build.sh: $VEROVIO_TAG is $HEAD, not $VEROVIO_COMMIT" >&2
	exit 1
fi
SRC=$(realpath "$CACHE/src/verovio")
(cd "$SRC/emscripten" && ../tools/get_git_commit.sh)

# 4. A fresh build tree, with only the data/ entries kept.
rm -rf "$CACHE/build"
mkdir -p "$CACHE/build/lib" "$CACHE/build/stage/data" "$CACHE/build/out"
while IFS= read -r entry; do
	[ -n "$entry" ] && cp -r "$SRC/data/$entry" "$CACHE/build/stage/data/"
done <"$HERE/data.txt"
BUILD=$(realpath "$CACHE/build")

# 5. Flags: map every absolute root away, and name clang's resource dir.
RES=$("$EMSDK/upstream/bin/clang" -print-resource-dir)
MAP="-ffile-prefix-map=$SRC=verovio -ffile-prefix-map=$EMSDK=emsdk -ffile-prefix-map=$BUILD=build"
F="$OPT -DNDEBUG -std=c++20 -s STRICT=1 -fwasm-exceptions $MAP -resource-dir=$RES"

# 6. Compile. Verovio compiles RESOURCE_DIR="${CMAKE_INSTALL_PREFIX}/share/verovio"
# in as the resourcePath option's default, and emcmake would set the prefix to
# emsdk's absolute sysroot (stock npm Verovio holds its builder's home there).
# /usr/local gives Verovio's own fallback; the JS constructor sets /data anyway.
(cd "$BUILD/lib" &&
	emcmake cmake "$SRC/cmake" -DCMAKE_INSTALL_PREFIX=/usr/local \
		-DBUILD_AS_WASM=ON -DNO_HUMDRUM_SUPPORT=ON -DNO_PAE_SUPPORT=ON \
		-DNO_ABC_SUPPORT=ON -DNO_GABC_SUPPORT=ON -DNO_DARMS_SUPPORT=ON -DNO_MXL_SUPPORT=ON \
		-DCMAKE_CXX_FLAGS="$F" -DCMAKE_CXX_FLAGS_RELEASE="$F" &&
	emmake make -j"$JOBS")

# 7. Link.
# shellcheck disable=SC2086
(cd "$BUILD/stage" &&
	em++ ../lib/libverovio.a $OPT --closure 1 -s WASM=1 -s INITIAL_MEMORY=128MB -s STACK_SIZE=64MB \
		-s ALLOW_MEMORY_GROWTH -s INCOMING_MODULE_JS_API=onRuntimeInitialized,instantiateWasm \
		-fwasm-exceptions -DNDEBUG -std=c++20 -s STRICT=1 $MAP -resource-dir="$RES" \
		--embed-file data@data/ -s EXPORTED_FUNCTIONS=@"$SRC/emscripten/exports.txt" \
		-s EXPORTED_RUNTIME_METHODS='["cwrap","HEAPU8"]' -s MODULARIZE=1 -s EXPORT_ES6=1 \
		-s EXPORT_NAME="'createVerovioModule'" -o "$BUILD/out/verovio-module.mjs")

# 8. Banner, then the glue; the wasm unchanged.
VERSION=$(bun -e "console.log((await Bun.file(process.argv[1]).json()).version)" "$PKG/package.json")
{
	echo "/*! Modified build of Verovio 6.4.1 by barmark (not the Verovio project), LGPL-3.0-only: see NOTICE.md and https://github.com/kevinpeckham/barmark/releases/tag/engraver-v$VERSION */"
	cat "$BUILD/out/verovio-module.mjs"
} >"$OUT/verovio-module.mjs"
cp "$BUILD/out/verovio-module.wasm" "$OUT/verovio-module.wasm"

# 9. No absolute build path in either file.
LITERALS=(--literal "$SRC" --literal "$EMSDK" --literal "$BUILD" --literal "$PWD")
[ -n "${GITHUB_WORKSPACE:-}" ] && LITERALS+=(--literal "$GITHUB_WORKSPACE")
[ -n "${RUNNER_TEMP:-}" ] && LITERALS+=(--literal "$RUNNER_TEMP")
bun "$HERE/paths.ts" "$OUT/verovio-module.mjs" "$OUT/verovio-module.wasm" "${LITERALS[@]}"
echo "build.sh: $OUT/verovio-module.mjs and $OUT/verovio-module.wasm"
