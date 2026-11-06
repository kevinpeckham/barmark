# @barmark/cli

The `barmark` command: check, format, part, render, transpose, export and import
[Barmark](https://www.barmark.dev) chord charts (`.chart.md` files) in a
terminal or in CI. It runs the same `barmark` parser and `@barmark/render`
renderer as barmark.dev, and `@barmark/musicxml` for MusicXML, at exact
versions, so a chart means the same thing everywhere.

## Install

With Node 20.6 or later:

```sh
npx @barmark/cli check .          # run once
npm install --save-dev @barmark/cli   # or keep it in a project
```

Without Node, download the binary for your system from the
[GitHub release](https://github.com/kevinpeckham/barmark/releases?q=cli-v)
(`barmark-linux-x64`, `barmark-linux-arm64`, `barmark-darwin-x64`,
`barmark-darwin-arm64`, `barmark-windows-x64.exe`). The binaries are not
signed yet; on macOS, clear the download flag before the first run:

```sh
chmod +x barmark-darwin-arm64
xattr -d com.apple.quarantine barmark-darwin-arm64
```

## Commands

Folders mean every `*.chart.md` file inside them, skipping `node_modules`,
dot-folders and symlinks. `-` reads from stdin.

```sh
barmark check songs                      # errors and warnings, file:line
barmark export --musicxml song.chart.md --out song.musicxml   # for MuseScore, Dorico…
barmark import song.musicxml --out song.chart.md   # or a compressed song.mxl
barmark check --strict --format github songs   # warnings fail too; PR annotations
barmark format song.chart.md             # print it in standard form
barmark format --write songs             # rewrite the files that change
barmark format --check songs             # list them and fail, for CI
barmark part Bass song.chart.md          # one part of a chart of several
barmark render song.chart.md --out song.html   # a standalone page, font included
barmark transpose song.chart.md --to E   # or --semitones -2
```

`check --format json` prints the diagnostics for other tools. `render`
takes the renderer's options as flags: `--theme auto|light|dark`,
`--numerals nashville|roman`, `--no-bar-numbers`, `--rehearsal-letters`,
`--no-wrap`, `--diagnostics`, `--part <label>` to draw one part, and `--font-url <url>` to link the font
instead of embedding it. `barmark <command> --help` lists each command's
flags; `barmark --version` prints the versions of the CLI and its
libraries.

`export --musicxml` writes MusicXML 4.0 that notation programs open and
play in the chart's order; `--part <label>` exports one part. A chart
with errors is not exported. A chart with no title takes its file name.

`import` reads a MusicXML score (`.musicxml`, `.xml` or compressed `.mxl`)
as a chart. What the chart can't carry over is listed on stderr, one line
each, as `song.mxl: measure 12 (Piano): message`. `--part <name>` (a part's
name, abbreviation or id, in any case) imports one part alone, its notes
as note sets. It exits 0 when a chart came out,
even with warnings, and 1 when none did or the `.mxl` is bad. It does not
read stdin.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Done (warnings are allowed unless `--strict`) |
| 1 | The charts have problems: an error, a warning with `--strict`, or a file `format --check` would change |
| 2 | The command was used wrongly: an unknown flag, a missing or unreadable file |

## In CI

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 22
- run: npx -y @barmark/cli@0.1.0 check --strict --format github songs
- run: npx -y @barmark/cli@0.1.0 format --check songs
```

Pin the version: a new release can read a chart differently, and a pinned
version turns that into a pull request you review.

## License

MIT. `render` embeds Edwin, which `@barmark/render` ships under the SIL
Open Font License (`fonts/OFL.txt` there; the binaries' release carries it
as `Edwin-OFL.txt`).
