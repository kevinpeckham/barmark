# The conformance fixtures

Chart texts paired with the reading a conforming parser must produce,
contributed by the stem-bench program (the standing offer in BRIEF.md).
Two suites:

- **realCharts.test.ts** — the four public Badverbs charts, byte-for-byte
  as stored in Stem Shovel after the barmark migration, with expectations
  in `fixtures/*.expected.json`.
- **traps.test.ts** — the grammar's trap rules, the places where a
  plausible misreading changes the music, each tagged with the study that
  verified it.

## Why these expectations are trustworthy

They were derived OUTSIDE this parser, which is what makes them
conformance tests rather than a snapshot of current behavior:

- The section structure and bar counts come from the band's own declared
  section start times on their recordings — stem-bench Study 16 showed
  every start lands grid-exact (0.0000 s) when the chart is read
  correctly at the declared tempo.
- The chord content comes from stem-bench's verified bar lists, built
  with a DIFFERENT parser (Stem Shovel's retired in-house one) and
  cross-checked bar for bar against this parser in Study 16's
  registered run.
- Full provenance: the stem-bench repository's BRIEF-STUDY16.md,
  REPORT.md and results/study16.json.

A change that makes any of these fail is a grammar question before it is
a code change: the music these charts describe is fixed by recordings.
Kevin decides grammar questions.

The recordings and charts are by Badverbs, who share them publicly on
Stem Shovel; Kevin holds the rights.
