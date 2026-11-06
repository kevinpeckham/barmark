/** The help text, one block for the command and one per subcommand. */

export const HELP = `Usage: barmark <command> [options]

Commands:
  check <paths…>       Report each chart's errors and warnings
  export <file>        Write a chart as MusicXML (--musicxml)
  format <paths…>      Print or rewrite charts in standard form
  import <file>        Read a MusicXML score as a chart
  part <label> <file>  Print one part of a chart of several
  render <file>        Write a chart as a standalone HTML page
  transpose <file>     Print a chart in another key

Options:
  --help               Show help (also: barmark <command> --help)
  --version            Show the versions of the CLI and its libraries

Exit codes: 0 done, 1 the charts have problems, 2 usage.
`;

/** Each command's own help: `barmark <command> --help`. */
export const COMMAND_HELP: Record<string, string> = {
	check: `Usage: barmark check <paths…> [options]

Report each chart's errors and warnings. Folders mean every *.chart.md
inside them; - reads stdin.

  --strict                 Warnings fail too (exit 1)
  --format text|github|json
                           text: path:line: severity: message (default)
                           github: annotations on a pull request
                           json: an array of { file, diagnostics }
`,
	export: `Usage: barmark export --musicxml <file> [options]

The chart as MusicXML 4.0, for MuseScore, Dorico, Sibelius or Finale: one
part per declared part, playing in the chart's order. A chart with errors
is not exported; problems go to stderr.

  --musicxml               Export MusicXML (the one format for now)
  --out <file>             Write to a file instead of stdout
  --part <label>           Export only this part
`,
	format: `Usage: barmark format <paths…> [options]

Charts in standard form. With one chart and no option, prints it.

  --write                  Rewrite each chart that changes, and list it
  --check                  List each chart that would change; exit 1 if any
`,
	render: `Usage: barmark render <file> [options]

A standalone HTML page of the chart, with the Edwin font embedded.

  --out <file>             Write to a file instead of stdout
  --theme auto|light|dark  Colors (default auto: follows the reader's system)
  --numerals nashville|roman
                           Show chords as degrees of the key
  --no-bar-numbers         Hide bar numbers
  --rehearsal-letters      Letter each section A, B, C…
  --no-wrap                Keep each row on one line
  --part <label>           Draw only this part
  --diagnostics            List the chart's problems below it
  --font-url <url>         Link the font instead of embedding it
`,
	import: `Usage: barmark import <file> [options]

A MusicXML score (.musicxml, .xml or compressed .mxl; from MuseScore, Dorico, Sibelius, Finale…) as a chart.
Chord symbols become chords; what the chart can't carry over goes to
stderr as file: measure N (Part): message. Exits 0 when a chart came out,
even with warnings; 1 when none did or the .mxl is bad. Does not read stdin.

  --out <file>             Write to a file instead of stdout
  --part <name>            Import one part alone, its notes as note sets
`,
	part: `Usage: barmark part <label> <file> [options]

One part of a chart of several, as a chart of its own: its own bars, the
bars every part plays, and N.C. where it rests. Problems go to stderr.

  --out <file>             Write to a file instead of stdout
`,
	transpose: `Usage: barmark transpose <file> (--to <key> | --semitones <n>) [options]

The chart in another key. Problems go to stderr.

  --to <key>               The new key, e.g. E or Bb
  --semitones <n>          Move by a whole number of semitones, e.g. -2
  --out <file>             Write to a file instead of stdout
`,
};
