/** The help text, one block for the command and one per subcommand. */

export const HELP = `Usage: barmark <command> [options]

Commands:
  check <paths…>       Report each chart's errors and warnings
  format <paths…>      Print or rewrite charts in standard form
  render <file>        Write a chart as a standalone HTML page
  transpose <file>     Print a chart in another key

Options:
  --help               Show help (also: barmark <command> --help)
  --version            Show the versions of the CLI and its libraries

Exit codes: 0 done, 1 the charts have problems, 2 usage.
`;
