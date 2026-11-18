# Changelog

All notable changes to `@barmark/lyricsheet` are recorded here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
package uses [semantic versioning](https://semver.org/).

## [Unreleased]

### Added

- `exportLyricsheet`: refuses a chart with errors, an unknown part or no bars, and writes the song's header (title, credits, key, time and tempo) as ChordPro directives; a sheet always has a title line (the chart's, else `title`, else `{title: }`).
- Sung sections as ChordPro lyric environments, in play order: each chord before the syllable it lands on, a chord on no syllable standing alone, `{chorus}` for a replayed chorus singing the same words, annotations for `N.C.`, stops, `?`, note sets, words, rehearsal marks and fermatas, key, time and tempo changes where they happen (each with a comment a reader sees), a repeat singing the same words again kept in one environment, and comments for text lines, rit., accel. and feel. One part's harmony (the one named, else the first that writes chord symbols) and the singer's words. Losses: `other-parts`, `other-lines`, `stacked-verses`, `chord-moved`, `text-changed`, `chord-names`, `note-sets`, `voicing`, `marks`, `bar-meter` and `fermata`.
