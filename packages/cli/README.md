# @barmark/cli

The `barmark` command: check, format, part, render, transpose, export and import
[Barmark](https://www.barmark.dev) chord charts (`.chart.md` files) in a
terminal or in CI. It runs the same `barmark` parser and `@barmark/render`
renderer as barmark.dev, `@barmark/musicxml` for MusicXML,
`@barmark/score` (with Verovio) for full scores and `@barmark/midi` for
MIDI files, at exact versions, so a chart means the same thing everywhere.

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
barmark export --midi song.chart.md --out song.mid   # for a DAW or a practice player
barmark import song.mid --out song.chart.md        # chords named from the notes
barmark check --strict --format github songs   # warnings fail too; PR annotations
barmark format song.chart.md             # print it in standard form
barmark format --write songs             # rewrite the files that change
barmark format --check songs             # list them and fail, for CI
barmark part Bass song.chart.md          # one part of a chart of several
barmark render song.chart.md --out song.html   # a standalone page, font included
barmark render --score song.chart.md --out song.html   # the full engraved score
barmark transpose song.chart.md --to E   # or --semitones -2
```

`check --format json` prints the diagnostics for other tools. `render`
takes the renderer's options as flags: `--theme auto|light|dark`,
`--numerals nashville|roman`, `--no-bar-numbers`, `--rehearsal-letters`,
`--no-wrap`, `--columns shared|row`, `--diagnostics`, `--part <label>` to draw one part, and `--font-url <url>` to link the font
instead of embedding it. `barmark <command> --help` lists each command's
flags; `barmark --version` prints the versions of the CLI, its
libraries and Verovio.

`render --score` writes a standalone page of the full engraved score
instead of the bar grid: the drawing `<barmark-score>` shows, the chart
exported to MusicXML and engraved by [Verovio](https://www.verovio.org),
which the CLI carries (nothing else to install). The output is HTML: open
it in a browser, and print it to PDF from there. `--theme` colours it as
it does the grid, `--part <label>` engraves that part alone, and
`--width <px>` sets the width it is laid out for (320 to 40000; default
900, a comfortable reading width: the page scales the score to fit the
window or the paper, so the width decides how many bars go on a line,
not how big the page is). The grid's own flags (`--numerals`,
`--no-bar-numbers`, `--rehearsal-letters`, `--no-wrap`, `--columns`,
`--diagnostics`, `--font-url`) are usage errors with `--score`, and `--width` is one
without it. A chart that won't engrave (one with errors, or no bars)
writes nothing: the reason goes to stderr as `song.chart.md: Line 5:
message`, and the exit code is 1. The score's text is set in Verovio's own
fonts, so Edwin is not embedded.

`export --musicxml` writes MusicXML 4.0 that notation programs open and
play in the chart's order; `--part <label>` exports one part. A chart
with errors is not exported. A chart with no title takes its file name.

`import` reads a MusicXML score (`.musicxml`, `.xml` or compressed `.mxl`)
as a chart. What the chart can't carry over is listed on stderr, one line
each, as `check` prints its findings: `song.mxl: measure 12 (Piano):
warning: message` (the measure left out when the message lists the
measures itself). `--part <name>` (a
part's name, abbreviation or id, ignoring case and punctuation) imports
one part alone, its notes as note sets. It exits 0 when a chart came out,
even with warnings, and 1 when none did or the `.mxl` is bad. It does not
read stdin.

`export --midi` writes a Standard MIDI File of the chart's play order
(chords voiced on piano, the tempo map, markers and lyrics); `--out` is
required, and `--part <label>` exports one part. What MIDI can't hold is
listed on stderr as `song.chart.md: bar 9: warning: message`, such as an
open repeat (`x ...`) played once. Bars are numbered as the chart
numbers them: a pickup is bar 0, here and in `import`. A chart with errors is not exported.

`import` reads a MIDI file (`.mid` or `.midi`) as a chart too, naming a
chord from the notes of the tracks that carry the harmony and turning
lyric events into lyric rows. Its messages are listed on stderr as
`song.mid: bar 12 (track 2): warning: message`. `--tracks 2,Piano`
names the harmony's tracks by number or name (ignoring case) instead of
letting the import choose. As for MusicXML, it exits 1 when no chart came
out.

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

`render --score` uses [Verovio](https://github.com/rism-digital/verovio),
which is LGPL-3.0-only. From npm, Verovio is an ordinary dependency
(through `@barmark/score`), installed and loaded unchanged. The standalone
binaries bundle it unmodified, at the version this package pins; the
release carries
its licence as `Verovio-LGPL-3.0.txt` and the GPL it builds on as
`Verovio-GPL-3.0.txt`. barmark's own code stays MIT.

Verovio © Laurent Pugin and others, LGPL-3.0-only. Its source, at the
version the binaries bundle, is
[rism-digital/verovio at the matching `version-` tag](https://github.com/rism-digital/verovio/tree/version-6.4.1)
(`barmark --version` names that version). To build the binaries with
another or a modified Verovio: in a checkout of this repository, point the
`verovio` dependency of `packages/cli` and `packages/score` at it, run
`bun install`, then `bun scripts/compile.ts <target> <out>` (the targets
are listed in that script).
