# Changelog

All notable changes to `@barmark/listen` are recorded here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
package uses [semantic versioning](https://semver.org/).

## [Unreleased]

### Added

- The first release: (filled in when the package is finished).
- `@barmark/listen/features`: `recordingFeatures`, `chromaFeatures`,
  `onsetFeatures` and `joinFeatures` make a recording's features record
  (`FEATURES_VERSION` 1), and `readFeatures` checks one read back from a
  cache, refusing another version (`features-version`) or a record whose
  hop or frame rate does not follow from its sample rate, whose arrays
  are not `Float32Array`s, whose arrays are not the length its duration
  gives at its rate, whose values are not finite, which lacks a key of
  its own, or which throws when read (`features-invalid`). The entry imports nothing from `barmark` or
  `@barmark/sync`.
